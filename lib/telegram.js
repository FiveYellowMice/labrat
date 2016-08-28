"use strict";
const https = require("https");
const child_process = require("child_process");
const crypto = require("crypto");
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
	if (update.message) {
		replyMessage(update.message);
	} else if (update.inline_query) {
		answerInline(update.inline_query);
	}
}

function replyMessage(message) {
	if (!message.message_id || !message.chat || !message.chat.id) {
		return;
	}
	
	var messageProcessed;
	
	// Test if it is a command
	if (message.text && /^(?:\/\w+@labratbot(?: |$)|\/\w+(?!@))/.test(message.text)) {
		var command = message.text.match(/^\/(\w+)/)[1];
		var argument = message.text.match(/^\/\w+(?:@\w+)? ?(.*)$/)[1];
		console.log(`Telegram bot: Replying command "${command}".`);

		messageProcessed = processCommandMessage(command, argument);
	}
	
	// Test if it is a reply to certain messages
	if (message.text && message.reply_to_message && message.reply_to_message.from && message.reply_to_message.from.username === "labratbot") {
		messageProcessed = processReplies(message);
	}
	
	if (messageProcessed) {
		messageProcessed.then((response) => {
			if (!response) {
				// Do nothing.
			} else if (typeof response === "string") {
				sendApiRequest("sendMessage", {
					chat_id: message.chat.id,
					text: response,
					parse_mode: "HTML",
					reply_to_message_id: message.message_id
				});
			} else {
				sendApiRequest("sendMessage", Object.assign({
					chat_id: message.chat.id,
					reply_to_message_id: message.message_id
				}, response));
			}
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
			if (argument) {
				resolve("https://www.google.com/search?q=" + encodeURIComponent(argument));
			} else {
				resolve({
					text: "What do you want to search?",
					reply_markup: {
						force_reply: true,
						selective: true
					}
				});
			}
			break;
		case "status":
			var outputBuffer = [];
			var journalLines = Number(argument);
			if (argument === "" || !Number.isInteger(journalLines) || journalLines < 0) journalLines = 4;

			child_process.spawn("systemctl", ["status", "-ocat", `-n${journalLines}`, "labrat"])
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

function processReplies(message) { return new Promise((resolve, reject) => {
	switch (message.reply_to_message.text) {
		case "What do you want to search?":
			resolve("https://www.google.com/search?q=" + encodeURIComponent(message.text));
			break;
		default:
			resolve(null);
	}
}); }

function answerInline(query) {
	Promise.all([
		new Promise((resolve, reject) => { // Google
			if (query.query) {
				var link = "https://www.google.com/search?q=" + encodeURIComponent(query.query);
				resolve({
					type: "article",
					id: crypto.createHash("sha1").update(link).digest("hex"),
					title: query.query + " - Google",
					input_message_content: {
						message_text: link
					}
				});
			} else {
				resolve({
					type: "article",
					id: "595c3cce2409a55c13076f1bac5edee529fc2e58",
					title: "Google",
					input_message_content: {
						message_text: "https://www.google.com/"
					}
				});
			}
		}),
		new Promise((resolve, reject) => { // Wikipedia
			var text = query.query;
			if (!text) {
				resolve(null);
				return;
			}
			
			var responseText = text.replace(/(?:\[\[.+?\]\]|\{\{.+?\}\})/g, (element) => {
				var language, title, display;
				if (/\[\[.+\]\]/.test(element)) {
					let match = element.match(/\[\[(?::([a-z]{2,3}):)?(?::((?:Category|category|Media|media|File|file):))?(.+?)(?:\|(.*))?\]\]/);
					if (match[1]) language = match[1];
					title = (match[2] || "") + match[3];
					if (match[4]) {
						display = match[4];
					} else if (match[4] === "") {
						display = title.match(/^(?:.+?:)?(.*)$/);
					}
				} else if (/\{\{.+\}\}/.test(element)) {
					let match = element.match(/\{\{(?:(?:subst|safesubst|msgnw):)?(.*:)?(.+)\}\}/);
					if (match[1] || match[3]) {
						title = match[2];
					} else {
						title = "Template:" + match[2];
					}
				}
				
				if (!title) return "";
				var link = `https://${language || "zh"}.wikipedia.org/wiki/` + encodeURI(title.replace(" ", "_"));
				
				return `<a href="${tgHtmlEscape(link)}">${tgHtmlEscape(display || title)}</a>`;
			});
			
			resolve({
				type: "article",
				id: crypto.createHash("sha1").update(responseText).digest("hex"),
				title: "Wikipedia",
				description: text,
				input_message_content: {
					message_text: responseText,
					parse_mode: "HTML"
				}
			});
		})
	])
	.then((results) => {
		sendApiRequest("answerInlineQuery", {
			inline_query_id: query.id,
			results: results.filter((r) => r)
		});
	});
}

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
