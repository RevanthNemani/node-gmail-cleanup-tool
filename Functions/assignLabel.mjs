// assignLabel.mjs

import dotenv from 'dotenv';
import fs from 'fs/promises';
import { google } from 'googleapis';
import { pathToFileURL } from 'url';
import PQueue from 'p-queue';
import { authorize } from '../helpers/authHelper.mjs';

dotenv.config();

// Main function to load credentials and start the authorization process
async function main() {
    try {
        const content = await fs.readFile('credentials.json');
        authorize(JSON.parse(content), processLabeling);
    } catch (err) {
        console.log('Error loading client secret file:', err);
    }
}

// Main function to read email senders and assign "to be deleted" label
async function processLabeling(auth) {
    const sheets = google.sheets({ version: 'v4', auth });
    const gmail = google.gmail({ version: 'v1', auth });
    const queue = new PQueue({ concurrency: parseInt(process.env.PQ_CONCURRENCY_ASSIGN_LABEL, 10) });
    const statusUpdates = [];

    console.log('Reading senders from Google Sheet...');
    try {
        const emailList = await readUniqueEmails(sheets);
        const labelId = await getOrCreateLabel(gmail, 'to be deleted');

        if (emailList.length === 0) {
            console.log('No senders found in the sheet.');
            return;
        }

        const tasks = emailList.map((email, index) =>
            queue.add(() => assignLabelToEmails(gmail, email, labelId, index + 2, statusUpdates))
        );

        await Promise.allSettled(tasks);
        await updateSheetWithStatuses(sheets, statusUpdates);
        console.log('All emails from listed senders have been labeled and responses updated.');
    } catch (error) {
        console.error('Error processing labeling:', error);
    }
}

// Read unique, non-empty emails from the Google Sheet
export async function readUniqueEmails(sheets) {
    const sheetId = process.env.SHEET_ID_LABEL; // Your Google Sheet ID
    const range = 'Sheet1!A2:A'; // Assumes emails are listed in column A starting from A2

    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range,
        });

        const rows = res.data.values || [];
        // Create a Set to ensure uniqueness and filter out empty or invalid emails
        const emailList = [...new Set(rows.flat().map(email => email.trim()).filter(email => email !== ''))];

        console.log(`Found ${emailList.length} unique senders to process.`);
        return emailList;

    } catch (error) {
        console.error('Failed to read senders from Google Sheet:', error.response?.data?.error || error.message);
        return [];
    }
}

// Get or create the "to be deleted" label
async function getOrCreateLabel(gmail, labelName) {
    try {
        const res = await gmail.users.labels.list({ userId: 'me' });
        const labels = res.data.labels || [];
        const label = labels.find(l => l.name === labelName);

        if (label) {
            console.log(`Found label "${labelName}" with ID ${label.id}.`);
            return label.id;
        }

        // Create the label if it doesn't exist
        const createRes = await gmail.users.labels.create({
            userId: 'me',
            requestBody: {
                name: labelName,
                labelListVisibility: 'labelShow',
                messageListVisibility: 'show',
            },
        });

        console.log(`Created label "${labelName}" with ID ${createRes.data.id}.`);
        return createRes.data.id;

    } catch (error) {
        console.error('Error fetching or creating label:', error.response?.data?.error || error.message);
        throw error;
    }
}

// Assign the "to be deleted" label to all emails from a specific sender with retry on rate limits
async function assignLabelToEmails(gmail, email, labelId, rowIndex, statusUpdates) {
    let retryCount = 0;
    const maxRetries = 5; // Maximum number of retries
    const initialDelay = 1000; // Initial delay in milliseconds

    while (retryCount <= maxRetries) {
        try {
            // Search for all messages from the specific email address
            const res = await gmail.users.messages.list({
                userId: 'me',
                q: `from:${email}`,
                maxResults: 500, // Adjust maxResults if necessary
            });

            const messages = res.data.messages || [];
            if (messages.length === 0) {
                console.log(`No messages found from ${email}.`);
                statusUpdates.push({ rowIndex, status: 'No messages found' });
                return;
            }

            const messageIds = messages.map(message => message.id);

            // Assign the label to all messages
            await gmail.users.messages.batchModify({
                userId: 'me',
                requestBody: {
                    ids: messageIds,
                    addLabelIds: [labelId],
                },
            });

            console.log(`Assigned label "to be deleted" to ${messages.length} messages from ${email}.`);
            statusUpdates.push({ rowIndex, status: 'Labeled successfully' });
            break; // Exit loop if successful

        } catch (error) {
            const errorMessage = error.response?.data?.error || error.message;

            if (error.response?.status === 429) {
                // Rate limit exceeded, apply exponential backoff
                retryCount++;
                const delay = initialDelay * Math.pow(2, retryCount); // Exponential backoff formula
                console.log(`Rate limit exceeded, retrying in ${delay / 1000} seconds... (Retry ${retryCount})`);
                await new Promise(resolve => setTimeout(resolve, delay)); // Delay before retrying
            } else {
                // Log other errors and exit
                console.error(`Error assigning label to emails from ${email}:`, errorMessage);
                statusUpdates.push({ rowIndex, status: `Error: ${errorMessage}` });
                break;
            }
        }
    }

    if (retryCount > maxRetries) {
        console.error(`Failed to assign label to emails from ${email} after ${maxRetries} retries due to rate limits.`);
        statusUpdates.push({ rowIndex, status: 'Failed after retries' });
    }
}

// Batch update Google Sheet with all statuses
async function updateSheetWithStatuses(sheets, statusUpdates) {
    const sheetId = process.env.SHEET_ID_LABEL; // Your Google Sheet ID
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

// Run the main function only when executed directly
if (pathToFileURL(process.argv[1]).href === import.meta.url) {
    main().catch(console.error);
}

