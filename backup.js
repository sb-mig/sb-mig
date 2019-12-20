const StoryblokClient = require("storyblok-js-client");
const fs = require("fs");
const { accessToken } = require("./config");

let client = new StoryblokClient({
  accessToken
});

let lastPage = 1;
let getStories = page => {
  client
    .get("cdn/stories", {
      version: "draft",
      per_page: 25,
      page: page
    })
    .then(res => {
      let stories = res.data.stories;
      stories.forEach(story => {
        fs.writeFile(
          "./backup/" + story.id + ".json",
          JSON.stringify(story),
          err => {
            if (err) throw err;

            console.log(story.full_slug + " backed up");
          }
        );
      });

      let total = res.total;
      lastPage = Math.ceil(res.total / res.perPage);

      if (page <= lastPage) {
        page++;
        getStories(page);
      }
    });
};

getStories(1);
