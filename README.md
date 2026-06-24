# RUX
**R**apid **U**ser e**X**perience

A lightweight, zero-dependency pure ES6 library for building reactive single-page applications. No build step, no compiler, no framework — just JavaScript modules you drop straight into your app.

---

## Philosophy

RUX is built around one idea: **separate your data from your presentation, and let changes flow automatically**. You define a model, build a view that references it, connect it to a server endpoint, and you're done. When data changes, the UI updates itself.

The entire library fits in four files: `mvc.js` (state), `html.js` (DOM), `svg.js` (graphics), and `io.js` (remote).

---

## Core concepts

### 1. Reactive state with `mvc.js`

At the heart of RUIX is the `state()` function, which creates a reactive model. Any part of the UI observing that model will update automatically when it changes.

```js
import { state, transform } from "./mvc.js"

const count = state(0)

// Derive a new observable from an existing one
const doubled = transform(count, v => v * 2)

count.set(5)
console.log(doubled.get()) // 10
```

Models support structured data out of the box. Access nested properties directly — they become observables too:

```js
const user = state()

user.set({ firstName: "Jane", lastName: "Doe" })

// user.firstName and user.lastName are live observables
console.log(user.firstName.get()) // "Jane"
```

Observe a model immediately and on every future change:

```js
count.observe(v => console.log("count is now", v)) // fires immediately with current value
count.observeChanges(v => console.log("changed to", v)) // fires only on future changes
```

---

### 2. Declarative UI with `html.js`

Build DOM trees with a fluent, composable API. Every element function returns a builder you can chain. Pass a model anywhere a value is expected and the DOM will stay in sync automatically.

```js
import { body, div, h1, p, button, input, span } from "./html.js"
import { state, set, toggle } from "./mvc.js"

const name    = state("World")
const visible = state(true)

body(
    h1("Hello, ", name, "!"),
    input(name).placeholder("Your name"),  // two-way binding

    button("Toggle").onClick(toggle(visible)),
    div("I appear and disappear")
        .display(visible)
)
```

Typing into the input updates `name`, which instantly updates the `h1`. No event wiring, no manual DOM queries.

---

### 3. Rendering lists with `each()`

Render dynamic lists from array models. RUIX handles adds, removes, and updates efficiently, including optional key-based reconciliation.

```js
import { body, table, thead, tbody, tr, th, td } from "./html.js"
import { state, each } from "./mvc.js"
import { get, bind } from "./io.js"

const books = state([])

body(
    table(
        thead(tr(th("Author"), th("Title"), th("ISBN"))),
        tbody(
            each(books, book => tr(
                td(book.author),
                td(book.title),
                td(book.ISBN)
            ))
        )
    )
)

// Load from server and bind to model
const booksApi = get("./api/books.json")
bind(booksApi, books)
booksApi.trigger()
```

---

### 4. Remote data with `io.js`

Connect models to REST endpoints, Server-Sent Events, or WebSockets. All connectors expose `output`, `error`, and `loading` as observable state, so you can bind them directly to UI.

#### GET

```js
import { get, bind } from "./io.js"
import { state } from "./mvc.js"
import { div, p, span } from "./html.js"

const weather = state()
const api     = get("/api/weather")

bind(api, weather)

div(
    p("Temperature: ", weather.temp, "°C"),
    p("Humidity: ",    weather.humidity, "%")
)

api.trigger() // fetch once
```

#### Reactive URL — re-fetch when a model changes

```js
import { get } from "./io.js"
import { state, uri } from "./mvc.js"

const selectedId = state(1)
const user       = state()

// URL rebuilds whenever selectedId changes, and fetches immediately
get(uri("/api/users/{id}", selectedId), user).observeUrl()

// Changing selectedId automatically re-fetches
selectedId.set(42)
```

#### POST with reactive body

```js
import { post } from "./io.js"
import { state } from "./mvc.js"

const query   = state({ term: "" })
const results = state([])

// Re-POST every time query changes; fires immediately with current value
post("/api/search", query, results).observeBody()

// Updating the query triggers a new request automatically
query.term.set("RUIX")
```

#### Server-Sent Events — real-time push

```js
import { sse, bind } from "./io.js"
import { state } from "./mvc.js"
import { div, span } from "./html.js"

const price = state()
const feed  = sse("/api/prices/stream")

bind(feed, price)
feed.connect()

div("BTC: $", price.btc, "  ETH: $", price.eth)
```

#### WebSocket — bidirectional

```js
import { webs } from "./io.js"
import { state } from "./mvc.js"

const outgoing = state()
const incoming = state()

webs("/ws/chat", outgoing, incoming).connect()

// Sending: update the outgoing model
outgoing.set({ text: "Hello!" })

// Receiving: observe the incoming model
incoming.observeChanges(msg => console.log("Received:", msg))
```

#### Loading and error states

Every connector exposes `loading` and `error` as models you can bind directly into the view:

```js
const api = get("/api/data")
bind(api, data)

div(
    span("Loading…").display(api.loading),
    span("Error: ", api.error).display(transform(api.error, v => v != null)),
    table(/* data rows */).display(transform(api.loading, v => !v))
)

api.trigger()
```

---

## Testing

RUIX ships with a minimal browser-native test runner in `test/run.js`. No Node.js, no test framework — just ES modules opened in a browser tab.

```js
// test/test-mvc.js
import { suite, assert, assertEquals } from "./run.js"
import { state, stateModel, transform } from "../mvc.js"

suite({
    name: "StateModel",

    testInitialValue() {
        assertEquals(stateModel(42).get(), 42)
    },

    testObserversFireOnSet() {
        const m = stateModel(0)
        let received = null
        m.observeChanges(v => received = v)
        m.set(99)
        assertEquals(received, 99)
    },

    testObserveFiresImmediately() {
        const m = stateModel("hello")
        let received = null
        m.observe(v => received = v)
        assertEquals(received, "hello")
    },

    testTransformUpdatesWithParent() {
        const m = stateModel(5)
        const doubled = transform(m, v => v * 2)
        m.set(7)
        assertEquals(doubled.get(), 14)
    }
})
```

Open `test/index.html` in a browser and check the console for results. Tests are grouped by suite, with a `✅` / `❌` per test and a summary at the end.

---

## Key benefits

**No build step.** Import directly from `<script type="module">`. Works from a file server or even `file://`.

**No dependencies.** Zero npm packages, zero bundlers, zero configuration.

**Reactive by default.** Pass a model where a value is expected and the UI stays in sync — no manual re-renders, no diffing engine to learn.

**Composable.** Models, views, and connectors are all just objects. Combine them freely; the library stays out of your way.

**Small.** The entire library is under 5KB minified. You can read and understand every line.

**Testable in the browser.** The built-in test runner uses the same ES module pattern as the rest of the library — no separate toolchain needed.
