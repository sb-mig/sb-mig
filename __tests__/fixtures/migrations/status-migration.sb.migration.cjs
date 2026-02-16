/*
 Example migration template for sb-mig E2E tests.
 Updates a component field and marks the change as replaced.
*/

const migrateStatus = (componentData) => {
    const nextStatus =
        componentData.status === "before" ? "after" : componentData.status;

    return {
        wasReplaced: componentData.status !== nextStatus,
        data: {
            ...componentData,
            status: nextStatus,
        },
    };
};

module.exports = {
    "__COMPONENT_NAME__": migrateStatus,
};
