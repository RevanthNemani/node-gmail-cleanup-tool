// Unsubscribe.js

import dotenv from 'dotenv';
import fs from 'fs/promises';
import { google } from 'googleapis';
import PQueue from 'p-queue';
import { authorize } from '../helpers/authHelper.mjs';

dotenv.config();

// Main function to load credentials and start the authorization process
async function main() {
    try {
        const content = await fs.readFile('credentials.json');
        authorize(JSON.parse(content), processUnsubscribes);
    } catch (err) {
        console.log('Error loading client secret file:', err);
    }
}

// Main function to fetch emails from the Google Sheet and find the latest email in Gmail
async function processUnsubscribes(auth) {
    const sheets = google.sheets({ version: 'v4', auth });
    const gmail = google.gmail({ version: 'v1', auth });
    const queue = new PQueue({ concurrency: parseInt(process.env.PQ_CONCURRENCY_UNSUB, 10) });
    const statusUpdates = [];

    console.log('Reading unsubscribes from Google Sheet...');
    try {
        const emailList = await readUniqueUnsubscribeEmails(sheets);

        if (emailList.length === 0) {
            console.log('No emails to unsubscribe found in the sheet.');
            return;
        }

        const tasks = emailList.map((email, index) =>
            queue.add(() => fetchLatestEmail(gmail, email, index + 2, statusUpdates))
        );

        await Promise.allSettled(tasks);
        await updateSheetWithStatuses(sheets, statusUpdates);
        console.log('All latest emails for unsubscribes have been fetched and responses updated.');
    } catch (error) {
        console.error('Error processing unsubscribes:', error);
    }
}

// Read unique, non-empty emails from the Google Sheet
async function readUniqueUnsubscribeEmails(sheets) {
    const sheetId = process.env.SHEET_ID_UNSUBSCRIBE; // Your Google Sheet ID
    const range = 'Sheet1!A2:A'; // Assumes emails are listed in column A starting from A2

    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range,
        });

        const rows = res.data.values || [];
        // Create a Set to ensure uniqueness and filter out empty or invalid emails
        const emailList = [...new Set(rows.flat().map(email => email.trim()).filter(email => email !== ''))];

        console.log(`Found ${emailList.length} unique emails to unsubscribe.`);
        return emailList;

    } catch (error) {
        console.error('Failed to read emails from Google Sheet:', error.response?.data?.error || error.message);
        return [];
    }
}

// Fetch the latest email for a specific address and collect status updates
async function fetchLatestEmail(gmail, email, rowIndex, statusUpdates) {
    try {
        // Search for messages from the specific email address, sorted by latest first
        const res = await gmail.users.messages.list({
            userId: 'me',
            q: `from:${email}`,
            maxResults: 1,
        });

        const messages = res.data.messages || [];

        if (messages.length === 0) {
            console.log(`No messages found from ${email}.`);
            statusUpdates.push({ rowIndex, status: 'No messages found' });
            return;
        }

        // Fetch details of the latest message
        const message = messages[0];
        const msgDetails = await gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'metadata',
        });

        console.log(`Latest message from ${email}: ID ${msgDetails.data.id}`);
        statusUpdates.push({ rowIndex, status: 'Unsubscribed successfully' });

    } catch (error) {
        const errorMessage = error.response?.data?.error || error.message;
        console.error(`Error fetching latest email for ${email}:`, errorMessage);
        statusUpdates.push({ rowIndex, status: `Error: ${errorMessage}` });
    }
}

// Batch update Google Sheet with all statuses
async function updateSheetWithStatuses(sheets, statusUpdates) {
    const sheetId = process.env.SHEET_ID_UNSUBSCRIBE; // Your Google Sheet ID
    const updates = statusUpdates.map(({ rowIndex, status }) => ({
        range: `Sheet1!B${rowIndex}`,
        values: [[status]],
    }));

    try {
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: sheetId,
            requestBody: {
                data: updates,
                valueInputOption: 'RAW',
            },
        });
        console.log('Successfully updated Google Sheet with all statuses.');
    } catch (error) {
        console.error('Failed to batch update the Google Sheet with statuses:', error.response?.data?.error || error.message);
    }
}


main().catch(console.error);
