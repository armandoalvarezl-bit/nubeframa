var SHEET_NAME = 'Inventario';
var SALES_SHEET_NAME = 'Ventas';
var USERS_SHEET_NAME = 'Usuarios';
var COMPANIES_SHEET_NAME = 'Empresas';
var LICENSES_SHEET_NAME = 'Licencias';
var LICENSE_DEVICES_SHEET_NAME = 'LicenciasEquipos';
var LICENSE_HISTORY_SHEET_NAME = 'LicenciasHistorial';
var WITHDRAWALS_SHEET_NAME = 'Retiros';
var CASH_CLOSURES_SHEET_CANDIDATES = ['CierresCaja', 'Cierres de Caja', 'Cierres'];
var SETTINGS_SHEET_NAME = 'Info';
var REQUIRED_HEADERS = ['id', 'sku', 'nombre', 'categoria', 'precio', 'stock', 'lote', 'fecha_vencimiento', 'laboratorio', 'codigo_barras', 'descripcion', 'imagen_url', 'activo'];
var LEGACY_SALES_HEADERS = ['id', 'ticket_numero', 'fecha', 'hora', 'cliente_nombre', 'cliente_documento', 'metodo_pago', 'recibido', 'cambio', 'subtotal', 'impuesto', 'total', 'items_json', 'creado_en'];
var SALES_HEADERS = ['id', 'ticket_numero', 'fecha', 'hora', 'cliente_nombre', 'cliente_documento', 'metodo_pago', 'recibido', 'cambio', 'subtotal', 'impuesto', 'total', 'items_json', 'creado_en', 'puntos_usados', 'descuento_puntos', 'puntos_ganados'];
var USER_HEADERS = ['Id', 'Nombre', 'Usuario', 'contraseña', 'Estado'];
var WITHDRAWALS_HEADERS = ['id', 'retiro_numero', 'fecha', 'hora', 'monto', 'motivo', 'cajero_usuario', 'cajero_nombre', 'supervisor_usuario', 'supervisor_nombre', 'creado_en'];
var CASH_CLOSURES_HEADERS = ['id', 'cierre_numero', 'fecha', 'creado_en', 'usuario', 'apertura', 'ventas_efectivo', 'ventas_tarjeta', 'ventas_transferencia', 'retiros_total', 'ajuste_manual', 'efectivo_contado', 'efectivo_esperado', 'diferencia', 'transacciones', 'ventas_total', 'unidades', 'observaciones', 'ventas_json'];
var SETTINGS_HEADERS = ['clave', 'valor'];
var COMPANY_PROFILE_KEYS = ['name', 'nit', 'phone', 'email', 'address', 'city', 'manager', 'logo_url'];
var LEGACY_USER_HEADERS = ['Id', 'Nombre', 'Usuario', 'contraseÃ±a', 'Estado'];
var WEB_USER_HEADERS = ['Id', 'EmpresaId', 'Nombre', 'Usuario', 'contrasena', 'Rol', 'Estado', 'CreadoEn'];
var COMPANY_HEADERS = ['id', 'nombre', 'nit', 'telefono', 'email', 'contacto', 'estado', 'creada_en', 'actualizada_en'];
var LICENSE_HEADERS = ['id', 'empresa_id', 'codigo_licencia', 'cliente_nombre', 'cliente_documento', 'empresa_nombre', 'telefono', 'email', 'equipo_id', 'equipo_nombre', 'plan', 'max_equipos', 'fecha_activacion', 'fecha_vencimiento', 'estado', 'observaciones', 'creada_en', 'actualizada_en'];
var LICENSE_DEVICE_HEADERS = ['id', 'licencia_id', 'equipo_id', 'equipo_nombre', 'primera_activacion', 'ultima_validacion', 'estado'];
var LICENSE_HISTORY_HEADERS = ['id', 'licencia_id', 'tipo_evento', 'detalle', 'equipo_id', 'equipo_nombre', 'creado_en'];

