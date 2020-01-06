// main file

const clear = require("clear");
const chalk = require("chalk");
const figlet = require("figlet");

clear();

console.log(
  chalk.yellow(figlet.textSync("sb-mig", { horizontalLayout: "full" }))
);
