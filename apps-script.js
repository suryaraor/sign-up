// Google Apps Script for Material Sign-up
// Deploy as web app: Deploy > New Deployment > Web app > Execute as: your account > Access: Anyone

function doGet(e) {
  const sheetId = e.parameter.sheetId;
  const action = e.parameter.action;
  const callback = e.parameter.callback;
  const sheetName = e.parameter.sheetName || 'material';

  try {
    let result = { success: false, error: 'Unknown action' };

    if (action === 'getMaterials') {
      result = getMaterials(sheetId, sheetName);
    } else if (action === 'createMaterial') {
      result = createMaterial(sheetId, sheetName, e.parameter.item, e.parameter.location, e.parameter.createdBy);
    } else if (action === 'signupMaterial') {
      result = signupMaterial(sheetId, sheetName, Number(e.parameter.rowIndex), e.parameter.volunteer);
    } else if (action === 'updateMaterialStatus') {
      result = updateMaterialStatus(
        sheetId,
        sheetName,
        Number(e.parameter.rowIndex),
        e.parameter.volunteer,
        e.parameter.accepted === 'true',
        e.parameter.loaded === 'true'
      );
    } else if (action === 'releaseMaterial') {
      result = releaseMaterial(sheetId, sheetName, Number(e.parameter.rowIndex), e.parameter.volunteer);
    }

    return asResponse(result, callback);
  } catch (error) {
    return asResponse({ success: false, error: error.toString() }, callback);
  }
}

function doPost(e) {
  return ContentService.createTextOutput(JSON.stringify({
    success: false,
    error: 'Use GET/JSONP for this app'
  })).setMimeType(ContentService.MimeType.JSON);
}

function doOptions() {
  return ContentService.createTextOutput('');
}

