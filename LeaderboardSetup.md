# Simple online leaderboard setup

The shared leaderboard uses a Google Sheet and a small Apps Script web app. There are no Firebase projects, SDK config files, command-line tools, or database rules to set up.

## One-time setup

1. Create a blank Google Sheet.
2. In the sheet, open **Extensions → Apps Script**.
3. Replace the editor contents with everything in `GoogleAppsScript.gs`, then save.
4. Choose `setupLeaderboard` in the function menu and click **Run**. Approve the requested spreadsheet access. This creates the `Profiles` and `Scores` tabs.
5. Click **Deploy → New deployment**, choose the **Web app** type, set **Execute as** to **Me**, and set access to **Anyone**. Click **Deploy** and approve access.
6. Copy the web app URL ending in `/exec`.
7. In `index.html`, paste that URL into `window.BEAST_HUNT_LEADERBOARD_URL`.
8. Serve the game over HTTP (for example with VS Code Live Server) and reload it. Choose and save a nickname in **High scores**.

When you change the Apps Script later, open **Deploy → Manage deployments → Edit**, choose **New version**, and redeploy.

If daily scores stop appearing, replace the Apps Script editor contents with the latest `GoogleAppsScript.gs`, save, then deploy a **New version**. The script handles Sheets converting date-looking cell values into date objects; keeping the deployed script up to date is important for UTC daily score matching.

## What it does

The sheet keeps one profile per browser identity and the best daily and all-time winning score per difficulty and map size. Daily scores use UTC. Only the top 10 scores are shown. Players need no Google sign-in; the browser saves a random player ID and nickname locally.

This is intended for a casual game, not a secure competition: the public web app accepts score submissions from browsers, so someone could fake scores. Clearing browser data creates a new player identity. Apps Script also has Google usage quotas.
