const { componentByName } = require("./discover.js")

const components = [
  {
    name: "component-1",
    display_name: "Component 1",
    is_root: false,
    is_nestable: true,
    schema: {
      title: {
        type: "text",
        pos: 1
      }
    }
  },
  {
    name: "component-2",
    display_name: "Component 2",
    is_root: false,
    is_nestable: true,
    schema: {
      title: {
        type: "text",
        pos: 1
      }
    }
  }
]

describe("Discover", () => {
  test("componentByName should return proper component name", () => {
    const assert = componentByName(components, "component-1")
    expect(assert.name).toBe("component-1")
  })
})