function asResponse(payload, callback) {
  if (callback) {
    return ContentService.createTextOutput(`${callback}(${JSON.stringify(payload)})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function getMaterials(sheetId, sheetName) {
  try {
    const { sheet, data, map } = getMaterialSheetModel(sheetId, sheetName);
    const rows = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const item = String(row[map.item] || '').trim();
      const location = String(row[map.location] || '').trim();
      if (!item && !location) {
        continue;
      }

      rows.push({
        rowIndex: i + 1,
        id: String(row[map.id] || '').trim(),
        item,
        volunteer: String(row[map.volunteer] || '').trim(),
        location,
        accepted: parseBooleanCell(row[map.accepted]),
        loaded: parseBooleanCell(row[map.loaded])
      });
    }

    return {
      success: true,
      sheetName: sheet.getName(),
      total: rows.length,
      data: rows
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function createMaterial(sheetId, sheetName, item, location, createdBy) {
  try {
    if (!item || !location) {
      return { success: false, error: 'Item and location are required' };
    }

    const { sheet, map } = getMaterialSheetModel(sheetId, sheetName);
    const now = new Date();
    const nextRow = sheet.getLastRow() + 1;
    const nextId = generateMaterialId(sheet, map.id);

    sheet.getRange(nextRow, map.id + 1).setValue(nextId);
    sheet.getRange(nextRow, map.item + 1).setValue(item);
    sheet.getRange(nextRow, map.volunteer + 1).setValue('');
    sheet.getRange(nextRow, map.location + 1).setValue(location);
    sheet.getRange(nextRow, map.accepted + 1).setValue('No');
    sheet.getRange(nextRow, map.loaded + 1).setValue('No');
    sheet.getRange(nextRow, map.createdBy + 1).setValue(String(createdBy || '').trim());
    sheet.getRange(nextRow, map.updatedAt + 1).setValue(now);

    return { success: true, message: 'Material item created', id: nextId };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function signupMaterial(sheetId, sheetName, rowIndex, volunteer) {
  try {
    if (!rowIndex || rowIndex < 2) {
      return { success: false, error: 'Invalid rowIndex' };
    }

    const volunteerName = String(volunteer || '').trim();
    if (!volunteerName) {
      return { success: false, error: 'Volunteer name is required' };
    }

    const { sheet, map } = getMaterialSheetModel(sheetId, sheetName);
    const currentVolunteer = String(sheet.getRange(rowIndex, map.volunteer + 1).getValue() || '').trim();
    if (currentVolunteer) {
      return { success: false, error: 'Item already claimed' };
    }

    sheet.getRange(rowIndex, map.volunteer + 1).setValue(volunteerName);
    sheet.getRange(rowIndex, map.accepted + 1).setValue('No');
    sheet.getRange(rowIndex, map.loaded + 1).setValue('No');
    sheet.getRange(rowIndex, map.updatedAt + 1).setValue(new Date());

    return { success: true, message: 'Signed up successfully' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function updateMaterialStatus(sheetId, sheetName, rowIndex, volunteer, accepted, loaded) {
  try {
    if (!rowIndex || rowIndex < 2) {
      return { success: false, error: 'Invalid rowIndex' };
    }

    const volunteerName = String(volunteer || '').trim();
    if (!volunteerName) {
      return { success: false, error: 'Volunteer name is required' };
    }

    const { sheet, map } = getMaterialSheetModel(sheetId, sheetName);
    const existingVolunteer = String(sheet.getRange(rowIndex, map.volunteer + 1).getValue() || '').trim();
    if (!existingVolunteer) {
      return { success: false, error: 'No volunteer for this item yet' };
    }

    if (existingVolunteer.toLowerCase() !== volunteerName.toLowerCase()) {
      return { success: false, error: 'Only assigned volunteer can update status' };
    }

    sheet.getRange(rowIndex, map.accepted + 1).setValue(accepted ? 'Yes' : 'No');
    sheet.getRange(rowIndex, map.loaded + 1).setValue(loaded ? 'Yes' : 'No');
    sheet.getRange(rowIndex, map.updatedAt + 1).setValue(new Date());

    return { success: true, message: 'Status updated' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function releaseMaterial(sheetId, sheetName, rowIndex, volunteer) {
  try {
    if (!rowIndex || rowIndex < 2) {
      return { success: false, error: 'Invalid rowIndex' };
    }

    const volunteerName = String(volunteer || '').trim();
    const { sheet, map } = getMaterialSheetModel(sheetId, sheetName);
    const existingVolunteer = String(sheet.getRange(rowIndex, map.volunteer + 1).getValue() || '').trim();

    if (!existingVolunteer) {
      return { success: false, error: 'Item is already unclaimed' };
    }

    if (existingVolunteer.toLowerCase() !== volunteerName.toLowerCase()) {
      return { success: false, error: 'Only assigned volunteer can release item' };
    }

    sheet.getRange(rowIndex, map.volunteer + 1).setValue('');
    sheet.getRange(rowIndex, map.accepted + 1).setValue('No');
    sheet.getRange(rowIndex, map.loaded + 1).setValue('No');
    sheet.getRange(rowIndex, map.updatedAt + 1).setValue(new Date());

    return { success: true, message: 'Item released' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getMaterialSheetModel(sheetId, sheetName) {
  const spreadsheet = SpreadsheetApp.openById(sheetId);
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(`Sheet '${sheetName}' not found`);
  }

  let data = sheet.getDataRange().getValues();
  if (data.length === 0) {
    sheet.getRange(1, 1, 1, 8).setValues([['ID', 'Item', 'Volunteer', 'location', 'Accepted', 'Loaded', 'CreatedBy', 'UpdatedAt']]);
    data = sheet.getDataRange().getValues();
  }

  let headers = data[0].map(h => String(h || '').trim());
  headers = ensureColumns(sheet, headers, ['Accepted', 'Loaded', 'CreatedBy', 'UpdatedAt']);
  data = sheet.getDataRange().getValues();

  const headerMap = mapMaterialHeaders(headers);
  if (headerMap.id === -1 || headerMap.item === -1 || headerMap.volunteer === -1 || headerMap.location === -1) {
    throw new Error('Required columns missing. Expected: ID, Item, Volunteer, location');
  }

  return { sheet, data, map: headerMap };
}

function ensureColumns(sheet, headers, requiredColumns) {
  const updatedHeaders = headers.slice();
  requiredColumns.forEach((name) => {
    const exists = updatedHeaders.some(h => h.toLowerCase() === name.toLowerCase());
    if (!exists) {
      updatedHeaders.push(name);
      sheet.getRange(1, updatedHeaders.length).setValue(name);
    }
  });
  return updatedHeaders;
}

function mapMaterialHeaders(headers) {
  const normalized = headers.map(h => String(h || '').toLowerCase().trim());
  return {
    id: normalized.findIndex(h => h === 'id'),
    item: normalized.findIndex(h => h === 'item'),
    volunteer: normalized.findIndex(h => h === 'volunteer'),
    location: normalized.findIndex(h => h === 'location'),
    accepted: normalized.findIndex(h => h === 'accepted'),
    loaded: normalized.findIndex(h => h === 'loaded'),
    createdBy: normalized.findIndex(h => h === 'createdby'),
    updatedAt: normalized.findIndex(h => h === 'updatedat')
  };
}

function parseBooleanCell(value) {
  const normalized = String(value || '').toLowerCase().trim();
  return normalized === 'yes' || normalized === 'true' || normalized === '1';
}

function generateMaterialId(sheet, idColumnIndex) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return 'M-001';
  }

  const values = sheet.getRange(2, idColumnIndex + 1, lastRow - 1, 1).getValues();
  let max = 0;
  values.forEach((row) => {
    const raw = String(row[0] || '').trim();
    const match = raw.match(/(\d+)$/);
    if (match) {
      const n = Number(match[1]);
      if (n > max) {
        max = n;
      }
    }
  });

  const next = max + 1;
  return `M-${String(next).padStart(3, '0')}`;
}
