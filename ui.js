import { Observable, state, transform, each, set, requireWriteable} from "./mvc.js"
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
            (item, index) => li(labelFn(item))
                .cursor('pointer').padding('6px 10px').backgroundColor(transform(active, i => i === index ? "#f0f4ff" : null))
                .onClick(() => setModel(item.get()))
        ))
            .position('absolute').top('100%').left(0).right(0).margin('2px 0 0').padding(0).zIndex(999).maxHeight('10em').overflowY('auto')
            .boxShadow('0 4px 12px rgba(0,0,0,.12)').border('1px solid #ccc').borderRadius('3px').backgroundColor('white')
            .listStyle('none')
            .display(open)
    ).position("relative").display("inline-block")
}



// Rebuild a small formatting vocabulary; never attach unfiltered input HTML.
function cleanHtml(html, doc) {
    const source = doc.createElement('template')
    source.innerHTML = html
    const output = doc.createElement('div')
    const allowed = new Set(['P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U',
        'S', 'STRIKE', 'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'A'])
    const discard = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED',
        'SVG', 'MATH', 'TEMPLATE', 'FORM', 'INPUT', 'TEXTAREA', 'SELECT'])
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
    const doc = document
    const win = doc.defaultView
    const editor = div().contenteditable(true).role('textbox')
        .set('aria-label', label).set('aria-multiline', 'true')
        .tabindex('0').padding('12px').minHeight(minHeight)
        .css('overflow-wrap', 'anywhere').css('outline-offset', '-2px')
    const area = editor.get()
    const status = span().role('status').set('aria-live', 'polite')
    const toolbar = div().role('group').set('aria-label', 'Text formatting')
        .display('flex').css('flex-wrap', 'wrap').gap('4px').padding('8px')
        .backgroundColor('#f5f5f5').borderBottom('1px solid #ddd')
    const linkInput = input().type('url').set('aria-label', 'Link URL')
        .placeholder('https://example.com').flex('1')
    const linkPanel = div().display(false).padding('8px').borderBottom('1px solid #ddd')
    let savedRange = null
    let writing = false
    let disposed = false
    let composing = false
    let pendingHtml
    const controls = []

    function remember() {
        const selection = win.getSelection()
        if (selection.rangeCount && area.contains(selection.anchorNode) && area.contains(selection.focusNode)) {
            savedRange = selection.getRangeAt(0).cloneRange()
        }
    }

    function restore() {
        area.focus()
        const selection = win.getSelection()
        const range = savedRange && area.contains(savedRange.startContainer) && area.contains(savedRange.endContainer)
            ? savedRange : doc.createRange()
        if (range !== savedRange) { range.selectNodeContents(area); range.collapse(false) }
        selection.removeAllRanges()
        selection.addRange(range)
    }

    function publish() {
        if (disposed || composing) return
        const html = cleanHtml(area.innerHTML, doc)
        if (model.get() === html) return
        writing = true
        try { model.set(html) } finally { writing = false }
    }
    function reflect() {
        remember()
        const selection = win.getSelection()
        if (!area.contains(selection.anchorNode) || !area.contains(selection.focusNode)) return
        for (const [control, command] of controls) {
            control.set('aria-pressed', String(doc.queryCommandState(command)))
        }
    }
    function run(command, value = null) {
        if (disposed) return
        restore()
        if (!doc.execCommand(command, false, value)) status.get().textContent = 'This action is not available for the current selection.'
        else status.get().textContent = ''
        remember()
        publish()
        reflect()
    }
    function tool(text, command, value = null, toggle = false) {
        const control = button(text).type('button').set('aria-label', text)
            .on('mousedown', (_el, e) => { remember(); e.preventDefault() }, false)
            .onClick(() => run(command, value))
        if (toggle) { control.set('aria-pressed', 'false'); controls.push([control, command]) }
        if (typeof doc.execCommand !== 'function' || !doc.queryCommandSupported(command)) control.disabled(true)
        return control
    }
    toolbar.add(
        tool('Bold', 'bold', null, true),
        tool('Italic', 'italic', null, true),
        tool('Underline', 'underline', null, true),
        tool('Paragraph', 'formatBlock', 'p'),
        tool('Heading', 'formatBlock', 'h2'),
        tool('Bullets', 'insertUnorderedList'),
        tool('Numbered list', 'insertOrderedList'),
        button('Link').type('button')
            .on('mousedown', (_el, e) => { remember(); e.preventDefault() }, false)
            .onClick(() => { linkPanel.display('flex'); linkInput.get().value = ''; linkInput.get().focus() }),
        tool('Remove link', 'unlink'),
        tool('Undo', 'undo'), tool('Redo', 'redo')
    )
    function closeLink() { linkPanel.display(false); restore() }
    function applyLink() {
        const href = safeUrl(linkInput.get().value, doc)
        if (!href) { status.get().textContent = 'Enter an HTTP, HTTPS, mailto or tel link.'; return }
        if (!savedRange || savedRange.collapsed) { status.get().textContent = 'Select the text to link first.'; return }
        run('createLink', href)
        linkPanel.display(false)
    }
    linkPanel.add(linkInput, button('Apply link').type('button').onClick(applyLink),
        button('Cancel').type('button').onClick(closeLink))
    linkInput.onKeyDown((_el, e) => {
        if (e.key === 'Enter') { e.preventDefault(); applyLink() }
        if (e.key === 'Escape') { e.preventDefault(); closeLink() }
    })
    editor.onInput(() => { publish(); reflect() })
        .on('compositionstart', () => { composing = true }, false)
        .on('compositionend', () => {
            composing = false
            if (pendingHtml !== undefined) { area.innerHTML = pendingHtml; pendingHtml = undefined; savedRange = null }
            else publish()
        }, false)
        .on('paste', (_el, e) => {
            e.preventDefault()
            if (e.clipboardData) run('insertText', e.clipboardData.getData('text/plain'))
        }, false)
        .on('drop', (_el, e) => e.preventDefault(), false)
        .on('click', (_el, e) => { if (e.target.closest('a')) e.preventDefault() }, false)
    const root = div(toolbar, linkPanel, editor, div(status).padding('4px 12px'))
        .class('rx-rich-text').border('1px solid #ccc').borderRadius('6px')
    model.observe(value => {
        if (disposed || writing) return
        if (value != null && typeof value !== 'string') throw new TypeError('richTextEditor: model value must be a string or null')
        const html = cleanHtml(value ?? '', doc)
        if (composing) { pendingHtml = html; return }
        if (area.innerHTML !== html) { area.innerHTML = html; savedRange = null }
    })
    doc.addEventListener('selectionchange', reflect)
    root.dispose = () => {
        disposed = true
        doc.removeEventListener('selectionchange', reflect)
        // Observable currently has no unsubscribe API; its retained callback becomes inert.
        return root
    }
    return root
}
