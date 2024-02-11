// import fs from "fs/promises";
// import path from "path";
// import process from "process";
// import { authenticate } from "@google-cloud/local-auth";
// import { google } from "googleapis";

// // If modifying these scopes, delete token.json.
// const SCOPES = ["https://www.googleapis.com/auth/drive.metadata.readonly"];
// // The file token.json stores the user's access and refresh tokens, and is
// // created automatically when the authorization flow completes for the first
// // time.
// const TOKEN_PATH = path.join(process.cwd(), "token.json");
// const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

// /**
//  * Reads previously authorized credentials from the save file.
//  *
//  * @return {Promise<OAuth2Client|null>}
//  */
// const loadSavedCredentialsIfExist = async () => {
//   try {
//     const content = await fs.readFile(TOKEN_PATH);
//     const credentials = JSON.parse(content);
//     return google.auth.fromJSON(credentials);
//   } catch (err) {
//     return null;
//   }
// };

// /**
//  * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
//  *
//  * @param {OAuth2Client} client
//  * @return {Promise<void>}
//  */
// const saveCredentials = async (client) => {
//   const content = await fs.readFile(CREDENTIALS_PATH);
//   const keys = JSON.parse(content);
//   const key = keys.installed || keys.web;
//   const payload = JSON.stringify({
//     type: "authorized_user",
//     client_id: key.client_id,
//     client_secret: key.client_secret,
//     refresh_token: client.credentials.refresh_token,
//   });
//   await fs.writeFile(TOKEN_PATH, payload);
// };

// /**
//  * Load or request or authorization to call APIs.
//  *
//  */
// const authorize = async () => {
//   let client = await loadSavedCredentialsIfExist();
//   if (client) {
//     return client;
//   }
//   client = await authenticate({
//     scopes: SCOPES,
//     keyfilePath: CREDENTIALS_PATH,
//   });
//   if (client.credentials) {
//     await saveCredentials(client);
//   }
//   return client;
// };

// /**
//  * Lists the names and IDs of up to 10 files.
//  * @param {OAuth2Client} authClient An authorized OAuth2 client.
//  */
// const listFiles = async (authClient) => {
//   const drive = google.drive({ version: "v3", auth: authClient });
//   const res = await drive.files.list({
//     pageSize: 10,
//     fields: "nextPageToken, files(id, name)",
//   });
//   const files = res.data.files;
//   if (files.length === 0) {
//     console.log("No files found.");
//     return;
//   }

//   console.log("Files:");
//   files.map((file) => {
//     console.log(`${file.name} (${file.id})`);
//   });
// };

// authorize().then(listFiles).catch(console.error);
import express from "express";
import { google } from "googleapis";
import fs from "fs";
import axios from "axios";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

// Google Drive API configuration
const auth = new google.auth.GoogleAuth({
  keyFile: "./key.json",
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const drive = google.drive({
  version: "v3",
  auth,
});

// Function to download a file from Google Drive
async function downloadFile(fileId, destPath) {
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );
  const writer = fs.createWriteStream(destPath);
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

// Function to upload a file to Google Drive using chunked uploading
async function uploadFileChunked(filePath, parentId) {
  const fileSize = fs.statSync(filePath).size;
  const chunkSize = 5 * 1024 * 1024; // 5MB chunk size
  let start = 0;
  let end = chunkSize - 1;
  let chunkIndex = 0;

  while (start < fileSize) {
    const chunk = fs.createReadStream(filePath, { start, end });
    const uploadResponse = await drive.files.create({
      requestBody: {
        name: `new_video_${chunkIndex}_${filePath.split("/").pop()}`,
        parents: [parentId],
      },
      media: {
        mimeType: "application/octet-stream",
        body: chunk,
      },
    });
    console.log(`Uploaded chunk ${chunkIndex}`);
    start = end + 1;
    end = Math.min(start + chunkSize - 1, fileSize - 1);
    chunkIndex++;
  }
}

// Route to initiate download and upload processes
app.post("/transfer-video", async (req, res) => {
  const { fileId, destParentId } = req.body;

  try {
    // Download the video file
    await downloadFile(fileId, "temp/video.mp4");
    console.log("Video downloaded successfully.");

    // Upload the video file in chunks
    await uploadFileChunked("temp/video.mp4", destParentId);
    console.log("Video uploaded successfully.");

    res.status(200).json({ message: "Video transfer completed successfully." });
  } catch (error) {
    console.error("Error occurred:", error);
    res.status(500).json({ error: "An error occurred during video transfer." });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
