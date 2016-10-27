const fs = require("fs");
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
        latestTweetId = Number(fs.readFileSync(__dirname + "/../var/latest-tweet-id.txt", "utf8"));
        if (latestTweetId.isNaN) {
            latestTweetId = null;
        }
    } catch (err) {
        latestTweetId = null;
    }
    doStuff();
    setInterval(doStuff, 1800000);
}

function doStuff() {
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
    
    sendApiRequest({
        path: "statuses/user_timeline",
        params: params
    })
    .then((tweets) => {
        return tweets.filter(filterTweet).reverse();
    })
    .then((tweets) => {
        return Promise.all(tweets.map(processTweet));
    })
    .catch((err) => {
        console.log("Twitter Sync: Error: " + err.message);
    });
}

function filterTweet(tweet) {
    if (tweet.in_reply_to_user_id_str) {
        return false;
    } else {
        return true;
    }
}

function processTweet(tweet) {
    latestTweetId = tweet.id;
    fs.writeFile(__dirname + "/../var/latest-tweet-id.txt", String(latestTweetId), function(err) {
        if (err) {
            console.log("Twitter Sync: " + err.message);
        }
    });
    console.log("Twitter Sync: New Tweet: " + tweet.text);
    
    var messageText =
        telegram.tgHtmlEscape(tweet.text) + "\n\n" +
        "<a href=\"https://twitter.com/" + tweet.user.screen_name + "/status/" + tweet.id + "\">评论</a>";
    
    return telegram.sendApiRequest("sendMessage", {
        chat_id: config.twitter.channelName,
        text: messageText,
        parse_mode: "HTML"
    });
}

module.exports = {
    sendApiRequest: sendApiRequest,
    start: start
};