
const https = require("https");
const config = require("../config.js").telegram;

function processWebhook(request, response) {
	if (request.url !== `/webhooks/telegram/${config.webhookToken}/`) {
		console.log("Telegram bot received a webhook request with invalid token.");
		response.statusCode = 403;
		response.end("Invalid token.\n");
		return;
	}

	var body = [];
	request.on("data", (chunk) => body.push(chunk));
	request.on("end", () => processUpdate(Buffer.concat(body)));
	response.statusCode = 204;
	response.end();
}

function processUpdate(updateJson) {
	console.log("Telegram bot:" + updateJson);
	try {
		var update = JSON.parse(updateJson);
	} catch (e) {
		console.log("Error parsing JSON.");
		return;
	}

	//console.log(update);
	if (update.message && update.message.text && update.message.chat && update.message.chat.id) {
		replyMessage(update.message.chat.id, update.message.message_id, update.message.text);
	}
}

function replyMessage(chatId, messageId, text) {
	// Test if it is a command
	if (/^(?:\/\w+@labratbot(?: |$)|\/\w+(?!@))/.test(text)) {
		var command = text.match(/^\/(\w+)(?: |$|@)/)[1];
		var argument = text.match(/^\/\w+(?:@\w+)? ?(.*)$/)
		console.log(`Telegram bot: Replying command "${command}".`);

		var response = processCommandMessage(command, argument);
		sendApiRequest("sendMessage", {
			chat_id: chatId,
			text: response,
			parse_mode: "HTML",
			reply_to_message_id: messageId
		});
	}
}

function processCommandMessage(command, argument) {
	switch (command) {
		case "start":
			return "REMINDER: This bot makes no sense in private chats, please add it to a group.";
		case "help":
			return "LabRat: Sacrifice itself, help others.\n" +
				"This bot is made by @FiveYellowMice, its source code is on <a href=\"https://github.com/FiveYellowMice/labrat\">GitHub</a>.\n" +
				"\n" +
				"Commands:\n<pre>" +
				"/ping    Ping!\n" +
				"/help    Show this help message.</pre>";
		case "ping":
			return "Pong!";
		default:
			return `LabRat: ${command}: Command not found`;
	}
}

function sendApiRequest(method, data, callback) {
	var request = https.request({
		hostname: "api.telegram.org",
		method: "POST",
		path: `/bot${config.token}/sendMessage`,
		headers: {
			"content-type": "application/json"
		}
	});
	request.end(JSON.stringify(data));

	request.on("response", (response) => {
		var body = [];
		response.on("data", (chunk) => body.push(chunk));
		response.on("end", () => {
			var responseText = Buffer.concat(body);
			try {
				var responseJson = JSON.parse(responseText);
				if (responseJson.ok === true) {
					console.log("Telegram bot: Message sent succesfully. " + (responseJson.description ? responseJson.description : ""));
					if (callback) callback(undefined, responseJson.result);
				} else {
					console.log("Telegram bot: Message sending failed. "+ responseJson.description);
					if (callback) callback(responseJson.description);
				}
			} catch (e) {
				console.log("Telegram bot: Message sent, but received unparsable JSON: " + responseText);
				if (callback) callback(responseText);
			}
		});
	});
}

module.exports = {
	processWebhook: processWebhook
}
