const simpleParser = require("mailparser").simpleParser;
const cheerio = require("cheerio");
const fs = require("fs");
const AWS = require("aws-sdk");
AWS.config.update({ region: "us-west-2" });
const s3 = new AWS.S3();

const source = fs.readFileSync("./email.txt");
const amexRegex = /(?<=Card).+?(?=Was)/;

const amex = $ => {
  const text = $("b").text();
  const matches = text.match(amexRegex);
  if (matches && matches.length === 1) {
    const text = matches[0];
    return text;
  } else {
    return null;
  }
};

const main = async message => {
  const { html } = await simpleParser(source);
  $ = cheerio.load(html);
  let response = null;
  if (html.indexOf("American Express") > -1) {
    response = amex($);
  }
  console.log(response);
};

main(source);

exports.handler = async event => {
  const messageId = event["Records"][0].ses.mail.messageId;
  const params = {
    Bucket: "transaction-emails",
    Key: messageId
  };

  s3.getObject(params, function(err, data) {
    if (err) {
      console.log(err, err.stack);
    } else {
      main(data.Body);
    }
  });
};
