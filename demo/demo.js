import {body, br, button, h1, p, table, tbody, td, th, tr} from "../html.js";
import {circle, line, rect, svg} from "../svg.js";
import {each, set, state} from "../mvc.js";
import {bind, get} from "../io.js";
import rules from "../ruix.css" with { type: "css" };
import {autocomplete} from "../ui.js";
document.adoptedStyleSheets = [rules];

const model = state('Click me')
const bookstore = state([])
const search = state("")
const options = state([])
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
    autocomplete(search, options)
)

search.observeChanges(s => options.set(allOptions.filter(m => m.startsWith(s))))

const bookApi = get("./demo.json")

bind(bookApi, bookstore)

bookApi.trigger()
