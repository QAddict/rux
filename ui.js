import { state, isObservable, transform } from "./mvc.js"
import { div, input, ul, li } from "./html.js"

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

    // Sync input text from model (e.g. if model is reset externally)
    const displayValue = transform(model, v => v != null ? labelFn(v) : "")

    function commit(item) {
        model.set(item)
        open.set(false)
        active.set(-1)
    }

    function moveActive(delta) {
        const list = options.get() ?? []
        if (!list.length) return
        active.set((active.get() + delta + list.length) % list.length)
    }

    const inputEl = input(displayValue)
        .placeholder("Type to search…")
        .autocomplete("off")
        .class("rx-ac-input")
        .onInput(el => {
            model.set(el.get().value)
            open.set(true)
            active.set(-1)
        })
        .onKeyDown((el, e) => {
            switch (e.key) {
                case "ArrowDown": moveActive(1);  e.preventDefault(); break
                case "ArrowUp":   moveActive(-1); e.preventDefault(); break
                case "Enter": {
                    const item = (options.get() ?? [])[active.get()]
                    if (item != null) { commit(item); e.preventDefault() }
                    else open.set(false)
                    break
                }
                case "Escape": open.set(false); active.set(-1); break
            }
        }, false)
        .on("focus", () => open.set(true),  false)
        .on("blur",  () => setTimeout(() => open.set(false), 150), false)

    const dropdown = ul().class("rx-ac-dropdown")

    // Re-render list whenever options change
    options.observe(list => {
        dropdown.clear()
        ;(list ?? []).forEach((item, index) => {
            const isActive = transform(active, i => i === index)
            dropdown.add(
                li(labelFn(item))
                    .class("rx-ac-item")
                    .display(transform(isActive, v => v ? null : null)) // always visible
                    .setProperty("style", transform(isActive, v => v ? "background:#f0f4ff" : ""))
                    .onClick(() => commit(item))
            )
        })
        active.set(-1)
        open.set((list ?? []).length > 0)
    })

    return div(inputEl, div(dropdown).display(open))
        .class("rx-ac-wrap")
}

/**
 * Minimal default styles.
 * Apply with: document.adoptedStyleSheets = [...document.adoptedStyleSheets, autocompleteStyles]
 */
export const autocompleteStyles = new CSSStyleSheet()
autocompleteStyles.replaceSync(`
.rx-ac-wrap       { position: relative; display: inline-block; }
.rx-ac-input      { width: 100%; box-sizing: border-box; padding: 4px 8px;
                    border: 1px solid #ccc; border-radius: 3px; font: inherit; }
.rx-ac-dropdown   { position: absolute; top: 100%; left: 0; right: 0; margin: 2px 0 0;
                    padding: 0; list-style: none; border: 1px solid #ccc; border-radius: 3px;
                    background: #fff; box-shadow: 0 4px 12px rgba(0,0,0,.12);
                    max-height: 220px; overflow-y: auto; z-index: 999; }
.rx-ac-item       { padding: 6px 10px; cursor: pointer; }
.rx-ac-item:hover { background: #f0f4ff; }
`)
