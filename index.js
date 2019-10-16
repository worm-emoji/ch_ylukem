const simpleParser = require("mailparser").simpleParser;
const cheerio = require("cheerio");
const fs = require("fs");
const AWS = require("aws-sdk");
AWS.config.update({ region: "us-west-2" });
const s3 = new AWS.S3();

const source = fs.readFileSync("./email.txt");

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
    return [words[startIndex], words[startIndex + 1].replace("*", "")].join(
      " "
    );
  } else {
    return null;
  }
};
let $ = null;

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