function doGet(e) {
  var mode = getParam_(e, 'mode', 'full');

  try {
    if (mode === 'ping') {
      return jsonResponse_({
        ok: true,
        mode: 'ping',
        message: 'Apps Script responde',
        timestamp: new Date().toISOString()
      });
    }

    if (mode === 'debug') {
      return jsonResponse_(debugInfo_());
    }

    if (mode === 'setup') {
      return jsonResponse_(setupWebApp_({ dryRun: true }));
    }

    if (mode === 'users') {
      return jsonResponse_({
        ok: true,
        mode: 'users',
        updated_at: new Date().toISOString(),
        users: listUsersWeb_()
      });
    }

    if (mode === 'licensing') {
      return jsonResponse_({
        ok: true,
        mode: 'licensing',
        updated_at: new Date().toISOString(),
        overview: getLicensingOverviewWeb_()
      });
    }

    if (mode === 'sales') {
      var salesSheet = getSalesSheet_();
      var sales = readSalesItems_(salesSheet);
      return jsonResponse_({
        ok: true,
        mode: 'sales',
        updated_at: new Date().toISOString(),
        total: sales.length,
        sales: sales
      });
    }

    if (mode === 'withdrawals') {
      var withdrawalsSheet = getWithdrawalsSheet_();
      var withdrawals = readWithdrawalItems_(withdrawalsSheet);
      return jsonResponse_({
        ok: true,
        mode: 'withdrawals',
        updated_at: new Date().toISOString(),
        total: withdrawals.length,
        withdrawals: withdrawals
      });
    }

    if (mode === 'closures') {
      var cashClosuresSheet = getCashClosuresSheet_();
      var closures = readCashClosureItems_(cashClosuresSheet);
      return jsonResponse_({
        ok: true,
        mode: 'closures',
        updated_at: new Date().toISOString(),
        total: closures.length,
        closures: closures
      });
    }

    if (mode === 'company') {
      var settingsSheet = getSettingsSheet_();
      return jsonResponse_({
        ok: true,
        mode: 'company',
        updated_at: new Date().toISOString(),
        profile: readCompanyProfile_(settingsSheet)
      });
    }

    var sheet = getInventorySheet_();
    var items = readInventoryItems_(sheet);

    return jsonResponse_({
      ok: true,
      mode: 'full',
      updated_at: new Date().toISOString(),
      total: items.length,
      items: items
    });
  } catch (error) {
    logError_('doGet', error);
    return jsonResponse_({
      ok: false,
      where: 'doGet',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

function doPost(e) {
  try {
    var payload = parseRequestBody_(e);
    var action = String(payload.action || 'upsert').trim().toLowerCase();

    if (action === 'debug') {
      return jsonResponse_({
        ok: true,
        mode: 'post-debug',
        received: payload,
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'authenticate_user') {
      var usersSheet = getUsersSheet_();
      var authResult = authenticateUser_(usersSheet, payload);
      return jsonResponse_(authResult);
    }

    if (action === 'setup_web_app') {
      return jsonResponse_(setupWebApp_(payload));
    }

    if (action === 'list_users') {
      return jsonResponse_({
        ok: true,
        action: 'list_users',
        updated_at: new Date().toISOString(),
        users: listUsersWeb_()
      });
    }

    if (action === 'save_user') {
      return jsonResponse_({
        ok: true,
        action: 'save_user',
        updated_at: new Date().toISOString(),
        users: saveUserWeb_(payload.user || payload)
      });
    }

    if (action === 'set_user_active') {
      return jsonResponse_({
        ok: true,
        action: 'set_user_active',
        updated_at: new Date().toISOString(),
        users: setUserActiveWeb_(payload.id, payload.active)
      });
    }

    if (action === 'licensing_overview') {
      return jsonResponse_({
        ok: true,
        action: 'licensing_overview',
        updated_at: new Date().toISOString(),
        overview: getLicensingOverviewWeb_()
      });
    }

    if (action === 'save_company') {
      return jsonResponse_({
        ok: true,
        action: 'save_company',
        updated_at: new Date().toISOString(),
        overview: saveCompanyWeb_(payload.company || payload)
      });
    }

    if (action === 'save_license') {
      return jsonResponse_({
        ok: true,
        action: 'save_license',
        updated_at: new Date().toISOString(),
        overview: saveLicenseWeb_(payload.license || payload)
      });
    }

    if (action === 'validate_license_web') {
      return jsonResponse_({
        ok: true,
        action: 'validate_license_web',
        updated_at: new Date().toISOString(),
        license: validateLicenseWeb_(payload.code || payload.licenseCode || '')
      });
    }

    if (action === 'set_license_status') {
      return jsonResponse_({
        ok: true,
        action: 'set_license_status',
        updated_at: new Date().toISOString(),
        overview: setLicenseStatusWeb_(payload.id, payload.status)
      });
    }

    if (action === 'renew_license') {
      return jsonResponse_({
        ok: true,
        action: 'renew_license',
        updated_at: new Date().toISOString(),
        overview: renewLicenseWeb_(payload.id)
      });
    }

    if (action === 'release_license_device') {
      return jsonResponse_({
        ok: true,
        action: 'release_license_device',
        updated_at: new Date().toISOString(),
        overview: releaseLicenseDeviceWeb_(payload.licenseId, payload.installationId)
      });
    }

    if (action === 'save_company_profile') {
      var settingsSheet = getSettingsSheet_();
      var profile = normalizeCompanyProfile_(payload.profile || payload);
      var savedProfile = saveCompanyProfile_(settingsSheet, profile);
      return jsonResponse_({
        ok: true,
        action: 'save_company_profile',
        updated_at: new Date().toISOString(),
        profile: savedProfile
      });
    }

    if (action === 'decrement_stock') {
      var sheet = getInventorySheet_();
      var salesItems = payload.items;
      if (!Array.isArray(salesItems) || !salesItems.length) {
        throw new Error('No se recibieron items para descontar stock.');
      }

      decrementStock_(sheet, salesItems);
      return jsonResponse_({
        ok: true,
        action: 'decrement_stock',
        updated_at: new Date().toISOString(),
        total: readInventoryItems_(sheet).length,
        items: readInventoryItems_(sheet)
      });
    }

    if (action === 'receive_order') {
      var sheet = getInventorySheet_();
      var receivedItems = payload.items;
      if (!Array.isArray(receivedItems) || !receivedItems.length) {
        throw new Error('No se recibieron items para ingresar al inventario.');
      }

      receiveOrder_(sheet, receivedItems);
      return jsonResponse_({
        ok: true,
        action: 'receive_order',
        updated_at: new Date().toISOString(),
        total: readInventoryItems_(sheet).length,
        items: readInventoryItems_(sheet)
      });
    }

    if (action === 'bulk_upsert') {
      var sheet = getInventorySheet_();
      var importItems = payload.items;
      if (!Array.isArray(importItems) || !importItems.length) {
        throw new Error('No se recibieron items para importar.');
      }

      var summary = bulkUpsertInventoryItems_(sheet, importItems);
      return jsonResponse_({
        ok: true,
        action: 'bulk_upsert',
        updated_at: new Date().toISOString(),
        summary: summary,
        total: readInventoryItems_(sheet).length,
        items: readInventoryItems_(sheet)
      });
    }

    if (action === 'register_sale') {
      var salesSheet = getSalesSheet_();
      var sale = normalizeIncomingSale_(payload.sale || payload);
      if (!Array.isArray(sale.items) || !sale.items.length) {
        throw new Error('La venta debe contener al menos un item.');
      }

      var savedSale = appendSale_(salesSheet, sale);
      var sales = readSalesItems_(salesSheet);
      return jsonResponse_({
        ok: true,
        action: 'register_sale',
        updated_at: new Date().toISOString(),
        sale: savedSale,
        total: sales.length,
        sales: sales
      });
    }

    if (action === 'register_withdrawal') {
      var withdrawalsSheet = getWithdrawalsSheet_();
      var usersSheet = getUsersSheet_();
      var withdrawal = normalizeIncomingWithdrawal_(payload.withdrawal || payload);
      var supervisorAuth = authenticateUser_(usersSheet, {
        username: payload.supervisor_username || payload.supervisorUsername || '',
        password: payload.supervisor_password || payload.supervisorPassword || ''
      });

      if (!supervisorAuth.ok || !supervisorAuth.user) {
        throw new Error('No fue posible validar al supervisor.');
      }

      if (supervisorAuth.user.role !== 'admin' && supervisorAuth.user.role !== 'supervisor') {
        throw new Error('Solo un administrador o supervisor puede autorizar retiros.');
      }

      withdrawal.supervisorUsername = supervisorAuth.user.username;
      withdrawal.supervisorName = supervisorAuth.user.name;

      var savedWithdrawal = appendWithdrawal_(withdrawalsSheet, withdrawal);
      var withdrawals = readWithdrawalItems_(withdrawalsSheet);
      return jsonResponse_({
        ok: true,
        action: 'register_withdrawal',
        updated_at: new Date().toISOString(),
        withdrawal: savedWithdrawal,
        total: withdrawals.length,
        withdrawals: withdrawals
      });
    }

    if (action === 'update_withdrawal') {
      var updateWithdrawalsSheet = getWithdrawalsSheet_();
      var updateUsersSheet = getUsersSheet_();
      var updateWithdrawal = normalizeIncomingWithdrawal_(payload.withdrawal || payload);
      var updateSupervisorAuth = authenticateUser_(updateUsersSheet, {
        username: payload.supervisor_username || payload.supervisorUsername || '',
        password: payload.supervisor_password || payload.supervisorPassword || ''
      });

      if (!updateSupervisorAuth.ok || !updateSupervisorAuth.user) {
        throw new Error('No fue posible validar al supervisor.');
      }

      if (updateSupervisorAuth.user.role !== 'admin' && updateSupervisorAuth.user.role !== 'supervisor') {
        throw new Error('Solo un administrador o supervisor puede autorizar cambios en retiros.');
      }

      updateWithdrawal.supervisorUsername = updateSupervisorAuth.user.username;
      updateWithdrawal.supervisorName = updateSupervisorAuth.user.name;

      var updatedWithdrawal = updateWithdrawal_(updateWithdrawalsSheet, updateWithdrawal);
      var updatedWithdrawals = readWithdrawalItems_(updateWithdrawalsSheet);
      return jsonResponse_({
        ok: true,
        action: 'update_withdrawal',
        updated_at: new Date().toISOString(),
        withdrawal: updatedWithdrawal,
        total: updatedWithdrawals.length,
        withdrawals: updatedWithdrawals
      });
    }

    if (action === 'delete_withdrawal') {
      var deleteWithdrawalsSheet = getWithdrawalsSheet_();
      var deletedWithdrawal = deleteWithdrawal_(deleteWithdrawalsSheet, payload.withdrawal_id || payload.withdrawalId || payload.id || '');
      var remainingWithdrawals = readWithdrawalItems_(deleteWithdrawalsSheet);
      return jsonResponse_({
        ok: true,
        action: 'delete_withdrawal',
        updated_at: new Date().toISOString(),
        withdrawal: deletedWithdrawal,
        total: remainingWithdrawals.length,
        withdrawals: remainingWithdrawals
      });
    }

    if (action === 'register_cash_closure') {
      var cashClosuresSheet = getCashClosuresSheet_();
      var cashClosure = normalizeIncomingCashClosure_(payload.closure || payload);
      var savedCashClosure = appendCashClosure_(cashClosuresSheet, cashClosure);
      var cashClosures = readCashClosureItems_(cashClosuresSheet);
      return jsonResponse_({
        ok: true,
        action: 'register_cash_closure',
        updated_at: new Date().toISOString(),
        closure: savedCashClosure,
        total: cashClosures.length,
        closures: cashClosures
      });
    }

    if (action === 'update_cash_closure') {
      var cashClosuresSheet = getCashClosuresSheet_();
      var cashClosure = normalizeIncomingCashClosure_(payload.closure || payload);
      var updatedCashClosure = updateCashClosure_(cashClosuresSheet, cashClosure);
      var cashClosures = readCashClosureItems_(cashClosuresSheet);
      return jsonResponse_({
        ok: true,
        action: 'update_cash_closure',
        updated_at: new Date().toISOString(),
        closure: updatedCashClosure,
        total: cashClosures.length,
        closures: cashClosures
      });
    }

    if (action === 'delete_cash_closure') {
      var cashClosuresSheet = getCashClosuresSheet_();
      var deletedCashClosure = deleteCashClosure_(cashClosuresSheet, payload.closure_id || payload.closureId || payload.id || '');
      var cashClosures = readCashClosureItems_(cashClosuresSheet);
      return jsonResponse_({
        ok: true,
        action: 'delete_cash_closure',
        updated_at: new Date().toISOString(),
        closure: deletedCashClosure,
        total: cashClosures.length,
        closures: cashClosures
      });
    }

    if (action !== 'upsert') {
      throw new Error('Acción no soportada: ' + action);
    }

    var sheet = getInventorySheet_();
    var product = normalizeIncomingItem_(payload.item || payload);
    if (!product.nombre) throw new Error('El nombre del producto es obligatorio.');
    if (!product.sku) throw new Error('El SKU del producto es obligatorio.');

    var saved = upsertInventoryItem_(sheet, product);
    var items = readInventoryItems_(sheet);

    return jsonResponse_({
      ok: true,
      action: 'upsert',
      updated_at: new Date().toISOString(),
      item: saved,
      total: items.length,
      items: items
    });
  } catch (error) {
    logError_('doPost', error);
    return jsonResponse_({
      ok: false,
      where: 'doPost',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

function debugInfo_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet ? spreadsheet.getSheetByName(SHEET_NAME) : null;
  var allSheetNames = spreadsheet ? spreadsheet.getSheets().map(function(item) { return item.getName(); }) : [];
  var headers = [];
  var rowCount = 0;

  if (sheet) {
    rowCount = sheet.getLastRow();
    if (rowCount > 0) {
      headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), REQUIRED_HEADERS.length)).getValues()[0];
    }
  }

  return {
    ok: true,
    mode: 'debug',
    timestamp: new Date().toISOString(),
    spreadsheet_name: spreadsheet ? spreadsheet.getName() : null,
    spreadsheet_id: spreadsheet ? spreadsheet.getId() : null,
    target_sheet: SHEET_NAME,
    target_sheet_exists: !!sheet,
    available_sheets: allSheetNames,
    last_row: rowCount,
    last_column: sheet ? sheet.getLastColumn() : 0,
    headers: headers,
    required_headers: REQUIRED_HEADERS
  };
}

function getInventorySheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('No se pudo abrir la hoja de cálculo activa.');
  }

  var sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error('No existe la hoja "' + SHEET_NAME + '". Hojas disponibles: ' + spreadsheet.getSheets().map(function(item) {
      return item.getName();
    }).join(', '));
  }

  ensureHeaders_(sheet);
  return sheet;
}

function getSalesSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('No se pudo abrir la hoja de cálculo activa.');
  }

  var sheet = spreadsheet.getSheetByName(SALES_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SALES_SHEET_NAME);
  }

  ensureSalesHeaders_(sheet);
  return sheet;
}

function getUsersSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('No se pudo abrir la hoja de cálculo activa.');
  }

  var sheet = spreadsheet.getSheetByName(USERS_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(USERS_SHEET_NAME);
  }

  ensureUsersHeaders_(sheet);
  return sheet;
}

function getWithdrawalsSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('No se pudo abrir la hoja de cálculo activa.');
  }

  var sheet = spreadsheet.getSheetByName(WITHDRAWALS_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(WITHDRAWALS_SHEET_NAME);
  }

  ensureWithdrawalsHeaders_(sheet);
  return sheet;
}

function getCashClosuresSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('No se pudo abrir la hoja de cálculo activa.');
  }

  var sheet = null;
  for (var i = 0; i < CASH_CLOSURES_SHEET_CANDIDATES.length; i += 1) {
    sheet = spreadsheet.getSheetByName(CASH_CLOSURES_SHEET_CANDIDATES[i]);
    if (sheet) break;
  }

  if (!sheet) {
    sheet = spreadsheet.insertSheet(CASH_CLOSURES_SHEET_CANDIDATES[0]);
  }

  ensureCashClosuresHeaders_(sheet);
  return sheet;
}

function getSettingsSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('No se pudo abrir la hoja de cálculo activa.');
  }

  var sheet = spreadsheet.getSheetByName(SETTINGS_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SETTINGS_SHEET_NAME);
  }

  ensureSettingsHeaders_(sheet);
  return sheet;
}

function ensureHeaders_(sheet) {
  var lastColumn = Math.max(sheet.getLastColumn(), REQUIRED_HEADERS.length);
  var existingHeaders = lastColumn ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];
  var isEmptySheet = sheet.getLastRow() === 0;

  if (isEmptySheet) {
    sheet.getRange(1, 1, 1, REQUIRED_HEADERS.length).setValues([REQUIRED_HEADERS]);
    return;
  }

  var existingTrimmed = existingHeaders.map(function(header) {
    return String(header || '').trim();
  }).filter(function(header) {
    return header !== '';
  });

  var legacyInventoryHeaders = REQUIRED_HEADERS.slice();
  legacyInventoryHeaders.splice(legacyInventoryHeaders.indexOf('imagen_url'), 1);
  var legacyMatches = existingTrimmed.length === legacyInventoryHeaders.length;

  if (legacyMatches) {
    for (var legacyIndex = 0; legacyIndex < legacyInventoryHeaders.length; legacyIndex += 1) {
      if (existingTrimmed[legacyIndex] !== legacyInventoryHeaders[legacyIndex]) {
        legacyMatches = false;
        break;
      }
    }
  }

  if (legacyMatches) {
    sheet.getRange(1, 1, 1, REQUIRED_HEADERS.length).setValues([REQUIRED_HEADERS]);
    return;
  }

  for (var i = 0; i < REQUIRED_HEADERS.length; i += 1) {
    if (String(existingHeaders[i] || '').trim() !== REQUIRED_HEADERS[i]) {
      throw new Error('La fila de encabezados no coincide con el formato esperado. Debe ser: ' + REQUIRED_HEADERS.join(', '));
    }
  }
}

function ensureSalesHeaders_(sheet) {
  var lastColumn = Math.max(sheet.getLastColumn(), SALES_HEADERS.length);
  var existingHeaders = lastColumn ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];
  var isEmptySheet = sheet.getLastRow() === 0;

  if (isEmptySheet) {
    sheet.getRange(1, 1, 1, SALES_HEADERS.length).setValues([SALES_HEADERS]);
    return;
  }

  var legacyMatches = true;
  for (var j = 0; j < LEGACY_SALES_HEADERS.length; j += 1) {
    if (String(existingHeaders[j] || '').trim() !== LEGACY_SALES_HEADERS[j]) {
      legacyMatches = false;
      break;
    }
  }

  if (legacyMatches) {
    for (var k = LEGACY_SALES_HEADERS.length; k < SALES_HEADERS.length; k += 1) {
      sheet.getRange(1, k + 1).setValue(SALES_HEADERS[k]);
    }
    return;
  }

  for (var i = 0; i < SALES_HEADERS.length; i += 1) {
    if (String(existingHeaders[i] || '').trim() !== SALES_HEADERS[i]) {
      throw new Error('La fila de encabezados de ventas no coincide con el formato esperado. Debe ser: ' + SALES_HEADERS.join(', '));
    }
  }
}

function ensureUsersHeaders_(sheet) {
  var lastColumn = Math.max(sheet.getLastColumn(), WEB_USER_HEADERS.length);
  var existingHeaders = lastColumn ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];
  var isEmptySheet = sheet.getLastRow() === 0;

  if (isEmptySheet) {
    sheet.getRange(1, 1, 1, WEB_USER_HEADERS.length).setValues([WEB_USER_HEADERS]);
    return;
  }

  var legacyMatches = true;
  for (var j = 0; j < LEGACY_USER_HEADERS.length; j += 1) {
    if (normalizeHeaderKey_(existingHeaders[j]) !== normalizeHeaderKey_(LEGACY_USER_HEADERS[j])) {
      legacyMatches = false;
      break;
    }
  }

  if (legacyMatches) {
    var upgrades = ['EmpresaId', 'Rol', 'CreadoEn'];
    for (var k = 0; k < upgrades.length; k += 1) {
      sheet.getRange(1, LEGACY_USER_HEADERS.length + k + 1).setValue(upgrades[k]);
    }
    return;
  }

  for (var i = 0; i < WEB_USER_HEADERS.length; i += 1) {
    if (normalizeHeaderKey_(existingHeaders[i]) !== normalizeHeaderKey_(WEB_USER_HEADERS[i])) {
      throw new Error('La fila de encabezados de usuarios no coincide con el formato esperado. Debe ser: ' + WEB_USER_HEADERS.join(', '));
    }
  }
}

function ensureWithdrawalsHeaders_(sheet) {
  var lastColumn = Math.max(sheet.getLastColumn(), WITHDRAWALS_HEADERS.length);
  var existingHeaders = lastColumn ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];
  var isEmptySheet = sheet.getLastRow() === 0;

  if (isEmptySheet) {
    sheet.getRange(1, 1, 1, WITHDRAWALS_HEADERS.length).setValues([WITHDRAWALS_HEADERS]);
    return;
  }

  for (var i = 0; i < WITHDRAWALS_HEADERS.length; i += 1) {
    if (normalizeHeaderKey_(existingHeaders[i]) !== normalizeHeaderKey_(WITHDRAWALS_HEADERS[i])) {
      throw new Error('La fila de encabezados de retiros no coincide con el formato esperado. Debe ser: ' + WITHDRAWALS_HEADERS.join(', '));
    }
  }
}

function normalizeHeaderKey_(value) {
  return String(value || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function ensureCashClosuresHeaders_(sheet) {
  var lastColumn = Math.max(sheet.getLastColumn(), CASH_CLOSURES_HEADERS.length);
  var existingHeaders = lastColumn ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];
  var isEmptySheet = sheet.getLastRow() === 0;

  if (isEmptySheet) {
    sheet.getRange(1, 1, 1, CASH_CLOSURES_HEADERS.length).setValues([CASH_CLOSURES_HEADERS]);
    return;
  }

  for (var i = 0; i < CASH_CLOSURES_HEADERS.length; i += 1) {
    if (String(existingHeaders[i] || '').trim() !== CASH_CLOSURES_HEADERS[i]) {
      throw new Error('La fila de encabezados de cierres no coincide con el formato esperado. Debe ser: ' + CASH_CLOSURES_HEADERS.join(', '));
    }
  }
}

function ensureSettingsHeaders_(sheet) {
  var lastColumn = Math.max(sheet.getLastColumn(), SETTINGS_HEADERS.length);
  var existingHeaders = lastColumn ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];
  var isEmptySheet = sheet.getLastRow() === 0;

  if (isEmptySheet) {
    sheet.getRange(1, 1, 1, SETTINGS_HEADERS.length).setValues([SETTINGS_HEADERS]);
    return;
  }

  for (var i = 0; i < SETTINGS_HEADERS.length; i += 1) {
    if (String(existingHeaders[i] || '').trim() !== SETTINGS_HEADERS[i]) {
      throw new Error('La fila de encabezados de configuración no coincide con el formato esperado. Debe ser: ' + SETTINGS_HEADERS.join(', '));
    }
  }
}

function readInventoryItems_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0].map(function(header) {
    return String(header).trim();
  });

  return values.slice(1)
    .filter(function(row) {
      return row.some(function(cell) {
        return String(cell).trim() !== '';
      });
    })
    .map(function(row) {
      var item = rowToItem_(headers, row);
      return normalizeStoredItem_(item);
    });
}

function readSalesItems_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0].map(function(header) {
    return String(header).trim();
  });

  return values.slice(1)
    .filter(function(row) {
      return row.some(function(cell) {
        return String(cell).trim() !== '';
      });
    })
    .map(function(row) {
      return normalizeStoredSale_(rowToItem_(headers, row));
    });
}

function readWithdrawalItems_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0].map(function(header) {
    return String(header).trim();
  });

  return values.slice(1)
    .filter(function(row) {
      return row.some(function(cell) {
        return String(cell).trim() !== '';
      });
    })
    .map(function(row) {
      return normalizeStoredWithdrawal_(rowToItem_(headers, row));
    });
}

function readCashClosureItems_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0].map(function(header) {
    return String(header).trim();
  });

  return values.slice(1)
    .filter(function(row) {
      return row.some(function(cell) {
        return String(cell).trim() !== '';
      });
    })
    .map(function(row) {
      return normalizeStoredCashClosure_(rowToItem_(headers, row));
    });
}

function rowToItem_(headers, row) {
  var item = {};
  headers.forEach(function(header, index) {
    item[header] = row[index];
  });
  return item;
}

function normalizeStoredItem_(item) {
  return {
    id: String(item.id || '').trim(),
    sku: String(item.sku || '').trim(),
    nombre: String(item.nombre || '').trim(),
    categoria: String(item.categoria || '').trim().toLowerCase(),
    precio: Number(item.precio || 0),
    stock: Number(item.stock || 0),
    lote: String(item.lote || '').trim(),
    fecha_vencimiento: normalizeDateValue_(item.fecha_vencimiento),
    laboratorio: String(item.laboratorio || '').trim(),
    codigo_barras: String(item.codigo_barras || '').trim(),
    descripcion: String(item.descripcion || '').trim(),
    imagen_url: String(item.imagen_url || '').trim(),
    activo: String(item.activo || 'SI').trim().toUpperCase()
  };
}

