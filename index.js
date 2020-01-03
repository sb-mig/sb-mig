// main file

const clear = require("clear");
const chalk = require("chalk");
const figlet = require("figlet");
const inquirer = require("./inquirer");

clear();




console.log(
  chalk.yellow(figlet.textSync("sb-mig", { horizontalLayout: "full" }))
);

const run = async () => {
  const storyblokCredentials = await inquirer.askStoryblokCredentials();
  console.log(storyblokCredentials);
};

run();
