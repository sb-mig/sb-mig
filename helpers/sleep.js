const sleepBlock = milliseconds => {
  const date = Date.now();
  let currentDate = null;
  do {
    currentDate = Date.now();
  } while (currentDate - date < milliseconds);
};

const sleep = ms => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

module.exports = { sleep, sleepBlock };
