import {body, br, button, captionTop, h1, p, pre, table, tbody, td, th, tr} from "../html.js";
import {circle, line, rect, svg} from "../svg.js";
import {each, functionModel, set, state, uri} from "../mvc.js";
import {bind, get} from "../io.js";
import rules from "../ruix.css" with { type: "css" };
import {autocomplete, dataGrid, pageableGrid, position, richTextEditor, searchControls} from "../ui.js";
document.adoptedStyleSheets = [rules];

const model = state('Click me')
const bookstore = state([])
const filter = state("")
const pages = state(null)
const request = state({page: 0})
const search = state("")
const options = state([])
const edited = state("")
const allOptions = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "December"]
body(
    h1("RUIX demo"),
    p("Hello world!"),
    button(model).onClick(set(model, 'Clicked')),
    br(),
    table(
        tbody(
            tr(
                th("Author"),
                th("Title"),
                th("ISBN")
            ),
            each(bookstore, book => tr(
                td(book.author),
                td(book.title),
                td(book.ISBN)
            ))
        )
    ),
    svg(
        rect().x(10).y(10).width(100).height(100).stroke('black').fill('red'),
        line().x1(10).y1(10).x2(100).y2(100).stroke('blue'),
        circle().cx(55).cy(55).r(40).fill('green')
    ),
    autocomplete(search, options),
    {x:12,y:13},

    richTextEditor(edited),
    pre(edited),
    pageableGrid(request.page, pages, [position, "name"], row => row.id),
    dataGrid(functionModel((data, filter) => data.filter(book => book.title.includes(filter)), bookstore, filter), ["author", "title"])
        .add(captionTop(searchControls(filter)))

)

search.observeChanges(s => options.set(allOptions.filter(m => m.startsWith(s))))

const bookApi = get("./demo.json")

bind(bookApi, bookstore)

get(uri("page{page}.json", request), pages).observeUrl()

bookApi.trigger()