function normalizeIncomingItem_(item) {
  var normalized = {
    id: String(item.id || '').trim(),
    sku: String(item.sku || '').trim(),
    nombre: String(item.nombre || item.name || '').trim(),
    categoria: String(item.categoria || item.category || 'general').trim().toLowerCase(),
    precio: Number(item.precio != null ? item.precio : item.price || 0),
    stock: Number(item.stock != null ? item.stock : 0),
    lote: String(item.lote || item.batch || '').trim(),
    fecha_vencimiento: normalizeDateValue_(item.fecha_vencimiento || item.expiration_date || ''),
    laboratorio: String(item.laboratorio || item.lab || '').trim(),
    codigo_barras: String(item.codigo_barras || item.barcode || '').trim(),
    descripcion: String(item.descripcion || item.description || '').trim(),
    imagen_url: String(item.imagen_url || item.image_url || item.imageUrl || item.imagen || item.image || item.foto || '').trim(),
    activo: String(item.activo || item.active || 'SI').trim().toUpperCase()
  };

  if (!normalized.id) {
    normalized.id = normalized.nombre || normalized.sku;
  }

  if (!isFinite(normalized.precio)) normalized.precio = 0;
  if (!isFinite(normalized.stock)) normalized.stock = 0;
  if (normalized.activo !== 'NO') normalized.activo = 'SI';

  return normalized;
}

function normalizeStoredSale_(sale) {
  var items = [];
  try {
    items = JSON.parse(String(sale.items_json || '[]'));
  } catch (error) {
    items = [];
  }

  return {
    id: String(sale.id || '').trim(),
    ticketNumber: String(sale.ticket_numero || '').trim(),
    clientName: String(sale.cliente_nombre || 'Cliente general').trim(),
    clientDocument: String(sale.cliente_documento || '').trim(),
    date: String(sale.fecha || '').trim(),
    time: String(sale.hora || '').trim(),
    paymentMethod: String(sale.metodo_pago || 'Efectivo').trim(),
    cashReceived: Number(sale.recibido || 0),
    change: Number(sale.cambio || 0),
    subtotal: Number(sale.subtotal || 0),
    tax: Number(sale.impuesto || 0),
    total: Number(sale.total || 0),
    redeemedPoints: Number(sale.puntos_usados || 0),
    loyaltyDiscount: Number(sale.descuento_puntos || 0),
    earnedPoints: Number(sale.puntos_ganados || 0),
    items: Array.isArray(items) ? items : []
  };
}

function normalizeStoredWithdrawal_(withdrawal) {
  return {
    id: String(withdrawal.id || '').trim(),
    withdrawalNumber: String(withdrawal.retiro_numero || '').trim(),
    date: normalizeSalesDateValue_(withdrawal.fecha || ''),
    time: normalizeTimeValue_(withdrawal.hora || ''),
    amount: Number(withdrawal.monto || 0),
    reason: String(withdrawal.motivo || '').trim(),
    cashierUsername: String(withdrawal.cajero_usuario || '').trim(),
    cashierName: String(withdrawal.cajero_nombre || '').trim(),
    supervisorUsername: String(withdrawal.supervisor_usuario || '').trim(),
    supervisorName: String(withdrawal.supervisor_nombre || '').trim(),
    createdAt: String(withdrawal.creado_en || '').trim()
  };
}

function normalizeStoredCashClosure_(closure) {
  var sales = [];
  try {
    sales = JSON.parse(String(closure.ventas_json || '[]'));
  } catch (error) {
    sales = [];
  }

  return {
    id: String(closure.id || '').trim(),
    closureNumber: String(closure.cierre_numero || '').trim(),
    date: normalizeSalesDateValue_(closure.fecha || ''),
    createdAt: String(closure.creado_en || '').trim(),
    user: String(closure.usuario || '').trim(),
    openingAmount: Number(closure.apertura || 0),
    cashSales: Number(closure.ventas_efectivo || 0),
    cardSales: Number(closure.ventas_tarjeta || 0),
    transferSales: Number(closure.ventas_transferencia || 0),
    withdrawalsTotal: Number(closure.retiros_total || 0),
    expenses: Number(closure.ajuste_manual || 0),
    countedCash: Number(closure.efectivo_contado || 0),
    expectedDrawer: Number(closure.efectivo_esperado || 0),
    difference: Number(closure.diferencia || 0),
    transactions: Number(closure.transacciones || 0),
    totalSales: Number(closure.ventas_total || 0),
    units: Number(closure.unidades || 0),
    observations: String(closure.observaciones || '').trim(),
    sales: Array.isArray(sales) ? sales : []
  };
}

function normalizeIncomingSale_(sale) {
  var now = new Date();
  var dateText = normalizeSalesDateValue_(sale.date || '');
  var timeText = String(sale.time || '').trim();

  return {
    id: String(sale.id || Utilities.getUuid()).trim(),
    ticketNumber: String(sale.ticketNumber || '').trim(),
    clientName: String(sale.clientName || 'Cliente general').trim(),
    clientDocument: String(sale.clientDocument || '').trim(),
    date: dateText || Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    time: timeText || Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm'),
    paymentMethod: String(sale.paymentMethod || 'Efectivo').trim(),
    cashReceived: Number(sale.cashReceived || 0),
    change: Number(sale.change || 0),
    subtotal: Number(sale.subtotal || 0),
    tax: Number(sale.tax || 0),
    total: Number(sale.total || 0),
    redeemedPoints: Number(sale.redeemedPoints || sale.pointsUsed || 0),
    loyaltyDiscount: Number(sale.loyaltyDiscount || sale.discountFromPoints || 0),
    earnedPoints: Number(sale.earnedPoints || 0),
    items: Array.isArray(sale.items) ? sale.items : []
  };
}

function normalizeIncomingWithdrawal_(withdrawal) {
  var now = new Date();
  var dateText = normalizeSalesDateValue_(withdrawal.date || '');
  var timeText = normalizeTimeValue_(withdrawal.time || '');

  return {
    id: String(withdrawal.id || Utilities.getUuid()).trim(),
    withdrawalNumber: String(withdrawal.withdrawalNumber || '').trim(),
    date: dateText || Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    time: timeText || Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm'),
    amount: Number(withdrawal.amount || 0),
    reason: String(withdrawal.reason || '').trim(),
    cashierUsername: String(withdrawal.cashierUsername || '').trim(),
    cashierName: String(withdrawal.cashierName || '').trim(),
    supervisorUsername: String(withdrawal.supervisorUsername || '').trim(),
    supervisorName: String(withdrawal.supervisorName || '').trim(),
    createdAt: String(withdrawal.createdAt || now.toISOString()).trim()
  };
}

function normalizeTimeValue_(value) {
  if (!value) return '';

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'HH:mm');
  }

  var text = String(value).trim();
  if (!text) return '';

  var shortMatch = text.match(/^(\d{1,2}):(\d{2})/);
  if (shortMatch) {
    return ('0' + shortMatch[1]).slice(-2) + ':' + shortMatch[2];
  }

  var parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'HH:mm');
  }

  return text;
}

function normalizeIncomingCashClosure_(closure) {
  var now = new Date();
  var normalized = {
    id: String(closure.id || Utilities.getUuid()).trim(),
    closureNumber: String(closure.closureNumber || closure.cierre_numero || '').trim(),
    date: normalizeSalesDateValue_(closure.date || closure.fecha || '') || Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    createdAt: String(closure.createdAt || closure.creado_en || now.toISOString()).trim(),
    user: String(closure.user || closure.usuario || '').trim(),
    openingAmount: Number(closure.openingAmount || closure.apertura || 0),
    cashSales: Number(closure.cashSales || closure.ventas_efectivo || 0),
    cardSales: Number(closure.cardSales || closure.ventas_tarjeta || 0),
    transferSales: Number(closure.transferSales || closure.ventas_transferencia || 0),
    withdrawalsTotal: Number(closure.withdrawalsTotal || closure.retiros_total || 0),
    expenses: Number(closure.expenses || closure.ajuste_manual || 0),
    countedCash: Number(closure.countedCash || closure.efectivo_contado || 0),
    expectedDrawer: Number(closure.expectedDrawer || closure.efectivo_esperado || 0),
    difference: Number(closure.difference || closure.diferencia || 0),
    transactions: Number(closure.transactions || closure.transacciones || 0),
    totalSales: Number(closure.totalSales || closure.ventas_total || 0),
    units: Number(closure.units || closure.unidades || 0),
    observations: String(closure.observations || closure.observaciones || '').trim(),
    sales: Array.isArray(closure.sales) ? closure.sales : []
  };

  if (!normalized.closureNumber) {
    normalized.closureNumber = 'C-' + ('0000' + Math.max(1, 1)).slice(-4);
  }

  return normalized;
}

function normalizeCompanyProfile_(profile) {
  return {
    name: String(profile.name || '').trim(),
    nit: String(profile.nit || '').trim(),
    phone: String(profile.phone || '').trim(),
    email: String(profile.email || '').trim(),
    address: String(profile.address || '').trim(),
    city: String(profile.city || '').trim(),
    manager: String(profile.manager || '').trim(),
    logo_url: String(profile.logo_url || profile.logoUrl || '').trim()
  };
}

function readCompanyProfile_(sheet) {
  var values = sheet.getDataRange().getValues();
  var profile = normalizeCompanyProfile_({});

  if (values.length < 2) {
    return profile;
  }

  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    var key = String(values[rowIndex][0] || '').trim();
    if (!key || COMPANY_PROFILE_KEYS.indexOf(key) === -1) continue;
    profile[key] = String(values[rowIndex][1] || '').trim();
  }

  return profile;
}

