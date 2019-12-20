const restApi = require("./restApi");
const { sbApi } = require("./sbApi.js");

switch (process.argv[2]) {
  case "storyblok-client":
    console.log("Making request with storyblok-client");
    sbApi
      .getAll("cdn/links", { version: "draft" })
      .then(results => console.log(results));
    break;
  case "all-presets":
    restApi.getAllPresets().then(res => {
      console.log("this are all presets");
      console.log(res);
    });
    break;

  default:
    console.log("Not making any request");
    break;
}
