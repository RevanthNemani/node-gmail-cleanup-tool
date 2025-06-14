import dotenv from 'dotenv';
import fs from 'fs/promises';
import http from 'http';
import url from 'url';
import open from 'open';
import { google } from 'googleapis';

dotenv.config();

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/spreadsheets'];
const TOKEN_PATH = 'token.json';

// Load credentials and authorize a client
export async function authorize(credentials, callback) {
    const { client_secret, client_id } = credentials.web;
    const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        process.env.REDIRECT_URI_HOST + ":" + process.env.REDIRECT_URI_PORT + "/" + process.env.REDIRECT_URI_CALLBACK
    );

    try {
        const token = await fs.readFile(TOKEN_PATH);
        oAuth2Client.setCredentials(JSON.parse(token));
        callback(oAuth2Client);
    } catch (err) {
        getNewToken(oAuth2Client, callback);
    }
}

// Get and store a new token after prompting for user authorization through the browser
function getNewToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
    });

    const server = http.createServer(async (req, res) => {
        if (req.url.includes('/oauth2callback')) {
            const query = new url.URL(req.url, process.env.REDIRECT_URI_HOST + ":" + process.env.REDIRECT_URI_PORT).searchParams;
            const code = query.get('code');
            res.end('Authentication successful! You can close this window.');

            oAuth2Client.getToken(code, async (err, token) => {
                if (err) {
                    console.error('Error retrieving access token', err);
                    server.close();
                    return;
                }
                oAuth2Client.setCredentials(token);
                await fs.writeFile(TOKEN_PATH, JSON.stringify(token));
                callback(oAuth2Client);
                server.close();
            });
        }
    }).listen(parseInt(process.env.REDIRECT_URI_PORT, 10) || 8080, () => {
        open(authUrl);
        console.log('Authorize this app by visiting this URL:', authUrl);
    });
}