function saveCompanyProfile_(sheet, profile) {
  var normalized = normalizeCompanyProfile_(profile);
  var rows = [SETTINGS_HEADERS];

  COMPANY_PROFILE_KEYS.forEach(function(key) {
    rows.push([key, normalized[key] || '']);
  });

  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, SETTINGS_HEADERS.length).setValues(rows);
  return normalized;
}

function authenticateUser_(sheet, payload) {
  var username = String(payload.username || payload.usuario || '').trim().toLowerCase();
  var password = String(payload.password || payload.clave || '').trim();

  if (!username) {
    throw new Error('El usuario es obligatorio.');
  }
  if (!password) {
    throw new Error('La clave es obligatoria.');
  }

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    throw new Error('La hoja de usuarios no contiene registros.');
  }

  var headers = values[0].map(function(header) {
    return String(header).trim();
  });

  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    var user = rowToItem_(headers, values[rowIndex]);
    var storedUsername = String(getUserField_(user, ['Usuario', 'usuario', 'USUARIO', 'User', 'user', 'Login', 'login', 'Correo', 'correo', 'Email', 'email']) || '').trim().toLowerCase();
    var storedPassword = String(getUserField_(user, ['contraseña', 'Contraseña', 'Password', 'password', 'Clave', 'clave']) || '').trim();
    if (!storedPassword) {
      storedPassword = String(getUserField_(user, ['contrasena', 'Contrasena', 'CONTRASENA']) || '').trim();
    }
    var active = String(getUserField_(user, ['Estado', 'estado', 'STATUS', 'Status', 'Activo', 'activo']) || 'Activo').trim().toUpperCase();

    if (storedUsername !== username) continue;

    if (active !== 'ACTIVO' && active !== 'SI') {
      throw new Error('El usuario se encuentra inactivo.');
    }

    if (storedPassword !== password) {
      throw new Error('Clave incorrecta.');
    }

    var role = normalizeUserRole_(getUserRole_(user, storedUsername), storedUsername);
    var companyId = String(getUserField_(user, ['EmpresaId', 'empresa_id', 'empresaid', 'CompanyId', 'companyId', 'IdEmpresa']) || '').trim();

    return {
      ok: true,
      action: 'authenticate_user',
      user: {
        id: String(user.Id || '').trim(),
        companyId: companyId,
        username: storedUsername,
        name: String(user.Nombre || storedUsername).trim(),
        role: role,
        licenseCode: '',
        license: null
      },
      timestamp: new Date().toISOString()
    };
  }

  throw new Error('Usuario no encontrado.');
}

function getUserField_(user, possibleKeys) {
  for (var index = 0; index < possibleKeys.length; index += 1) {
    var key = possibleKeys[index];
    if (!Object.prototype.hasOwnProperty.call(user, key)) continue;
    var value = user[key];
    if (String(value || '').trim()) return value;
  }
  return '';
}

function getUserRole_(user, username) {
  var value = String(getUserField_(user, ['Rol', 'rol', 'ROLE', 'Perfil', 'perfil', 'Cargo', 'cargo', 'Tipo', 'tipo', 'Tipo usuario', 'tipo usuario', 'TipoUsuario', 'tipo_usuario', 'Permiso', 'permiso', 'Permisos', 'permisos', 'Nivel', 'nivel', 'Administrador', 'administrador', 'Admin', 'admin', 'Acceso', 'acceso']) || '').trim();
  if (value) return value;

  if (username === 'admin' || username === 'administrador') return 'admin';
  if (username === 'supervisor') return 'supervisor';
  return 'cajero';
}

function normalizeUserRole_(role, username) {
  var value = String(role || '').trim().toLowerCase();
  var normalizedUsername = String(username || '').trim().toLowerCase();
  var isGlobalAdminUser = normalizedUsername === 'admin' || normalizedUsername === 'administrador' || normalizedUsername === 'operador' || normalizedUsername === 'adminweb' || normalizedUsername === 'soporte' || normalizedUsername === 'desarrollo';

  if (!value) return 'cajero';
  if (
    value.indexOf('admin_empresa') !== -1 ||
    value.indexOf('empresa') !== -1 ||
    value.indexOf('farmacia') !== -1 ||
    value.indexOf('sucursal') !== -1 ||
    value.indexOf('negocio') !== -1 ||
    value.indexOf('local') !== -1
  ) {
    return 'admin_empresa';
  }
  if (value.indexOf('operador') !== -1) return 'operador';
  if (value.indexOf('admin') !== -1) return isGlobalAdminUser ? 'admin' : 'admin_empresa';
  if (value.indexOf('super') !== -1) return 'supervisor';
  if (value.indexOf('caj') !== -1 || value.indexOf('cash') !== -1 || value.indexOf('user') !== -1 || value.indexOf('usuario') !== -1 || value.indexOf('caja') !== -1) return 'cajero';
  return 'cajero';
}

function normalizeSalesDateValue_(value) {
  if (!value) return '';

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  var text = String(value).trim();
  if (!text) return '';

  var isoValue = normalizeDateValue_(text);
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoValue)) {
    return isoValue;
  }

  var latinMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (latinMatch) {
    return latinMatch[3] + '-' + latinMatch[2] + '-' + latinMatch[1];
  }

  return text;
}

function upsertInventoryItem_(sheet, item) {
  var values = sheet.getDataRange().getValues();
  var headers = values.length ? values[0].map(function(header) {
    return String(header).trim();
  }) : REQUIRED_HEADERS.slice();

  var targetRowIndex = -1;
  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    var current = normalizeStoredItem_(rowToItem_(headers, values[rowIndex]));
    if ((item.id && current.id === item.id) || (item.sku && current.sku === item.sku)) {
      targetRowIndex = rowIndex + 1;
      break;
    }
  }

  var rowValues = headers.map(function(header) {
    return item[header] != null ? item[header] : '';
  });

  if (targetRowIndex === -1) {
    sheet.appendRow(rowValues);
  } else {
    sheet.getRange(targetRowIndex, 1, 1, rowValues.length).setValues([rowValues]);
  }

  return item;
}

function appendSale_(sheet, sale) {
  var values = sheet.getDataRange().getValues();
  var nextNumber = Math.max(values.length, 1);
  var normalized = normalizeIncomingSale_(sale);
  if (!normalized.ticketNumber) {
    normalized.ticketNumber = 'T-' + ('0000' + nextNumber).slice(-4);
  }

  var createdAt = new Date().toISOString();
  var rowValues = [
    normalized.id,
    normalized.ticketNumber,
    normalized.date,
    normalized.time,
    normalized.clientName,
    normalized.clientDocument,
    normalized.paymentMethod,
    normalized.cashReceived,
    normalized.change,
    normalized.subtotal,
    normalized.tax,
    normalized.total,
    JSON.stringify(normalized.items),
    createdAt,
    normalized.redeemedPoints,
    normalized.loyaltyDiscount,
    normalized.earnedPoints
  ];

  sheet.appendRow(rowValues);
  return normalized;
}

function appendWithdrawal_(sheet, withdrawal) {
  var values = sheet.getDataRange().getValues();
  var nextNumber = Math.max(values.length, 1);
  var normalized = normalizeIncomingWithdrawal_(withdrawal);
  if (!normalized.withdrawalNumber) {
    normalized.withdrawalNumber = 'R-' + ('0000' + nextNumber).slice(-4);
  }

  var rowValues = [
    normalized.id,
    normalized.withdrawalNumber,
    normalized.date,
    normalized.time,
    normalized.amount,
    normalized.reason,
    normalized.cashierUsername,
    normalized.cashierName,
    normalized.supervisorUsername,
    normalized.supervisorName,
    normalized.createdAt
  ];

  sheet.appendRow(rowValues);
  return normalized;
}

function updateWithdrawal_(sheet, withdrawal) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    throw new Error('La hoja de retiros no contiene registros.');
  }

  var headers = values[0].map(function(header) {
    return String(header).trim();
  });
  var normalized = normalizeIncomingWithdrawal_(withdrawal);
  var targetRowIndex = -1;

  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    if (String(values[rowIndex][0] || '').trim() === normalized.id) {
      targetRowIndex = rowIndex + 1;
      break;
    }
  }

  if (targetRowIndex === -1) {
    throw new Error('No se encontró el retiro que intentas actualizar.');
  }

  var storedCurrent = normalizeStoredWithdrawal_(rowToItem_(headers, values[targetRowIndex - 1]));
  if (!normalized.withdrawalNumber) normalized.withdrawalNumber = storedCurrent.withdrawalNumber;
  if (!normalized.createdAt) normalized.createdAt = storedCurrent.createdAt;

  var rowValues = [
    normalized.id,
    normalized.withdrawalNumber,
    normalized.date,
    normalized.time,
    normalized.amount,
    normalized.reason,
    normalized.cashierUsername,
    normalized.cashierName,
    normalized.supervisorUsername,
    normalized.supervisorName,
    normalized.createdAt
  ];

  sheet.getRange(targetRowIndex, 1, 1, rowValues.length).setValues([rowValues]);
  return normalized;
}

function deleteWithdrawal_(sheet, withdrawalId) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    throw new Error('La hoja de retiros no contiene registros.');
  }

  var headers = values[0].map(function(header) {
    return String(header).trim();
  });
  var targetRowIndex = -1;

  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    if (String(values[rowIndex][0] || '').trim() === String(withdrawalId || '').trim()) {
      targetRowIndex = rowIndex + 1;
      break;
    }
  }

  if (targetRowIndex === -1) {
    throw new Error('No se encontró el retiro que intentas eliminar.');
  }

  var deleted = normalizeStoredWithdrawal_(rowToItem_(headers, values[targetRowIndex - 1]));
  sheet.deleteRow(targetRowIndex);
  return deleted;
}

