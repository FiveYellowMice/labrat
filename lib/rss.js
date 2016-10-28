const rssParser = require("rss-parser");
const sqlite3 = require("sqlite3");
const telegramBot = require("./telegram.js");
const config = require("../config.js").rss;

function start() {
  doStuff();
  setInterval(doStuff, 1800000);

  function doStuff() {
    console.log("RSS receiver: Fetching RSS...");
    fetchFeed(config.url)
    .then(checkNewEntries, (err) => console.log("RSS receiver: Fetch failed. " + err))
    .then(processNewEntries, (err) => console.log("RSS receiver: Read database error. " + err))
    .then(markNewEntries, (err) => console.log("RSS receiver: Error while processing new entries. " + err))
    .catch((err) => console.log("RSS receiver: Write database error. " + err));
  }
}

function fetchFeed(url) { return new Promise((resolve, reject) => {
  rssParser.parseURL(url, (err, parsed) => {
    if (err) {
      reject(err);
      return;
    }
    resolve(parsed.feed);
  });
}); }

function checkNewEntries(feed) { return new Promise((resolve, reject) => {
  /**
   * It will use a SQLite database in `var/rss.sqlite` to store read RSS entries.
   * Every time it checks for new updates, it read the database, and then drop existing entries.
   */
  var db;

  new Promise((resolve, reject) => {
    // Initialize database, or create it.
    db = new sqlite3.Database(`${__dirname}/../var/rss.sqlite`, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  })
  .then(() => new Promise((resolve, reject) => {
    // Create table if not exists...
    db.run("CREATE TABLE IF NOT EXISTS fymblog (url TEXT)", (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  }), reject)
  .then(() => new Promise((resolve, reject) => {
    // Find existing entries.
    db.all("SELECT * FROM fymblog", (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(data || []);
    });
  }), reject)
  .then((existing) => new Promise((resolve, reject) => {
    // Close DB.
    db.close();
    // Compare entries got with ones in the database.
    existing = existing.map(entry => entry.url);
    var got = feed.entries.map(entry => entry.link);
    var newEntries = got.filter((entry) => {
      for (var i = 0; i < existing.length; i++) {
        if (entry === existing[i]) return false;
      }
      return true;
    });
    if (newEntries.length > 0) {
      console.log("RSS receiver: Found new entries. " + newEntries.join(" "));
    } else {
      console.log("RSS receiver: No new entries found. (Not an error)");
    }
    resolve(newEntries);
  }), reject)
  .then(resolve, reject);
}); }

function processNewEntries(entries) { return new Promise((resolve, reject) => {
  var requests = [];
  entries.forEach((entry) => {
    requests.push(telegramBot.sendApiRequest("sendMessage", {
      chat_id: config.channel,
      text: entry
    }));
  });
  Promise.all(requests).then(() => {
    resolve(entries);
  }, reject);
}); }

function markNewEntries(entries) { return new Promise((resolve, reject) => {
  var db;

  new Promise((resolve, reject) => {
    db = new sqlite3.Database(`${__dirname}/../var/rss.sqlite`, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  })
  .then(() => new Promise((resolve, reject) => {
    if (entries.length > 0) {
      db.run(`INSERT INTO fymblog (url) VALUES ("${entries.join("\"), (\"")}")`, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    } else resolve();
  }), reject)
  .then(() => new Promise((resolve, reject) => {
    db.close();
    resolve();
  }), reject)
  .then(resolve, reject);
}); }

module.exports = {
  start: start
}
