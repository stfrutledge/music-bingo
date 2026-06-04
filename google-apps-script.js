/**
 * Google Apps Script for Music Bingo Sheets Sync
 *
 * SETUP INSTRUCTIONS:
 * 1. Create a new Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Delete any existing code and paste this entire file
 * 4. Click Deploy > New deployment
 * 5. Select "Web app" as the type
 * 6. Set "Execute as" to "Me"
 * 7. Set "Who has access" to "Anyone"
 * 8. Click Deploy and copy the web app URL
 * 9. Paste the URL into the Music Bingo app settings
 */

// Handle GET requests (fetch data and save)
function doGet(e) {
  try {
    // Handle missing parameters gracefully
    const params = e && e.parameter ? e.parameter : {};
    const action = params.action || 'list';

    if (action === 'get') {
      const playlistId = params.playlistId;
      if (!playlistId) {
        return jsonResponse({ error: 'playlistId required' });
      }
      const playlist = getPlaylist(playlistId);
      return jsonResponse({ playlist });
    }

    if (action === 'list') {
      const playlists = listPlaylists();
      return jsonResponse({ playlists });
    }

    // Handle save via GET (data passed as URL parameter)
    if (action === 'save') {
      if (!params.data) {
        return jsonResponse({ error: 'data required' });
      }
      const data = JSON.parse(params.data);
      if (data.playlist) {
        savePlaylist(data.playlist);
        return jsonResponse({ success: true, message: 'Playlist saved' });
      }
      return jsonResponse({ error: 'playlist data required' });
    }

    // Chunked save: init - creates/clears the sheet
    if (action === 'init') {
      if (!params.data) {
        return jsonResponse({ error: 'data required' });
      }
      const data = JSON.parse(params.data);
      initPlaylistSheet(data.playlistId, data.playlistName, data.totalSongs);
      return jsonResponse({ success: true, message: 'Initialized' });
    }

    // Chunked save: chunk - adds songs to sheet
    if (action === 'chunk') {
      if (!params.data) {
        return jsonResponse({ error: 'data required' });
      }
      const data = JSON.parse(params.data);
      addSongsChunk(data.playlistId, data.startIndex, data.songs);
      return jsonResponse({ success: true, message: 'Chunk saved' });
    }

    // Chunked save: finalize - marks save complete
    if (action === 'finalize') {
      if (!params.data) {
        return jsonResponse({ error: 'data required' });
      }
      const data = JSON.parse(params.data);
      finalizePlaylist(data.playlistId);
      return jsonResponse({ success: true, message: 'Finalized' });
    }

    return jsonResponse({ error: 'Unknown action' });
  } catch (error) {
    return jsonResponse({ error: error.toString() });
  }
}

// Handle POST requests (save data)
function doPost(e) {
  try {
    let data;

    // Try to parse from various sources
    if (e && e.postData && e.postData.contents) {
      // Direct JSON body
      data = JSON.parse(e.postData.contents);
    } else if (e && e.parameter && e.parameter.data) {
      // Form data
      data = JSON.parse(e.parameter.data);
    } else {
      // Log what we received for debugging
      console.log('POST received:', JSON.stringify(e));
      return jsonResponse({ error: 'No data provided', received: e ? Object.keys(e) : 'null' });
    }

    if (data.action === 'save') {
      savePlaylist(data.playlist);
      return jsonResponse({ success: true, message: 'Playlist saved' });
    }

    return jsonResponse({ error: 'Unknown action' });
  } catch (error) {
    return jsonResponse({ error: error.toString() });
  }
}