function appendCashClosure_(sheet, closure) {
  var values = sheet.getDataRange().getValues();
  var nextNumber = Math.max(values.length, 1);
  var normalized = normalizeIncomingCashClosure_(closure);
  if (!normalized.closureNumber) {
    normalized.closureNumber = 'C-' + ('0000' + nextNumber).slice(-4);
  }

  var rowValues = [
    normalized.id,
    normalized.closureNumber,
    normalized.date,
    normalized.createdAt,
    normalized.user,
    normalized.openingAmount,
    normalized.cashSales,
    normalized.cardSales,
    normalized.transferSales,
    normalized.withdrawalsTotal,
    normalized.expenses,
    normalized.countedCash,
    normalized.expectedDrawer,
    normalized.difference,
    normalized.transactions,
    normalized.totalSales,
    normalized.units,
    normalized.observations,
    JSON.stringify(normalized.sales)
  ];

  sheet.appendRow(rowValues);
  return normalized;
}

function updateCashClosure_(sheet, closure) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    throw new Error('La hoja de cierres no contiene registros.');
  }

  var headers = values[0].map(function(header) {
    return String(header).trim();
  });
  var normalized = normalizeIncomingCashClosure_(closure);
  var targetRowIndex = -1;

  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    if (String(values[rowIndex][0] || '').trim() === normalized.id) {
      targetRowIndex = rowIndex + 1;
      break;
    }
  }

  if (targetRowIndex === -1) {
    throw new Error('No se encontró el cierre que intentas actualizar.');
  }

  var storedCurrent = normalizeStoredCashClosure_(rowToItem_(headers, values[targetRowIndex - 1]));
  if (!normalized.closureNumber) normalized.closureNumber = storedCurrent.closureNumber;
  if (!normalized.createdAt) normalized.createdAt = storedCurrent.createdAt;

  var rowValues = [
    normalized.id,
    normalized.closureNumber,
    normalized.date,
    normalized.createdAt,
    normalized.user,
    normalized.openingAmount,
    normalized.cashSales,
    normalized.cardSales,
    normalized.transferSales,
    normalized.withdrawalsTotal,
    normalized.expenses,
    normalized.countedCash,
    normalized.expectedDrawer,
    normalized.difference,
    normalized.transactions,
    normalized.totalSales,
    normalized.units,
    normalized.observations,
    JSON.stringify(normalized.sales)
  ];

  sheet.getRange(targetRowIndex, 1, 1, rowValues.length).setValues([rowValues]);
  return normalized;
}

function deleteCashClosure_(sheet, closureId) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    throw new Error('La hoja de cierres no contiene registros.');
  }

  var headers = values[0].map(function(header) {
    return String(header).trim();
  });
  var targetRowIndex = -1;

  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    if (String(values[rowIndex][0] || '').trim() === String(closureId || '').trim()) {
      targetRowIndex = rowIndex + 1;
      break;
    }
  }

  if (targetRowIndex === -1) {
    throw new Error('No se encontró el cierre que intentas eliminar.');
  }

  var deleted = normalizeStoredCashClosure_(rowToItem_(headers, values[targetRowIndex - 1]));
  sheet.deleteRow(targetRowIndex);
  return deleted;
}

function bulkUpsertInventoryItems_(sheet, items) {
  var values = sheet.getDataRange().getValues();
  var headers = values.length ? values[0].map(function(header) {
    return String(header).trim();
  }) : REQUIRED_HEADERS.slice();
  var created = 0;
  var updated = 0;

  items.forEach(function(rawItem, index) {
    var item = normalizeIncomingItem_(rawItem);
    if (!item.nombre) throw new Error('El nombre del producto es obligatorio en la fila ' + (index + 2) + '.');
    if (!item.sku) throw new Error('El SKU del producto es obligatorio en la fila ' + (index + 2) + '.');

    var targetRowIndex = -1;
    for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
      var current = normalizeStoredItem_(rowToItem_(headers, values[rowIndex]));
      if ((item.id && current.id === item.id) || (item.sku && current.sku === item.sku)) {
        targetRowIndex = rowIndex;
        break;
      }
    }

    var rowValues = headers.map(function(header) {
      return item[header] != null ? item[header] : '';
    });

    if (targetRowIndex === -1) {
      values.push(rowValues);
      created += 1;
    } else {
      values[targetRowIndex] = rowValues;
      updated += 1;
    }
  });

  if (values.length === 1) {
    sheet.getRange(1, 1, 1, headers.length).setValues(values);
  } else {
    sheet.getRange(1, 1, values.length, headers.length).setValues(values);
  }

  return {
    created: created,
    updated: updated,
    processed: items.length
  };
}

function decrementStock_(sheet, items) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    throw new Error('La hoja no contiene productos para descontar.');
  }

  var headers = values[0].map(function(header) {
    return String(header).trim();
  });
  var stockIndex = headers.indexOf('stock');
  if (stockIndex === -1) {
    throw new Error('No existe la columna "stock" en la hoja.');
  }

  var updates = items.map(function(item) {
    return {
      id: String(item.id || '').trim(),
      sku: String(item.sku || '').trim(),
      quantity: Number(item.quantity || 0)
    };
  });

  updates.forEach(function(update) {
    if (!update.id && !update.sku) {
      throw new Error('Cada item debe incluir id o sku para descontar stock.');
    }
    if (!isFinite(update.quantity) || update.quantity <= 0) {
      throw new Error('La cantidad a descontar debe ser mayor que cero.');
    }
  });

  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    var current = normalizeStoredItem_(rowToItem_(headers, values[rowIndex]));
    var matchedUpdate = null;

    for (var updateIndex = 0; updateIndex < updates.length; updateIndex += 1) {
      var update = updates[updateIndex];
      if ((update.id && current.id === update.id) || (update.sku && current.sku === update.sku)) {
        matchedUpdate = update;
        break;
      }
    }

    if (!matchedUpdate) continue;

    if (current.stock < matchedUpdate.quantity) {
      throw new Error('Stock insuficiente para "' + current.nombre + '". Disponible: ' + current.stock + ', solicitado: ' + matchedUpdate.quantity);
    }

    values[rowIndex][stockIndex] = current.stock - matchedUpdate.quantity;
    matchedUpdate.applied = true;
  }

  updates.forEach(function(update) {
    if (!update.applied) {
      throw new Error('No se encontró el producto para descontar stock: ' + (update.sku || update.id));
    }
  });

  sheet.getRange(2, 1, values.length - 1, headers.length).setValues(values.slice(1));
}

function receiveOrder_(sheet, items) {
  var values = sheet.getDataRange().getValues();
  var headers = values.length ? values[0].map(function(header) {
    return String(header).trim();
  }) : REQUIRED_HEADERS.slice();

  var normalizedItems = items.map(function(item) {
    var normalized = normalizeIncomingItem_(item);
    normalized.quantity = Number(item.quantity != null ? item.quantity : item.cantidad != null ? item.cantidad : item.stock != null ? item.stock : 0);
    if (!isFinite(normalized.quantity) || normalized.quantity <= 0) {
      throw new Error('Cada item del pedido debe traer una cantidad válida mayor que cero.');
    }
    if (!normalized.sku) {
      throw new Error('Cada item del pedido debe traer SKU.');
    }
    return normalized;
  });

  normalizedItems.forEach(function(incoming) {
    var targetRowIndex = -1;

    for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
      var current = normalizeStoredItem_(rowToItem_(headers, values[rowIndex]));
      if ((incoming.id && current.id === incoming.id) || (incoming.sku && current.sku === incoming.sku)) {
        targetRowIndex = rowIndex;
        break;
      }
    }

    if (targetRowIndex === -1) {
      var newItem = {
        id: incoming.id || incoming.nombre || incoming.sku,
        sku: incoming.sku,
        nombre: incoming.nombre || incoming.sku,
        categoria: incoming.categoria || 'general',
        precio: incoming.precio || 0,
        stock: incoming.quantity,
        lote: incoming.lote || '',
        fecha_vencimiento: incoming.fecha_vencimiento || '',
        laboratorio: incoming.laboratorio || '',
        codigo_barras: incoming.codigo_barras || '',
        descripcion: incoming.descripcion || '',
        imagen_url: incoming.imagen_url || '',
        activo: incoming.activo || 'SI'
      };

      values.push(headers.map(function(header) {
        return newItem[header] != null ? newItem[header] : '';
      }));
      return;
    }

    var currentItem = normalizeStoredItem_(rowToItem_(headers, values[targetRowIndex]));
    var updatedItem = {
      id: incoming.id || currentItem.id,
      sku: incoming.sku || currentItem.sku,
      nombre: incoming.nombre || currentItem.nombre,
      categoria: incoming.categoria || currentItem.categoria,
      precio: incoming.precio || currentItem.precio,
      stock: Number(currentItem.stock || 0) + incoming.quantity,
      lote: incoming.lote || currentItem.lote,
      fecha_vencimiento: incoming.fecha_vencimiento || currentItem.fecha_vencimiento,
      laboratorio: incoming.laboratorio || currentItem.laboratorio,
      codigo_barras: incoming.codigo_barras || currentItem.codigo_barras,
      descripcion: incoming.descripcion || currentItem.descripcion,
      imagen_url: incoming.imagen_url || currentItem.imagen_url,
      activo: incoming.activo || currentItem.activo || 'SI'
    };

    values[targetRowIndex] = headers.map(function(header) {
      return updatedItem[header] != null ? updatedItem[header] : '';
    });
  });

  if (values.length === 1) {
    sheet.getRange(1, 1, 1, headers.length).setValues(values);
  } else {
    sheet.getRange(1, 1, values.length, headers.length).setValues(values);
  }
}

function parseRequestBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }

  var raw = String(e.postData.contents || '').trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error('No se pudo leer el cuerpo JSON de la solicitud.');
  }
}

function getParam_(e, key, fallback) {
  if (!e || !e.parameter) return fallback;
  var value = e.parameter[key];
  return value == null || value === '' ? fallback : String(value);
}

function normalizeDateValue_(value) {
  if (!value) return '';

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  var text = String(value).trim();
  if (!text) return '';

  var isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[0];

  var parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  return text;
}

