import {assert} from "chai";

import {isItFactory} from "../src/utils/main.js";

describe("isItFactory for parsing flags", () => {
    it("works correctly", () => {
        const rules = {
            all: ['all'],
            stories: ['stories'],
            allWithSSOT: ['all', 'ssot'],
            allWithPresets: ['all', 'presets'],
            onlyPresets: ['presets'],
            empty: []
        }


        const flagsArray = [
            {
                cases:   { from: 1234,  to: 987, all: true},
                answers: { all: true, stories: false, allWithSSOT: false, allWithPresets: false, onlyPresets: false, empty: false }
            },
            {
                cases:   { from: 1234,  to: 987, all: true, presets: true},
                answers: { all: false, stories: false, allWithSSOT: false, allWithPresets: true, onlyPresets: false, empty: false }
            },
            {
                cases:   { from: 1234,  to: 987, all: true, ssot: true},
                answers: { all: false, stories: false, allWithSSOT: true, allWithPresets: false, onlyPresets: false, empty: false }
            },
            {
                cases:   { from: 1234,  to: 987, presets: true},
                answers: { all: false, stories: false, allWithSSOT: false, allWithPresets: false, onlyPresets: true, empty: false }
            },
            {
                cases:   { from: 1234,  to: 987},
                answers: { all: false, stories: false, allWithSSOT: false, allWithPresets: false, onlyPresets: false, empty: true }
            },
            {
                cases:   { },
                answers: { all: false, stories: false, allWithSSOT: false, allWithPresets: false, onlyPresets: false, empty: true }
            },
            {
                cases:   { all: true, presets: true, stories: true, ssot: true },
                answers: { all: false, stories: false, allWithSSOT: false, allWithPresets: false, onlyPresets: false, empty: false }
            },
        ]

        flagsArray.forEach((flags, index) => {
            const isIt = isItFactory<keyof (typeof rules)>(flags.cases, rules, ['from', 'to'])

            Object.keys(rules).forEach((rule: any) => {
                const check = {
                    [`${index}`]: {
                        result: isIt(rule)
                    }
                }

                const answer ={
                    [`${index}`]: {
                        result: (flags.answers as any)[rule]
                    }
                }

                assert.deepEqual(check, answer);
            })
        })
    });
});