// Helper to return JSON response with CORS headers
function jsonResponse(data) {
  const output = ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

// Handle CORS preflight
function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

// Get or create a sheet for a playlist
function getOrCreateSheet(playlistId, playlistName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(playlistId);

  if (!sheet) {
    sheet = ss.insertSheet(playlistId);
    // Set up headers
    sheet.getRange('A1:F1').setValues([[
      'songId', 'title', 'artist', 'audioFile', 'startTime', 'startTimeManual'
    ]]);
    sheet.getRange('A1:F1').setFontWeight('bold');
    sheet.setFrozenRows(1);

    // Store playlist name in a named range or properties
    const props = PropertiesService.getScriptProperties();
    props.setProperty('playlist_name_' + playlistId, playlistName || playlistId);
  }

  return sheet;
}

// Save playlist data to sheet
function savePlaylist(playlistData) {
  const { playlistId, playlistName, songs } = playlistData;
  const sheet = getOrCreateSheet(playlistId, playlistName);

  // Store playlist name
  const props = PropertiesService.getScriptProperties();
  props.setProperty('playlist_name_' + playlistId, playlistName || playlistId);
  props.setProperty('playlist_synced_' + playlistId, new Date().toISOString());

  // Clear existing data (except header)
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 6).clear();
  }

  // Write song data
  if (songs && songs.length > 0) {
    const data = songs.map(song => [
      song.songId || '',
      song.title || '',
      song.artist || '',
      song.audioFile || '',
      song.startTime || 0,
      song.startTimeManual ? 'TRUE' : 'FALSE'
    ]);

    sheet.getRange(2, 1, data.length, 6).setValues(data);
  }

  // Auto-resize columns
  sheet.autoResizeColumns(1, 6);
}

// Get playlist data from sheet
function getPlaylist(playlistId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(playlistId);

  if (!sheet) {
    return null;
  }

  const props = PropertiesService.getScriptProperties();
  const playlistName = props.getProperty('playlist_name_' + playlistId) || playlistId;
  const lastSynced = props.getProperty('playlist_synced_' + playlistId);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return {
      playlistId,
      playlistName,
      songs: [],
      lastSynced: lastSynced ? new Date(lastSynced).getTime() : null
    };
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();

  const songs = data.map(row => ({
    songId: row[0],
    title: row[1],
    artist: row[2],
    audioFile: row[3],
    startTime: Number(row[4]) || 0,
    startTimeManual: row[5] === 'TRUE' || row[5] === true
  }));

  return {
    playlistId,
    playlistName,
    songs,
    lastSynced: lastSynced ? new Date(lastSynced).getTime() : null
  };
}

// List all playlists (sheets) in the spreadsheet
function listPlaylists() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const props = PropertiesService.getScriptProperties();

  const playlists = [];

  for (const sheet of sheets) {
    const playlistId = sheet.getName();
    // Skip sheets that don't look like playlists
    if (playlistId.startsWith('Sheet') || playlistId === '_config') {
      continue;
    }

    const playlistName = props.getProperty('playlist_name_' + playlistId) || playlistId;
    const lastSynced = props.getProperty('playlist_synced_' + playlistId);
    const songCount = Math.max(0, sheet.getLastRow() - 1);

    playlists.push({
      playlistId,
      playlistName,
      songCount,
      lastSynced: lastSynced ? new Date(lastSynced).getTime() : null
    });
  }

  return playlists;
}

// Chunked save: Initialize playlist sheet
function initPlaylistSheet(playlistId, playlistName, totalSongs) {
  const sheet = getOrCreateSheet(playlistId, playlistName);

  // Store playlist name
  const props = PropertiesService.getScriptProperties();
  props.setProperty('playlist_name_' + playlistId, playlistName || playlistId);

  // Clear existing data (except header)
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 6).clear();
  }
}

// Chunked save: Add songs chunk to sheet
function addSongsChunk(playlistId, startIndex, songs) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(playlistId);

  if (!sheet || !songs || songs.length === 0) return;

  const data = songs.map(song => [
    song.songId || '',
    song.title || '',
    song.artist || '',
    song.audioFile || '',
    song.startTime || 0,
    song.startTimeManual ? 'TRUE' : 'FALSE'
  ]);

  // Write at the correct row (startIndex + 2 because row 1 is header)
  sheet.getRange(startIndex + 2, 1, data.length, 6).setValues(data);
}

// Chunked save: Finalize playlist save
function finalizePlaylist(playlistId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(playlistId);

  if (!sheet) return;

  // Update sync timestamp
  const props = PropertiesService.getScriptProperties();
  props.setProperty('playlist_synced_' + playlistId, new Date().toISOString());

  // Auto-resize columns
  sheet.autoResizeColumns(1, 6);
}