function logError_(where, error) {
  console.error(where + ': ' + (error && error.stack ? error.stack : error));
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function setupWebApp_(payload) {
  var dryRun = Boolean(payload && payload.dryRun);
  var summary = {
    ok: true,
    action: 'setup_web_app',
    dryRun: dryRun,
    spreadsheetId: SpreadsheetApp.getActiveSpreadsheet().getId(),
    spreadsheetName: SpreadsheetApp.getActiveSpreadsheet().getName(),
    sheets: []
  };

  summary.sheets.push(describeSetupSheet_(SHEET_NAME, REQUIRED_HEADERS, getInventorySheet_, dryRun));
  summary.sheets.push(describeSetupSheet_(SALES_SHEET_NAME, SALES_HEADERS, getSalesSheet_, dryRun));
  summary.sheets.push(describeSetupSheet_(USERS_SHEET_NAME, WEB_USER_HEADERS, getUsersSheet_, dryRun));
  summary.sheets.push(describeSetupSheet_(WITHDRAWALS_SHEET_NAME, WITHDRAWALS_HEADERS, getWithdrawalsSheet_, dryRun));
  summary.sheets.push(describeSetupSheet_(CASH_CLOSURES_SHEET_CANDIDATES[0], CASH_CLOSURES_HEADERS, getCashClosuresSheet_, dryRun));
  summary.sheets.push(describeSetupSheet_(SETTINGS_SHEET_NAME, SETTINGS_HEADERS, getSettingsSheet_, dryRun));
  summary.sheets.push(describeSetupSheet_(COMPANIES_SHEET_NAME, COMPANY_HEADERS, getCompaniesSheet_, dryRun));
  summary.sheets.push(describeSetupSheet_(LICENSES_SHEET_NAME, LICENSE_HEADERS, getLicensesSheet_, dryRun));
  summary.sheets.push(describeSetupSheet_(LICENSE_DEVICES_SHEET_NAME, LICENSE_DEVICE_HEADERS, getLicenseDevicesSheet_, dryRun));
  summary.sheets.push(describeSetupSheet_(LICENSE_HISTORY_SHEET_NAME, LICENSE_HISTORY_HEADERS, getLicenseHistorySheet_, dryRun));

  if (!dryRun && payload && payload.admin) {
    saveUserWeb_({
      name: payload.admin.name || 'Administrador Web',
      username: payload.admin.username || 'adminweb',
      password: payload.admin.password || 'admin12345',
      role: payload.admin.role || 'admin',
      active: 'SI'
    });
    summary.seededAdmin = String(payload.admin.username || 'adminweb');
  }

  return summary;
}

function describeSetupSheet_(name, headers, resolver, dryRun) {
  if (!dryRun) resolver();
  return {
    name: name,
    headers: headers.slice(),
    ensured: true
  };
}

function getSpreadsheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('No se pudo abrir la hoja de calculo activa.');
  }
  return spreadsheet;
}

function getOrCreateSheet_(sheetName, headers) {
  var spreadsheet = getSpreadsheet_();
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  ensureSimpleHeaders_(sheet, headers);
  return sheet;
}

function getCompaniesSheet_() {
  return getOrCreateSheet_(COMPANIES_SHEET_NAME, COMPANY_HEADERS);
}

function getLicensesSheet_() {
  return getOrCreateSheet_(LICENSES_SHEET_NAME, LICENSE_HEADERS);
}

function getLicenseDevicesSheet_() {
  return getOrCreateSheet_(LICENSE_DEVICES_SHEET_NAME, LICENSE_DEVICE_HEADERS);
}

function getLicenseHistorySheet_() {
  return getOrCreateSheet_(LICENSE_HISTORY_SHEET_NAME, LICENSE_HISTORY_HEADERS);
}

function ensureSimpleHeaders_(sheet, headers) {
  var lastColumn = Math.max(sheet.getLastColumn(), headers.length);
  var existingHeaders = lastColumn ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];
  var isEmptySheet = sheet.getLastRow() === 0;
  if (isEmptySheet) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }
  for (var i = 0; i < headers.length; i += 1) {
    if (normalizeHeaderKey_(existingHeaders[i]) !== normalizeHeaderKey_(headers[i])) {
      throw new Error('La fila de encabezados no coincide con el formato esperado de ' + sheet.getName() + '.');
    }
  }
}

function readSimpleItems_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function(header) { return String(header).trim(); });
  return values.slice(1).filter(function(row) {
    return row.some(function(cell) { return String(cell).trim() !== ''; });
  }).map(function(row) {
    return rowToItem_(headers, row);
  });
}

function getNextNumericId_(items) {
  var maxId = 0;
  items.forEach(function(item) {
    maxId = Math.max(maxId, Number(item.id || item.Id || 0) || 0);
  });
  return String(maxId + 1);
}

function listUsersWeb_() {
  var sheet = getUsersSheet_();
  var items = readSimpleItems_(sheet);
  return items.map(function(user) {
    return {
      id: String(user.Id || '').trim(),
      companyId: String(user.EmpresaId || '').trim(),
      name: String(user.Nombre || '').trim(),
      username: String(user.Usuario || '').trim().toLowerCase(),
      role: normalizeUserRole_(String(user.Rol || ''), String(user.Usuario || '').trim().toLowerCase()),
      active: String(user.Estado || 'SI').trim().toUpperCase() === 'NO' ? 'NO' : 'SI',
      createdAt: String(user.CreadoEn || '').trim()
    };
  });
}

function saveUserWeb_(payload) {
  var sheet = getUsersSheet_();
  var items = readSimpleItems_(sheet);
  var userId = String(payload.id || '').trim();
  var username = String(payload.username || payload.Usuario || '').trim().toLowerCase();
  var headers = WEB_USER_HEADERS.slice();
  var rowIndex = -1;

  if (!username) throw new Error('Debes indicar el nombre de usuario.');
  if (!String(payload.name || payload.Nombre || '').trim()) throw new Error('Debes indicar el nombre del usuario.');

  items.forEach(function(item, index) {
    var currentUsername = String(item.Usuario || '').trim().toLowerCase();
    var currentId = String(item.Id || '').trim();
    if (currentUsername === username && currentId !== userId) {
      throw new Error('Ya existe un usuario con ese nombre de usuario.');
    }
    if (currentId === userId && userId) {
      rowIndex = index + 2;
    }
  });

  var nextId = userId || getNextNumericId_(items);
  var currentPassword = '';
  if (rowIndex > 0) {
    currentPassword = String(sheet.getRange(rowIndex, 5).getValue() || '').trim();
  }

  var normalized = {
    Id: nextId,
    EmpresaId: String(payload.companyId || payload.EmpresaId || '').trim(),
    Nombre: String(payload.name || payload.Nombre || '').trim(),
    Usuario: username,
    contrasena: String(payload.password || payload.contrasena || currentPassword).trim(),
    Rol: normalizeUserRole_(String(payload.role || payload.Rol || ''), username),
    Estado: String(payload.active || payload.Estado || 'SI').trim().toUpperCase() === 'NO' ? 'NO' : 'SI',
    CreadoEn: rowIndex > 0 ? String(sheet.getRange(rowIndex, 8).getValue() || '').trim() : new Date().toISOString()
  };

  if (!normalized.contrasena) {
    throw new Error('Debes indicar la clave del usuario.');
  }

  var rowValues = headers.map(function(header) { return normalized[header] != null ? normalized[header] : ''; });
  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
  return listUsersWeb_();
}

function setUserActiveWeb_(id, active) {
  var sheet = getUsersSheet_();
  var items = readSimpleItems_(sheet);
  var targetRow = -1;
  for (var i = 0; i < items.length; i += 1) {
    if (String(items[i].Id || '').trim() === String(id || '').trim()) {
      targetRow = i + 2;
      break;
    }
  }
  if (targetRow === -1) throw new Error('No se encontro el usuario.');
  sheet.getRange(targetRow, 7).setValue(String(active || 'SI').trim().toUpperCase() === 'NO' ? 'NO' : 'SI');
  return listUsersWeb_();
}

function readCompaniesWeb_() {
  return readSimpleItems_(getCompaniesSheet_()).map(function(item) {
    return {
      id: String(item.id || '').trim(),
      name: String(item.nombre || '').trim(),
      nit: String(item.nit || '').trim(),
      phone: String(item.telefono || '').trim(),
      email: String(item.email || '').trim(),
      contact: String(item.contacto || '').trim(),
      status: String(item.estado || 'ACTIVA').trim()
    };
  });
}

function readLicensesWeb_() {
  return readSimpleItems_(getLicensesSheet_()).map(function(item) {
    return {
      id: String(item.id || '').trim(),
      companyId: String(item.empresa_id || '').trim(),
      code: String(item.codigo_licencia || '').trim(),
      customerName: String(item.cliente_nombre || '').trim(),
      customerDocument: String(item.cliente_documento || '').trim(),
      companyName: String(item.empresa_nombre || '').trim(),
      phone: String(item.telefono || '').trim(),
      email: String(item.email || '').trim(),
      installationId: String(item.equipo_id || '').trim(),
      installationName: String(item.equipo_nombre || '').trim(),
      plan: String(item.plan || 'ANUAL').trim(),
      maxDevices: Number(item.max_equipos || 1),
      activatedAt: String(item.fecha_activacion || '').trim(),
      expiresAt: String(item.fecha_vencimiento || '').trim(),
      status: String(item.estado || 'ACTIVA').trim(),
      notes: String(item.observaciones || '').trim()
    };
  });
}

function readLicenseDevicesWeb_() {
  return readSimpleItems_(getLicenseDevicesSheet_()).map(function(item) {
    return {
      id: String(item.id || '').trim(),
      licenseId: String(item.licencia_id || '').trim(),
      installationId: String(item.equipo_id || '').trim(),
      installationName: String(item.equipo_nombre || '').trim(),
      firstActivatedAt: String(item.primera_activacion || '').trim(),
      lastValidatedAt: String(item.ultima_validacion || '').trim(),
      status: String(item.estado || 'ACTIVO').trim()
    };
  });
}

