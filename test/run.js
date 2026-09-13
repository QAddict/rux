import rules from "./suite.css" with { type: "css" };
import {node} from "../mvc.js";
document.adoptedStyleSheets = [rules];

let currentTest = ""
export function suite(def) {
    let rep = report(def)
    Object
        .entries(def)
        .filter(testMethods)
        .flatMap(testCases(def))
        .forEach(testCase => runTestCase(testCase).finally(() => rep(testCase)));
}

function testMethods(entry) {
    return entry[1] instanceof Function
}

function testCases(def) {
    return ([name, value]) => {
        let data = def[name + "Data"]
        return Array.isArray(data) ? data.map(row => testCases(name, value, row)) : [testCase(name, value, data)]
    }
}

function testCase(name, scenario, parameters) {
    return {
        name: name,
        parameters: parameters,
        async run() {
            if(Array.isArray(parameters)) await scenario(...parameters)
            else await scenario(parameters)
        }
    }
}

async function runTestCase(testCase) {
    testCase.start = new Date()
    try {
        currentTest = testCase.name
        await testCase.run().catch(error => testCase.error = error)
    } catch (error) {
        testCase.error = error
    }
    testCase.end = new Date()
    return testCase
}

function report(def) {
    let s = document.body.appendChild(document.createElement("div"))
    s.setAttribute("class", "suite")
    s.appendChild(document.createElement("h1")).appendChild(document.createTextNode(def.name))
    let tb = s.appendChild(document.createElement("table")).appendChild(document.createElement("tbody"))
    let thr = tb.appendChild(document.createElement("tr"))
    thr.appendChild(document.createElement("th")).appendChild(document.createTextNode("TestCase"))
    thr.appendChild(document.createElement("th")).appendChild(document.createTextNode("Start"))
    thr.appendChild(document.createElement("th")).appendChild(document.createTextNode("End"))
    thr.appendChild(document.createElement("th")).appendChild(document.createTextNode("Error"))
    return testCase => {
        let t = tb.appendChild(document.createElement("tr"))
        let tn = t.appendChild(document.createElement("td"))
        tn.appendChild(document.createElement("strong").appendChild(document.createTextNode(testCase.name)))
        if(testCase.parameters) tn.appendChild(document.createTextNode(testCase.parameters))
        t.appendChild(document.createElement("td")).appendChild(document.createTextNode(testCase.start.toISOString()))
        t.appendChild(document.createElement("td")).appendChild(document.createTextNode(testCase.end.toISOString()))
        t.appendChild(document.createElement("td")).appendChild(document.createTextNode(testCase.error || ""))
        t.setAttribute("class", testCase.error ? "failed" : "passed")
    }
}

export function assertEquals(expected, actual) {
    if(expected !== actual) throw new Error("Expected: " + expected + " to be equal to: " + actual + " but not equal.")
}

export function output(...children) {
    let out = document.body.appendChild(document.createElement("div"))
    out.appendChild(document.createElement("h3")).appendChild(document.createTextNode("Output of: " + currentTest))
    out.setAttribute("class", "output-box")
    let cnt = out.appendChild(document.createElement("div"))
    cnt.setAttribute("class", "output")
    children.forEach(child => cnt.appendChild(node(child)))
}

export async function assert(predicate) {
    return  new Promise((resolve, reject) => retry(predicate, 3, resolve, reject))
}

function retry(predicate, remaining, resolve, reject) {
    if(remaining < 1) reject(new Error("Failed"))
    if(predicate())
        resolve()
    else {
        console.log("Retrying...")
        setTimeout(retry, 200, predicate, remaining - 1, resolve, reject)
    }
}

export function assertThrow(action) {
    let thrown = false;
    try {
        action();
    } catch {
        thrown = true;
    }
    assertEquals(true, thrown);
}
