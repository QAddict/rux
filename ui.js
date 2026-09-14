import {state, transform, each, set} from "./mvc.js"
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
