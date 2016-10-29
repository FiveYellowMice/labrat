"use strict";
const co = require("co");
const telegram = require("./telegram.js");
const twitter = require("./twitter.js");
const config = require("../config.js");

var isBotInForwardMode = false;
var pendingTelegramMessages;
var pendingTweet;
var pendingTweetPhotos;

function isApplicable(update) {
  if (!update.message) return false;
  if (!update.message.from) return false;
  if (update.message.from.id !== config.telegram.ownerId) return false;
  
  if (isBotInForwardMode) {
    return true;
  } else if (update.message.text && /^\/start_forward$/.test(update.message.text)) {
    return true;
  }
}

function processUpdate(update) { return co(function* () {
  var message = update.message;
  
  if (message.text && /^\/start_forward$/.test(message.text)) {
    isBotInForwardMode = true;
    pendingTelegramMessages = [];
    pendingTweet = "";
    pendingTweetPhotos = [];
    return yield telegram.sendApiRequest("sendMessage", {
      chat_id: message.chat.id,
      text: "Forward mode has started. Use /stop_forward to cancel."
    });
    
  } else if (message.text && /^\/stop_forward$/.test(message.text)) {
    isBotInForwardMode = false;
    pendingTelegramMessages = undefined;
    pendingTweet = undefined;
    pendingTweetPhotos = undefined;
    return yield telegram.sendApiRequest("sendMessage", {
      chat_id: message.chat.id,
      text: "Forward aborted."
    });
    
  } else if (message.text && /^\/finish_forward$/.test(message.text)) {
    isBotInForwardMode = false;
    try {
      yield sendForwardedMessagesAndTweets();
      yield telegram.sendApiRequest("sendMessage", {
        chat_id: message.chat.id,
        text: "Forwarding completed."
      });
    } catch (err) {
      console.log(`Telegram forward: Error: ${err.message}`);
      if (process.env["LABRAT_ENV"] === "dev") {
        console.log(err.stack);
      }
      
      yield telegram.sendApiRequest("sendMessage", {
        chat_id: message.chat.id,
        text: "Error occurred:\n" + err.stack
      });
    }
    return;
  }
  
  pendingTelegramMessages.push(message);
  
  if (message.forward_from) {
    pendingTweet += `From ${(message.forward_from.username || message.forward_from.first_name).substr(0, 24)} on Telegram:\n`;
  } else if (message.forward_from_chat) {
    pendingTweet += `From ${message.forward_from_chat.title.substr(0, 24)} on Telegram:\n`;
  }
  
  if (message.text) {
    pendingTweet += message.text;
    
  } else if (message.photo) {
    if (message.caption) {
      pendingTweet += message.caption;
    }
    
    let photoId = message.photo.sort((a, b) => b.width * b.height - a.width * a.height)[0].file_id;
    yield telegram.sendApiRequest("sendMessage", {
      chat_id: message.chat.id,
      text: `Downloading photo ${photoId}...`
    });
    let photo = yield telegram.downloadFile(photoId);
    pendingTweetPhotos.push(photo);
    
  } else {
    yield telegram.sendApiRequest("sendMessage", {
      chat_id: message.chat.id,
      text: "This message type is not supported on Twitter."
    });
  }
  
  yield telegram.sendApiRequest("sendMessage", {
    chat_id: message.chat.id,
    text:
      `Now there's ${pendingTelegramMessages.length} messages to forward.\n` +
      `Pending Tweet is (${pendingTweet.length} chars):\n${pendingTweet}\n\n` +
      `Pending Tweet has ${pendingTweetPhotos.length} photos.\n` +
      "Send /finish_forward when you finish, and /stop_forward to cancel.",
    disable_web_page_preview: true
  });
  
}); }

function sendForwardedMessagesAndTweets() { return co(function* () {
  
  // Forward forwarded message to channel.
  for (let i = 0; i < pendingTelegramMessages.length; i++) {
    let message = pendingTelegramMessages[i];
    yield telegram.sendApiRequest("forwardMessage", {
      chat_id: config.twitter.channelName,
      from_chat_id: message.chat.id,
      disable_notification: true,
      message_id: message.message_id
    });
  }
  
  // Upload Tweet photos.
  var mediaIds = [];
  for (let i = 0; i < pendingTweetPhotos.length; i++) {
    let photo = pendingTweetPhotos[i];
    let mediaId = (yield twitter.sendApiRequest({
      post: true,
      path: "media/upload",
      params: {
        media: photo
      }
    })).media_id_string;
    console.log(`Telegram forward: Uploaded photo ${mediaId} to Twitter.`);
    mediaIds.push(mediaId);
  }
  
  // Send Tweet.
  var newTweet = yield twitter.sendApiRequest({
    post: true,
    path: "statuses/update",
    params: {
      status: pendingTweet,
      media_ids: mediaIds.join(",")
    }
  });
  
  yield telegram.sendApiRequest("sendMessage", {
    chat_id: config.twitter.channelName,
    text: `<a href="https://twitter.com/${newTweet.user.screen_name}/status/${newTweet.id_str}">Reply</a>`,
    parse_mode: "HTML",
    disable_web_page_preview: true
  });
  
  
  pendingTelegramMessages = undefined;
  pendingTweet = undefined;
  pendingTweetPhotos = undefined;
  
}); }

module.exports = {
  isApplicable: isApplicable,
  processUpdate: processUpdate
};