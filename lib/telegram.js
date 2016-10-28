"use strict";
const https = require("https");
const config = require("../config.js");

function tgHtmlEscape(text) {
  return text
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");
}

function sendApiRequest(method, params) { return new Promise((resolve, reject) => {
  // curl -X POST -H "Content-Type: application/json" -d "${data}" \
  // https://api.telegram.org/bot${token}/${method}
  if (process.env["LABRAT_ENV"] === "dev") {
    console.log(`Telegram bot: Sending request ${method},\n${JSON.stringify(params, null, "  ")}`);
  }
  
  var request = https.request({
    hostname: "api.telegram.org",
    method: "POST",
    path: `/bot${config.telegram.token}/${method}`,
    headers: {
      "content-type": "application/json"
    }
  });
  request.end(JSON.stringify(params));
  request.on("error", (e) => {
    console.log("Telegram bot: Unable to send API request. " + e.message);
    reject(e);
  });

  request.on("response", (response) => {
    var body = [];
    response.on("data", (chunk) => body.push(chunk));
    response.on("end", () => {
      var responseText = Buffer.concat(body);
      try {
        var responseJson = JSON.parse(responseText);
        if (responseJson.ok === true) {
          console.log("Telegram bot: Message sent succesfully. " + (responseJson.description ? responseJson.description : ""));
          resolve(responseJson.result);
        } else {
          console.log("Telegram bot: Message sending failed. "+ responseJson.description);
          reject(new Error(responseJson.description));
        }
      } catch (e) {
        console.log("Telegram bot: Message sent, but received unparsable JSON: " + responseText);
        reject(new Error(responseText));
      }
    });
    response.on("error", (e) => {
      console.log("Telegram bot: Unable to get response after an API call." + e.message);
      reject(e);
    });
  });
}); }

function downloadFile(fileId) {
  return sendApiRequest("getFile", {
    file_id: fileId
  })
  .then((fileInfo) => { return new Promise((resolve, reject) => {
    var request = https.request({
      hostname: "api.telegram.org",
      method: "GET",
      path: `/file/bot${config.telegram.token}/${fileInfo.file_path}`
    });
    
    request.end();
    
    request.on("error", (e) => {
      console.log("Telegram bot: Unable to download file. " + e.message);
      reject(e);
    });
    
    request.on("response", (response) => {
      var body = [];
      response.on("data", (chunk) => body.push(chunk));
      response.on("end", () => {
        var responseContent = Buffer.concat(body);
        console.log(`Downloaded ${responseContent.length} bytes.`);
        resolve(responseContent);
      });
      response.on("error", (e) => {
        console.log("Telegram bot: Unable to download file. " + e.message);
        reject(e);
      });
    });
  }); });
}

module.exports = {
  sendApiRequest: sendApiRequest,
  downloadFile: downloadFile,
  tgHtmlEscape: tgHtmlEscape
};
