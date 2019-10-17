const simpleParser = require("mailparser").simpleParser;
const cheerio = require("cheerio");
const fs = require("fs");
const AWS = require("aws-sdk");
const Twitter = require("twitter");
AWS.config.update({ region: "us-west-2" });
const s3 = new AWS.S3();

const twitter = new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
});

const amex = $ => {
  const words = [];
  let startIndex = null;

  $("b").each(function(i, elem) {
    const text = $(this).text();
    if (text.indexOf("your Card") > -1) {
      startIndex = i + 1;
    }
    words[i] = text;
  });

  if (startIndex !== null) {
    const merchant = words[startIndex];
    const amount = words[startIndex + 1].replace("*", "");
    return `${merchant} — ${amount}`;
  } else {
    return null;
  }
};

const citibank = $ => {
  const merchant = $("td")
    .filter((i, el) => $(el).text() === "Merchant")
    .next()
    .text();

  const amount = $("span")
    .filter((i, el) => $(el).text() === "Amount:")
    .closest("tr")
    .text()
    .replace("Amount:", "")
    .trim();
  return `${merchant} — ${amount}`;
};

const main = async message => {
  console.log("Main getting called");
  const { html } = await simpleParser(message);
  $ = cheerio.load(html);
  let response = null;
  if (html.indexOf("American Express") > -1) {
    console.log("American Express");
    response = amex($);
  } else if (html.indexOf("Citibank") > -1) {
    console.log("Citibank");
    response = citibank($);
  } else {
    console.log("Couldn't determine bank");
  }
  console.log("Response", response);
  if (response !== null) {
    twitter.post("statuses/update", { status: response }, (err, data) => {
      if (err) {
        console.err(err);
      }
    });
  }
};

exports.handler = async event => {
  const messageId = event["Records"][0].ses.mail.messageId;
  const params = {
    Bucket: "transaction-emails",
    Key: messageId
  };

  console.log("Message ID", messageId);

  s3.getObject(params, async function(err, data) {
    if (err) {
      console.log(err, err.stack);
    } else {
      await main(data.Body);
    }
  });

  return "";
};
