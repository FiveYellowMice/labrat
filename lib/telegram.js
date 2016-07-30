const https = require("https");
const child_process = require("child_process");
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
		var command = text.match(/^\/(\w+)/)[1];
		var argument = text.match(/^\/\w+(?:@\w+)? ?(.*)$/)[1];
		console.log(`Telegram bot: Replying command "${command}".`);

		processCommandMessage(command, argument).then((response) => {
			sendApiRequest("sendMessage", {
				chat_id: chatId,
				text: response,
				parse_mode: "HTML",
				reply_to_message_id: messageId
			});
		});
	}
}

function processCommandMessage(command, argument) { return new Promise((resolve) => {
	switch (command) {
		case "start":
			resolve("REMINDER: This bot makes no sense in private chats, please add it to a group.");
			break;
		case "help":
			resolve("LabRat: Sacrifice itself, help others.\n" +
				"This bot is made by @FiveYellowMice, its source code is on <a href=\"https://github.com/FiveYellowMice/labrat\">GitHub</a>.\n" +
				"\n" +
				"Commands:\n" +
				"/ping Ping!\n" +
				"/gsl Get Google search URL for a keyword.\n" +
				"/status <code>systemctl status labrat</code>\n" +
				"/help Show this help message.");
			break;
		case "ping":
			resolve("Pong!");
			break;
		case "gsl":
			resolve("https://www.google.com/search?q=" + encodeURIComponent(argument));
			break;
		case "status":
			var outputBuffer = [];
			child_process.spawn("systemctl", ["status", "labrat"])
			.on("error", (err) => resolve("Error running <code>systemctl status labrat</code>. " + err))
			.stdout
			.on("data", (chunk) => outputBuffer.push(chunk))
			.on("end", () => resolve(`<pre>${tgHtmlEscape(Buffer.concat(outputBuffer).toString())}</pre>`))
			.on("error", (err) => resolve("Error running <code>systemctl status labrat</code>. " + err));
			break;
		default:
			resolve(`LabRat: ${command}: Command not found`);
	}
}); }

function tgHtmlEscape(text) {
	return text
	.replace(/&/g, "&amp;")
	.replace(/</g, "&lt;")
	.replace(/>/g, "&gt;")
	.replace(/"/g, "&quot;");
}

function sendApiRequest(method, data) { new Promise((resolve, reject) => {
	// curl -X POST -H "Content-Type: application/json" -d "${data}" \
	// https://api.telegram.org/bot${token}/${method}
	var request = https.request({
		hostname: "api.telegram.org",
		method: "POST",
		path: `/bot${config.token}/${method}`,
		headers: {
			"content-type": "application/json"
		}
	});
	request.end(JSON.stringify(data));
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
					reject(responseJson.description);
				}
			} catch (e) {
				console.log("Telegram bot: Message sent, but received unparsable JSON: " + responseText);
				reject(responseText);
			}
		});
		response.on("error", (e) => {
			console.log("Telegram bot: Unable to get response after an API call." + e.message);
			reject(e);
		});
	});
}); }

module.exports = {
	processWebhook: processWebhook,
	sendApiRequest: sendApiRequest
}
