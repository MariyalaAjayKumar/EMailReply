const express = require("express");
const app = express();
const path = require("path");
const { authenticate } = require("@google-cloud/local-auth");
const fs = require("fs").promises;
const { google } = require("googleapis");

const port =5000;
// These are the scopes that we want to access
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://mail.google.com/",
];

// I kept the label name
const labelName = "Vacation Auto-Reply";

app.get("/", async (req, res) => {
  try {
    // Read the credentials from the file
    const credentials = {
      web: {
        client_id: "232783457437-tdasrao2f6j0i0toebdt0652jv1ddntd.apps.googleusercontent.com",
        project_id: "emailreply-406612",
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_secret: "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",
        redirect_uris: ["http://localhost"],
        javascript_origins: ["http://localhost:5000"],
      },
    };

    // Parse the JSON content of the credentials
    const { web } = credentials;

    // Here I am taking Google GMAIL authentication
    const auth = await authenticate({
      keyfilePath: path.join(__dirname, "token.json"),
      scopes: SCOPES,
      clientId: web.client_id,
      clientSecret: web.client_secret,
    });

    // Here I'm getting authorized Gmail ID
    const gmail = google.gmail({ version: "v1", auth });

    // Here I am finding all the labels available on the current Gmail
    const response = await gmail.users.labels.list({
      userId: "me",
    });

    // ... (rest of your code)

    // Create a label for the App
    const labelId = await createLabel(auth);

    // Repeat in random intervals
    setInterval(async () => {
      // Get messages that have no prior reply
      const messages = await getUnrepliesMessages(auth);

      if (messages && messages.length > 0) {
        for (const message of messages) {
          const messageData = await gmail.users.messages.get({
            auth,
            userId: "me",
            id: message.id,
          });

          const email = messageData.data;
          const hasReplied = email.payload.headers.some(
            (header) => header.name === "In-Reply-To"
          );

          if (!hasReplied) {
            // Craft the reply message
            const replyMessage = {
              userId: "me",
              resource: {
                raw: Buffer.from(
                  `To: ${
                    email.payload.headers.find(
                      (header) => header.name === "From"
                    ).value
                  }\r\n` +
                    `Subject: Re: ${
                      email.payload.headers.find(
                        (header) => header.name === "Subject"
                      ).value
                    }\r\n` +
                    `Content-Type: text/plain; charset="UTF-8"\r\n` +
                    `Content-Transfer-Encoding: 7bit\r\n\r\n` +
                    `Thank you for your email. I'm currently on vacation and will reply to you when I return.\r\n`
                ).toString("base64"),
              },
            };

            await gmail.users.messages.send(replyMessage);

            // Add label and move the email
            await gmail.users.messages.modify({
              auth,
              userId: "me",
              id: message.id,
              resource: {
                addLabelIds: [labelId],
                removeLabelIds: ["INBOX"],
              },
            });
          }
        }
      }
    }, Math.floor(Math.random() * (120 - 45 + 1) + 45) * 1000);

    res.json({ "this is Auth": auth });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
