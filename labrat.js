const http = require("http");
const config = require("./config.js");
const telegramBot = require("./lib/telegram.js");
const rssReceiver = require("./lib/rss.js");
const twitterSync = require("./lib/twitter.js");

console.log("Starting LabRat...");
http.createServer(function(request, response) {
	var webhookRegex = /\/webhooks\/(.*?)\/.*/;
	if (webhookRegex.test(request.url)) {
		switch (request.url.match(webhookRegex)[1]) {
			case "telegram":
				telegramBot.processWebhook(request, response);
			default:
				response.statusCode = 404;
				response.end("No such webhook.\n");
		}
		return;
	}

	// Currently no other HTTP services needed
	response.statusCode = 404;
	response.end("Not found.\n");
}).listen(config.listenPort, config.listenAddress, () => {
	console.log(`HTTP server started, listening on [${config.listenAddress}]:${config.listenPort}.`);
});

config.rss.url && rssReceiver.start();
config.twitter.consumerKey && twitterSync.start();
