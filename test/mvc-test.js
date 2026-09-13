import {assertEquals, assertThrow, output, suite} from "./run.js";
import {addTo, requireFunction, state, transform} from "../mvc.js";

suite({

    name: "MVC test suite",

    testState() {
        let testState = state()
        testState.set(3)
        output("Test state: ", testState)
        assertEquals(3, testState.get())
    },

    testTransform() {
        let sourceState = state()
        let transformedState = transform(sourceState, value => value + 10)
        output("Transformed state: ", transformedState)
        sourceState.set(3)
        assertEquals(13, transformedState.get())
    },

    testAddToPreservesArrayAndNotifiesObservers() {
        const original = ["A"];
        const model = state(original);
        let notifications = 0;
        let received;

        model.observeChanges(value => {
            notifications++;
            received = value;
        });

        addTo(model, "B")();

        assertEquals(true, Array.isArray(model.get()));
        assertEquals(false, original === model.get());
        assertEquals(2, model.get().length);
        assertEquals("A", model.get()[0]);
        assertEquals("B", model.get()[1]);

        assertEquals(1, original.length);
        assertEquals("A", original[0]);

        assertEquals(1, notifications);
        assertEquals(model.get(), received);

        addTo(model, "C")();

        assertEquals(3, model.get().length);
        assertEquals("C", model.get()[2]);
        assertEquals(2, notifications);
    },

    testAddToInitializesNull() {
        const model = state(null);

        addTo(model, "A")();

        assertEquals(true, Array.isArray(model.get()));
        assertEquals(1, model.get().length);
        assertEquals("A", model.get()[0]);
    },

    testRequireFunctionReturnsOriginalCallback() {
        const callback = value => value;

        assertEquals(callback, requireFunction(callback));
    },

    testRequireFunctionRejectsNonCallablePrototype() {
        const fakeFunction = Object.create(Function.prototype);

        assertEquals("object", typeof fakeFunction);
        assertThrow(() => requireFunction(fakeFunction));
    },

    testRequireFunctionAcceptsFunctionFromAnotherRealm() {
        const frame = document.createElement("iframe");
        frame.hidden = true;
        document.body.appendChild(frame);

        try {
            const callback = frame.contentWindow.Array;

            assertEquals("function", typeof callback);
            assertEquals(false, callback instanceof Function);
            assertEquals(callback, requireFunction(callback));
        } finally {
            frame.remove();
        }
    }

})