function readLicenseHistoryWeb_() {
  return readSimpleItems_(getLicenseHistorySheet_()).map(function(item) {
    return {
      id: String(item.id || '').trim(),
      licenseId: String(item.licencia_id || '').trim(),
      eventType: String(item.tipo_evento || '').trim(),
      detail: String(item.detalle || '').trim(),
      installationId: String(item.equipo_id || '').trim(),
      installationName: String(item.equipo_nombre || '').trim(),
      createdAt: String(item.creado_en || '').trim()
    };
  });
}

function getLicensingOverviewWeb_() {
  return {
    companies: readCompaniesWeb_(),
    licenses: readLicensesWeb_(),
    devices: readLicenseDevicesWeb_(),
    history: readLicenseHistoryWeb_()
  };
}

function saveCompanyWeb_(payload) {
  var sheet = getCompaniesSheet_();
  var items = readSimpleItems_(sheet);
  var id = String(payload.id || '').trim();
  var rowIndex = -1;
  var now = new Date().toISOString();
  for (var i = 0; i < items.length; i += 1) {
    if (String(items[i].id || '').trim() === id && id) {
      rowIndex = i + 2;
      break;
    }
  }
  var nextId = id || getNextNumericId_(items);
  var normalized = {
    id: nextId,
    nombre: String(payload.name || payload.nombre || '').trim(),
    nit: String(payload.nit || '').trim(),
    telefono: String(payload.phone || payload.telefono || '').trim(),
    email: String(payload.email || '').trim(),
    contacto: String(payload.contact || payload.contacto || '').trim(),
    estado: String(payload.status || payload.estado || 'ACTIVA').trim().toUpperCase() === 'INACTIVA' ? 'INACTIVA' : 'ACTIVA',
    creada_en: rowIndex > 0 ? String(sheet.getRange(rowIndex, 8).getValue() || '').trim() : now,
    actualizada_en: now
  };
  if (!normalized.nombre) throw new Error('Debes indicar el nombre de la empresa.');
  var rowValues = COMPANY_HEADERS.map(function(header) { return normalized[header] != null ? normalized[header] : ''; });
  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
  return getLicensingOverviewWeb_();
}

function saveLicenseWeb_(payload) {
  var sheet = getLicensesSheet_();
  var items = readSimpleItems_(sheet);
  var id = String(payload.id || '').trim();
  var code = String(payload.code || payload.codigo_licencia || '').trim();
  var rowIndex = -1;
  var now = new Date().toISOString();
  if (!code) throw new Error('Debes indicar el codigo de licencia.');
  for (var i = 0; i < items.length; i += 1) {
    var currentId = String(items[i].id || '').trim();
    var currentCode = String(items[i].codigo_licencia || '').trim();
    if (currentCode === code && currentId !== id) {
      throw new Error('Ya existe una licencia con ese codigo.');
    }
    if (currentId === id && id) {
      rowIndex = i + 2;
    }
  }
  var nextId = id || getNextNumericId_(items);
  var normalized = {
    id: nextId,
    empresa_id: String(payload.companyId || payload.empresa_id || '').trim(),
    codigo_licencia: code,
    cliente_nombre: String(payload.customerName || payload.cliente_nombre || 'Cliente licencia').trim(),
    cliente_documento: String(payload.customerDocument || payload.cliente_documento || '').trim(),
    empresa_nombre: String(payload.companyName || payload.empresa_nombre || '').trim(),
    telefono: String(payload.phone || payload.telefono || '').trim(),
    email: String(payload.email || '').trim(),
    equipo_id: rowIndex > 0 ? String(sheet.getRange(rowIndex, 9).getValue() || '').trim() : '',
    equipo_nombre: rowIndex > 0 ? String(sheet.getRange(rowIndex, 10).getValue() || '').trim() : '',
    plan: String(payload.plan || 'ANUAL').trim().toUpperCase() || 'ANUAL',
    max_equipos: Math.max(1, Number(payload.maxDevices || payload.max_equipos || 1)),
    fecha_activacion: rowIndex > 0 ? String(sheet.getRange(rowIndex, 13).getValue() || '').trim() : '',
    fecha_vencimiento: normalizeDateValue_(payload.expiresAt || payload.fecha_vencimiento || '') || Utilities.formatDate(new Date(new Date().setFullYear(new Date().getFullYear() + 1)), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    estado: String(payload.status || payload.estado || 'ACTIVA').trim().toUpperCase() === 'INACTIVA' ? 'INACTIVA' : 'ACTIVA',
    observaciones: String(payload.notes || payload.observaciones || '').trim(),
    creada_en: rowIndex > 0 ? String(sheet.getRange(rowIndex, 17).getValue() || '').trim() : now,
    actualizada_en: now
  };
  if (!normalized.empresa_nombre && normalized.empresa_id) {
    var companies = readCompaniesWeb_();
    var company = companies.filter(function(item) { return String(item.id || '').trim() === normalized.empresa_id; })[0];
    normalized.empresa_nombre = company ? String(company.name || '').trim() : '';
  }
  if (!normalized.empresa_nombre) throw new Error('Debes indicar la empresa asociada.');
  var rowValues = LICENSE_HEADERS.map(function(header) { return normalized[header] != null ? normalized[header] : ''; });
  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
  appendLicenseHistoryWeb_(normalized.id, 'GUARDADO', 'Licencia guardada/actualizada.', '', '');
  return getLicensingOverviewWeb_();
}

function validateLicenseWeb_(code) {
  var normalizedCode = String(code || '').trim();
  if (!normalizedCode) throw new Error('Debes ingresar un codigo de licencia.');
  var licenses = readLicensesWeb_();
  var license = licenses.filter(function(item) {
    return String(item.code || '').trim() === normalizedCode;
  })[0];
  if (!license) throw new Error('La licencia indicada no existe.');
  if (String(license.status || '').trim().toUpperCase() !== 'ACTIVA') {
    throw new Error('La licencia existe, pero no se encuentra activa.');
  }
  if (license.expiresAt) {
    var expiration = new Date(license.expiresAt);
    if (!isNaN(expiration.getTime()) && expiration.getTime() < Date.now()) {
      throw new Error('La licencia ya se encuentra vencida.');
    }
  }
  return license;
}

function setLicenseStatusWeb_(id, status) {
  var sheet = getLicensesSheet_();
  var items = readSimpleItems_(sheet);
  var rowIndex = -1;
  for (var i = 0; i < items.length; i += 1) {
    if (String(items[i].id || '').trim() === String(id || '').trim()) {
      rowIndex = i + 2;
      break;
    }
  }
  if (rowIndex === -1) throw new Error('No se encontro la licencia indicada.');
  var normalizedStatus = String(status || 'ACTIVA').trim().toUpperCase() === 'INACTIVA' ? 'INACTIVA' : 'ACTIVA';
  sheet.getRange(rowIndex, 15).setValue(normalizedStatus);
  sheet.getRange(rowIndex, 18).setValue(new Date().toISOString());
  appendLicenseHistoryWeb_(id, 'CAMBIO_ESTADO', 'Estado cambiado a ' + normalizedStatus + '.', '', '');
  return getLicensingOverviewWeb_();
}

function renewLicenseWeb_(id) {
  var sheet = getLicensesSheet_();
  var items = readSimpleItems_(sheet);
  var rowIndex = -1;
  var row = null;
  for (var i = 0; i < items.length; i += 1) {
    if (String(items[i].id || '').trim() === String(id || '').trim()) {
      rowIndex = i + 2;
      row = items[i];
      break;
    }
  }
  if (rowIndex === -1 || !row) throw new Error('No se encontro la licencia indicada.');
  var baseDate = row.fecha_vencimiento ? new Date(row.fecha_vencimiento) : new Date();
  if (isNaN(baseDate.getTime()) || baseDate.getTime() < Date.now()) {
    baseDate = new Date();
  }
  baseDate.setFullYear(baseDate.getFullYear() + 1);
  sheet.getRange(rowIndex, 14).setValue(Utilities.formatDate(baseDate, Session.getScriptTimeZone(), 'yyyy-MM-dd'));
  sheet.getRange(rowIndex, 15).setValue('ACTIVA');
  sheet.getRange(rowIndex, 18).setValue(new Date().toISOString());
  appendLicenseHistoryWeb_(id, 'RENOVACION', 'Licencia renovada manualmente.', '', '');
  return getLicensingOverviewWeb_();
}

function releaseLicenseDeviceWeb_(licenseId, installationId) {
  var devicesSheet = getLicenseDevicesSheet_();
  var values = devicesSheet.getDataRange().getValues();
  var headers = values.length ? values[0].map(function(header) { return String(header).trim(); }) : LICENSE_DEVICE_HEADERS.slice();
  for (var i = values.length - 1; i >= 1; i -= 1) {
    var row = rowToItem_(headers, values[i]);
    if (String(row.licencia_id || '').trim() === String(licenseId || '').trim() && String(row.equipo_id || '').trim() === String(installationId || '').trim()) {
      devicesSheet.deleteRow(i + 1);
    }
  }
  appendLicenseHistoryWeb_(licenseId, 'LIBERACION_EQUIPO', 'Equipo liberado manualmente.', installationId, '');
  return getLicensingOverviewWeb_();
}

function appendLicenseHistoryWeb_(licenseId, eventType, detail, installationId, installationName) {
  var sheet = getLicenseHistorySheet_();
  var items = readSimpleItems_(sheet);
  var nextId = getNextNumericId_(items);
  sheet.appendRow([
    nextId,
    String(licenseId || '').trim(),
    String(eventType || '').trim(),
    String(detail || '').trim(),
    String(installationId || '').trim(),
    String(installationName || '').trim(),
    new Date().toISOString()
  ]);
}

