"use strict";
const fs = require("fs");
const co = require("co");
const Twitter = require("twitter");
const telegram = require("./telegram.js");
const config = require("../config.js");

var twitterApiClient = new Twitter({
  consumer_key: config.twitter.consumerKey,
  consumer_secret: config.twitter.consumerSecret,
  access_token_key: config.twitter.accessToken,
  access_token_secret: config.twitter.accessTokenSecret
});

var latestTweetId;

function sendApiRequest(options) {
  return new Promise((resolve, reject) => {
    twitterApiClient.get(options.path, options.params, function(err, result, response) {
      if (err) {
        if (err instanceof Array) {
          err = new Error(err[0].message);
        }
        reject(err);
        return;
      }
      resolve(result);
    });
  });
}

function start() {
  try {
    latestTweetId = fs.readFileSync(__dirname + "/../var/latest-tweet-id.txt", "utf8").trim();
  } catch (err) {
    latestTweetId = null;
  }
  doStuff();
  setInterval(doStuff, 1800000);
}

function doStuff() { co(function* () {
  console.log("Twitter Sync: Getting updates...");
  
  var params = {
    screen_name: "hkz85825915",
    exclude_replies: false,
    include_rts: true
  };
  
  if (latestTweetId) {
    params.since_id = latestTweetId;
  } else {
    params.count = 1;
  }
  
  var tweets = yield sendApiRequest({
    path: "statuses/user_timeline",
    params: params
  });
  
  tweets = tweets.filter(filterTweet).sort((a, b) => {
    return (new Date(a.created_at)) - (new Date(b.created_at));
  });
  
  for (var i = 0; i < tweets.length; i++) {
    yield processTweet(tweets[i]);
  }
})
.catch((err) => {
  console.log("Twitter Sync: Error: " + err.message);
  //console.log(err.stack);
}); }

function filterTweet(tweet) {
  if (tweet.in_reply_to_user_id_str) {
    return false;
  } else {
    return true;
  }
}

function processTweet(tweet) { return co(function* () {
  latestTweetId = tweet.id_str;
  fs.writeFile(__dirname + "/../var/latest-tweet-id.txt", latestTweetId, function(err) {
    if (err) {
      console.log("Twitter Sync: " + err.message);
    }
  });
  console.log("Twitter Sync: New Tweet: " + tweet.text.split("\n").join(" "));
  //console.log(JSON.stringify(tweet, null, "  "));
  
  var retweeted = tweet.retweeted;
  if (retweeted) {
    tweet = tweet.retweeted_status;
  }
  
  var messageText = tweet.text;
  var entities = [];
  ["media", "urls", "user_mentions", "hashtags"].forEach((entityType) => {
    if (!tweet.entities[entityType]) {
      return;
    }
    
    tweet.entities[entityType].forEach((entity) => {
      entity.entityType = entityType;
      entities.push(entity);
    });
  });
  entities = entities.sort((a, b) => {
    return b.indices[0] - a.indices[0];
  });
  
  if (entities.length > 0) {
    var messageTextAfterLastEntity = messageText.substr(entities[0].indices[1]);
    messageText = messageText.substr(0, entities[0].indices[1]) + telegram.tgHtmlEscape(messageTextAfterLastEntity);
  }
    
  entities.forEach((entity, i) => {
    var stringBefore = messageText.substr(0, entity.indices[0]);
    var entityString = messageText.substr(entity.indices[0], entity.indices[1]);
    var stringAfter = messageText.substr(entity.indices[1]);
    
    if (i < entities.length - 1) {
      var nextEntity = entities[i + 1];
      var beforeStringBefore = stringBefore.substr(0, nextEntity.indices[1]);
      var stringAfterNext = stringBefore.substr(nextEntity.indices[1]);
      stringBefore = beforeStringBefore + telegram.tgHtmlEscape(stringAfterNext);
    }
    
    var reconstructedEntity;
    switch (entity.entityType) {
      case "media":
        reconstructedEntity = `<a href="${telegram.tgHtmlEscape(entity.media_url_https)}">Picture</a>`;
        break;
      case "urls":
        reconstructedEntity = `<a href="${telegram.tgHtmlEscape(entity.expanded_url)}">${telegram.tgHtmlEscape(entity.display_url)}</a>`;
        break;
      case "user_mentions":
        reconstructedEntity = `<a href="https://twitter.com/${entity.screen_name}">@${entity.screen_name}</a>`;
        break;
      case "hashtags":
        reconstructedEntity = `<a href="https://twitter.com/hashtag/${telegram.tgHtmlEscape(encodeURIComponent(entity.text))}">#${telegram.tgHtmlEscape(entity.text)}</a>`;
        break;
      default:
        reconstructedEntity = "";
    }
    
    messageText = stringBefore + reconstructedEntity + stringAfter;
  });
  
  messageText = messageText + `\n\n<a href="https://twitter.com/${tweet.user.screen_name}/status/${tweet.id_str}">评论</a>`;
  
  if (retweeted) {
    messageText = `From <a href="https://twitter.com/${tweet.user.screen_name}">@${tweet.user.screen_name}</a>:\n` + messageText;
  }
  
  if (tweet.entities.media) {
    for (var i = 0; i < tweet.entities.media.length; i++) {
      yield telegram.sendApiRequest("sendPhoto", {
        chat_id: config.twitter.channelName,
        photo: tweet.entities.media[i].media_url_https,
        disable_notification: true
      });
    }
  }
  
  return yield telegram.sendApiRequest("sendMessage", {
    chat_id: config.twitter.channelName,
    text: messageText,
    parse_mode: "HTML",
    disable_web_page_preview: true
  });
}); }

module.exports = {
  sendApiRequest: sendApiRequest,
  start: start
};
