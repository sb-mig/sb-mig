const inquirer = require("inquirer");
const files = require("./helpers/files");

const askStoryblokCredentials = () => {
  const questions = [
    {
      name: "spaceId",
      type: "input",
      message: "Enter your storyblok space id: ",
      validate: value =>
        value.length ? true : "Please your storyblok space id:"
    },
    {
      name: "acccesToken",
      type: "input",
      message: "Enter your access token (preview for storyblok space): ",
      validate: value =>
        value.length
          ? true
          : "Enter your access token (preview for storyblok space): "
    },
    {
      name: "oauthToken",
      type: "input",
      message: "Enter your oauth token (from your storyblok account): ",
      validate: value =>
        value.length
          ? true
          : "Enter your oauth token (from your storyblok account): "
    }
  ];
  return inquirer.prompt(questions);
};


module.exports = {
    askStoryblokCredentials
}
