import {Observable, state, transform, each, set, requireWriteable, to, filter, delay} from "./mvc.js"
import { div, button, span, input, ul, li } from "./html.js"

/**
 * Autocomplete input component.
 *
 * The component owns only UI mechanics: typing, dropdown display, keyboard
 * navigation, and committing a selection back to the model.
 *
 * How options are derived from the model value is entirely external — pass any
 * Observable as `options`. Use a transform() for in-memory filtering, or bind
 * options to a remote connector that re-fetches when the model changes.
 *
 * @param {Observable}  model    The model holding the current value. Updated on selection.
 * @param {Observable}  options  Observable array of items to show in the dropdown.
 * @param {function}    [labelFn]  Extract display text from an item. Default: item => item
 * @returns {HtmlBuilder}
 *
 * @example — in-memory filter with transform()
 *   const countries = ["Czech Republic", "Slovakia", "Austria", "Germany"]
 *   const query = state("")
 *   const filtered = transform(query, q => countries.filter(c => c.toLowerCase().includes(q.toLowerCase())))
 *   body(autocomplete(query, filtered))
 *
 * @example — remote search via Post, re-queries as model changes
 *   const query   = state("")
 *   const options = state([])
 *   post("/api/search", query).bind(options).observeBodyChanges()
 *   body(autocomplete(query, options, item => item.label))
 *
 * @example — object items, selection sets full object on a separate model
 *   const query    = state("")
 *   const options  = state([])
 *   const selected = state()
 *   get("/api/users").bind(options).trigger()
 *   body(autocomplete(query, options, u => u.firstName + " " + u.lastName)
 *       .onCommit(item => selected.set(item)))
 */
export function autocomplete(model, options, labelFn = item => item) {
    const open   = state(false)
    const active = state(-1)

    // Re-render list whenever options change
    options.observe(set(active, -1))

    function setModel(value, isOpen = false) {
        if(value != null) model.set(value)
        open.set(isOpen)
        active.set(-1)
    }

    function moveActive(delta) {
        const list = options.get() ?? []
        if (!list.length) return
        active.set((active.get() + delta + list.length) % list.length)
    }

    // Wrapper
    return div(
        // Input element
        input(model.getName()).value(model).placeholder("Type to search…").autocomplete("off")
            .width('100%').borderBox().padding('4px 8px').border('1px solid #ccc').borderRadius("3px").font('inherit')
            .onInput(el => setModel(el.get().value, true))
            .onKeyDown((el, e) => {
                switch (e.key) {
                    case "ArrowDown": moveActive(1); break
                    case "ArrowUp":   moveActive(-1); break
                    case "Enter":  setModel(options.get()[active.get()]); break
                    case "Escape": setModel(null); break
                }
            })
            .onFocus(set(open, true))
            .onBlur(() => setTimeout(set(open, false), 150)),

        // Options drop-down
        ul(each(
            options,

            // Individual option
            (item, index) => li(labelFn(item)).cursor('pointer').padding('6px 10px')
                .backgroundColor(transform(active, i => i === index ? "#f0f4ff" : null))
                .onMouseOver(set(active, index)).onMouseOut(set(active, -1)).onClick(() => setModel(item.get())),
        ))
            .absolute().top('100%').left(0).right(0).margin('2px 0 0').padding(0).zIndex(999).maxHeight('10em').overflowY('auto')
            .boxShadow('0 4px 12px rgba(0,0,0,.12)').border('1px solid #ccc').borderRadius('3px').backgroundColor('white')
            .listStyle('none')
            .display(open)
    ).relative().display("inline-block")
}


