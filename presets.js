const Fetch = require("node-fetch");
const Logger = require("./helpers/logger");

const createPreset = (presetId) => {
    Logger.warning(`Trying to create preset with id: '${presetId}'`);
}

const updatePreset = (presetId) => {
    Logger.warning(`Trying to update preset with id: '${presetId}'`);
}

module.exports = {
    createPreset,
    updatePreset
}