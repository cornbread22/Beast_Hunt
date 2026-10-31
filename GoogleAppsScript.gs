const PROFILE_HEADERS = ["playerId", "nickname", "updatedAt"];
const SCORE_HEADERS = [
  "playerId",
  "difficulty",
  "mapSize",
  "period",
  "date",
  "moves",
  "achievedAt"
];

function setupLeaderboard() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error("Open this script from its leaderboard spreadsheet, then run setupLeaderboard again.");
  }
  ensureSheet_(spreadsheet, "Profiles", PROFILE_HEADERS);
  ensureSheet_(spreadsheet, "Scores", SCORE_HEADERS);
  PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", spreadsheet.getId());
}

function doGet(event) {
  const callback = event && event.parameter ? event.parameter.callback : "";
  if (!/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback || "")) {
    return ContentService.createTextOutput("Invalid callback.");
  }

  let result;
  try {
    result = handleRequest_(event.parameter || {});
  } catch (error) {
    result = { ok: false, error: error.message || String(error) };
  }

  return ContentService
    .createTextOutput(`${callback}(${JSON.stringify(result)});`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function handleRequest_(params) {
  switch (params.action) {
    case "leaderboard":
      return { ok: true, rows: getLeaderboard_(params) };
    case "setNickname":
      return setNickname_(params);
    case "submit":
      return submitScore_(params);
    default:
      throw new Error("Unknown leaderboard action.");
  }
}

function setNickname_(params) {
  const playerId = validatePlayerId_(params.uid);
  const nickname = String(params.nickname || "");
  if (!/^[A-Za-z0-9_]{2,16}$/.test(nickname)) {
    throw new Error("Nickname must be 2-16 letters, numbers, or underscores.");
  }

  withScriptLock_(() => {
    const sheet = getSheet_("Profiles");
    const rows = sheet.getDataRange().getValues();
    const rowIndex = rows.findIndex((row, index) => index > 0 && row[0] === playerId);
    const row = [playerId, nickname, Date.now()];
    if (rowIndex === -1) {
      sheet.appendRow(row);
    } else {
      sheet.getRange(rowIndex + 1, 1, 1, row.length).setValues([row]);
    }
  });
  return { ok: true };
}

function submitScore_(params) {
  const playerId = validatePlayerId_(params.uid);
  const difficulty = String(params.difficulty || "");
  const mapSize = Number(params.mapSize);
  const moves = Number(params.moves);
  if (!["easy", "normal", "hard", "impossible"].includes(difficulty)
    || ![7, 9, 11].includes(mapSize)
    || !Number.isInteger(moves)
    || moves < 1
    || moves > 10000) {
    throw new Error("Invalid score.");
  }

  withScriptLock_(() => {
    const profileRows = getSheet_("Profiles").getDataRange().getValues();
    const profile = profileRows.find((row, index) => index > 0 && row[0] === playerId);
    if (!profile) {
      throw new Error("Save a nickname before submitting a score.");
    }

    const today = getUtcDateKey_();
    const spreadsheetTimezone = getSpreadsheet_().getSpreadsheetTimeZone();
    const sheet = getSheet_("Scores");
    const rows = sheet.getDataRange().getValues();
    const updatedIndexes = [];
    for (const period of ["daily", "overall"]) {
      const date = period === "daily" ? today : "all";
      const existingIndex = rows.findIndex((row, index) =>
        index > 0
        && row[0] === playerId
        && row[1] === difficulty
        && Number(row[2]) === mapSize
        && row[3] === period
        && normalizeScoreDate_(row[4], spreadsheetTimezone) === date
      );
      if (existingIndex === -1) {
        const storedDate = period === "daily" ? `UTC:${date}` : date;
        rows.push([playerId, difficulty, mapSize, period, storedDate, moves, Date.now()]);
      } else if (moves < Number(rows[existingIndex][5])) {
        rows[existingIndex][5] = moves;
        rows[existingIndex][6] = Date.now();
        updatedIndexes.push(existingIndex);
      }
    }

    const currentRows = sheet.getLastRow();
    for (const index of updatedIndexes) {
      sheet.getRange(index + 1, 1, 1, SCORE_HEADERS.length).setValues([rows[index]]);
    }
    const changedRows = rows.slice(currentRows);
    if (changedRows.length) {
      sheet.getRange(currentRows + 1, 1, changedRows.length, SCORE_HEADERS.length).setValues(changedRows);
    }
  });
  return { ok: true };
}

function getLeaderboard_(params) {
  const playerId = validatePlayerId_(params.uid);
  const difficulty = String(params.difficulty || "");
  const mapSize = Number(params.mapSize);
  const period = String(params.period || "");
  const date = period === "daily" ? getUtcDateKey_() : "all";
  const spreadsheetTimezone = getSpreadsheet_().getSpreadsheetTimeZone();
  if (!["easy", "normal", "hard", "impossible"].includes(difficulty)
    || ![7, 9, 11].includes(mapSize)
    || !["daily", "overall"].includes(period)) {
    throw new Error("Invalid leaderboard selection.");
  }

  const profileRows = getSheet_("Profiles").getDataRange().getValues();
  const nicknames = new Map(profileRows.slice(1).map(row => [row[0], row[1]]));
  const scoreRows = getSheet_("Scores").getDataRange().getValues();
  return scoreRows.slice(1)
    .filter(row =>
      row[1] === difficulty
      && Number(row[2]) === mapSize
      && row[3] === period
      && normalizeScoreDate_(row[4], spreadsheetTimezone) === date
      && nicknames.has(row[0])
    )
    .map(row => ({
      uid: row[0],
      nickname: nicknames.get(row[0]),
      moves: Number(row[5]),
      achievedAt: Number(row[6]),
      is_you: row[0] === playerId
    }))
    .sort((a, b) => a.moves - b.moves || a.achievedAt - b.achievedAt)
    .slice(0, 10)
    .map(({ nickname, moves, is_you }) => ({ nickname, moves, is_you }));
}

function getUtcDateKey_() {
  return Utilities.formatDate(new Date(), "UTC", "yyyy-MM-dd");
}

function normalizeScoreDate_(value, timezone) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, timezone, "yyyy-MM-dd");
  }
  const text = String(value || "");
  const date = text.match(/^(?:UTC:)?(\d{4}-\d{2}-\d{2})$/);
  if (date) return date[1];
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime())
    ? text
    : Utilities.formatDate(parsed, timezone, "yyyy-MM-dd");
}

function getSpreadsheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!spreadsheetId) {
    throw new Error("Run setupLeaderboard once from the Apps Script editor first.");
  }
  return SpreadsheetApp.openById(spreadsheetId);
}

function validatePlayerId_(value) {
  const playerId = String(value || "");
  if (!/^[A-Za-z0-9_-]{10,80}$/.test(playerId)) {
    throw new Error("Invalid player identity.");
  }
  return playerId;
}

function getSheet_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) {
    throw new Error(`Missing ${name} sheet. Run setupLeaderboard again.`);
  }
  return sheet;
}

function ensureSheet_(spreadsheet, name, headers) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
}

function withScriptLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    callback();
  } finally {
    lock.releaseLock();
  }
}
