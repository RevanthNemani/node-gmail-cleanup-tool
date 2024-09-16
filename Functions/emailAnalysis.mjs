// emailAnalysis.mjs

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
        authorize(JSON.parse(content), fetchEmails);
    } catch (err) {
        console.log('Error loading client secret file:', err);
    }
}

// Fetch emails from Gmail and update Google Sheets with the count of each sender
async function fetchEmails(auth) {
    const gmail = google.gmail({ version: 'v1', auth });
    const sheets = google.sheets({ version: 'v4', auth });
    const emailsCount = new Map();
    const queue = new PQueue({ concurrency: parseInt(process.env.PQ_CONCURRENCY_ANALYSIS, 10) });
    let pageToken = null;
    let totalEmails = 0;
    let fetchedEmails = 0;

    console.log('Fetching total email count...');
    try {
        const profile = await gmail.users.labels.get({
            userId: 'me',
            id: 'INBOX',
        });
        totalEmails = profile.data.messagesTotal;
        console.log(`Total emails in inbox: ${totalEmails}`);
    } catch (error) {
        console.error('Error fetching total email count:', error);
        return;
    }

    console.log('Fetching emails...');
    try {
        while (fetchedEmails < totalEmails) {
            const res = await gmail.users.messages.list({
                userId: 'me',
                maxResults: 100,
                pageToken,
            });
            const messages = res.data.messages || [];
            pageToken = res.data.nextPageToken;

            const batchSize = Math.min(messages.length, totalEmails - fetchedEmails);
            fetchedEmails += batchSize;

            console.log(`Fetched ${fetchedEmails}/${totalEmails} messages.`);

            messages.slice(0, batchSize).forEach((message) => {
                queue.add(() => processMessage(gmail, message, emailsCount));
            });
        }

        console.log('Waiting for all tasks to complete...');
        await queue.onIdle();
        console.log('All tasks completed. Proceeding to update Google Sheets...');

        const success = await updateGoogleSheet(emailsCount, sheets);
        if (success) {
            console.log('Emails fetched and written to Google Sheets successfully.');
        } else {
            console.log('Failed to update Google Sheets with the fetched data.');
        }
    } catch (error) {
        console.error('Error fetching emails:', error);
    }
}

// Process individual email message
async function processMessage(gmail, message, emailsCount) {
    try {
        const msg = await gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'metadata',
            metadataHeaders: ['From'],
        });

        const fromHeader = msg.data.payload.headers.find((header) => header.name === 'From');
        if (fromHeader && fromHeader.value) {
            const emailMatch = fromHeader.value.match(/<(.*)>/);
            const email = emailMatch ? emailMatch[1] : fromHeader.value.trim();
            emailsCount.set(email, (emailsCount.get(email) || 0) + 1);
        }
    } catch (error) {
        // Error handling, retry with exponential backoff if rate limited
        if (error.response && error.response.status === 429) {
            console.log('Rate limit hit, retrying message fetch with exponential backoff...');
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retrying
            return processMessage(gmail, message, emailsCount); // Retry fetching the message
        } else {
            console.error(`Error fetching message details for ID ${message.id}:`, error);
        }
    }
}

// Update Google Sheets with the fetched email data
async function updateGoogleSheet(emailsCount, sheets) {
    const sheetId = process.env.SHEET_ID_FETCH; // Replace with your Google Sheet ID
    const startCell = 'A1';
    const data = [['Email', 'Count'], ...Array.from(emailsCount.entries())];
    const rowCount = data.length;
    const endCell = `B${rowCount}`;
    const range = `Sheet1!${startCell}:${endCell}`;

    console.log(`Writing data to range: ${range}`);

    try {
        const response = await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range,
            valueInputOption: 'RAW',
            requestBody: {
                values: data,
            },
        });

        if (response.status === 200) {
            return true;
        } else {
            console.error('Error response from Google Sheets:', response.statusText);
            return false;
        }
    } catch (error) {
        console.error('Failed to update Google Sheet:', error.response?.data?.error || error.message);
        return false;
    }
}

main().catch(console.error);