const allowed = new Set(['P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'A'])
const discard = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE', 'FORM', 'INPUT', 'TEXTAREA', 'SELECT'])

// Rebuild a small formatting vocabulary; never attach unfiltered input HTML.
function cleanHtml(html, doc) {
    const source = doc.createElement('template')
    source.innerHTML = html
    const output = doc.createElement('div')

    function copy(node, parent) {
        if (node.nodeType === 3) { parent.appendChild(doc.createTextNode(node.data)); return }
        if (node.nodeType !== 1 || discard.has(node.tagName)) return
        let target = parent
        if (allowed.has(node.tagName)) {
            target = doc.createElement(node.tagName.toLowerCase())
            if (node.tagName === 'A') {
                const href = safeUrl(node.getAttribute('href'), doc)
                if (href) target.setAttribute('href', href)
            }
            parent.appendChild(target)
        }
        for (const child of node.childNodes) copy(child, target)
    }
    for (const child of source.content.childNodes) copy(child, output)
    return output.innerHTML
}

function safeUrl(value, doc) {
    if (typeof value !== 'string' || !value.trim()) return null
    try {
        const url = new URL(value.trim(), doc.baseURI)
        return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? url.href : null
    } catch { return null }
}

/**
 * Basic native rich-text editor backed by an Observable<string|null>.
 * Returns an HtmlBuilder. Call dispose() when permanently discarding the editor.
 * External model replacement resets the selection and may reset native undo history.
 * Paste accepts plain text; model HTML is restricted to basic formatting tags.
 */
export function richTextEditor(model, {label = 'Rich text', minHeight = '12rem'} = {}) {
    requireWriteable(model)
    const linkPanelVisible = state(false)
    const statusText = state('')
    const linkValue = state('')
    const doc = document
    const win = doc.defaultView
    const editor = div().contenteditable().role('textbox').ariaLabel(label).ariaMultiline().tabindex('0').padding('12px').minHeight(minHeight).overflowWrap('anywhere').outlineOffset('-2px')
    const area = editor.get()
    const status = span().role('status').ariaLive('polite').textContent(statusText)
    let savedRange = null
    let writing = false
    let disposed = false
    let composing = state(false)
    const controls = []

    function remember() {
        const selection = win.getSelection()
        if (selection.rangeCount && area.contains(selection.anchorNode) && area.contains(selection.focusNode)) {
            savedRange = selection.getRangeAt(0).cloneRange()
        }
    }

    function restore() {
        editor.focus()
        const selection = win.getSelection()
        const range = savedRange && area.contains(savedRange.startContainer) && area.contains(savedRange.endContainer) ? savedRange : doc.createRange()
        if (range !== savedRange) { range.selectNodeContents(area); range.collapse(false) }
        selection.removeAllRanges()
        selection.addRange(range)
    }

    function publish() {
        if (disposed || composing.get()) return
        const html = cleanHtml(area.innerHTML, doc)
        if (model.get() === html) return
        writing = true
        try { model.set(html) } finally { writing = false }
    }
    function reflect() {
        remember()
        const selection = win.getSelection()
        if (!area.contains(selection.anchorNode) || !area.contains(selection.focusNode)) return
        for (const [pressed, command] of controls) {
            pressed.set(doc.queryCommandState(command))
        }
    }
    function run(command, value = null) {
        if (disposed) return
        restore()
        statusText.set(doc.execCommand(command, false, value) ? '' : 'This action is not available for the current selection.')
        remember()
        publish()
        reflect()
    }
    function tool(text, command, value = null, toggle = false) {
        const control = button(text).type('button').ariaLabel(text).onMouseDown(remember, true).onClick(() => run(command, value))
        if (toggle) {
            const pressed = state(false)
            control.ariaPressed(pressed).backgroundColor(transform(pressed, to('#fff')));
            controls.push([pressed, command])
        }
        if (typeof doc.execCommand !== 'function' || !doc.queryCommandSupported(command)) control.disabled(true)
        return control
    }
    function closeLink() { linkPanelVisible.set(false); restore() }
    function applyLink() {
        const href = safeUrl(linkValue.get(), doc)
        if (!href) { statusText.set('Enter an HTTP, HTTPS, mailto or tel link.'); return }
        if (!savedRange || savedRange.collapsed) { statusText.set('Select the text to link first.'); return }
        run('createLink', href)
        linkPanelVisible.set(false)
    }
    const root = div(

        // Toolbar
        div(
            tool('B', 'bold', null, true).fontWeight('bold'),
            tool('I', 'italic', null, true).fontStyle('italic'),
            tool('U', 'underline', null, true).textDecoration('underline'),
            tool('S', `strikeThrough`, null, true).textDecoration('line-through'),
            tool('Paragraph', 'formatBlock', 'p'),
            tool('Heading', 'formatBlock', 'h2'),
            tool('•≡', 'insertUnorderedList'),
            tool('1≡', 'insertOrderedList'),
            button('\u{1F517}\uFE0E').type('button').onMouseDown(remember).onClick(() => { linkPanelVisible.set(true); linkValue.set('') }),
            tool('↶', 'undo'),
            tool('↷', 'redo')
        ).role('group').ariaLabel('Text formatting').display('flex').flexWrap('wrap').gap('4px').padding('8px').backgroundColor('#f5f5f5').borderBottom('1px solid #ddd'),

        // Hidden link input
        div(
            input('link').value(linkValue).type('url').ariaLabel('Link URL').placeholder('https://example.com').flex('1')
                .focusOn(delay(filter(linkPanelVisible), 10))
                .onInput(e => linkValue.set(e.get().value))
                .onKeyDown((_el, e) => {
                    if (e.key === 'Enter') { e.preventDefault(); applyLink() }
                    if (e.key === 'Escape') { e.preventDefault(); closeLink() }
                }),
            button('Apply link').type('button').onClick(applyLink),
            button('Cancel').type('button').onClick(closeLink)
        ).display(transform(linkPanelVisible, to("flex", false))).padding('8px').borderBottom('1px solid #ddd'),

        // Main editor pane
        editor
            .onInput(() => { publish(); reflect() })
            .onCompositionStart(set(composing, true))
            .onCompositionEnd(() => {composing.set(false); publish()})
            .onPaste((_el, e) => e.clipboardData && run('insertText', e.clipboardData.getData('text/plain')))
            .onDrop(() => {}, true)
            .onClick((_el, e) => e.target.closest('a') && e.preventDefault(), false),

        // Status text
        div(status).padding('4px 12px')

    ).border('1px solid #ccc').borderRadius('6px')

    doc.addEventListener('selectionchange', reflect)
    root.dispose = () => {
        disposed = true
        doc.removeEventListener('selectionchange', reflect)
        // Observable currently has no unsubscribe API; its retained callback becomes inert.
        return root
    }
    return root
}
