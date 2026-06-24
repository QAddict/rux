import { state, stateModel, isObservable } from "./mvc.js"

export class Remote {
    constructor(url, output = state()) {
        this.url     = stateModel(url)
        this.headers = state({})
        this.output  = output
        this.error   = state(null)
        this.loading = state(false)
    }

    connect() {
        throw new Error("Undeclared method Remote.connect()")
    }

    trigger() {
        this.connect()
        return this
    }

    /** Bind output to a model or function. Fluent alternative to bind(remote, model). */
    bind(modelOrFn) {
        this.output.observeChanges(isObservable(modelOrFn) ? v => modelOrFn.set(v) : modelOrFn)
        return this
    }

    /** Re-connect on future URL changes only. */
    observeUrlChanges() {
        this.url.observeChanges(() => this.connect())
        return this
    }

    /** Re-connect immediately with current URL, and on every future change. */
    observeUrl() {
        this.url.observe(() => this.connect())
        return this
    }
}

export class Get extends Remote {
    connect() {
        this.loading.set(true)
        this.error.set(null)
        fetch(this.url.get(), { headers: this.headers.get(), credentials: "include" })
            .then(r => r.ok ? r.json() : Promise.reject(r))
            .then(data => { this.output.set(data); this.loading.set(false) })
            .catch(err => { this.error.set(err);   this.loading.set(false) })
    }
}

export class Post extends Remote {
    constructor(url, body, output = state()) {
        super(url, output)
        this.headers.set({ "Content-Type": "application/json" })
        this.body = stateModel(body)
    }

    connect() {
        this.loading.set(true)
        this.error.set(null)
        fetch(this.url.get(), {
            headers: this.headers.get(),
            credentials: "include",
            method: "POST",
            body: JSON.stringify(this.body.get())
        })
            .then(r => r.ok ? r.json() : Promise.reject(r))
            .then(data => { this.output.set(data); this.loading.set(false) })
            .catch(err => { this.error.set(err);   this.loading.set(false) })
    }

    /** Re-POST on future body changes only. */
    observeBodyChanges() {
        this.body.observeChanges(() => this.connect())
        return this
    }

    /** Re-POST immediately with current body, and on every future change. */
    observeBody() {
        this.body.observe(() => this.connect())
        return this
    }
}

export class SSE extends Remote {
    connect() {
        this._source?.close()
        this.error.set(null)
        const src = new EventSource(this.url.get(), { withCredentials: true })
        src.onmessage = e => this.output.set(JSON.parse(e.data))
        src.onerror   = e => this.error.set(e)
        this._source = src
    }

    disconnect() { this._source?.close(); this._source = null }
}

export class Webs extends Remote {
    constructor(url, input, output = state()) {
        super(url, output)
        this.input = stateModel(input)
    }

    connect() {
        this._ws?.close()
        this.loading.set(true)
        this.error.set(null)
        const ws = new WebSocket(this.url.get())
        ws.onopen    = ()  => this.loading.set(false)
        ws.onmessage = m   => m.data && this.output.set(JSON.parse(m.data))
        ws.onerror   = e   => this.error.set(e)
        this.input.observeChanges(v => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(v)))
        this._ws = ws
    }

    disconnect() { this._ws?.close(); this._ws = null }
}

// Factory functions
export function get(url, output)         { return new Get(url, output) }
export function post(url, body, output)  { return new Post(url, body, output) }
export function sse(url, output)         { return new SSE(url, output) }
export function webs(url, input, output) { return new Webs(url, input, output) }

// Kept for backward compatibility and the rux idiom
export function bind(channel, model) {
    channel.output.observeChanges(data => model.set(data))
}
