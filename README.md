# Node Email Cleanup Tool

The Node Email Cleanup Tool is a utility designed to help manage Gmail inboxes by analyzing emails, assigning labels, and unsubscribing from unwanted senders. The tool interacts with Gmail and Google Sheets APIs, allowing users to automate their email management tasks efficiently.

## Project Structure

The project is structured as follows:

```
nodeEmailCleanupTool
│
├── Functions
│   ├── assignLabel.mjs
│   ├── emailAnalysis.mjs
│   ├── unsubscribe.mjs
│
├── helpers
│   ├── authHelper.mjs
│
├── node_modules
│
├── .env
├── .gitignore
├── credentials.json
├── LICENSE
├── package.json
├── package-lock.json
├── README.md
└── token.json
```

## Prerequisites

- **Node.js**: Ensure that you have Node.js version 18 or later installed on your machine. [Download Node.js](https://nodejs.org/)
- **Google Cloud Project**: Set up a Google Cloud Project and enable the Gmail and Google Sheets APIs.
- **OAuth 2.0 Client Credentials**: Download the `credentials.json` file from your Google Cloud Console.

## Installation

1. **Clone the repository**:

   ```bash
   git clone https://github.com/RevanthNemani/node-gmail-cleanup-tool.git
   cd nodeEmailCleanupTool
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Create and configure the `.env` file**:

   Create a `.env` file in the root directory of the project and populate it with the following environment variables:

   ```env
   SHEET_ID_FETCH=1eOdIYohTAYGNfyNneWhv0gbkjLYxUOQavM3SUAyo3Gk
   SHEET_ID_LABEL=1HvvqY3mkPQMnj4mto7_UJQZFSiytnY-NxhsrGlrTfGI
   SHEET_ID_UNSUBSCRIBE=1w68R_-HH0kIKpv_oaBzZCCEYet1ihPpvvo4p395CIMg
   REDIRECT_URI_HOST=http://localhost
   REDIRECT_URI_PORT=8080   # Change if you prefer a different local port
   REDIRECT_URI_CALLBACK=oauth2callback

   PQ_CONCURRENCY_ANALYSIS=30
   PQ_CONCURRENCY_UNSUB=30
   PQ_CONCURRENCY_ASSIGN_LABEL=30
   ```

   Replace the placeholder values with your specific configuration details, particularly the Google Sheets IDs and concurrency settings.

## Setup and Authorization

1. **Configure OAuth 2.0 Credentials**:

   - Go to the Google Cloud Console.
   - Enable the Gmail and Google Sheets APIs for your project.
   - Create OAuth 2.0 credentials, specifying `http://localhost:<port>/oauth2callback` as the redirect URI, where `<port>` matches `REDIRECT_URI_PORT` (default `8080`).
   - Download the `credentials.json` file and place it in the root of your project.

2. **Run any of the scripts (e.g., `emailAnalysis.mjs`)**:

   ```bash
   node ./Functions/emailAnalysis.mjs
   ```

   - The first time you run a script, it will prompt you to authorize the application by opening a browser window. Complete the authorization flow to generate a `token.json` file.
   - This `token.json` file will be used for subsequent requests.

## Script Descriptions

1. **`assignLabel.mjs`**:
   - Assigns a "to be deleted" label to emails based on a list of senders provided in a Google Sheet for easy filter delete.

2. **`emailAnalysis.mjs`**:
   - Analyzes your inbox to count emails from different senders and updates a Google Sheet with the results.

3. **`unsubscribe.mjs`**:
   - Automates the process of unsubscribing from unwanted emails based on a list in a Google Sheet.

## Usage

- **Run Scripts**:

  To execute any of the scripts, use the following command structure:

  ```bash
  node ./Functions/<script-name>.mjs
  ```

  Example:

  ```bash
  node ./Functions/emailAnalysis.mjs
  ```

## Helper Modules

- **`authHelper.mjs`**: Manages the OAuth 2.0 authorization flow.

## Error Handling and Logging

- Each script contains robust error handling to manage API errors, including rate limits and insufficient permissions.
- Logs are displayed in the terminal to provide real-time feedback on the execution status of the scripts.

## License

This project is licensed under the MIT License.

## Contributing

Feel free to submit issues, create pull requests, or suggest improvements.
