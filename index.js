const simpleParser = require("mailparser").simpleParser;
const cheerio = require("cheerio");
const fs = require("fs");
const AWS = require("aws-sdk");
const Twitter = require("twitter");
AWS.config.update({ region: "us-west-2" });
const s3 = new AWS.S3();

let $ = null;

const twitter = new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
});

const amex = jq => {
  const words = [];
  let startIndex = null;

  jq("b").each(function(i, elem) {
    const text = jq(this).text();
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

const citibank = jq => {
  const merchant = jq("td")
    .filter((i, el) => jq(el).text() === "Merchant")
    .next()
    .text();

  const amount = jq("span")
    .filter((i, el) => jq(el).text() === "Amount:")
    .closest("tr")
    .text()
    .replace("Amount:", "")
    .trim();
  return `${merchant} — ${amount}`;
};

const square = ($, subject) => {
  let merchant = null;
  const matches = subject.match(/(?<=Receipt from).*/);
  if (matches && matches[0]) {
    merchant = matches[0].trim();
  }
  const amount = $("span")
    .filter((i, el) => $(el).text() === "$")
    .parent()
    .text()
    .trim();
  return `${merchant} — ${amount}`;
};

const main = async message => {
  console.log("Main getting called");
  const { html, subject } = await simpleParser(message);
  $ = cheerio.load(html);
  let response = null;
  if (html.indexOf("American Express") > -1) {
    console.log("American Express");
    response = amex($);
  } else if (html.indexOf("Citibank") > -1) {
    console.log("Citibank");
    response = citibank($);
  } else if (html.indexOf("Square") > -1) {
    console.log("Square");
    response = square($, subject);
  } else {
    console.log("Couldn't determine bank");
  }
  console.log("Response", response);
  if (response !== null) {
    return new Promise(resolve => {
      twitter.post("statuses/update", { status: response }, (err, data) => {
        if (err) {
          console.error(err);
        }
        resolve(response);
      });
    });
  }
  return response;
};

exports.handler = async event => {
  const messageId = event["Records"][0].ses.mail.messageId;
  const params = {
    Bucket: "transaction-emails",
    Key: messageId
  };

  console.log("Message ID", messageId);
  return new Promise(resolve => {
    s3.getObject(params, async function(err, data) {
      if (err) {
        console.log(err, err.stack);
      } else {
        const res = await main(data.Body);
        resolve(res);
      }
    });
  });
};
