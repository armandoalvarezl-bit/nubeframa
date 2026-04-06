const STORAGE_KEYS = {
  inventory: "farmapos_inventory",
  clients: "farmapos_clients",
  suppliers: "farmapos_suppliers",
  purchases: "farmapos_purchases",
  returns: "farmapos_returns",
  promotions: "farmapos_promotions",
  auditLogs: "farmapos_audit_logs",
  sales: "farmapos_sales",
  lastTicket: "farmapos_last_ticket",
  session: "farmapos_session",
  license: "farmapos_license",
  inventorySyncMeta: "farmapos_inventory_sync_meta",
  cashClosures: "farmapos_cash_closures",
  cashClosureDraft: "farmapos_cash_closure_draft",
  cashWithdrawals: "farmapos_cash_withdrawals",
  pharmacyProfile: "farmapos_pharmacy_profile",
  printerPreferences: "farmapos_printer_preferences",
  dianConfig: "farmapos_dian_config",
  dianTestResult: "farmapos_dian_test_result"
};

const TAX_RATE = 0.19;
const LOYALTY_POINTS_PER_COP = 1000;
const CASH_WITHDRAWAL_WARNING_LIMIT = 400000;
const LOYALTY_REDEMPTION_VALUE_PER_POINT = 1;
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const LIVE_SYNC_INTERVAL_MS = 15000;
const APP_TIME_ZONE = "America/Bogota";
const WEB_DB_API_STORAGE_KEY = "farmapos_web_db_api_url";
const DAILY_WELCOME_STORAGE_KEY = "farmapos_daily_welcome_seen";
const SESSION_WELCOME_STORAGE_KEY = "farmapos_session_welcome_seen";
const INVENTORY_API_URL = "https://script.google.com/macros/s/AKfycbxCfpvKwlU21QJUxXaDjlMwIvS5KTOQRSayDgw2KHVOTqum1n6bZd5BIArI-Nem8VfwsQ/exec";
const desktopDb = window.farmaposDesktop?.db || null;
const browserStorage = window.sessionStorage;
const persistentStorage = window.localStorage;
const WEB_DB_API_URL = resolveWebDbApiUrl();
const AUTH_DEBUG_STORAGE_KEY = "farmapos_auth_debug";
const DEFAULT_BRAND_LOGO = "assets/logo/logo-farmapos.png";
const DEFAULT_INTERNAL_BRAND_LOGO = "assets/logo/logo-nubefarma-clean.png";
const uiFeedbackState = {
  dialogResolver: null,
  loadingCount: 0
};
let supportApiConfig = {
  enabled: false,
  url: "",
  apiKey: ""
};
const liveSyncState = {
  running: false,
  timerId: null
};
const inventoryScannerState = {
  active: false,
  stream: null,
  rafId: 0,
  detector: null
};
const DEFAULT_BRAND_THEME = {
  primary: "#ff6a3d",
  primaryDark: "#e55328",
  primarySoft: "rgba(255, 106, 61, 0.18)",
  primaryGradientStart: "#ff6a3d",
  primaryGradientEnd: "#ff6a3d",
  secondary: "#214761",
  secondarySoft: "rgba(33, 71, 97, 0.18)",
  ring: "0 0 0 0.22rem rgba(255, 106, 61, 0.2)",
  bgAccentA: "rgba(255, 106, 61, 0.04)",
  bgAccentB: "rgba(33, 71, 97, 0.05)",
  authAccentA: "rgba(255, 106, 61, 0.03)",
  authAccentB: "rgba(33, 71, 97, 0.04)",
  bgBottom: "#edf1f5",
  authBgBottom: "#e8edf2"
};
let activeBrandThemeRequestId = 0;
let cachedSystemVersion = "";

function isAppsScriptWebDbUrl(url = WEB_DB_API_URL) {
  return /script\.google\.com\/macros\/s\//i.test(String(url || ""));
}

Object.values(STORAGE_KEYS).filter((key) => ![STORAGE_KEYS.pharmacyProfile, STORAGE_KEYS.session, STORAGE_KEYS.license].includes(key)).forEach((key) => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignoramos errores al limpiar persistencia anterior.
  }
});
let salesOpeningPromptShown = false;
let cachedRuntimeStatus = null;
const DEFAULT_DESCRIPTIONS = {
  "Acetaminofén 500 mg": "Tabletas x 100 unidades",
  "Ibuprofeno 400 mg": "Cápsulas blandas x 50",
  "Vitamina C 1 g": "Tabletas efervescentes",
  "Protector solar FPS 50": "Presentación 120 ml",
  "Alcohol antiséptico": "Frasco 350 ml",
  "Multivitamínico adulto": "Frasco x 60 cápsulas"
};

function loadData(key, fallback) {
  try {
    const stored = browserStorage.getItem(key) || persistentStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function resolveWebDbApiUrl() {
  const metaUrl = String(document.querySelector('meta[name="farmapos-web-db-api-url"]')?.content || "").trim();
  if (metaUrl) return metaUrl.replace(/\/+$/, "");
  try {
    const storedUrl = String(window.localStorage.getItem(WEB_DB_API_STORAGE_KEY) || "").trim();
    if (storedUrl) return storedUrl.replace(/\/+$/, "");
  } catch {
    // Ignoramos errores de lectura del almacenamiento.
  }

  const protocol = String(window.location?.protocol || "").toLowerCase();
  const hostname = String(window.location?.hostname || "").trim().toLowerCase();
  const origin = String(window.location?.origin || "").trim();

  if ((protocol === "http:" || protocol === "https:") && origin && hostname && hostname !== "127.0.0.1" && hostname !== "localhost") {
    return origin.replace(/\/+$/, "");
  }

  if (protocol === "http:" || protocol === "https:" || protocol === "file:") {
    return "http://127.0.0.1:8787";
  }

  return "";
}

function isWebDbApiEnabled() {
  return Boolean(WEB_DB_API_URL);
}

async function fetchWebDbApiJson(path, options = {}, timeoutMs = 15000) {
  if (!isWebDbApiEnabled()) {
    throw new Error("La API web de MariaDB no esta configurada.");
  }

  try {
    const isAppsScript = isAppsScriptWebDbUrl();
    const request = isAppsScript
      ? buildAppsScriptWebDbRequest(path, options)
      : {
          url: `${WEB_DB_API_URL}${path}`,
          fetchOptions: {
            ...options,
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              ...(options.headers || {})
            }
          }
        };

    const data = await fetchJsonWithTimeout(request.url, request.fetchOptions, timeoutMs);

    if (!data?.ok) {
      throw new Error(data?.error || "No fue posible completar la operacion en MariaDB.");
    }

    return data;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`No fue posible conectarse a la API web de MariaDB en ${WEB_DB_API_URL}.`);
    }
    throw error;
  }
}

function buildAppsScriptWebDbRequest(path, options = {}) {
  const method = String(options.method || "GET").trim().toUpperCase();
  let payload = {};

  if (options.body) {
    try {
      payload = JSON.parse(options.body);
    } catch {
      payload = {};
    }
  }

  if (path === "/v1/licensing/overview" && method === "GET") {
    return {
      url: WEB_DB_API_URL,
      fetchOptions: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({ action: "licensing_overview" })
      }
    };
  }

  if (path === "/v1/users" && method === "GET") {
    return {
      url: WEB_DB_API_URL,
      fetchOptions: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({ action: "list_users" })
      }
    };
  }

  if (path === "/v1/users" && method === "POST") {
    return {
      url: WEB_DB_API_URL,
      fetchOptions: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({
          action: "save_user",
          user: payload
        })
      }
    };
  }

  const userActiveMatch = path.match(/^\/v1\/users\/([^/]+)\/active$/i);
  if (userActiveMatch && method === "POST") {
    return {
      url: WEB_DB_API_URL,
      fetchOptions: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({
          action: "set_user_active",
          id: decodeURIComponent(userActiveMatch[1]),
          active: payload.active
        })
      }
    };
  }

  if (path === "/v1/licensing/companies" && method === "POST") {
    return {
      url: WEB_DB_API_URL,
      fetchOptions: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({
          action: "save_company",
          company: payload
        })
      }
    };
  }

  if (path === "/v1/licensing/licenses" && method === "POST") {
    return {
      url: WEB_DB_API_URL,
      fetchOptions: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({
          action: "save_license",
          license: payload
        })
      }
    };
  }

  const licenseStatusMatch = path.match(/^\/v1\/licensing\/licenses\/([^/]+)\/status$/i);
  if (licenseStatusMatch && method === "POST") {
    return {
      url: WEB_DB_API_URL,
      fetchOptions: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({
          action: "set_license_status",
          id: decodeURIComponent(licenseStatusMatch[1]),
          status: payload.status
        })
      }
    };
  }

  const licenseRenewMatch = path.match(/^\/v1\/licensing\/licenses\/([^/]+)\/renew$/i);
  if (licenseRenewMatch && method === "POST") {
    return {
      url: WEB_DB_API_URL,
      fetchOptions: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({
          action: "renew_license",
          id: decodeURIComponent(licenseRenewMatch[1])
        })
      }
    };
  }

  const licenseDeviceReleaseMatch = path.match(/^\/v1\/licensing\/licenses\/([^/]+)\/devices\/([^/]+)\/release$/i);
  if (licenseDeviceReleaseMatch && method === "POST") {
    return {
      url: WEB_DB_API_URL,
      fetchOptions: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({
          action: "release_license_device",
          licenseId: decodeURIComponent(licenseDeviceReleaseMatch[1]),
          installationId: decodeURIComponent(licenseDeviceReleaseMatch[2])
        })
      }
    };
  }

  throw new Error(`La operacion web ${path} no esta disponible en Apps Script.`);
}

function saveAuthDebug(event, payload = {}) {
  try {
    persistentStorage.setItem(AUTH_DEBUG_STORAGE_KEY, JSON.stringify({
      event,
      payload,
      at: new Date().toISOString(),
      page: document.body?.dataset?.page || ""
    }));
  } catch {
    // Ignoramos errores de depuracion.
  }
}

function saveData() {
  browserStorage.setItem(STORAGE_KEYS.inventory, JSON.stringify(state.inventory));
  browserStorage.setItem(STORAGE_KEYS.clients, JSON.stringify(state.clients));
  browserStorage.setItem(STORAGE_KEYS.suppliers, JSON.stringify(state.suppliers));
  browserStorage.setItem(STORAGE_KEYS.purchases, JSON.stringify(state.purchases));
  browserStorage.setItem(STORAGE_KEYS.returns, JSON.stringify(state.returns));
  browserStorage.setItem(STORAGE_KEYS.promotions, JSON.stringify(state.promotions));
  browserStorage.setItem(STORAGE_KEYS.auditLogs, JSON.stringify(state.auditLogs));
  browserStorage.setItem(STORAGE_KEYS.sales, JSON.stringify(state.sales));
  browserStorage.setItem(STORAGE_KEYS.lastTicket, state.lastTicketHtml);
}

function saveSyncMeta(meta) {
  browserStorage.setItem(STORAGE_KEYS.inventorySyncMeta, JSON.stringify(meta));
}

function saveSalesData() {
  browserStorage.setItem(STORAGE_KEYS.sales, JSON.stringify(state.sales));
}

function saveCashClosureData() {
  browserStorage.setItem(STORAGE_KEYS.cashClosures, JSON.stringify(state.cashClosures));
}

function saveCashClosureDraft() {
  browserStorage.setItem(STORAGE_KEYS.cashClosureDraft, JSON.stringify(state.cashClosureDraft));
}

function saveCashWithdrawalsData() {
  browserStorage.removeItem(STORAGE_KEYS.cashWithdrawals);
}

function getDefaultCashClosureDraft() {
  return {
    openingAmount: 0,
    countedCash: 0,
    expenses: 0,
    observations: "",
    isOpen: false,
    openedAt: "",
    openingNumber: "",
    openingBase: 0
  };
}

function normalizeCashClosureDraft(draft) {
  const base = {
    ...getDefaultCashClosureDraft(),
    ...draft
  };

  const openedDate = normalizeInputDateValue(base.openedAt || "");
  const today = normalizeInputDateValue(new Date());
  const isOpenToday = Boolean(base.isOpen && openedDate && openedDate === today);

  if (!isOpenToday) {
    return getDefaultCashClosureDraft();
  }

  const openingBase = Number(base.openingBase || base.openingAmount || 0);
  return {
    ...base,
    isOpen: true,
    openingAmount: openingBase,
    openingBase,
    countedCash: Number(base.countedCash || 0),
    expenses: Math.max(0, Math.min(Number(base.expenses || 0), 450000)),
    observations: String(base.observations || "").trim(),
    openedAt: String(base.openedAt || "").trim(),
    openingNumber: String(base.openingNumber || "").trim()
  };
}

function getCashSessionStart() {
  if (!state.cashClosureDraft.isOpen || !state.cashClosureDraft.openedAt) return null;
  const openedAt = new Date(state.cashClosureDraft.openedAt);
  return Number.isNaN(openedAt.getTime()) ? null : openedAt;
}

function parseTimeToMinutes(timeText) {
  const text = String(timeText || "").trim().toLowerCase();
  if (!text) return null;

  const normalized = text
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .replace(/a m/g, "am")
    .replace(/p m/g, "pm");
  const match = normalized.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3] || "";
  if (minutes < 0 || minutes > 59 || hours < 0 || hours > 23) return null;

  if (period === "pm" && hours < 12) hours += 12;
  if (period === "am" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function isRecordInCurrentCashSession(dateValue, timeValue) {
  const sessionStart = getCashSessionStart();
  if (!sessionStart) return false;

  const recordDate = normalizeInputDateValue(dateValue);
  if (!recordDate) return false;

  const sessionDate = normalizeInputDateValue(sessionStart);
  if (recordDate !== sessionDate) return recordDate > sessionDate;

  const sessionMinutes = sessionStart.getHours() * 60 + sessionStart.getMinutes();
  const recordMinutes = parseTimeToMinutes(timeValue);
  if (recordMinutes == null) return true;
  return recordMinutes >= sessionMinutes;
}

function getCurrentCashSessionSales() {
  return getActiveSales().filter((sale) => isRecordInCurrentCashSession(sale.date, sale.time));
}

function getCurrentCashSessionWithdrawals() {
  return state.cashWithdrawals.filter((withdrawal) => isRecordInCurrentCashSession(withdrawal.date, withdrawal.time));
}

function getDefaultPharmacyProfile() {
  return {
    name: "",
    nit: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    manager: "",
    logoUrl: ""
  };
}

function normalizePharmacyProfile(profile) {
  const base = getDefaultPharmacyProfile();
  return {
    name: String(profile?.name || base.name).trim(),
    nit: String(profile?.nit || base.nit).trim(),
    phone: String(profile?.phone || base.phone).trim(),
    email: String(profile?.email || base.email).trim(),
    address: String(profile?.address || base.address).trim(),
    city: String(profile?.city || base.city).trim(),
    manager: String(profile?.manager || base.manager).trim(),
    logoUrl: String(profile?.logoUrl || profile?.logo_url || base.logoUrl).trim()
  };
}

function savePharmacyProfile() {
  persistentStorage.setItem(STORAGE_KEYS.pharmacyProfile, JSON.stringify(state.pharmacyProfile));
}

function getDefaultDianConfig() {
  return {
    environment: "test",
    providerMode: "direct",
    prefix: "",
    resolution: "",
    softwareId: "",
    softwarePin: "",
    certificateName: "",
    certificatePassword: "",
    apiUrl: "",
    testSetId: ""
  };
}

function normalizeDianConfig(config) {
  const base = getDefaultDianConfig();
  return {
    environment: ["test", "production"].includes(String(config?.environment || "").trim().toLowerCase())
      ? String(config.environment).trim().toLowerCase()
      : base.environment,
    providerMode: ["direct", "provider"].includes(String(config?.providerMode || "").trim().toLowerCase())
      ? String(config.providerMode).trim().toLowerCase()
      : base.providerMode,
    prefix: String(config?.prefix || "").trim().toUpperCase(),
    resolution: String(config?.resolution || "").trim(),
    softwareId: String(config?.softwareId || config?.software_id || "").trim(),
    softwarePin: String(config?.softwarePin || config?.software_pin || "").trim(),
    certificateName: String(config?.certificateName || config?.certificate_name || "").trim(),
    certificatePassword: String(config?.certificatePassword || config?.certificate_password || "").trim(),
    apiUrl: String(config?.apiUrl || config?.api_url || "").trim(),
    testSetId: String(config?.testSetId || config?.test_set_id || "").trim()
  };
}

function saveDianConfig() {
  persistentStorage.setItem(STORAGE_KEYS.dianConfig, JSON.stringify(state.dianConfig));
}

function getDefaultDianTestResult() {
  return {
    generatedAt: "",
    simulatedAt: "",
    status: "",
    saleId: "",
    ticketNumber: "",
    invoiceNumber: "",
    environment: "",
    simulationId: "",
    payload: null
  };
}

function normalizeDianTestResult(result) {
  const base = getDefaultDianTestResult();
  return {
    generatedAt: String(result?.generatedAt || "").trim(),
    simulatedAt: String(result?.simulatedAt || "").trim(),
    status: String(result?.status || "").trim(),
    saleId: String(result?.saleId || "").trim(),
    ticketNumber: String(result?.ticketNumber || "").trim(),
    invoiceNumber: String(result?.invoiceNumber || "").trim(),
    environment: String(result?.environment || "").trim(),
    simulationId: String(result?.simulationId || "").trim(),
    payload: result?.payload && typeof result.payload === "object" ? result.payload : base.payload
  };
}

function saveDianTestResult() {
  persistentStorage.setItem(STORAGE_KEYS.dianTestResult, JSON.stringify(state.dianTestResult));
}

function getDianTestResultSummary(result = state.dianTestResult) {
  const normalized = normalizeDianTestResult(result);
  if (!normalized.invoiceNumber) {
    return "Aun no se ha generado ninguna factura electronica de prueba.";
  }

  const parts = [
    normalized.invoiceNumber,
    normalized.status || "Generada",
    normalized.environment === "production" ? "Produccion" : "Pruebas"
  ];
  if (normalized.simulatedAt) {
    parts.push(`Envio ${formatSessionDateTime(normalized.simulatedAt)}`);
  } else if (normalized.generatedAt) {
    parts.push(`Generada ${formatSessionDateTime(normalized.generatedAt)}`);
  }
  return parts.join(" · ");
}

function buildDianTestInvoiceFromSale(sale, config = state.dianConfig) {
  const normalizedConfig = normalizeDianConfig(config);
  const pharmacy = normalizePharmacyProfile(state.pharmacyProfile);
  const customerDocument = String(sale?.clientDocument || "222222222").trim() || "222222222";
  const prefix = normalizedConfig.prefix || "SETP";
  const invoiceNumber = `${prefix}${String(sale?.ticketNumber || Date.now()).replace(/[^A-Z0-9]/gi, "")}`;
  const issueDate = normalizeInputDateValue(sale?.date || new Date());
  const issueTime = String(sale?.time || new Date().toLocaleTimeString("es-CO", { hour12: false })).trim();

  return {
    profileExecutionId: crypto.randomUUID(),
    generatedAt: new Date().toISOString(),
    environment: normalizedConfig.environment,
    providerMode: normalizedConfig.providerMode,
    documentType: "FACTURA_ELECTRONICA_VENTA",
    invoiceNumber,
    prefix,
    resolution: normalizedConfig.resolution,
    testSetId: normalizedConfig.testSetId,
    software: {
      id: normalizedConfig.softwareId,
      pinConfigured: Boolean(normalizedConfig.softwarePin),
      certificateName: normalizedConfig.certificateName,
      apiUrl: normalizedConfig.apiUrl
    },
    seller: {
      companyName: pharmacy.name || "Farma POS",
      nit: pharmacy.nit || "NIT_NO_CONFIGURADO",
      phone: pharmacy.phone || "",
      email: pharmacy.email || "",
      address: pharmacy.address || "",
      city: pharmacy.city || "",
      responsible: pharmacy.manager || ""
    },
    customer: {
      name: sale?.clientName || "Cliente general",
      document: customerDocument
    },
    sale: {
      id: sale?.id || "",
      ticketNumber: sale?.ticketNumber || "",
      paymentMethod: sale?.paymentMethod || "Efectivo",
      issueDate,
      issueTime,
      subtotal: Number(sale?.subtotal || 0),
      tax: Number(sale?.tax || 0),
      discounts: Number(sale?.promoDiscount || 0) + Number(sale?.loyaltyDiscount || 0),
      total: Number(sale?.total || 0),
      currency: "COP"
    },
    lines: Array.isArray(sale?.items)
      ? sale.items.map((item, index) => ({
          lineNumber: index + 1,
          code: item.sku || item.id || `ITEM-${index + 1}`,
          description: item.name || "Producto",
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.price || 0),
          lineExtensionAmount: Number(item.originalSubtotal || 0),
          discountAmount: Number(item.promoDiscount || 0),
          lineTotal: Number(item.lineTotal || 0)
        }))
      : []
  };
}

function downloadJsonFile(payload, filename = "dian-test.json") {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function getDianConfigSummary(config = state.dianConfig) {
  const normalized = normalizeDianConfig(config);
  const summary = [
    normalized.environment === "production" ? "Produccion" : "Pruebas",
    normalized.providerMode === "provider" ? "Proveedor tecnologico" : "Directa",
    normalized.prefix || "Sin prefijo",
    normalized.softwareId ? "Software ID cargado" : "Sin Software ID"
  ];
  return summary.join(" · ");
}

function validateDianConfig(config = state.dianConfig) {
  const normalized = normalizeDianConfig(config);
  const errors = [];

  if (!normalized.prefix) errors.push("Debes indicar el prefijo de facturacion.");
  if (!normalized.softwareId) errors.push("Debes indicar el Software ID.");
  if (!normalized.softwarePin) errors.push("Debes indicar el PIN del software.");
  if (!normalized.apiUrl) errors.push("Debes indicar la URL del servicio.");
  if (!/^https?:\/\//i.test(normalized.apiUrl)) errors.push("La URL del servicio debe comenzar por http:// o https://.");
  if (normalized.environment === "test" && !normalized.testSetId) {
    errors.push("En pruebas conviene registrar el TestSetId o una referencia de habilitacion.");
  }

  return {
    ok: !errors.length,
    errors,
    config: normalized
  };
}

function getDefaultPrinterPreferences() {
  return {
    ticketPrinterName: ""
  };
}

function normalizePrinterPreferences(preferences) {
  const base = getDefaultPrinterPreferences();
  return {
    ticketPrinterName: String(preferences?.ticketPrinterName || preferences?.ticket_printer_name || base.ticketPrinterName).trim()
  };
}

function savePrinterPreferences() {
  persistentStorage.setItem(STORAGE_KEYS.printerPreferences, JSON.stringify(state.printerPreferences));
}

function getActiveTicketPrinterName() {
  return String(state.printerPreferences?.ticketPrinterName || "").trim();
}

function getTicketPrinterStatusLabel() {
  const selected = getActiveTicketPrinterName();
  if (!selected) return "Predeterminada";
  const match = state.availablePrinters.find((printer) => String(printer.name || "").trim() === selected);
  return match?.displayName || selected;
}

async function loadAvailablePrinters(force = false) {
  if (!window.farmaposDesktop?.print?.listPrinters) {
    state.availablePrinters = [];
    return [];
  }

  if (!force && state.availablePrintersLoaded && state.availablePrinters.length) {
    return state.availablePrinters;
  }

  try {
    const printers = await window.farmaposDesktop.print.listPrinters();
    state.availablePrinters = Array.isArray(printers)
      ? printers.map((printer) => ({
          name: String(printer?.name || "").trim(),
          displayName: String(printer?.displayName || printer?.name || "").trim(),
          description: String(printer?.description || "").trim(),
          isDefault: Boolean(printer?.isDefault)
        })).filter((printer) => printer.name)
      : [];
    state.availablePrintersLoaded = true;
  } catch (error) {
    console.warn("No fue posible cargar la lista de impresoras.", error);
    state.availablePrinters = [];
    state.availablePrintersLoaded = false;
  }

  if (document.body.dataset.page === "settings") {
    renderPrinterSettingsPanel();
  }

  return state.availablePrinters;
}

function renderPrinterSettingsPanel() {
  const select = document.getElementById("settingsPrinterSelect");
  if (!select) return;

  const printers = state.availablePrinters || [];
  const selectedPrinter = getActiveTicketPrinterName();
  const options = [
    `<option value="">Impresora predeterminada del sistema</option>`,
    ...printers.map((printer) => `<option value="${escapeHtml(printer.name)}">${escapeHtml(printer.displayName || printer.name)}${printer.isDefault ? " (Predeterminada)" : ""}</option>`)
  ];

  select.innerHTML = options.join("");
  select.value = printers.some((printer) => printer.name === selectedPrinter) ? selectedPrinter : "";
  select.disabled = !window.farmaposDesktop?.isDesktop;

  const summary = !window.farmaposDesktop?.isDesktop
    ? "La seleccion de impresora POS solo esta disponible en la app de escritorio."
    : selectedPrinter
      ? `Impresora seleccionada: ${getTicketPrinterStatusLabel()}.`
      : "Usando la impresora predeterminada del sistema.";

  setText("settingsPrinterSummary", summary);
  setText("settingsPrinterStatus", getTicketPrinterStatusLabel());
}

function applyRemotePharmacyProfile(profile) {
  state.pharmacyProfile = normalizePharmacyProfile(profile);
  savePharmacyProfile();
  rerenderCurrentPage();
}

function applyImageSourceWithFallback(imageNode, preferredSrc, fallbackSrc, altText) {
  if (!imageNode) return;
  const safePreferredSrc = String(preferredSrc || "").trim();
  const safeFallbackSrc = String(fallbackSrc || "").trim() || DEFAULT_BRAND_LOGO;
  imageNode.dataset.logoFallback = safeFallbackSrc;
  imageNode.onerror = () => {
    if (imageNode.src !== safeFallbackSrc) {
      imageNode.src = safeFallbackSrc;
    } else {
      imageNode.onerror = null;
    }
  };
  imageNode.src = safePreferredSrc || safeFallbackSrc;
  imageNode.alt = altText;
}

function getPersistenceBackendLabel() {
  if (isDesktopDbEnabled()) return "MariaDB";
  if (INVENTORY_API_URL) return "API web";
  return "almacenamiento local";
}

function getTicketPharmacyProfile() {
  const profile = normalizePharmacyProfile(state.pharmacyProfile);
  return {
    name: profile.name || "Farma POS",
    nit: profile.nit || "NIT no configurado",
    phone: profile.phone || "",
    email: profile.email || "",
    address: profile.address || "",
    city: profile.city || "",
    logoUrl: profile.logoUrl || ""
  };
}

function loadSyncMeta() {
  return loadData(STORAGE_KEYS.inventorySyncMeta, {
    source: INVENTORY_API_URL,
    lastSyncAt: null,
    updatedAt: null,
    total: 0,
    status: "Pendiente"
  });
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(value);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = repairMojibake(value);
}

function repairMojibake(value) {
  const text = String(value ?? "");
  if (!text || !/[ÃÂ]/.test(text)) return text;

  try {
    const bytes = Uint8Array.from(Array.from(text, (char) => char.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder("utf-8").decode(bytes);
    const originalNoise = (text.match(/[ÃÂ�]/g) || []).length;
    const decodedNoise = (decoded.match(/[ÃÂ�]/g) || []).length;
    if (decoded && decodedNoise < originalNoise) {
      return decoded;
    }
  } catch {
    // Si no se puede reparar, dejamos el valor original.
  }

  return text;
}

async function getSystemVersionLabel() {
  if (cachedSystemVersion) return cachedSystemVersion;
  if (window.farmaposDesktop?.app?.version) {
    try {
      const version = String(await window.farmaposDesktop.app.version() || "").trim();
      cachedSystemVersion = version ? `Version ${version}` : "Version Desktop";
      return cachedSystemVersion;
    } catch {
      // Continuamos con el valor por defecto.
    }
  }
  cachedSystemVersion = "Version web";
  return cachedSystemVersion;
}

async function getDesktopRuntimeStatus() {
  if (cachedRuntimeStatus) return cachedRuntimeStatus;
  if (!window.farmaposDesktop?.db?.status) return null;
  try {
    cachedRuntimeStatus = await window.farmaposDesktop.db.status();
    return cachedRuntimeStatus;
  } catch {
    return null;
  }
}

function formatBackendRuntimeLabel(status) {
  const runtime = status?.runtime;
  if (!runtime?.backendFile) return "";
  const stamp = runtime.backendFileStamp ? formatSessionDateTime(runtime.backendFileStamp) : "";
  const helper = runtime.hasNormalizeDateTimeValue ? "helper ok" : "helper faltante";
  return [helper, stamp].filter(Boolean).join(" · ");
}

async function renderSystemVersion() {
  const versionLabel = await getSystemVersionLabel();
  const runtimeStatus = await getDesktopRuntimeStatus();
  const runtimeLabel = formatBackendRuntimeLabel(runtimeStatus);
  const runtimeTitle = runtimeStatus?.runtime?.backendFile
    ? `Backend: ${runtimeStatus.runtime.backendFile}${runtimeStatus.runtime.executablePath ? `\nEjecutable: ${runtimeStatus.runtime.executablePath}` : ""}`
    : "";
  document.querySelectorAll(".sidebar-session").forEach((container) => {
    let versionNode = container.querySelector("[data-system-version]");
    if (!versionNode) {
      versionNode = document.createElement("small");
      versionNode.setAttribute("data-system-version", "true");
      container.appendChild(versionNode);
    }
    versionNode.textContent = versionLabel;

    let runtimeNode = container.querySelector("[data-system-runtime]");
    if (!runtimeNode) {
      runtimeNode = document.createElement("small");
      runtimeNode.setAttribute("data-system-runtime", "true");
      container.appendChild(runtimeNode);
    }
    runtimeNode.textContent = runtimeLabel || "Runtime sin diagnostico";
    runtimeNode.title = runtimeTitle;
  });
}

function escapeHtml(value) {
  return repairMojibake(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ensureFeedbackUi() {
  if (document.getElementById("appFeedbackModal")) return;

  const shell = document.createElement("div");
  shell.innerHTML = `
    <div class="app-feedback-modal" id="appFeedbackModal" hidden>
      <div class="app-feedback-backdrop" data-close-dialog></div>
      <div class="app-feedback-card" role="dialog" aria-modal="true" aria-labelledby="appFeedbackTitle">
        <div class="app-feedback-icon" id="appFeedbackIcon">
          <i class="bi bi-info-circle"></i>
        </div>
        <div class="app-feedback-copy">
          <h3 id="appFeedbackTitle">Aviso</h3>
          <p id="appFeedbackMessage"></p>
        </div>
        <div class="app-feedback-actions">
          <button type="button" class="btn btn-outline-secondary" id="appFeedbackCancel">Cancelar</button>
          <button type="button" class="btn btn-brand" id="appFeedbackConfirm">Aceptar</button>
        </div>
      </div>
    </div>
    <div class="app-loading-overlay" id="appLoadingOverlay" hidden>
      <div class="app-loading-card" role="status" aria-live="polite">
        <div class="app-loading-spinner"></div>
        <strong id="appLoadingTitle">Procesando</strong>
        <span id="appLoadingMessage">Espera un momento...</span>
      </div>
    </div>
    <div class="app-toast-region" id="appToastRegion" aria-live="polite" aria-atomic="true"></div>
    <div class="app-startup-splash" id="appStartupSplash" hidden>
      <div class="app-startup-splash-backdrop"></div>
      <div class="app-startup-splash-card">
        <img class="app-startup-splash-logo" src="assets/logo/logo-farmapos.png" alt="Logo Farma POS">
        <span class="app-startup-splash-kicker">Farma POS</span>
        <strong>Preparando tu espacio de trabajo</strong>
        <p id="appStartupSplashVersion">Version Desktop</p>
        <div class="app-startup-splash-bar"><span></span></div>
      </div>
    </div>
  `;

  document.body.append(...shell.children);

  document.getElementById("appFeedbackConfirm")?.addEventListener("click", () => closeFeedbackDialog(true));
  document.getElementById("appFeedbackCancel")?.addEventListener("click", () => closeFeedbackDialog(false));
  document.querySelectorAll("[data-close-dialog]").forEach((node) => {
    node.addEventListener("click", () => closeFeedbackDialog(false));
  });
}

function showAppToast(message, options = {}) {
  ensureFeedbackUi();
  const region = document.getElementById("appToastRegion");
  if (!region) return;

  const variant = String(options.variant || "info").trim().toLowerCase();
  const iconByVariant = {
    success: "bi-check2-circle",
    warn: "bi-exclamation-triangle",
    danger: "bi-x-circle",
    info: "bi-stars",
    welcome: "bi-person-heart"
  };

  const toast = document.createElement("article");
  toast.className = `app-toast is-${variant}`;
  toast.innerHTML = `
    <i class="bi ${iconByVariant[variant] || iconByVariant.info}"></i>
    <div class="app-toast-copy">
      <strong>${escapeHtml(options.title || "Farma POS")}</strong>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
  region.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 220);
  }, Number(options.duration || 2400));
}

function getCurrentAppDateStamp() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function getWelcomeSessionFingerprint() {
  const username = String(sessionState?.username || sessionState?.user || "usuario").trim().toLowerCase();
  const loginAt = String(sessionState?.loginAt || "").trim();
  return `${username}::${loginAt}`;
}

function hasShownWelcomeForCurrentSession() {
  try {
    return browserStorage.getItem(SESSION_WELCOME_STORAGE_KEY) === getWelcomeSessionFingerprint();
  } catch {
    return false;
  }
}

function markWelcomeShownForCurrentSession() {
  try {
    browserStorage.setItem(SESSION_WELCOME_STORAGE_KEY, getWelcomeSessionFingerprint());
  } catch {
    // Ignoramos errores de almacenamiento de sesiÃ³n.
  }
}

function hasShownDailyWelcome() {
  try {
    const username = String(sessionState?.username || sessionState?.user || "usuario").trim().toLowerCase();
    const currentDate = getCurrentAppDateStamp();
    return persistentStorage.getItem(`${DAILY_WELCOME_STORAGE_KEY}:${username}`) === currentDate;
  } catch {
    return false;
  }
}

function markDailyWelcomeShown() {
  try {
    const username = String(sessionState?.username || sessionState?.user || "usuario").trim().toLowerCase();
    persistentStorage.setItem(`${DAILY_WELCOME_STORAGE_KEY}:${username}`, getCurrentAppDateStamp());
  } catch {
    // Ignoramos errores de almacenamiento persistente.
  }
}

function playElegantWelcomeTone() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return;

  try {
    const context = new AudioContextCtor();
    const now = context.currentTime;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.connect(context.destination);

    const notes = [
      { frequency: 523.25, duration: 0.18, delay: 0 },
      { frequency: 659.25, duration: 0.22, delay: 0.12 },
      { frequency: 783.99, duration: 0.34, delay: 0.26 }
    ];

    notes.forEach((note, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = now + note.delay;
      const endAt = startAt + note.duration;

      oscillator.type = index === notes.length - 1 ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(note.frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.028, startAt + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(startAt);
      oscillator.stop(endAt + 0.05);
    });

    master.gain.exponentialRampToValueAtTime(0.06, now + 0.08);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
    window.setTimeout(() => context.close().catch(() => {}), 900);
  } catch {
    // Ignoramos bloqueos de audio automÃ¡tico.
  }
}

function showDailyWelcomeNotification() {
  if (!sessionState?.user || hasShownWelcomeForCurrentSession()) return;

  const roleLabel = getSessionRoleLabel();
  const loginAtLabel = formatSessionDateTime(sessionState.loginAt);
  const alreadyWelcomedToday = hasShownDailyWelcome();
  const message = alreadyWelcomedToday
    ? `${sessionState.user} conectado como ${roleLabel}. Ingreso: ${loginAtLabel}.`
    : `${sessionState.user}, te deseamos una jornada excelente como ${roleLabel}. Ingreso: ${loginAtLabel}.`;

  showAppToast(message, {
    variant: "welcome",
    title: alreadyWelcomedToday ? "Bienvenido de nuevo" : "Buen inicio de jornada",
    duration: 5200
  });
  playElegantWelcomeTone();
  markWelcomeShownForCurrentSession();
  if (!alreadyWelcomedToday) {
    markDailyWelcomeShown();
  }
}

async function showStartupSplash(active) {
  ensureFeedbackUi();
  const splash = document.getElementById("appStartupSplash");
  const versionNode = document.getElementById("appStartupSplashVersion");
  const logoNode = document.querySelector(".app-startup-splash-logo");
  const kickerNode = document.querySelector(".app-startup-splash-kicker");
  if (!splash) return;

  if (active) {
    const brand = getBrandIdentity();
    applyImageSourceWithFallback(logoNode, brand.logoSrc, DEFAULT_BRAND_LOGO, `Logo ${brand.name}`);
    if (kickerNode) {
      kickerNode.textContent = brand.name;
    }
    if (versionNode) versionNode.textContent = await getSystemVersionLabel();
    splash.hidden = false;
    return;
  }

  splash.classList.add("is-hiding");
  window.setTimeout(() => {
    splash.hidden = true;
    splash.classList.remove("is-hiding");
  }, 340);
}

function closeFeedbackDialog(result) {
  const modal = document.getElementById("appFeedbackModal");
  if (modal) modal.hidden = true;

  if (uiFeedbackState.dialogResolver) {
    const resolver = uiFeedbackState.dialogResolver;
    uiFeedbackState.dialogResolver = null;
    resolver(result);
  }
}

function openFeedbackDialog({
  title = "Aviso",
  message = "",
  confirmText = "Aceptar",
  cancelText = "Cancelar",
  variant = "info",
  showCancel = false
} = {}) {
  ensureFeedbackUi();

  const modal = document.getElementById("appFeedbackModal");
  const titleNode = document.getElementById("appFeedbackTitle");
  const messageNode = document.getElementById("appFeedbackMessage");
  const confirmNode = document.getElementById("appFeedbackConfirm");
  const cancelNode = document.getElementById("appFeedbackCancel");
  const iconNode = document.getElementById("appFeedbackIcon");
  if (!modal || !titleNode || !messageNode || !confirmNode || !cancelNode || !iconNode) {
    return Promise.resolve(false);
  }

  const iconByVariant = {
    info: "bi-info-circle",
    success: "bi-check2-circle",
    warn: "bi-exclamation-triangle",
    danger: "bi-x-circle"
  };

  titleNode.textContent = title;
  messageNode.textContent = message;
  confirmNode.textContent = confirmText;
  cancelNode.textContent = cancelText;
  cancelNode.hidden = !showCancel;
  iconNode.className = `app-feedback-icon is-${variant}`;
  iconNode.innerHTML = `<i class="bi ${iconByVariant[variant] || iconByVariant.info}"></i>`;
  modal.hidden = false;

  return new Promise((resolve) => {
    uiFeedbackState.dialogResolver = resolve;
  });
}

function showInfoDialog(message, options = {}) {
  return openFeedbackDialog({
    title: options.title || "Aviso",
    message,
    confirmText: options.confirmText || "Entendido",
    variant: options.variant || "info",
    showCancel: false
  });
}

function showConfirmDialog(message, options = {}) {
  return openFeedbackDialog({
    title: options.title || "Confirmar acciÃ³n",
    message,
    confirmText: options.confirmText || "Continuar",
    cancelText: options.cancelText || "Cancelar",
    variant: options.variant || "warn",
    showCancel: true
  });
}

function setLoadingState(active, options = {}) {
  ensureFeedbackUi();

  const overlay = document.getElementById("appLoadingOverlay");
  const titleNode = document.getElementById("appLoadingTitle");
  const messageNode = document.getElementById("appLoadingMessage");
  if (!overlay || !titleNode || !messageNode) return;

  if (active) {
    uiFeedbackState.loadingCount += 1;
    titleNode.textContent = options.title || "Procesando";
    messageNode.textContent = options.message || "Espera un momento...";
    overlay.hidden = false;
    return;
  }

  uiFeedbackState.loadingCount = Math.max(0, uiFeedbackState.loadingCount - 1);
  if (uiFeedbackState.loadingCount === 0) {
    overlay.hidden = true;
  }
}

async function withLoading(task, options) {
  setLoadingState(true, options);
  try {
    return await task();
  } finally {
    setLoadingState(false);
  }
}

function normalizeInputDateValue(value) {
  if (!value) return "";
  const text = String(value).trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[0];

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(value) {
  const normalized = normalizeInputDateValue(value);
  if (!normalized) return "-";

  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return normalized;

  return parsed.toLocaleDateString("es-CO");
}

function getExpirationMeta(item) {
  if (!item?.expirationDate) return null;

  const normalized = normalizeInputDateValue(item.expirationDate);
  if (!normalized) return null;

  const today = new Date();
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const expiration = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(expiration.getTime())) return null;

  const diffDays = Math.round((expiration.getTime() - current.getTime()) / 86400000);
  if (diffDays < 0) return { status: "expired", days: Math.abs(diffDays) };
  if (diffDays <= 30) return { status: "soon", days: diffDays };
  return null;
}

function getExpirationAlerts() {
  return state.inventory
    .filter((item) => item.active !== "NO")
    .map((item) => ({ item, meta: getExpirationMeta(item) }))
    .filter((entry) => entry.meta)
    .sort((a, b) => {
      const rank = { expired: 0, soon: 1 };
      return rank[a.meta.status] - rank[b.meta.status] || a.meta.days - b.meta.days;
    });
}

function getExpirationBadge(meta) {
  if (!meta) return { className: "neutral", label: "Sin fecha" };
  if (meta.status === "expired") return { className: "expired", label: "Vencido" };
  if (meta.status === "soon") return { className: "soon", label: "PrÃ³ximo" };
  return { className: "ok", label: "Vigente" };
}

function getInventoryTableFilters() {
  return {
    search: document.getElementById("inventorySearchInput")?.value.trim().toLowerCase() || "",
    expiration: document.getElementById("inventoryExpirationFilter")?.value || "all",
    batch: document.getElementById("inventoryBatchFilter")?.value.trim().toLowerCase() || "",
    laboratory: document.getElementById("inventoryLaboratoryFilter")?.value.trim().toLowerCase() || ""
  };
}

function matchesInventoryFilters(item, filters) {
  const meta = getExpirationMeta(item);
  const badge = getExpirationBadge(meta);
  const matchesSearch = !filters.search || [
    item.name,
    item.sku,
    item.barcode,
    item.batch,
    item.laboratory
  ].some((value) => String(value || "").toLowerCase().includes(filters.search));
  const matchesBatch = !filters.batch || String(item.batch || "").toLowerCase().includes(filters.batch);
  const matchesLaboratory = !filters.laboratory || String(item.laboratory || "").toLowerCase().includes(filters.laboratory);

  let matchesExpiration = true;
  if (filters.expiration === "expired") matchesExpiration = meta?.status === "expired";
  if (filters.expiration === "soon") matchesExpiration = meta?.status === "soon";
  if (filters.expiration === "valid") matchesExpiration = !!item.expirationDate && !meta;
  if (filters.expiration === "none") matchesExpiration = !item.expirationDate;

  return matchesSearch && matchesBatch && matchesLaboratory && matchesExpiration;
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Tiempo de espera agotado al conectar con Google Apps Script.");
    }
    if (error instanceof TypeError) {
      throw new Error("No fue posible conectar con Google Apps Script.");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function normalizeCategory(category) {
  const value = String(category || "").trim().toLowerCase();
  if (value.includes("analg")) return "analgesico";
  if (value.includes("vit")) return "vitamina";
  if (value.includes("cuid")) return "cuidado";
  if (value.includes("derm")) return "cuidado";
  return value || "general";
}

function getCategoryLabel(category) {
  const labels = {
    analgesico: "Analgésicos",
    vitamina: "Vitaminas",
    cuidado: "Cuidado",
    general: "General"
  };
  return labels[category] || category;
}

function getProductIcon(category) {
  const icons = {
    analgesico: "bi-capsule-pill",
    vitamina: "bi-heart-pulse",
    cuidado: "bi-bandaid",
    general: "bi-box-seam"
  };
  return icons[category] || icons.general;
}

function normalizeInventoryImage(value) {
  return String(value || "").trim();
}

function getInventoryImageSrc(item) {
  return normalizeInventoryImage(
    item?.imagen_url
    || item?.image_url
    || item?.imageUrl
    || item?.imagen
    || item?.image
    || item?.foto
  );
}

function renderProductVisual(item, options = {}) {
  const imageUrl = getInventoryImageSrc(item);
  const className = options.className || "product-visual";
  const label = escapeHtml(item?.name || item?.nombre || item?.sku || "Producto");
  if (imageUrl) {
    return `<div class="${className}"><img src="${escapeHtml(imageUrl)}" alt="${label}"></div>`;
  }
  return `<div class="${className} product-icon"><i class="bi ${getProductIcon(normalizeCategory(item?.category || item?.categoria))}"></i></div>`;
}

function normalizeInventoryItem(item, index) {
  const name = repairMojibake(item.nombre || item.name || "").trim();
  const sku = repairMojibake(item.sku || "").trim() || `FP-${String(index + 1).padStart(3, "0")}`;
  const category = normalizeCategory(item.categoria || item.category);
  const price = Number(item.precio ?? item.price ?? 0);
  const stock = Number(item.stock ?? 0);
  const batch = repairMojibake(item.lote || item.batch || "").trim();
  const expirationDate = normalizeInputDateValue(item.fecha_vencimiento || item.expiration_date || "");
  const laboratory = repairMojibake(item.laboratorio || item.lab || "").trim();
  const barcode = repairMojibake(item.codigo_barras || item.barcode || "").trim();
  const description = repairMojibake(item.descripcion || DEFAULT_DESCRIPTIONS[name] || "Producto disponible").trim();
  const active = String(item.activo || item.active || "SI").trim().toUpperCase();
  const imageUrl = getInventoryImageSrc(item);

  return {
    id: String(item.id || name || sku).trim() || crypto.randomUUID(),
    name: name || sku,
    category,
    price: Number.isFinite(price) ? price : 0,
    stock: Number.isFinite(stock) ? stock : 0,
    sku,
    batch,
    expirationDate,
    laboratory,
    barcode,
    description,
    active: active === "NO" ? "NO" : "SI",
    imageUrl
  };
}

const initialInventory = [];

function normalizeClientRecord(client) {
  return {
    id: String(client?.id || crypto.randomUUID()).trim(),
    name: repairMojibake(client?.name || "Cliente general").trim(),
    document: repairMojibake(client?.document || "").trim(),
    phone: repairMojibake(client?.phone || "").trim(),
    purchases: Number(client?.purchases || 0),
    points: Number(client?.points || 0),
    totalSpent: Number(client?.totalSpent || 0),
    active: String(client?.active || client?.activo || "SI").trim().toUpperCase() === "NO" ? "NO" : "SI"
  };
}

function normalizeSupplierRecord(supplier) {
  return {
    id: String(supplier?.id || crypto.randomUUID()).trim(),
    name: repairMojibake(supplier?.name || supplier?.nombre || "").trim(),
    document: repairMojibake(supplier?.document || supplier?.documento || supplier?.nit || "").trim(),
    phone: repairMojibake(supplier?.phone || supplier?.telefono || "").trim(),
    contact: repairMojibake(supplier?.contact || supplier?.contacto || "").trim(),
    city: repairMojibake(supplier?.city || supplier?.ciudad || "").trim(),
    notes: repairMojibake(supplier?.notes || supplier?.notas || "").trim(),
    active: String(supplier?.active || supplier?.activo || "SI").trim().toUpperCase() === "NO" ? "NO" : "SI"
  };
}

function normalizePurchaseRecord(purchase) {
  return {
    id: String(purchase?.id || crypto.randomUUID()).trim(),
    supplierId: String(purchase?.supplierId || purchase?.supplier_id || "").trim(),
    supplierName: String(purchase?.supplierName || purchase?.supplier_name || purchase?.proveedor || "").trim(),
    inventoryItemId: String(purchase?.inventoryItemId || purchase?.inventory_item_id || purchase?.inventario_id || "").trim(),
    productName: String(purchase?.productName || purchase?.product_name || purchase?.producto || "").trim(),
    sku: String(purchase?.sku || "").trim(),
    quantity: Number(purchase?.quantity || purchase?.cantidad || 0),
    unitCost: Number(purchase?.unitCost || purchase?.unit_cost || purchase?.costo_unitario || 0),
    total: Number(purchase?.total || (Number(purchase?.quantity || 0) * Number(purchase?.unitCost || 0))),
    batch: String(purchase?.batch || purchase?.lote || "").trim(),
    date: normalizeInputDateValue(purchase?.date || purchase?.fecha || new Date()),
    notes: String(purchase?.notes || purchase?.notas || "").trim(),
    createdAt: String(purchase?.createdAt || purchase?.creado_en || new Date().toISOString()).trim()
  };
}

function normalizeReturnRecord(entry) {
  return {
    id: String(entry?.id || crypto.randomUUID()).trim(),
    saleId: String(entry?.saleId || entry?.sale_id || "").trim(),
    saleLineId: String(entry?.saleLineId || entry?.sale_line_id || entry?.detalle_venta_id || "").trim(),
    ticketNumber: String(entry?.ticketNumber || entry?.ticket_numero || "").trim(),
    clientName: String(entry?.clientName || entry?.cliente_nombre || "").trim(),
    inventoryItemId: String(entry?.inventoryItemId || entry?.inventory_item_id || entry?.inventario_id || "").trim(),
    productName: String(entry?.productName || entry?.producto_nombre || "").trim(),
    quantity: Number(entry?.quantity || entry?.cantidad || 0),
    unitPrice: Number(entry?.unitPrice || entry?.precio_unitario || 0),
    total: Number(entry?.total || 0),
    reason: String(entry?.reason || entry?.motivo || "").trim(),
    restock: String(entry?.restock || entry?.repone_stock || "SI").trim().toUpperCase() === "NO" ? "NO" : "SI",
    date: normalizeInputDateValue(entry?.date || entry?.fecha || new Date()),
    createdAt: String(entry?.createdAt || entry?.creado_en || new Date().toISOString()).trim(),
    processedBy: String(entry?.processedBy || entry?.procesado_por || "").trim()
  };
}

function normalizePromotionRecord(entry) {
  return {
    id: String(entry?.id || crypto.randomUUID()).trim(),
    name: String(entry?.name || entry?.nombre || "").trim(),
    scope: String(entry?.scope || entry?.alcance || "product").trim().toLowerCase(),
    targetValue: String(entry?.targetValue || entry?.target_value || entry?.objetivo || "").trim(),
    discountType: String(entry?.discountType || entry?.discount_type || entry?.tipo_descuento || "percent").trim().toLowerCase(),
    discountValue: Number(entry?.discountValue || entry?.discount_value || entry?.valor_descuento || 0),
    active: String(entry?.active || entry?.activo || "SI").trim().toUpperCase() === "NO" ? "NO" : "SI"
  };
}

function normalizeAuditLogRecord(entry) {
  return {
    id: String(entry?.id || crypto.randomUUID()).trim(),
    module: String(entry?.module || entry?.modulo || "general").trim().toLowerCase(),
    action: String(entry?.action || entry?.accion || "actualizar").trim().toLowerCase(),
    entityId: String(entry?.entityId || entry?.entity_id || "").trim(),
    entityName: String(entry?.entityName || entry?.entity_name || "").trim(),
    detail: String(entry?.detail || entry?.detalle || "").trim(),
    user: String(entry?.user || entry?.usuario || "Sistema").trim(),
    username: String(entry?.username || entry?.usuario_login || "").trim(),
    createdAt: String(entry?.createdAt || entry?.creado_en || new Date().toISOString()).trim()
  };
}

function normalizeUserAdminRecord(user) {
  const normalizedRole = String(user?.role || "").trim().toLowerCase();
  return {
    id: String(user?.id || "").trim(),
    companyId: String(user?.companyId || "").trim(),
    name: String(user?.name || "").trim(),
    username: String(user?.username || "").trim(),
    password: "",
    role: ["admin", "operador", "admin_empresa", "supervisor", "cajero"].includes(normalizedRole)
      ? normalizedRole
      : "cajero",
    active: String(user?.active || "SI").trim().toUpperCase() === "NO" ? "NO" : "SI",
    createdAt: String(user?.createdAt || "").trim()
  };
}

function calculateLoyaltyPointsFromTotal(total) {
  return Math.max(0, Math.floor(Number(total || 0) / LOYALTY_POINTS_PER_COP));
}

function calculateLoyaltyDiscountFromPoints(points) {
  return Math.max(0, Number(points || 0) * LOYALTY_REDEMPTION_VALUE_PER_POINT);
}

const initialClients = [
  { id: crypto.randomUUID(), name: "Cliente general", document: "222222222", phone: "", purchases: 0 }
];

const normalizedInitialClients = initialClients.map(normalizeClientRecord);
const initialSuppliers = [];
const initialPurchases = [];
const initialReturns = [];
const initialPromotions = [];
const initialAuditLogs = [];
const RELEASE_NOTES_ITEMS = [
  {
    date: "1 de abril de 2026",
    title: "Accesos mas compactos",
    detail: "Se redujo el alto del login principal y del acceso interno para aprovechar mejor la pantalla."
  },
  {
    date: "1 de abril de 2026",
    title: "Version visible en accesos",
    detail: "El login principal y el acceso interno ahora muestran la version actual de la app."
  },
  {
    date: "1 de abril de 2026",
    title: "Animaciones de entrada",
    detail: "Se agrego una apertura visual mas profesional para login, dashboard y modulos principales."
  },
  {
    date: "1 de abril de 2026",
    title: "Nueva paleta visual",
    detail: "La interfaz adopto azul oscuro, verde limon, amarillo dorado y azul aqua como identidad."
  }
];

const state = {
  inventory: loadData(STORAGE_KEYS.inventory, initialInventory),
  clients: loadData(STORAGE_KEYS.clients, normalizedInitialClients).map(normalizeClientRecord),
  suppliers: loadData(STORAGE_KEYS.suppliers, initialSuppliers).map(normalizeSupplierRecord),
  purchases: loadData(STORAGE_KEYS.purchases, initialPurchases).map(normalizePurchaseRecord),
  returns: loadData(STORAGE_KEYS.returns, initialReturns).map(normalizeReturnRecord),
  promotions: loadData(STORAGE_KEYS.promotions, initialPromotions).map(normalizePromotionRecord),
  auditLogs: loadData(STORAGE_KEYS.auditLogs, initialAuditLogs).map(normalizeAuditLogRecord),
  sales: loadData(STORAGE_KEYS.sales, []),
  cashClosures: loadData(STORAGE_KEYS.cashClosures, []),
  cashWithdrawals: [],
  cashClosureDraft: normalizeCashClosureDraft(loadData(STORAGE_KEYS.cashClosureDraft, getDefaultCashClosureDraft())),
  editingCashClosureId: "",
  cashClosureEditorBackup: null,
  editingWithdrawalId: "",
  lastTicketHtml: browserStorage.getItem(STORAGE_KEYS.lastTicket) || "",
  cart: new Map(),
  redeemedPoints: 0,
  selectedClientId: "",
  reportPeriod: "day",
  inventorySyncMeta: loadSyncMeta(),
  pharmacyProfile: normalizePharmacyProfile((() => {
    try {
      return JSON.parse(persistentStorage.getItem(STORAGE_KEYS.pharmacyProfile) || "null") || getDefaultPharmacyProfile();
    } catch {
      return getDefaultPharmacyProfile();
    }
  })()),
  dianConfig: normalizeDianConfig((() => {
    try {
      return JSON.parse(persistentStorage.getItem(STORAGE_KEYS.dianConfig) || "null") || getDefaultDianConfig();
    } catch {
      return getDefaultDianConfig();
    }
  })()),
  dianTestResult: normalizeDianTestResult((() => {
    try {
      return JSON.parse(persistentStorage.getItem(STORAGE_KEYS.dianTestResult) || "null") || getDefaultDianTestResult();
    } catch {
      return getDefaultDianTestResult();
    }
  })()),
  printerPreferences: normalizePrinterPreferences((() => {
    try {
      return JSON.parse(persistentStorage.getItem(STORAGE_KEYS.printerPreferences) || "null") || getDefaultPrinterPreferences();
    } catch {
      return getDefaultPrinterPreferences();
    }
  })()),
  availablePrinters: [],
  availablePrintersLoaded: false,
  users: [],
  usersLoaded: false,
  usersLoading: false,
  usersError: "",
  licensingCompanies: [],
  licensingLicenses: [],
  licensingDevices: [],
  licensingHistory: [],
  licensingLoaded: false,
  licensingLoading: false,
  licensingError: "",
  supportTickets: [],
  supportMessages: [],
  supportSelectedTicketId: "",
  supportUnreadCompanyTotal: 0,
  supportUnreadInternalTotal: 0,
  supportLoaded: false,
  supportLoading: false,
  supportError: "",
  editingUserId: "",
  editingCompanyId: "",
  editingLicenseId: "",
  settingsProfileDirty: false,
  expirationModalShown: false
};

state.selectedClientId = state.clients[0]?.id || "";

const sessionState = loadData(STORAGE_KEYS.session, null);
const licenseState = loadData(STORAGE_KEYS.license, null);

function getCurrentLicenseState() {
  return loadData(STORAGE_KEYS.license, licenseState);
}

function getLicenseUiSummary() {
  const currentLicense = getCurrentLicenseState();
  const planLabel = getLicensePlanLabel(currentLicense?.plan || "ANUAL");
  const expiresAt = String(currentLicense?.expiresAt || "").trim();
  if (!expiresAt) {
    return {
      code: String(currentLicense?.code || "").trim() || "--",
      planLabel,
      statusLabel: "Sin licencia",
      remainingLabel: "--",
      cutoffLabel: "--"
    };
  }

  const expirationDate = new Date(expiresAt);
  if (Number.isNaN(expirationDate.getTime())) {
    return {
      code: String(currentLicense?.code || "").trim() || "--",
      planLabel,
      statusLabel: "Licencia invalida",
      remainingLabel: "--",
      cutoffLabel: "--"
    };
  }

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const expiryStart = new Date(expirationDate.getFullYear(), expirationDate.getMonth(), expirationDate.getDate());
  const diffDays = Math.ceil((expiryStart.getTime() - todayStart.getTime()) / (24 * 60 * 60 * 1000));

  let statusLabel = "Activa";
  let remainingLabel = "";

  if (diffDays < 0) {
    statusLabel = "Vencida";
    remainingLabel = `Vencio hace ${Math.abs(diffDays)} dia(s)`;
  } else if (diffDays === 0) {
    statusLabel = "Corte hoy";
    remainingLabel = "Se vence hoy";
  } else if (diffDays === 1) {
    remainingLabel = "1 dia restante";
  } else {
    remainingLabel = `${diffDays} dias restantes`;
  }

  return {
    code: String(currentLicense?.code || "").trim() || "--",
    planLabel,
    statusLabel,
    remainingLabel,
    cutoffLabel: formatSessionDateTime(expirationDate.toISOString())
  };
}

function isInternalSupportSession() {
  return isAdminSession();
}

function getSupportScope() {
  return isInternalSupportSession() ? "INTERNO" : "EMPRESA";
}

function getSupportCompanyIdentifier() {
  const sessionCompanyId = String(sessionState?.companyId || "").trim();
  if (sessionCompanyId) return sessionCompanyId;

  const currentLicense = getCurrentLicenseState();
  const licenseCode = String(currentLicense?.code || "").trim();
  if (licenseCode) return `license:${licenseCode}`;

  const profile = normalizePharmacyProfile(state.pharmacyProfile);
  const profileName = String(profile.name || "").trim();
  if (profileName) return `company:${profileName.toLowerCase().replace(/\s+/g, "-")}`;

  const username = String(sessionState?.username || sessionState?.user || "").trim();
  return username ? `user:${username.toLowerCase()}` : "";
}

function getSupportUnreadCount() {
  return isInternalSupportSession()
    ? Number(state.supportUnreadInternalTotal || 0)
    : Number(state.supportUnreadCompanyTotal || 0);
}

function getSupportStatusLabel(status) {
  const normalized = String(status || "").trim().toUpperCase();
  if (normalized === "EN_PROCESO") return "En proceso";
  if (normalized === "RESUELTO") return "Resuelto";
  if (normalized === "CERRADO") return "Cerrado";
  return "Abierto";
}

function getSupportStatusClass(status) {
  const normalized = String(status || "").trim().toUpperCase();
  if (normalized === "EN_PROCESO") return "is-progress";
  if (normalized === "RESUELTO" || normalized === "CERRADO") return "is-closed";
  return "is-open";
}

function normalizeLicensePlanValue(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized.includes("QUINC")) return "QUINCENAL";
  if (normalized.includes("MENS")) return "MENSUAL";
  return "ANUAL";
}

function calculateLicenseExpiryByPlan(plan, fromDate = new Date()) {
  const baseDate = fromDate instanceof Date ? new Date(fromDate.getTime()) : new Date(fromDate);
  if (Number.isNaN(baseDate.getTime())) {
    return "";
  }

  const normalizedPlan = normalizeLicensePlanValue(plan);
  if (normalizedPlan === "QUINCENAL") {
    baseDate.setDate(baseDate.getDate() + 15);
  } else if (normalizedPlan === "MENSUAL") {
    baseDate.setMonth(baseDate.getMonth() + 1);
  } else {
    baseDate.setFullYear(baseDate.getFullYear() + 1);
  }

  return baseDate.toISOString().slice(0, 10);
}

function normalizeLicenseCodeValue(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function generateRobustLicenseCodeValue(companyName = "", plan = "ANUAL") {
  const companyToken = normalizeLicenseCodeValue(companyName).replaceAll("-", "").slice(0, 6) || "NUBEFA";
  const normalizedPlan = normalizeLicensePlanValue(plan);
  const planToken = normalizedPlan === "QUINCENAL" ? "QNC" : normalizedPlan === "MENSUAL" ? "MEN" : "ANL";
  const yearToken = new Date().getFullYear();
  const entropyToken = crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  return normalizeLicenseCodeValue(`LIC-${companyToken}-${planToken}-${yearToken}-${entropyToken}`);
}

function isSessionExpired(session) {
  const loginAt = String(session?.loginAt || "").trim();
  if (!loginAt) return true;
  const sessionDate = new Date(loginAt);
  if (Number.isNaN(sessionDate.getTime())) return true;
  return Date.now() - sessionDate.getTime() > SESSION_MAX_AGE_MS;
}

if (!sessionState?.user) {
  saveAuthDebug("dashboard_redirect_no_session", {
    sessionState,
    licenseState
  });
  window.location.href = "pos.html";
  throw new Error("SesiÃ³n no iniciada.");
}

if (isSessionExpired(sessionState)) {
  browserStorage.removeItem(STORAGE_KEYS.session);
  browserStorage.removeItem(STORAGE_KEYS.license);
  saveAuthDebug("dashboard_redirect_session_expired", {
    sessionState,
    licenseState
  });
  window.location.href = "pos.html";
  throw new Error("Sesion expirada.");
}

if (!["admin", "operador"].includes(String(sessionState?.role || "").trim().toLowerCase()) && !licenseState?.code) {
  browserStorage.removeItem(STORAGE_KEYS.session);
  saveAuthDebug("dashboard_redirect_no_license", {
    sessionState,
    licenseState
  });
  window.location.href = "pos.html";
  throw new Error("Licencia no validada.");
}

function getNormalizedSessionRole() {
  const username = String(sessionState?.username || "").trim().toLowerCase();
  let role = String(sessionState?.role || "").trim().toLowerCase();
  const sessionCompanyId = String(sessionState?.companyId || "").trim();
  const sessionLicenseCode = String(licenseState?.code || "").trim();
  const hasCompanyContext = Boolean(sessionCompanyId || sessionLicenseCode);
  const isGlobalAdminUser = ["admin", "administrador", "operador"].includes(username);

  if (!role) {
    role = username === "admin" || username === "supervisor" ? "admin" : "cajero";
  }

  if (role.includes("operador")) return "operador";
  if (
    role.includes("admin_empresa") ||
    role.includes("empresa") ||
    role.includes("farmacia") ||
    role.includes("sucursal") ||
    role.includes("negocio") ||
    role.includes("local")
  ) {
    return "admin_empresa";
  }
  if (role.includes("admin")) {
    if (hasCompanyContext && !isGlobalAdminUser) {
      return "admin_empresa";
    }
    return "admin";
  }
  if (role.includes("super")) return "supervisor";
  if (role.includes("caj") || role.includes("cash") || role.includes("user") || role.includes("usuario") || role.includes("caja")) return "cajero";
  if (role === "admin" || role === "supervisor" || role === "cajero") return role;
  return "cajero";
}

function isAdminSession() {
  return ["admin", "operador"].includes(getNormalizedSessionRole());
}

function canEditCompanyProfile() {
  return isAdminSession() || getNormalizedSessionRole() === "admin_empresa";
}

function canAccessSettingsPage() {
  return ["admin", "operador", "admin_empresa"].includes(getNormalizedSessionRole());
}

function isEditingSettingsProfile() {
  return document.body.dataset.page === "settings" && state.settingsProfileDirty;
}

function shouldAutoSyncSettingsProfile() {
  return document.body.dataset.page !== "settings";
}

function getDesktopCompanyPayload(payload = {}) {
  const sessionCompanyId = String(sessionState?.companyId || "").trim();
  if (sessionCompanyId) {
    return {
      ...payload,
      companyId: sessionCompanyId
    };
  }

  const currentLicense = getCurrentLicenseState();
  const licenseCompanyId = String(currentLicense?.companyId || currentLicense?.licenseCompanyId || "").trim();
  if (licenseCompanyId) {
    return {
      ...payload,
      companyId: licenseCompanyId
    };
  }

  return { ...payload };
}

async function addAuditLog(entry) {
  const payload = normalizeAuditLogRecord({
    ...entry,
    user: entry?.user || sessionState?.user || "Sistema",
    username: entry?.username || sessionState?.username || "",
    createdAt: entry?.createdAt || new Date().toISOString()
  });

  if (isDesktopDbEnabled() && desktopDb.addAuditLog) {
    try {
      const logs = await desktopDb.addAuditLog(getDesktopCompanyPayload(payload));
      state.auditLogs = Array.isArray(logs) ? logs.map(normalizeAuditLogRecord) : state.auditLogs;
      saveData();
      return payload;
    } catch (error) {
      console.warn("No fue posible registrar la auditoria en MariaDB:", error);
    }
  }

  state.auditLogs.unshift(payload);
  state.auditLogs = state.auditLogs.slice(0, 500);
  saveData();
  return payload;
}

function getCurrentPageFileName() {
  const path = window.location.pathname || "";
  const parts = path.split("/").filter(Boolean);
  return (parts.pop() || "dashboard.html").toLowerCase();
}

function getLinkFileName(href) {
  if (!href || href.startsWith("#") || href.startsWith("javascript:")) return "";
  const cleanHref = href.split("#")[0].split("?")[0];
  const parts = cleanHref.split("/").filter(Boolean);
  return (parts.pop() || "").toLowerCase();
}

function getAllowedPagesByRole(role) {
  if (role === "admin" || role === "operador") return null;

  if (role === "admin_empresa") {
    return new Set([
      "dashboard.html",
      "ventas.html",
      "historico-ventas.html",
      "retiros-caja.html",
      "cierre-caja.html",
      "inventario.html",
      "proveedores.html",
      "compras.html",
      "promociones.html",
      "backups.html",
      "auditoria.html",
      "clientes.html",
      "reportes.html",
      "soporte.html",
      "configuracion.html"
    ]);
  }

  if (role === "supervisor") {
    return new Set([
      "dashboard.html",
      "ventas.html",
      "historico-ventas.html",
      "retiros-caja.html",
      "cierre-caja.html",
      "inventario.html",
      "proveedores.html",
      "compras.html",
      "promociones.html",
      "backups.html",
      "auditoria.html",
      "clientes.html",
      "reportes.html",
      "soporte.html"
    ]);
  }

  return new Set([
    "dashboard.html",
    "ventas.html",
    "historico-ventas.html",
    "retiros-caja.html",
    "cierre-caja.html"
  ]);
}

function applyRolePermissions() {
  const role = getNormalizedSessionRole();
  const allowedPages = getAllowedPagesByRole(role);
  const currentPage = getCurrentPageFileName();

  if (!allowedPages) {
    document.body.dataset.userRole = role;
    return;
  }

  if (!allowedPages.has(currentPage)) {
    window.location.href = "dashboard.html";
    return;
  }

  document.body.dataset.userRole = role;

  document.querySelectorAll("a[href]").forEach((link) => {
    const fileName = getLinkFileName(link.getAttribute("href"));
    if (!fileName || allowedPages.has(fileName)) return;

    const container = link.closest(".shortcut-card, .dashboard-badge") || link;
    container.style.display = "none";
  });
}

function renderSupportNavBadge() {
  const unreadCount = getSupportUnreadCount();
  document.querySelectorAll('.app-nav a[href="soporte.html"]').forEach((link) => {
    let badge = link.querySelector(".support-nav-badge");
    if (!badge && unreadCount > 0) {
      badge = document.createElement("span");
      badge.className = "support-nav-badge";
      link.appendChild(badge);
    }

    if (!badge) return;
    if (unreadCount <= 0) {
      badge.remove();
      return;
    }

    badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
  });
}

state.cashClosures = Array.isArray(state.cashClosures) ? state.cashClosures.map(normalizeCashClosureRecord) : [];
state.cashWithdrawals = Array.isArray(state.cashWithdrawals) ? state.cashWithdrawals.map(normalizeCashWithdrawalRecord) : [];
browserStorage.removeItem(STORAGE_KEYS.cashWithdrawals);
saveCashClosureDraft();

function getSelectedClient() {
  return state.clients.find((client) => client.id === state.selectedClientId && client.active !== "NO")
    || state.clients.find((client) => client.active !== "NO")
    || state.clients[0]
    || null;
}

function getCartPricing() {
  const items = Array.from(state.cart.values()).map((item) => {
    const originalSubtotal = Number(item.price || 0) * Number(item.quantity || 0);
    const { promotion, discount } = getPromotionDiscountAmount(item, item.quantity);
    return {
      ...item,
      originalSubtotal,
      promoDiscount: discount,
      lineTotal: Math.max(0, originalSubtotal - discount),
      promotionId: promotion?.id || "",
      promotionName: promotion?.name || "",
      promotionDiscountType: promotion?.discountType || "",
      promotionDiscountValue: Number(promotion?.discountValue || 0)
    };
  });
  const subtotal = items.reduce((sum, item) => sum + item.originalSubtotal, 0);
  const promoDiscount = items.reduce((sum, item) => sum + item.promoDiscount, 0);
  const taxableSubtotal = Math.max(0, subtotal - promoDiscount);
  const tax = Math.round(taxableSubtotal * TAX_RATE);
  const grossTotal = taxableSubtotal + tax;
  const selectedClient = getSelectedClient();
  const availablePoints = Math.max(0, Number(selectedClient?.points || 0));
  const maxRedeemablePoints = Math.min(availablePoints, grossTotal);
  const redeemedPoints = Math.max(0, Math.min(Number(state.redeemedPoints || 0), maxRedeemablePoints));
  const loyaltyDiscount = calculateLoyaltyDiscountFromPoints(redeemedPoints);
  const total = Math.max(0, grossTotal - loyaltyDiscount);

  return {
      items,
      subtotal,
      promoDiscount,
      taxableSubtotal,
      tax,
      grossTotal,
    availablePoints,
    redeemedPoints,
    loyaltyDiscount,
    total
  };
}

function formatSessionDateTime(iso) {
  if (!iso) return "--";
  const date = new Date(iso);
  return `${date.toLocaleDateString("es-CO")} ${date.toLocaleTimeString("es-CO", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

function getSessionRoleLabel() {
  const role = getNormalizedSessionRole();
  if (role === "operador") return "Operador";
  if (role === "supervisor") return "Supervisor";
  if (role === "admin_empresa") return "Administrador de farmacia";
  if (role === "admin") return "Administrador";
  return "Cajero";
}

function renderSessionInfo() {
  ensureOperationsNavigation();
  ensureAdminNavigation();
  const detectedRole = getSessionRoleLabel();
  const roleLabel = ["Administrador", "Operador", "Administrador de farmacia", "Supervisor", "Cajero"].includes(detectedRole) ? detectedRole : "Cajero";

  document.querySelectorAll("#sessionUser").forEach((element) => {
    element.textContent = sessionState.user;
  });
  document.querySelectorAll("#sessionLoginAt").forEach((element) => {
    element.textContent = formatSessionDateTime(sessionState.loginAt);
  });
  document.querySelectorAll("[data-session-role]").forEach((element) => {
    element.textContent = roleLabel;
  });

  document.querySelectorAll(".sidebar-session").forEach((container) => {
    let roleNode = container.querySelector("[data-session-role-sidebar]");
    if (!roleNode) {
      roleNode = document.createElement("small");
      roleNode.setAttribute("data-session-role-sidebar", "true");
      container.insertBefore(roleNode, container.querySelector("#sessionLoginAt") || null);
    }
    roleNode.textContent = `Rol: ${roleLabel}`;
  });

  document.querySelectorAll(".dashboard-session-bar").forEach((bar) => {
    if (bar.querySelector("[data-session-role]")) return;

    const chip = document.createElement("div");
    chip.className = "session-chip";
    chip.innerHTML = `
      <span class="session-chip-label">Rol</span>
      <strong data-session-role="true">${escapeHtml(roleLabel)}</strong>
    `;

    const firstAction = bar.querySelector("a.btn, button.btn");
    if (firstAction) {
      bar.insertBefore(chip, firstAction);
    } else {
      bar.appendChild(chip);
    }
  });

  document.getElementById("logoutButton")?.addEventListener("click", () => {
    browserStorage.removeItem(STORAGE_KEYS.session);
    window.location.href = "pos.html";
  });
}

function ensureTopbarActionHost() {
  const topbar = document.querySelector(".app-topbar");
  if (!topbar) return null;

  const existingHost = topbar.querySelector(".dashboard-session-bar, .sales-topbar-actions, .app-topbar-side");
  if (existingHost) return existingHost;

  let titleBlock = topbar.firstElementChild;
  if (!(titleBlock instanceof HTMLElement)) {
    titleBlock = document.createElement("div");
    topbar.prepend(titleBlock);
  }
  titleBlock.classList.add("app-topbar-copy");

  const side = document.createElement("div");
  side.className = "app-topbar-side";
  topbar.appendChild(side);
  return side;
}

function ensureReleaseNotesCenter() {
  const topbar = document.querySelector(".app-topbar");
  if (!topbar || document.getElementById("releaseNotesToggle")) return;

  const actionsHost = ensureTopbarActionHost();
  if (!actionsHost) return;

  const shell = document.createElement("div");
  shell.className = "release-notes-shell";
  shell.innerHTML = `
    <button class="release-notes-toggle" id="releaseNotesToggle" type="button" aria-label="Ver novedades y actualizaciones" aria-expanded="false">
      <i class="bi bi-bell"></i>
      <span class="release-notes-badge">${RELEASE_NOTES_ITEMS.length}</span>
    </button>
    <div class="release-notes-popover" id="releaseNotesPopover" hidden>
      <div class="release-notes-head">
        <div>
          <strong>Novedades</strong>
          <span>Actualizaciones recientes de la app</span>
        </div>
      </div>
      <div class="release-notes-list">
        ${RELEASE_NOTES_ITEMS.map((item) => `
          <article class="release-note-item">
            <small>${escapeHtml(item.date)}</small>
            <strong>${escapeHtml(item.title)}</strong>
            <p>${escapeHtml(item.detail)}</p>
          </article>
        `).join("")}
      </div>
    </div>
  `;

  actionsHost.appendChild(shell);

  const toggle = shell.querySelector("#releaseNotesToggle");
  const popover = shell.querySelector("#releaseNotesPopover");
  if (!toggle || !popover) return;

  const closePopover = () => {
    popover.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  };
  const openPopover = () => {
    popover.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
  };

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    if (popover.hidden) {
      openPopover();
      return;
    }
    closePopover();
  });

  popover.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", closePopover);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePopover();
  });
}

async function renderTopbarSystemStatus() {
  const topbar = document.querySelector(".app-topbar");
  if (!topbar) return;

  const currentPage = String(document.body?.dataset?.page || "").trim().toLowerCase();
  const host = ensureTopbarActionHost();
  if (!host) return;

  let shell = host.querySelector(".system-status-strip");
  if (!shell) {
    shell = document.createElement("div");
    shell.className = "system-status-strip";
    host.prepend(shell);
  }

  const versionLabel = await getSystemVersionLabel();
  const licenseSummary = getLicenseUiSummary();
  const syncMeta = loadSyncMeta();
  const syncLabel = syncMeta?.lastSyncAt
    ? formatSessionDateTime(syncMeta.lastSyncAt)
    : "Pendiente";
  const statusTone = licenseSummary.statusLabel === "Activa"
    ? "is-ok"
    : (licenseSummary.statusLabel === "Sin licencia" || licenseSummary.statusLabel === "Vencida" ? "is-warn" : "is-info");

  shell.innerHTML = `
    <div class="system-status-pill is-info">
      <i class="bi bi-box"></i>
      <div><span>App</span><strong>${escapeHtml(versionLabel)}</strong></div>
    </div>
    <div class="system-status-pill ${statusTone}">
      <i class="bi bi-patch-check"></i>
      <div><span>Licencia</span><strong>${escapeHtml(licenseSummary.statusLabel)}</strong></div>
    </div>
    <div class="system-status-pill is-sync">
      <i class="bi bi-arrow-repeat"></i>
      <div><span>Ultima sync</span><strong>${escapeHtml(syncLabel)}</strong></div>
    </div>
  `;

  if (currentPage === "sales") {
    shell.classList.add("is-sales");
  } else {
    shell.classList.remove("is-sales");
  }
}

function ensureSalesShortcutsUi() {
  if (document.body.dataset.page !== "sales") return;
  if (document.getElementById("salesShortcutsModal")) return;

  const topbarActions = document.querySelector(".sales-topbar-actions");
  if (topbarActions && !document.getElementById("salesShortcutsToggle")) {
    const button = document.createElement("button");
    button.type = "button";
    button.id = "salesShortcutsToggle";
    button.className = "btn btn-outline-secondary sales-shortcuts-trigger";
    button.innerHTML = '<i class="bi bi-keyboard"></i><span>Atajos</span>';
    topbarActions.appendChild(button);
  }

  const shell = document.createElement("div");
  shell.innerHTML = `
    <div class="ticket-modal sales-shortcuts-modal" id="salesShortcutsModal" hidden>
      <div class="ticket-overlay" id="salesShortcutsOverlay"></div>
      <div class="ticket-card sales-shortcuts-card">
        <div class="ticket-head">
          <h2>Atajos de teclado</h2>
          <button class="icon-action" id="closeSalesShortcuts" type="button" aria-label="Cerrar atajos">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
        <div class="sales-shortcuts-grid">
          <div class="sales-shortcut-item"><kbd>Ctrl</kbd><kbd>K</kbd><span>Enfocar busqueda</span></div>
          <div class="sales-shortcut-item"><kbd>F2</kbd><span>Nueva venta</span></div>
          <div class="sales-shortcut-item"><kbd>F4</kbd><span>Cobrar venta</span></div>
          <div class="sales-shortcut-item"><kbd>F6</kbd><span>Vaciar carrito</span></div>
          <div class="sales-shortcut-item"><kbd>Alt</kbd><kbd>C</kbd><span>Ir a cliente</span></div>
          <div class="sales-shortcut-item"><kbd>Alt</kbd><kbd>P</kbd><span>Ir a recibido</span></div>
          <div class="sales-shortcut-item"><kbd>?</kbd><span>Abrir ayuda de atajos</span></div>
          <div class="sales-shortcut-item"><kbd>Esc</kbd><span>Cerrar ventanas</span></div>
        </div>
      </div>
    </div>
  `;
  document.body.append(...shell.children);
}

function setupSalesKeyboardShortcuts() {
  if (document.body.dataset.page !== "sales") return;

  ensureSalesShortcutsUi();
  const modal = document.getElementById("salesShortcutsModal");
  const overlay = document.getElementById("salesShortcutsOverlay");
  const closeButton = document.getElementById("closeSalesShortcuts");
  const toggleButton = document.getElementById("salesShortcutsToggle");

  const closeModal = () => {
    if (modal) modal.hidden = true;
  };
  const openModal = () => {
    if (modal) modal.hidden = false;
  };

  toggleButton?.addEventListener("click", openModal);
  overlay?.addEventListener("click", closeModal);
  closeButton?.addEventListener("click", closeModal);

  if (document.body.dataset.salesShortcutsBound === "true") return;
  document.body.dataset.salesShortcutsBound = "true";

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const isTypingTarget = target instanceof HTMLElement && (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable
    );

    if (event.key === "Escape") {
      closeModal();
      return;
    }

    if (event.key === "?" && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      openModal();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      document.getElementById("salesSearchInput")?.focus();
      return;
    }

    if (isTypingTarget && !(event.altKey && ["c", "p"].includes(event.key.toLowerCase()))) return;

    if (event.key === "F2") {
      event.preventDefault();
      document.getElementById("newSaleButton")?.click();
      return;
    }

    if (event.key === "F4") {
      event.preventDefault();
      document.getElementById("checkoutSale")?.click();
      return;
    }

    if (event.key === "F6") {
      event.preventDefault();
      document.getElementById("clearCart")?.click();
      return;
    }

    if (event.altKey && event.key.toLowerCase() === "c") {
      event.preventDefault();
      document.getElementById("saleClient")?.focus();
      return;
    }

    if (event.altKey && event.key.toLowerCase() === "p") {
      event.preventDefault();
      document.getElementById("cashReceived")?.focus();
    }
  });
}

function isDesktopDbEnabled() {
  return Boolean(desktopDb);
}

async function syncDesktopBootstrapState() {
  if (!isDesktopDbEnabled()) return false;

  try {
    const bootstrap = await desktopDb.bootstrap(getDesktopCompanyPayload());
    if (!bootstrap) return false;

    if (Array.isArray(bootstrap.inventory)) {
      applyRemoteInventoryState(bootstrap.inventory, new Date().toISOString());
    }

    if (Array.isArray(bootstrap.clients)) {
      state.clients = bootstrap.clients.map(normalizeClientRecord);
      state.selectedClientId = state.clients[0]?.id || "";
      saveData();
    }

    if (Array.isArray(bootstrap.suppliers)) {
      state.suppliers = bootstrap.suppliers.map(normalizeSupplierRecord);
      saveData();
    }

    if (Array.isArray(bootstrap.purchases)) {
      state.purchases = bootstrap.purchases.map(normalizePurchaseRecord);
      saveData();
    }

    if (Array.isArray(bootstrap.returns)) {
      state.returns = bootstrap.returns.map(normalizeReturnRecord);
      saveData();
    }

    if (Array.isArray(bootstrap.auditLogs)) {
      state.auditLogs = bootstrap.auditLogs.map(normalizeAuditLogRecord);
      saveData();
    }

    if (Array.isArray(bootstrap.sales)) {
      applyRemoteSalesState(bootstrap.sales);
    }

    if (bootstrap.profile && shouldAutoSyncSettingsProfile()) {
      applyRemotePharmacyProfile(bootstrap.profile);
    }

    if (Array.isArray(bootstrap.withdrawals)) {
      applyRemoteCashWithdrawalsState(bootstrap.withdrawals);
    }

    if (Array.isArray(bootstrap.closures)) {
      applyRemoteCashClosuresState(bootstrap.closures);
    }

    rerenderCurrentPage();
    return true;
  } catch (error) {
    console.error("No fue posible sincronizar desde MySQL/MariaDB:", error);
    return false;
  }
}

function getBrandLogoSrc() {
  const profile = normalizePharmacyProfile(state.pharmacyProfile);
  return profile.logoUrl || DEFAULT_BRAND_LOGO;
}

function getBrandIdentity() {
  if (isAdminSession()) {
    return {
      logoSrc: DEFAULT_INTERNAL_BRAND_LOGO,
      name: "NubeFarma"
    };
  }

  const profile = normalizePharmacyProfile(state.pharmacyProfile);
  return {
    logoSrc: profile.logoUrl || DEFAULT_BRAND_LOGO,
    name: profile.name || "Farma POS"
  };
}

function clampColorChannel(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
}

function hexToRgb(hex) {
  const normalized = String(hex || "").trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  };
}

function rgbToHex(rgb) {
  const toHex = (value) => clampColorChannel(value).toString(16).padStart(2, "0");
  return `#${toHex(rgb?.r)}${toHex(rgb?.g)}${toHex(rgb?.b)}`;
}

function mixRgb(colorA, colorB, ratio = 0.5) {
  const weight = Math.max(0, Math.min(1, Number(ratio) || 0));
  return {
    r: colorA.r + ((colorB.r - colorA.r) * weight),
    g: colorA.g + ((colorB.g - colorA.g) * weight),
    b: colorA.b + ((colorB.b - colorA.b) * weight)
  };
}

function rgbToHsl(rgb) {
  const r = clampColorChannel(rgb?.r) / 255;
  const g = clampColorChannel(rgb?.g) / 255;
  const b = clampColorChannel(rgb?.b) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  let hue = 0;
  let saturation = 0;

  if (delta) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    switch (max) {
      case r:
        hue = ((g - b) / delta) % 6;
        break;
      case g:
        hue = ((b - r) / delta) + 2;
        break;
      default:
        hue = ((r - g) / delta) + 4;
        break;
    }
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  return { hue, saturation, lightness };
}

function toRgbaString(rgb, alpha) {
  return `rgba(${clampColorChannel(rgb?.r)}, ${clampColorChannel(rgb?.g)}, ${clampColorChannel(rgb?.b)}, ${alpha})`;
}

function buildBrandTheme(primaryHex) {
  const paperRgb = { r: 255, g: 255, b: 255 };
  const inkRgb = { r: 25, g: 48, b: 64 };
  const primaryRgb = hexToRgb(primaryHex) || hexToRgb(DEFAULT_BRAND_THEME.primary);
  const primaryDarkRgb = mixRgb(primaryRgb, inkRgb, 0.34);
  const secondaryRgb = mixRgb(primaryRgb, inkRgb, 0.68);

  return {
    primary: rgbToHex(primaryRgb),
    primaryDark: rgbToHex(primaryDarkRgb),
    primarySoft: toRgbaString(primaryRgb, 0.18),
    primaryGradientStart: rgbToHex(primaryRgb),
    primaryGradientEnd: rgbToHex(primaryRgb),
    secondary: rgbToHex(secondaryRgb),
    secondarySoft: toRgbaString(secondaryRgb, 0.18),
    ring: `0 0 0 0.22rem ${toRgbaString(primaryRgb, 0.2)}`,
    bgAccentA: toRgbaString(primaryRgb, 0.04),
    bgAccentB: toRgbaString(secondaryRgb, 0.05),
    authAccentA: toRgbaString(primaryRgb, 0.03),
    authAccentB: toRgbaString(secondaryRgb, 0.04),
    bgBottom: rgbToHex(mixRgb(secondaryRgb, paperRgb, 0.88)),
    authBgBottom: rgbToHex(mixRgb(secondaryRgb, paperRgb, 0.84))
  };
}

function applyBrandTheme(theme = DEFAULT_BRAND_THEME) {
  const root = document.documentElement;
  const activeTheme = { ...DEFAULT_BRAND_THEME, ...(theme || {}) };
  root.style.setProperty("--primary", activeTheme.primary);
  root.style.setProperty("--primary-dark", activeTheme.primaryDark);
  root.style.setProperty("--primary-soft", activeTheme.primarySoft);
  root.style.setProperty("--primary-gradient-start", activeTheme.primaryGradientStart);
  root.style.setProperty("--primary-gradient-end", activeTheme.primaryGradientEnd);
  root.style.setProperty("--secondary", activeTheme.secondary);
  root.style.setProperty("--secondary-soft", activeTheme.secondarySoft);
  root.style.setProperty("--ring", activeTheme.ring);
  root.style.setProperty("--bg-accent-a", activeTheme.bgAccentA);
  root.style.setProperty("--bg-accent-b", activeTheme.bgAccentB);
  root.style.setProperty("--auth-accent-a", activeTheme.authAccentA);
  root.style.setProperty("--auth-accent-b", activeTheme.authAccentB);
  root.style.setProperty("--bg-bottom", activeTheme.bgBottom);
  root.style.setProperty("--auth-bg-bottom", activeTheme.authBgBottom);
}

async function extractBrandThemeFromLogo(logoSrc) {
  return new Promise((resolve) => {
    if (!logoSrc) {
      resolve(DEFAULT_BRAND_THEME);
      return;
    }

    const image = new Image();
    if (!String(logoSrc).startsWith("data:")) {
      image.crossOrigin = "anonymous";
    }

    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          resolve(DEFAULT_BRAND_THEME);
          return;
        }

        const size = 48;
        canvas.width = size;
        canvas.height = size;
        context.drawImage(image, 0, 0, size, size);
        const { data } = context.getImageData(0, 0, size, size);
        const buckets = new Map();

        for (let index = 0; index < data.length; index += 16) {
          const alpha = data[index + 3];
          if (alpha < 160) continue;

          const rgb = { r: data[index], g: data[index + 1], b: data[index + 2] };
          const hsl = rgbToHsl(rgb);
          if (hsl.saturation < 0.12) continue;
          if (hsl.lightness < 0.16 || hsl.lightness > 0.82) continue;

          const key = [
            Math.round(rgb.r / 24) * 24,
            Math.round(rgb.g / 24) * 24,
            Math.round(rgb.b / 24) * 24
          ].join("-");
          const score = (hsl.saturation * 100) + ((1 - Math.abs(hsl.lightness - 0.5)) * 35);
          buckets.set(key, (buckets.get(key) || 0) + score);
        }

        const dominantEntry = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0];
        if (!dominantEntry) {
          resolve(DEFAULT_BRAND_THEME);
          return;
        }

        const [r, g, b] = dominantEntry[0].split("-").map((value) => Number(value) || 0);
        resolve(buildBrandTheme(rgbToHex({ r, g, b })));
      } catch {
        resolve(DEFAULT_BRAND_THEME);
      }
    };

    image.onerror = () => resolve(DEFAULT_BRAND_THEME);
    image.src = logoSrc;
  });
}

async function applyDynamicBrandTheme(logoSrc) {
  const requestId = ++activeBrandThemeRequestId;
  applyBrandTheme(DEFAULT_BRAND_THEME);
  const theme = await extractBrandThemeFromLogo(logoSrc);
  if (requestId !== activeBrandThemeRequestId) return;
  applyBrandTheme(theme);
}

function applyBrandLogo() {
  const brand = getBrandIdentity();
  const logoSrc = brand.logoSrc;
  const pharmacyName = brand.name;

  document.querySelectorAll(".brand-logo").forEach((image) => {
    applyImageSourceWithFallback(image, logoSrc, DEFAULT_BRAND_LOGO, `Logo ${pharmacyName}`);
  });

  const preview = document.getElementById("pharmacyLogoPreview");
  if (preview) {
    applyImageSourceWithFallback(preview, logoSrc, DEFAULT_BRAND_LOGO, `Vista previa del logo de ${pharmacyName}`);
  }

  applyDynamicBrandTheme(logoSrc);
}

function readImageFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No fue posible leer el archivo de imagen."));
    reader.onload = () => {
      const source = String(reader.result || "");
      const image = new Image();

      image.onerror = () => reject(new Error("No fue posible procesar la imagen seleccionada."));
      image.onload = () => {
        const maxSize = 320;
        const ratio = Math.min(1, maxSize / Math.max(image.width || 1, image.height || 1));
        const width = Math.max(1, Math.round((image.width || 1) * ratio));
        const height = Math.max(1, Math.round((image.height || 1) * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("No fue posible preparar la imagen para guardarla."));
          return;
        }

        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        let output = canvas.toDataURL("image/png");
        if (output.length > 350000) {
          output = canvas.toDataURL("image/jpeg", 0.82);
        }
        if (output.length > 350000) {
          output = canvas.toDataURL("image/jpeg", 0.72);
        }
        if (output.length > 350000) {
          reject(new Error("La imagen sigue siendo demasiado pesada. Usa una mas liviana, idealmente menor a 300 KB."));
          return;
        }

        resolve(output);
      };

      image.src = source;
    };
    reader.readAsDataURL(file);
  });
}

function readProductImageFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No fue posible leer la imagen del producto."));
    reader.onload = () => {
      const source = String(reader.result || "");
      const image = new Image();

      image.onerror = () => reject(new Error("No fue posible procesar la imagen del producto."));
      image.onload = () => {
        const maxSize = 180;
        const ratio = Math.min(1, maxSize / Math.max(image.width || 1, image.height || 1));
        const width = Math.max(1, Math.round((image.width || 1) * ratio));
        const height = Math.max(1, Math.round((image.height || 1) * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("No fue posible preparar la imagen del producto."));
          return;
        }

        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        let output = canvas.toDataURL("image/jpeg", 0.82);
        if (output.length > 220000) {
          output = canvas.toDataURL("image/jpeg", 0.68);
        }
        if (output.length > 220000) {
          output = canvas.toDataURL("image/jpeg", 0.56);
        }
        if (output.length > 220000) {
          reject(new Error("La imagen del producto sigue siendo muy pesada. Usa una foto mas liviana."));
          return;
        }

        resolve(output);
      };

      image.src = source;
    };
    reader.readAsDataURL(file);
  });
}

function getSalesPeriodMeta(period) {
  const now = new Date();
  const today = normalizeInputDateValue(now);
  const currentMonth = today.slice(0, 7);
  const currentYear = today.slice(0, 4);

  if (period === "month") {
    return {
      key: "month",
      label: "Ventas del mes",
      rangeLabel: now.toLocaleDateString("es-CO", { month: "long", year: "numeric" }),
      filter: (sale) => normalizeInputDateValue(sale.date).slice(0, 7) === currentMonth
    };
  }

  if (period === "year") {
    return {
      key: "year",
      label: "Ventas del aÃ±o",
      rangeLabel: currentYear,
      filter: (sale) => normalizeInputDateValue(sale.date).slice(0, 4) === currentYear
    };
  }

  return {
    key: "day",
    label: "Ventas del dia",
    rangeLabel: formatDisplayDate(today),
    filter: (sale) => normalizeInputDateValue(sale.date) === today
  };
}

function buildSalesReportModel(period = state.reportPeriod || "day") {
  const meta = getSalesPeriodMeta(period);
  const sales = getActiveSales().filter(meta.filter);
  const totals = {
    revenue: sales.reduce((sum, sale) => sum + sale.total, 0),
    units: sales.reduce((sum, sale) => sum + sale.items.reduce((acc, item) => acc + item.quantity, 0), 0),
    transactions: sales.length,
    average: sales.length ? Math.round(sales.reduce((sum, sale) => sum + sale.total, 0) / sales.length) : 0
  };

  const paymentSummary = ["Efectivo", "Tarjeta", "Transferencia"].map((method) => ({
    method,
    total: sales.filter((sale) => sale.paymentMethod === method).reduce((sum, sale) => sum + sale.total, 0)
  }));

  return { meta, sales, totals, paymentSummary };
}

function buildSalesReportHtml(period = state.reportPeriod || "day") {
  const report = buildSalesReportModel(period);
  const pharmacy = normalizePharmacyProfile(state.pharmacyProfile);
  const reportCode = `RPT-${String(report.meta.key || "general").toUpperCase()}`;
  const logoBlock = pharmacy.logoUrl
    ? `<img class="report-doc-logo" src="${escapeHtml(pharmacy.logoUrl)}" alt="Logo ${escapeHtml(pharmacy.name || "Farma POS")}">`
    : `<div class="report-doc-logo report-doc-logo-fallback">${escapeHtml((pharmacy.name || "FP").slice(0, 2).toUpperCase())}</div>`;
  const salesRows = report.sales.length
    ? report.sales.map((sale) => `
        <tr>
          <td>${escapeHtml(sale.ticketNumber)}</td>
          <td>${escapeHtml(formatDisplayDate(sale.date))}</td>
          <td>${escapeHtml(sale.time || "--")}</td>
          <td>${escapeHtml(sale.clientName)}</td>
          <td>${sale.items.reduce((sum, item) => sum + item.quantity, 0)}</td>
          <td>${escapeHtml(sale.paymentMethod)}</td>
          <td>${formatCurrency(sale.total)}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="7">No hay ventas registradas para este periodo.</td></tr>`;

  const paymentRows = report.paymentSummary.map((entry) => `
      <div class="report-breakdown-row">
        <span>${escapeHtml(entry.method)}</span>
        <strong>${formatCurrency(entry.total)}</strong>
      </div>
    `).join("");

  return `
    <section class="sales-report-sheet">
      <header class="sales-report-head sales-report-doc-head">
        <div class="sales-report-doc-brand">
          ${logoBlock}
          <div class="sales-report-doc-brand-copy">
            <p class="sales-report-kicker">${escapeHtml(pharmacy.name || "Farma POS")}</p>
            <p class="sales-report-range">${escapeHtml(pharmacy.nit ? `NIT: ${pharmacy.nit}` : "Sistema de facturacion y recaudo")}</p>
            <p class="sales-report-range">${escapeHtml([pharmacy.address, pharmacy.city].filter(Boolean).join(" Â· ") || "Perfil comercial activo")}</p>
          </div>
        </div>

        <div class="sales-report-doc-title">
          <h3>${escapeHtml(report.meta.label)}</h3>
          <p class="sales-report-range">${escapeHtml(report.meta.rangeLabel)}</p>
          <strong>REPORTE CONSOLIDADO DE VENTAS</strong>
        </div>

        <div class="sales-report-stamp sales-report-doc-stamp">
          <span>Cod. ${escapeHtml(reportCode)}</span>
          <strong>${escapeHtml(formatSessionDateTime(new Date().toISOString()))}</strong>
          <small>${escapeHtml([pharmacy.phone, pharmacy.email].filter(Boolean).join(" Â· ") || "Documento generado por FarmaPOS")}</small>
        </div>
      </header>

      <section class="sales-report-summary">
        <article><span>Ingresos</span><strong>${formatCurrency(report.totals.revenue)}</strong></article>
        <article><span>Transacciones</span><strong>${report.totals.transactions}</strong></article>
        <article><span>Unidades</span><strong>${report.totals.units}</strong></article>
        <article><span>Promedio</span><strong>${formatCurrency(report.totals.average)}</strong></article>
      </section>

      <section class="sales-report-breakdown">
        <div class="sales-report-section-title">Metodo de pago</div>
        ${paymentRows}
      </section>

      <section class="sales-report-table-wrap">
        <div class="sales-report-section-title">Detalle de ventas</div>
        <table class="sales-report-table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Fecha</th>
              <th>Hora</th>
              <th>Cliente</th>
              <th>Items</th>
              <th>Pago</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>${salesRows}</tbody>
        </table>
      </section>
    </section>
  `;
}

function buildCashClosureModel() {
  const today = normalizeInputDateValue(new Date());
  const todaySales = getCurrentCashSessionSales().filter((sale) => normalizeInputDateValue(sale.date) === today);
  const cashSales = todaySales.filter((sale) => sale.paymentMethod === "Efectivo").reduce((sum, sale) => sum + sale.total, 0);
  const cardSales = todaySales.filter((sale) => sale.paymentMethod === "Tarjeta").reduce((sum, sale) => sum + sale.total, 0);
  const transferSales = todaySales.filter((sale) => sale.paymentMethod === "Transferencia").reduce((sum, sale) => sum + sale.total, 0);
  const totalSales = todaySales.reduce((sum, sale) => sum + sale.total, 0);
  const units = todaySales.reduce((sum, sale) => sum + sale.items.reduce((acc, item) => acc + item.quantity, 0), 0);
  const withdrawalsTotal = getTodayCashWithdrawalsTotal();
  const openingAmount = Number(state.cashClosureDraft.openingBase || state.cashClosureDraft.openingAmount || 0);
  const countedCash = Number(state.cashClosureDraft.countedCash || 0);
  const expenses = Math.max(0, Math.min(Number(state.cashClosureDraft.expenses || 0), 450000));
  const expectedDrawer = openingAmount + cashSales - withdrawalsTotal - expenses;
  const difference = countedCash - expectedDrawer;
  const closureNumber = String(
    state.cashClosureDraft.closureNumber || `C-${String(state.cashClosures.length + 1).padStart(4, "0")}`
  ).trim();

  return {
    closureNumber,
    date: today,
    label: formatDisplayDate(today),
    sales: todaySales,
    totalSales,
    units,
    transactions: todaySales.length,
    openingAmount,
    countedCash,
    withdrawalsTotal,
    expenses,
    cashSales,
    cardSales,
    transferSales,
    expectedDrawer,
    difference,
    observations: String(state.cashClosureDraft.observations || "").trim()
  };
}

function getCashDrawerStatusLabel() {
  if (!state.cashClosureDraft.isOpen) return "Caja cerrada";
  const openingAmount = Number(state.cashClosureDraft.openingBase || state.cashClosureDraft.openingAmount || 0);
  const openedAt = state.cashClosureDraft.openedAt ? formatSessionDateTime(state.cashClosureDraft.openedAt) : "--";
  return `Caja abierta Â· Base ${formatCurrency(openingAmount)} Â· ${openedAt}`;
}

function isCashDrawerOpen() {
  return !!state.cashClosureDraft.isOpen;
}

function getCurrentCashDrawerAmount() {
  const cashSales = getCurrentCashSessionSales()
    .filter((sale) => sale.paymentMethod === "Efectivo")
    .reduce((sum, sale) => sum + sale.total, 0);
  const openingAmount = Number(state.cashClosureDraft.openingBase || state.cashClosureDraft.openingAmount || 0);
  const withdrawalsTotal = getTodayCashWithdrawalsTotal();
  return openingAmount + cashSales - withdrawalsTotal;
}

function getCurrentCashSalesExposureAmount() {
  const cashSales = getCurrentCashSessionSales()
    .filter((sale) => sale.paymentMethod === "Efectivo")
    .reduce((sum, sale) => sum + sale.total, 0);
  const withdrawalsTotal = getTodayCashWithdrawalsTotal();
  return cashSales - withdrawalsTotal;
}

function shouldWarnCashWithdrawal() {
  return state.cashClosureDraft.isOpen && getCurrentCashSalesExposureAmount() > CASH_WITHDRAWAL_WARNING_LIMIT;
}

function buildCashOpeningModel() {
  const openingAmount = Number(state.cashClosureDraft.openingBase || state.cashClosureDraft.openingAmount || 0);
  return {
    openingNumber: String(state.cashClosureDraft.openingNumber || `A-${String(state.cashClosures.length + 1).padStart(4, "0")}`).trim(),
    openedAt: state.cashClosureDraft.openedAt || new Date().toISOString(),
    openingAmount,
    user: sessionState.user,
    pharmacy: normalizePharmacyProfile(state.pharmacyProfile)
  };
}

function buildCashOpeningHtml(opening) {
  const pharmacy = opening.pharmacy || {};
  const pharmacyMeta = [pharmacy.address, pharmacy.city].filter(Boolean).join(" ï¿½ ");
  const pharmacyContact = [pharmacy.phone, pharmacy.email].filter(Boolean).join(" ï¿½ ");
  const openingDate = normalizeInputDateValue(opening.openedAt);
  const openingTime = new Date(opening.openedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

  return `
    <section class="cash-closure-sheet">
      <header class="cash-closure-head">
        <div>
          <p class="cash-closure-kicker">Farma POS</p>
          <h3>Apertura de caja</h3>
          <p class="cash-closure-range">${escapeHtml(formatSessionDateTime(opening.openedAt))}</p>
        </div>
        <div class="cash-closure-stamp">
          <span>Comprobante</span>
          <strong>${escapeHtml(opening.openingNumber)}</strong>
        </div>
      </header>

      <section class="cash-closure-summary">
        <article><span>Base inicial</span><strong>${formatCurrency(opening.openingAmount)}</strong></article>
        <article><span>Responsable</span><strong>${escapeHtml(opening.user)}</strong></article>
        <article><span>Fecha</span><strong>${escapeHtml(formatDisplayDate(openingDate))}</strong></article>
        <article><span>Hora</span><strong>${escapeHtml(openingTime)}</strong></article>
      </section>

      <section class="cash-closure-breakdown">
        <div class="cash-closure-section-title">Detalle de apertura</div>
        <div class="report-breakdown-row"><span>Comprobante</span><strong>${escapeHtml(opening.openingNumber)}</strong></div>
        <div class="report-breakdown-row"><span>Estado</span><strong>Caja abierta</strong></div>
        <div class="report-breakdown-row"><span>Turno</span><strong>${escapeHtml(formatDisplayDate(openingDate))} ${escapeHtml(openingTime)}</strong></div>
      </section>

      <section class="cash-closure-notes">
        <div class="cash-closure-section-title">Punto de venta</div>
        <p><strong>${escapeHtml(pharmacy.name || "Farma POS")}</strong></p>
        <p>${escapeHtml(pharmacy.nit || "NIT no configurado")}</p>
        <p>${escapeHtml(pharmacyMeta || "Direccion sin configurar")}</p>
        <p>${escapeHtml(pharmacyContact || "Contacto sin configurar")}</p>
      </section>

      <section class="cash-closure-notes">
        <div class="cash-closure-section-title">Observacion</div>
        <p>Este comprobante confirma la apertura de caja para iniciar la jornada de ventas.</p>
      </section>
    </section>
  `;
}

function buildCashWithdrawalHtml(withdrawal) {
  const pharmacy = getTicketPharmacyProfile();
  const pharmacyMeta = [pharmacy.address, pharmacy.city].filter(Boolean).join(" Â· ");
  const pharmacyContact = [pharmacy.phone, pharmacy.email].filter(Boolean).join(" Â· ");
  const createdAtLabel = `${formatDisplayDate(withdrawal.date)} ${String(withdrawal.time || "--").trim() || "--"}`;

  return `
    <section class="cash-closure-sheet">
      <header class="cash-closure-head">
        <div>
          <p class="cash-closure-kicker">Farma POS</p>
          <h3>Retiro de caja</h3>
          <p class="cash-closure-range">${escapeHtml(createdAtLabel)}</p>
        </div>
        <div class="cash-closure-stamp">
          <span>Comprobante</span>
          <strong>${escapeHtml(withdrawal.withdrawalNumber || "Retiro")}</strong>
        </div>
      </header>

      <section class="cash-closure-summary">
        <article><span>Monto</span><strong>${formatCurrency(withdrawal.amount)}</strong></article>
        <article><span>Cajero</span><strong>${escapeHtml(withdrawal.cashierName || "Cajero")}</strong></article>
      </section>

      <section class="cash-closure-breakdown">
        <div class="report-breakdown-row"><span>Supervisor</span><strong>${escapeHtml(withdrawal.supervisorName || "Supervisor")}</strong></div>
        <div class="report-breakdown-row"><span>Motivo</span><strong>${escapeHtml(withdrawal.reason || "Sin motivo")}</strong></div>
      </section>

      <section class="cash-closure-notes">
        <p><strong>${escapeHtml(pharmacy.name || "Farma POS")}</strong></p>
        <p>${escapeHtml(pharmacy.nit || "NIT no configurado")}</p>
      </section>
    </section>
  `;
}

function buildCashClosureHtml(closure) {
  const detailRows = closure.sales.length
    ? closure.sales.map((sale) => `
        <article class="cash-closure-sale-item">
          <div class="cash-closure-sale-top">
            <strong>${escapeHtml(sale.ticketNumber)}</strong>
            <strong>${formatCurrency(sale.total)}</strong>
          </div>
          <div class="cash-closure-sale-meta">
            <span>${escapeHtml(sale.time || "--")}</span>
            <span>${escapeHtml(sale.clientName)}</span>
            <span>${escapeHtml(sale.paymentMethod)}</span>
          </div>
        </article>
      `).join("")
    : `<div class="cash-closure-empty">No hubo ventas registradas en este corte.</div>`;

  return `
    <section class="cash-closure-sheet">
      <header class="cash-closure-head">
        <div>
          <p class="cash-closure-kicker">Farma POS</p>
          <h3>Cierre de caja</h3>
          <p class="cash-closure-range">${escapeHtml(closure.label)}</p>
        </div>
        <div class="cash-closure-stamp">
          <span>Responsable</span>
          <strong>${escapeHtml(sessionState.user)}</strong>
        </div>
      </header>

      <section class="cash-closure-summary">
        <article><span>Apertura</span><strong>${formatCurrency(closure.openingAmount)}</strong></article>
        <article><span>Ventas</span><strong>${formatCurrency(closure.totalSales)}</strong></article>
        <article><span>Efectivo esperado</span><strong>${formatCurrency(closure.expectedDrawer)}</strong></article>
        <article><span>Diferencia</span><strong>${formatCurrency(closure.difference)}</strong></article>
      </section>

      <section class="cash-closure-breakdown">
        <div class="cash-closure-section-title">Metodos de pago</div>
        <div class="report-breakdown-row"><span>Efectivo</span><strong>${formatCurrency(closure.cashSales)}</strong></div>
        <div class="report-breakdown-row"><span>Tarjeta</span><strong>${formatCurrency(closure.cardSales)}</strong></div>
        <div class="report-breakdown-row"><span>Transferencia</span><strong>${formatCurrency(closure.transferSales)}</strong></div>
        <div class="report-breakdown-row"><span>Retiros autorizados</span><strong>${formatCurrency(closure.withdrawalsTotal)}</strong></div>
        <div class="report-breakdown-row"><span>Gastos adicionales</span><strong>${formatCurrency(closure.expenses)}</strong></div>
        <div class="report-breakdown-row"><span>Efectivo contado</span><strong>${formatCurrency(closure.countedCash)}</strong></div>
      </section>

      <section class="cash-closure-table-wrap">
        <div class="cash-closure-section-title">Detalle del dia</div>
        <div class="cash-closure-sales-list">${detailRows}</div>
      </section>

      <section class="cash-closure-notes">
        <div class="cash-closure-section-title">Observaciones</div>
        <p>${escapeHtml(closure.observations || "Sin observaciones registradas.")}</p>
      </section>
    </section>
  `;
}

function persistCashClosure() {
  const closure = buildCashClosureModel();
  const next = normalizeCashClosureRecord({
    ...closure,
    createdAt: new Date().toISOString(),
    user: sessionState.user
  }, state.cashClosures.length);
  state.cashClosures.push(next);
  state.cashClosureDraft = {
    ...getDefaultCashClosureDraft(),
    openingAmount: 0,
    countedCash: 0,
    expenses: 0,
    observations: ""
  };
  saveCashClosureData();
  saveCashClosureDraft();
  return next;
}

function getEditingCashClosureRecord() {
  if (!state.editingCashClosureId) return null;
  const index = state.cashClosures.findIndex((entry) => entry.id === state.editingCashClosureId);
  if (index === -1) return null;
  return normalizeCashClosureRecord(state.cashClosures[index], index);
}

function getActiveCashClosureModel() {
  const editingClosure = getEditingCashClosureRecord();
  if (!editingClosure) {
    return buildCashClosureModel();
  }

  const openingAmount = Number(state.cashClosureDraft.openingBase || state.cashClosureDraft.openingAmount || editingClosure.openingAmount || 0);
  const countedCash = Number(state.cashClosureDraft.countedCash ?? editingClosure.countedCash ?? 0);
  const expenses = Math.max(0, Math.min(Number(state.cashClosureDraft.expenses ?? editingClosure.expenses ?? 0), 450000));
  const expectedDrawer = openingAmount + Number(editingClosure.cashSales || 0) - Number(editingClosure.withdrawalsTotal || 0) - expenses;

  return {
    ...editingClosure,
    label: formatDisplayDate(editingClosure.date),
    openingAmount,
    countedCash,
    expenses,
    expectedDrawer,
    difference: countedCash - expectedDrawer,
    observations: String(state.cashClosureDraft.observations ?? editingClosure.observations ?? "").trim()
  };
}

function startEditingCashClosure(closureId) {
  const index = state.cashClosures.findIndex((entry) => entry.id === closureId);
  if (index === -1) return;

  const closure = normalizeCashClosureRecord(state.cashClosures[index], index);
  if (!state.editingCashClosureId) {
    state.cashClosureEditorBackup = { ...state.cashClosureDraft };
  }

  state.editingCashClosureId = closure.id;
  state.cashClosureDraft = {
    ...state.cashClosureDraft,
    openingAmount: closure.openingAmount,
    openingBase: closure.openingAmount,
    countedCash: closure.countedCash,
    expenses: closure.expenses,
    observations: closure.observations,
    isOpen: true
  };
  saveCashClosureDraft();
}

function stopEditingCashClosure() {
  state.editingCashClosureId = "";
  state.cashClosureDraft = state.cashClosureEditorBackup
    ? normalizeCashClosureDraft(state.cashClosureEditorBackup)
    : normalizeCashClosureDraft(state.cashClosureDraft);
  state.cashClosureEditorBackup = null;
  saveCashClosureDraft();
}

function updateExistingCashClosure() {
  const index = state.cashClosures.findIndex((entry) => entry.id === state.editingCashClosureId);
  if (index === -1) {
    throw new Error("No se encontro el cierre que intentas modificar.");
  }

  const current = normalizeCashClosureRecord(state.cashClosures[index], index);
  const model = getActiveCashClosureModel();
  const updated = normalizeCashClosureRecord({
    ...current,
    ...model,
    id: current.id,
    closureNumber: current.closureNumber,
    createdAt: current.createdAt,
    user: current.user
  }, index);

  state.cashClosures[index] = updated;
  saveCashClosureData();
  stopEditingCashClosure();
  return updated;
}

function deleteCashClosure(closureId) {
  const index = state.cashClosures.findIndex((entry) => entry.id === closureId);
  if (index === -1) {
    throw new Error("No se encontro el cierre que intentas eliminar.");
  }

  const removed = normalizeCashClosureRecord(state.cashClosures[index], index);
  state.cashClosures.splice(index, 1);

  if (state.editingCashClosureId === closureId) {
    stopEditingCashClosure();
  } else {
    saveCashClosureDraft();
  }

  saveCashClosureData();
  return removed;
}

function renderSalesReportPreview() {
  const summary = document.getElementById("reportPeriodSummary");
  const preview = document.getElementById("reportPrintPreview");
  if (!summary || !preview) return;

  const report = buildSalesReportModel(state.reportPeriod);
  summary.innerHTML = `
    <article class="report-summary-card"><span>Periodo</span><strong>${escapeHtml(report.meta.label)}</strong><small>${escapeHtml(report.meta.rangeLabel)}</small></article>
    <article class="report-summary-card"><span>Ventas</span><strong>${report.totals.transactions}</strong><small>Transacciones registradas</small></article>
    <article class="report-summary-card"><span>Ingresos</span><strong>${formatCurrency(report.totals.revenue)}</strong><small>Total del corte</small></article>
    <article class="report-summary-card"><span>Promedio</span><strong>${formatCurrency(report.totals.average)}</strong><small>Ticket promedio</small></article>
  `;
  preview.innerHTML = buildSalesReportHtml(state.reportPeriod);
}

function printHtmlDocument(documentHtml, blockedMessage) {
  if (window.farmaposDesktop?.isDesktop) {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.style.border = "0";

    document.body.appendChild(iframe);

    const frameDocument = iframe.contentDocument;
    const frameWindow = iframe.contentWindow;
    if (!frameDocument || !frameWindow) {
      iframe.remove();
      showInfoDialog(blockedMessage, { title: "Impresion bloqueada", variant: "warn" });
      return;
    }

    frameDocument.open();
    frameDocument.write(documentHtml);
    frameDocument.close();

    frameWindow.addEventListener("afterprint", () => {
      window.setTimeout(() => iframe.remove(), 150);
    }, { once: true });

    const waitForFrameAssets = () => new Promise((resolve) => {
      const images = Array.from(frameDocument.images || []);
      const pendingImages = images.filter((image) => !image.complete);

      if (!pendingImages.length) {
        window.setTimeout(resolve, 200);
        return;
      }

      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        window.setTimeout(resolve, 120);
      };

      pendingImages.forEach((image) => {
        image.addEventListener("load", finish, { once: true });
        image.addEventListener("error", finish, { once: true });
      });

      window.setTimeout(finish, 2500);
    });

    waitForFrameAssets().then(() => {
      frameWindow.focus();
      frameWindow.print();
      window.setTimeout(() => iframe.remove(), 2500);
    });
    return;
  }

  const printWindow = window.open("", "_blank", "width=900,height=900");
  if (!printWindow) {
    showInfoDialog(blockedMessage, { title: "Impresion bloqueada", variant: "warn" });
    return;
  }

  printWindow.document.open();
  printWindow.document.write(documentHtml);
  printWindow.document.close();
}

async function openPrintableDocument(title, bodyHtml) {
  const documentHtml = buildPrintableDocumentHtml(title, bodyHtml);

  if (window.farmaposDesktop?.print?.silentHtml) {
    try {
      await window.farmaposDesktop.print.silentHtml({
        title,
        html: documentHtml,
        deviceName: getActiveTicketPrinterName()
      });
      return;
    } catch (error) {
      console.warn("Fallo la impresion silenciosa. Se usara el dialogo del sistema.", error);
    }
  }

  printHtmlDocument(documentHtml, "El navegador bloqueo la ventana de impresion.");
}

function buildPrintableDocumentHtml(title, bodyHtml) {
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(title)}</title>
      <style>
        :root {
          --bg: #f4f7fb;
          --surface: #ffffff;
          --soft: #f7f8fc;
          --primary: #ff6a3d;
          --text: #193040;
          --muted: #718295;
          --border: rgba(25, 48, 64, 0.08);
        }
        * { box-sizing: border-box; }
        body { margin: 0; padding: 24px; font-family: Manrope, Arial, sans-serif; color: var(--text); background: var(--bg); }
        .report-print-shell { max-width: 980px; margin: 0 auto; }
        .sales-report-sheet, .cash-closure-sheet { display: grid; gap: 18px; padding: 24px; border: 1px solid var(--border); border-radius: 24px; background: var(--surface); }
        .sales-report-head, .cash-closure-head { display: flex; justify-content: space-between; gap: 16px; align-items: start; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
        .sales-report-doc-head { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.2fr) minmax(0, .9fr); align-items: center; }
        .sales-report-doc-brand { display: flex; gap: 14px; align-items: center; min-width: 0; }
        .report-doc-logo { width: 78px; height: 78px; object-fit: contain; flex: 0 0 auto; }
        .report-doc-logo-fallback { display: grid; place-items: center; border-radius: 18px; background: linear-gradient(135deg, #132c43, var(--primary)); color: #fff; font-size: 24px; font-weight: 800; }
        .sales-report-doc-brand-copy { min-width: 0; }
        .sales-report-doc-brand-copy .sales-report-kicker,
        .sales-report-doc-brand-copy .sales-report-range { text-align: left; }
        .sales-report-doc-title { text-align: center; }
        .sales-report-doc-title h3 { margin: 0; font-size: 1.6rem; }
        .sales-report-doc-title strong { display: block; margin-top: 10px; font-size: 1.1rem; letter-spacing: .04em; }
        .sales-report-doc-stamp small { display: block; margin-top: 8px; color: var(--muted); font-size: 12px; line-height: 1.35; }
        .sales-report-kicker, .sales-report-range, .sales-report-stamp span, .cash-closure-kicker, .cash-closure-range, .cash-closure-stamp span { margin: 0; color: var(--muted); }
        .sales-report-head h3, .sales-report-stamp strong, .cash-closure-head h3, .cash-closure-stamp strong { margin: 4px 0 0; }
        .sales-report-stamp, .cash-closure-stamp { text-align: right; }
        .sales-report-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
        .cash-closure-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .sales-report-summary article, .sales-report-breakdown, .cash-closure-summary article, .cash-closure-breakdown, .cash-closure-notes { min-width: 0; padding: 14px; border-radius: 16px; background: var(--soft); }
        .sales-report-summary span, .sales-report-breakdown span, .cash-closure-summary span { display: block; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
        .sales-report-summary strong, .cash-closure-summary strong { display: block; margin-top: 6px; font-size: 20px; line-height: 1.2; overflow-wrap: anywhere; word-break: break-word; }
        .sales-report-summary small { color: var(--muted); }
        .sales-report-section-title, .cash-closure-section-title { margin-bottom: 10px; font-weight: 800; }
        .report-breakdown-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; min-width: 0; padding: 8px 0; border-bottom: 1px solid var(--border); }
        .report-breakdown-row span, .report-breakdown-row strong { min-width: 0; }
        .report-breakdown-row span { flex: 1 1 auto; }
        .report-breakdown-row strong { flex: 0 1 42%; text-align: right; line-height: 1.25; overflow-wrap: anywhere; word-break: break-word; }
        .report-breakdown-row:last-child { border-bottom: 0; padding-bottom: 0; }
        .sales-report-table-wrap, .cash-closure-table-wrap { overflow: hidden; border: 1px solid var(--border); border-radius: 18px; }
        .sales-report-table-wrap .sales-report-section-title { padding: 14px 16px 0; }
        .sales-report-table, .cash-closure-table { width: 100%; border-collapse: collapse; }
        .sales-report-table th, .sales-report-table td, .cash-closure-table th, .cash-closure-table td { padding: 12px 16px; border-bottom: 1px solid var(--border); text-align: left; font-size: 14px; }
        .sales-report-table th, .cash-closure-table th { background: var(--soft); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
        .sales-report-table tbody tr:last-child td, .cash-closure-table tbody tr:last-child td { border-bottom: 0; }
        .cash-closure-sales-list { display: grid; gap: 10px; padding: 0 14px 14px; }
        .cash-closure-sale-item { padding: 10px 12px; border-radius: 14px; background: var(--soft); }
        .cash-closure-sale-top, .cash-closure-sale-meta { display: flex; justify-content: space-between; gap: 10px; }
        .cash-closure-sale-top { align-items: baseline; }
        .cash-closure-sale-top strong:last-child { text-align: right; overflow-wrap: anywhere; word-break: break-word; }
        .cash-closure-sale-meta { margin-top: 6px; flex-wrap: wrap; color: var(--muted); font-size: 12px; }
        .cash-closure-empty { padding: 0 14px 14px; color: var(--muted); }
        @media (max-width: 640px) {
          .sales-report-doc-head { grid-template-columns: 1fr; }
          .sales-report-doc-title, .sales-report-doc-stamp { text-align: left; }
          .cash-closure-head { display: grid; gap: 10px; }
          .cash-closure-stamp { text-align: left; }
          .cash-closure-summary { grid-template-columns: 1fr; }
          .report-breakdown-row strong { flex-basis: 48%; }
        }
        @media print {
          body { padding: 0; background: #fff; }
          .report-print-shell { max-width: none; }
          .sales-report-sheet, .cash-closure-sheet { border: 0; border-radius: 0; padding: 0; }
          .cash-closure-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
      </style>
    </head>
    <body>
      <div class="report-print-shell">${bodyHtml}</div>
      <script>
        window.onload = () => {
          window.print();
          window.onafterprint = () => window.close();
        };
      </script>
    </body>
    </html>
  `;
}

function ensureAdminNavigation() {
  if (!isAdminSession()) return;

  document.querySelectorAll(".app-nav").forEach((nav) => {
    if (nav.querySelector('a[href="licencias.html"]')) return;

    const link = document.createElement("a");
    const currentPage = getCurrentPageFileName();
    link.href = "licencias.html";
    if (currentPage === "licencias.html") {
      link.classList.add("active");
    }
    link.innerHTML = `<i class="bi bi-key-fill"></i><span>Licencias</span>`;

    const supportLink = nav.querySelector('a[href="soporte.html"]');
    if (supportLink) {
      nav.insertBefore(link, supportLink);
    } else {
      nav.appendChild(link);
    }
  });

  renderSystemVersion();
}

function ensureOperationsNavigation() {
  const entries = [
      { href: "proveedores.html", icon: "bi-truck", label: "Proveedores" },
      { href: "compras.html", icon: "bi-bag-plus", label: "Compras" },
      { href: "promociones.html", icon: "bi-megaphone", label: "Promociones" },
      { href: "backups.html", icon: "bi-shield-check", label: "Backups" },
      { href: "auditoria.html", icon: "bi-journal-text", label: "Auditoria" }
    ];

  document.querySelectorAll(".app-nav").forEach((nav) => {
    const currentPage = getCurrentPageFileName();
    const inventoryLink = nav.querySelector('a[href="inventario.html"]');
    const insertBeforeNode = inventoryLink?.nextElementSibling || null;

    entries.forEach((entry) => {
      if (nav.querySelector(`a[href="${entry.href}"]`)) return;
      const link = document.createElement("a");
      link.href = entry.href;
      if (currentPage === entry.href) {
        link.classList.add("active");
      }
      link.innerHTML = `<i class="bi ${entry.icon}"></i><span>${entry.label}</span>`;
      if (insertBeforeNode && insertBeforeNode.parentElement === nav) {
        nav.insertBefore(link, insertBeforeNode);
      } else {
        nav.appendChild(link);
      }
    });
  });
}

function printSalesReport() {
  const report = buildSalesReportModel(state.reportPeriod);
  openPrintableDocument(`${report.meta.label} - Farma POS`, buildSalesReportHtml(state.reportPeriod));
}

async function downloadSalesReport() {
  const report = buildSalesReportModel(state.reportPeriod);
  const documentHtml = buildPrintableDocumentHtml(`${report.meta.label} - Farma POS`, buildSalesReportHtml(state.reportPeriod));

  if (window.farmaposDesktop?.print?.savePdf) {
    try {
      const result = await window.farmaposDesktop.print.savePdf({
        filename: `reporte-${report.meta.key}.pdf`,
        html: documentHtml
      });
      if (!result?.canceled) {
        await showInfoDialog("El reporte se guardo en PDF correctamente.", {
          title: "PDF generado",
          variant: "success"
        });
      }
      return;
    } catch (error) {
      const rawMessage = String(error?.message || error || "").trim();
      if (rawMessage.includes("No handler registered for 'print:savePdf'")) {
        printHtmlDocument(documentHtml, "El navegador bloqueo la ventana de impresion.");
        await showInfoDialog("La app necesita reiniciarse para activar la descarga PDF. Mientras tanto se abrio la impresion para que lo guardes como PDF.", {
          title: "Reinicia la app",
          variant: "warn"
        });
        return;
      }
      await showInfoDialog(rawMessage || "No fue posible generar el PDF del reporte.", {
        title: "Error al exportar",
        variant: "warn"
      });
      return;
    }
  }

  printHtmlDocument(documentHtml, "El navegador bloqueo la ventana de impresion.");
}

function renderCashClosurePage() {
  const model = getActiveCashClosureModel();
  setText("closureDateLabel", model.label);
  setText("closureSalesValue", formatCurrency(model.totalSales));
  setText("closureTransactionsValue", String(model.transactions));
  setText("closureExpectedValue", formatCurrency(model.expectedDrawer));
  setText("closureDifferenceValue", formatCurrency(model.difference));
  setText("closureCashSales", formatCurrency(model.cashSales));
  setText("closureCardSales", formatCurrency(model.cardSales));
  setText("closureTransferSales", formatCurrency(model.transferSales));
  setText("closureWithdrawalsValue", formatCurrency(model.withdrawalsTotal));
  setText("closureExtraExpensesValue", formatCurrency(model.expenses));
  setText("closureUnitsValue", String(model.units));

  const openingInput = document.getElementById("closureOpeningAmount");
  const countedInput = document.getElementById("closureCountedCash");
  const expensesInput = document.getElementById("closureExpenses");
  const notesInput = document.getElementById("closureObservations");
  if (openingInput) openingInput.value = String(model.openingAmount || 0);
  if (countedInput) countedInput.value = String(model.countedCash || 0);
  if (expensesInput) expensesInput.value = String(Math.max(0, Math.min(model.expenses || 0, 450000)));
  if (notesInput) notesInput.value = model.observations || "";

  const saveButton = document.getElementById("saveCashClosure");
  const cancelButton = document.getElementById("cancelCashClosureEdit");
  if (saveButton) saveButton.textContent = state.editingCashClosureId ? "Actualizar cierre" : "Guardar cierre";
  if (cancelButton) cancelButton.hidden = !state.editingCashClosureId;

  const preview = document.getElementById("closurePreview");
  if (preview) preview.innerHTML = buildCashClosureHtml(model);

  const list = document.getElementById("closureHistoryList");
  if (list) {
    const recent = state.cashClosures.slice().map(normalizeCashClosureRecord).reverse().slice(0, 6);
    list.innerHTML = recent.length
      ? recent.map((closure) => `
          <article class="closure-history-item">
            <strong>${escapeHtml(closure.closureNumber)} - ${escapeHtml(formatDisplayDate(closure.date))}</strong>
            <span>${escapeHtml(closure.user)} - ${escapeHtml(formatSessionDateTime(closure.createdAt))}</span>
            <span>Esperado ${formatCurrency(closure.expectedDrawer)} - Contado ${formatCurrency(closure.countedCash)} - Diferencia ${formatCurrency(closure.difference)}</span>
            <div class="closure-history-actions">
              <button class="btn btn-sm btn-outline-secondary" type="button" data-action="edit-cash-closure" data-closure-id="${escapeHtml(closure.id)}">Editar</button>
              <button class="btn btn-sm btn-outline-danger" type="button" data-action="delete-cash-closure" data-closure-id="${escapeHtml(closure.id)}">Eliminar</button>
            </div>
          </article>
        `).join("")
      : `<div class="empty-state compact-empty"><p>Aun no hay cierres guardados.</p></div>`;
  }
}

function renderCashWithdrawalsPage() {
  setText("withdrawalCashierName", sessionState.user || "Cajero");
  setText("withdrawalCashierUser", sessionState.username || "--");
  setText("withdrawalAvailableCash", formatCurrency(getCurrentWithdrawableCashAmount()));
  setText("withdrawalTodayTotal", formatCurrency(getTodayCashWithdrawalsTotal()));
  setText("withdrawalTodayCount", String(getTodayCashWithdrawals().length));

  const submitButton = document.querySelector("#cashWithdrawalForm button[type='submit']");
  if (submitButton) {
    submitButton.textContent = state.editingWithdrawalId ? "Actualizar retiro" : "Guardar retiro";
  }

  const clearButton = document.getElementById("clearWithdrawalForm");
  if (clearButton) {
    clearButton.textContent = state.editingWithdrawalId ? "Cancelar edicion" : "Limpiar";
  }

  const latestWithdrawal = state.cashWithdrawals.length
    ? normalizeCashWithdrawalRecord(state.cashWithdrawals[state.cashWithdrawals.length - 1], state.cashWithdrawals.length - 1)
    : null;
  const printLastButton = document.getElementById("printLastWithdrawal");
  if (printLastButton) {
    printLastButton.hidden = !latestWithdrawal;
    printLastButton.disabled = !latestWithdrawal;
  }

  const list = document.getElementById("cashWithdrawalsList");
  if (!list) return;

  const recent = state.cashWithdrawals.slice().map(normalizeCashWithdrawalRecord).reverse().slice(0, 10);
  list.innerHTML = recent.length
    ? recent.map((withdrawal) => `
        <article class="closure-history-item">
          <strong>${escapeHtml(withdrawal.withdrawalNumber)} - ${formatCurrency(withdrawal.amount)}</strong>
          <span>${escapeHtml(formatDisplayDate(withdrawal.date))} ${escapeHtml(withdrawal.time || "--")} - Cajero ${escapeHtml(withdrawal.cashierName)}</span>
          <span>${escapeHtml(withdrawal.reason || "Sin motivo")} - Autoriza ${escapeHtml(withdrawal.supervisorName || withdrawal.supervisorUsername || "Supervisor")}</span>
          <div class="closure-history-actions">
            <button class="btn btn-sm btn-outline-secondary" type="button" data-action="print-withdrawal" data-withdrawal-id="${escapeHtml(withdrawal.id)}">Imprimir</button>
            <button class="btn btn-sm btn-outline-secondary" type="button" data-action="edit-withdrawal" data-withdrawal-id="${escapeHtml(withdrawal.id)}">Editar</button>
            <button class="btn btn-sm btn-outline-danger" type="button" data-action="delete-withdrawal" data-withdrawal-id="${escapeHtml(withdrawal.id)}">Eliminar</button>
          </div>
        </article>
      `).join("")
    : `<div class="empty-state compact-empty"><p>Aun no hay retiros registrados.</p></div>`;
}

function bindCashClosureEvents() {
  const syncDraft = () => {
    const expensesInput = document.getElementById("closureExpenses");
    const rawExpenses = Number(expensesInput?.value || 0);
    const normalizedExpenses = Math.max(0, Math.min(rawExpenses, 450000));
    if (expensesInput) expensesInput.value = String(normalizedExpenses);

    state.cashClosureDraft = {
      ...state.cashClosureDraft,
      openingAmount: Number(state.cashClosureDraft.openingBase || state.cashClosureDraft.openingAmount || 0),
      countedCash: Number(document.getElementById("closureCountedCash")?.value || 0),
      expenses: normalizedExpenses,
      observations: String(document.getElementById("closureObservations")?.value || "").trim()
    };
    saveCashClosureDraft();
    renderCashClosurePage();
  };

  ["closureCountedCash", "closureExpenses", "closureObservations"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", syncDraft);
  });

  document.getElementById("saveCashClosure")?.addEventListener("click", async () => {
    const isEditing = !!state.editingCashClosureId;

    try {
      const closure = await withLoading(async () => {
        const model = getActiveCashClosureModel();
        if (!INVENTORY_API_URL) {
          return isEditing ? updateExistingCashClosure() : persistCashClosure();
        }
        return isEditing ? updateCashClosureInApi(model) : registerCashClosureInApi(model);
      }, {
        title: isEditing ? "Actualizando cierre" : "Guardando cierre"
      });

      await showInfoDialog(
        isEditing
          ? `Cierre ${closure.closureNumber} actualizado correctamente.`
          : `Cierre ${closure.closureNumber} guardado correctamente.`,
        { title: isEditing ? "Cierre actualizado" : "Cierre guardado", variant: "success" }
      );
      renderCashClosurePage();
    } catch (error) {
      showInfoDialog(error.message || "No fue posible guardar el cierre.", {
        title: "Error al guardar",
        variant: "warn"
      });
    }
  });

  document.getElementById("cancelCashClosureEdit")?.addEventListener("click", () => {
    stopEditingCashClosure();
    renderCashClosurePage();
  });

  document.getElementById("printCashClosure")?.addEventListener("click", () => {
    const closure = getActiveCashClosureModel();
    openPrintableDocument(`Cierre de caja - ${closure.label}`, buildCashClosureHtml(closure));
  });

  document.getElementById("downloadCashClosure")?.addEventListener("click", () => {
    const closure = getActiveCashClosureModel();
    downloadTicketHtml(buildCashClosureHtml(closure), `cierre-caja-${closure.date}.html`);
  });

  document.getElementById("closureHistoryList")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action='edit-cash-closure']");
    if (button) {
      startEditingCashClosure(String(button.dataset.closureId || ""));
      renderCashClosurePage();
      return;
    }

    const deleteButton = event.target.closest("[data-action='delete-cash-closure']");
    if (!deleteButton) return;

    try {
      const closureId = String(deleteButton.dataset.closureId || "");
      const removed = INVENTORY_API_URL
        ? await deleteCashClosureInApi(closureId)
        : deleteCashClosure(closureId);
      showInfoDialog(`Cierre ${removed.closureNumber} eliminado correctamente.`, {
        title: "Cierre eliminado",
        variant: "success"
      });
      renderCashClosurePage();
    } catch (error) {
      showInfoDialog(error.message || "No fue posible eliminar el cierre.", {
        title: "Error al eliminar",
        variant: "warn"
      });
    }
  });
}

function bindCashWithdrawalEvents() {
  if (document.body.dataset.withdrawalEventsBound === "true") return;
  document.body.dataset.withdrawalEventsBound = "true";
  let withdrawalWarningShown = false;
  const withdrawalReasonOptions = [
    "Consignacion",
    "Pago a proveedor",
    "Caja menor",
    "Gasto operativo",
    "Traslado de efectivo"
  ];

  const printWithdrawal = (withdrawalId = "") => {
    const withdrawal = withdrawalId
      ? state.cashWithdrawals.find((entry) => entry.id === withdrawalId)
      : state.cashWithdrawals[state.cashWithdrawals.length - 1];
    if (!withdrawal) {
      showInfoDialog("No hay retiros disponibles para imprimir.", {
        title: "Sin retiros",
        variant: "warn"
      });
      return;
    }

    const normalized = normalizeCashWithdrawalRecord(withdrawal, 0);
    openPrintableDocument(`Retiro ${normalized.withdrawalNumber}`, buildCashWithdrawalHtml(normalized));
  };

  const syncWithdrawalReasonField = (value = "") => {
    const select = document.getElementById("withdrawalReason");
    const otherInput = document.getElementById("withdrawalReasonOther");
    const normalizedValue = String(value || "").trim();
    const useOther = normalizedValue && !withdrawalReasonOptions.includes(normalizedValue);

    if (select) {
      select.value = useOther ? "Otro" : normalizedValue;
    }

    if (otherInput) {
      otherInput.hidden = !(useOther || (select && select.value === "Otro"));
      otherInput.value = useOther ? normalizedValue : "";
    }
  };

  const getWithdrawalReasonValue = () => {
    const selectValue = String(document.getElementById("withdrawalReason")?.value || "").trim();
    if (selectValue === "Otro") {
      return String(document.getElementById("withdrawalReasonOther")?.value || "").trim();
    }
    return selectValue;
  };

  const resetWithdrawalForm = () => {
    document.getElementById("cashWithdrawalForm")?.reset();
    state.editingWithdrawalId = "";
    syncWithdrawalReasonField("");
    renderCashWithdrawalsPage();
  };

  const startEditingWithdrawal = (withdrawalId) => {
    const withdrawal = state.cashWithdrawals.find((entry) => entry.id === withdrawalId);
    if (!withdrawal) return;
    state.editingWithdrawalId = withdrawal.id;
    const amountInput = document.getElementById("withdrawalAmount");
    const supervisorUserInput = document.getElementById("withdrawalSupervisorUser");
    const supervisorPasswordInput = document.getElementById("withdrawalSupervisorPassword");
    if (amountInput) amountInput.value = String(withdrawal.amount || 0);
    syncWithdrawalReasonField(withdrawal.reason || "");
    if (supervisorUserInput) supervisorUserInput.value = withdrawal.supervisorUsername || "";
    if (supervisorPasswordInput) supervisorPasswordInput.value = "";
    renderCashWithdrawalsPage();
  };

  document.getElementById("withdrawalAmount")?.addEventListener("input", (event) => {
    const rawAmount = Number(event.target.value || 0);
    const amount = Math.min(rawAmount, 450000);
    event.target.value = amount ? String(amount) : "";

    if (rawAmount > 450000 && !withdrawalWarningShown) {
      withdrawalWarningShown = true;
      showInfoDialog("El retiro maximo permitido es de $450.000. Se ajusto automaticamente al tope.", {
        title: "Tope de retiro",
        variant: "warn"
      });
    } else if (rawAmount <= 450000) {
      withdrawalWarningShown = false;
    }
  });

  document.getElementById("clearWithdrawalForm")?.addEventListener("click", () => {
    resetWithdrawalForm();
  });

  document.getElementById("withdrawalReason")?.addEventListener("change", (event) => {
    syncWithdrawalReasonField(String(event.target.value || "").trim());
  });

  document.getElementById("printLastWithdrawal")?.addEventListener("click", () => {
    printWithdrawal();
  });

  document.getElementById("cashWithdrawalForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!state.cashClosureDraft.isOpen) {
      showInfoDialog("Debes abrir caja antes de registrar un retiro.", { title: "Caja cerrada", variant: "warn" });
      return;
    }

    const amount = Number(document.getElementById("withdrawalAmount")?.value || 0);
    const reason = getWithdrawalReasonValue();
    const supervisorUsername = String(document.getElementById("withdrawalSupervisorUser")?.value || "").trim();
    const supervisorPassword = String(document.getElementById("withdrawalSupervisorPassword")?.value || "").trim();
    const currentEditingWithdrawal = state.editingWithdrawalId
      ? state.cashWithdrawals.find((entry) => entry.id === state.editingWithdrawalId)
      : null;
    const availableAmountForUpdate = getCurrentWithdrawableCashAmount() + Number(currentEditingWithdrawal?.amount || 0);

    if (!amount || amount <= 0) {
      showInfoDialog("Ingresa un valor valido para el retiro.", { title: "Valor requerido", variant: "warn" });
      return;
    }

    if (amount > 450000) {
      showInfoDialog("El retiro maximo permitido es de $450.000.", { title: "Tope de retiro", variant: "warn" });
      return;
    }

    if (amount > availableAmountForUpdate) {
      showInfoDialog("El retiro supera el efectivo disponible de ventas y afectaria la base.", { title: "Fondos insuficientes", variant: "warn" });
      return;
    }

    if (!reason) {
      showInfoDialog("Escribe el motivo del retiro.", { title: "Motivo requerido", variant: "warn" });
      return;
    }

    if (!supervisorUsername || !supervisorPassword) {
      showInfoDialog("El retiro debe ser autorizado con usuario y clave de supervisor.", { title: "Supervisor requerido", variant: "warn" });
      return;
    }

    const withdrawal = {
      id: state.editingWithdrawalId || crypto.randomUUID(),
      amount,
      reason,
      cashierUsername: sessionState.username || "",
      cashierName: sessionState.user || "Cajero"
    };

    try {
      const isEditing = !!state.editingWithdrawalId;
      const savedWithdrawal = await withLoading(async () => (
        isEditing
          ? updateCashWithdrawalInApi(withdrawal, supervisorUsername, supervisorPassword)
          : registerCashWithdrawalInApi(withdrawal, supervisorUsername, supervisorPassword)
      ), {
        title: isEditing ? "Actualizando retiro" : "Registrando retiro",
        message: isEditing
          ? (isDesktopDbEnabled() ? "Validando supervisor y actualizando en MySQL/MariaDB..." : "Validando supervisor y actualizando en Google Sheets...")
          : (isDesktopDbEnabled() ? "Validando supervisor y guardando en MySQL/MariaDB..." : "Validando supervisor y guardando en Google Sheets...")
      });

      resetWithdrawalForm();
      renderCashWithdrawalsPage();
      await showInfoDialog(`Retiro ${savedWithdrawal.withdrawalNumber} ${isEditing ? "actualizado" : "guardado"} correctamente.`, {
        title: isEditing ? "Retiro actualizado" : "Retiro registrado",
        variant: "success"
      });
      printWithdrawal(savedWithdrawal.id);
    } catch (error) {
      showInfoDialog(error.message || "No fue posible registrar el retiro.", {
        title: "Error al guardar",
        variant: "danger"
      });
    }
  });

  document.getElementById("cashWithdrawalsList")?.addEventListener("click", async (event) => {
    const printButton = event.target.closest("[data-action='print-withdrawal']");
    if (printButton) {
      printWithdrawal(String(printButton.dataset.withdrawalId || ""));
      return;
    }

    const editButton = event.target.closest("[data-action='edit-withdrawal']");
    if (editButton) {
      startEditingWithdrawal(String(editButton.dataset.withdrawalId || ""));
      return;
    }

    const deleteButton = event.target.closest("[data-action='delete-withdrawal']");
    if (!deleteButton) return;

    try {
      const withdrawalId = String(deleteButton.dataset.withdrawalId || "");
      const removed = await deleteCashWithdrawalInApi(withdrawalId);
      resetWithdrawalForm();
      renderCashWithdrawalsPage();
      showInfoDialog(`Retiro ${removed.withdrawalNumber} eliminado correctamente.`, {
        title: "Retiro eliminado",
        variant: "success"
      });
    } catch (error) {
      showInfoDialog(error.message || "No fue posible eliminar el retiro.", {
        title: "Error al eliminar",
        variant: "warn"
      });
    }
  });
}

function setupMobileNav() {
  const sidebar = document.querySelector(".app-sidebar");
  const topbar = document.querySelector(".app-topbar");
  if (!sidebar || !topbar || document.getElementById("mobileMenuToggle")) return;

  const brand = sidebar.querySelector(".brand-box");
  const nav = sidebar.querySelector(".app-nav");
  const session = sidebar.querySelector(".sidebar-session");
  if (!brand || !nav) return;

  const topbarPrimary = topbar.firstElementChild;
  if (topbarPrimary && !topbarPrimary.classList.contains("topbar-main")) {
    topbarPrimary.classList.add("topbar-main");
  }

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.id = "mobileMenuToggle";
  toggle.className = "mobile-menu-toggle";
  toggle.setAttribute("aria-label", "Abrir menu");
  toggle.innerHTML = '<i class="bi bi-list"></i>';
  topbarPrimary?.prepend(toggle);

  const overlay = document.createElement("div");
  overlay.className = "mobile-nav-overlay";
  overlay.id = "mobileNavOverlay";

  const drawer = document.createElement("aside");
  drawer.className = "mobile-nav-drawer";
  drawer.id = "mobileNavDrawer";
  drawer.innerHTML = `
    <div class="mobile-nav-head">
      ${brand.outerHTML}
      <button type="button" class="mobile-nav-close" id="mobileNavClose" aria-label="Cerrar menu">
        <i class="bi bi-x-lg"></i>
      </button>
    </div>
    ${nav.outerHTML}
    ${session ? session.outerHTML : ""}
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  const closeMenu = () => document.body.classList.remove("mobile-nav-open");
  const openMenu = () => document.body.classList.add("mobile-nav-open");

  toggle.addEventListener("click", openMenu);
  overlay.addEventListener("click", closeMenu);
  drawer.querySelector("#mobileNavClose")?.addEventListener("click", closeMenu);
  drawer.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
}

function setupSalesWorkspace() {
  if (document.body.dataset.page !== "sales") return;

  const sidebar = document.querySelector(".app-sidebar");
  const toggle = document.getElementById("salesSidebarToggle");
  const backdrop = document.getElementById("salesSidebarBackdrop");
  if (!sidebar || !toggle || !backdrop) return;

  const closeSidebar = () => {
    document.body.classList.remove("sales-sidebar-open");
    backdrop.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  };
  const openSidebar = () => {
    document.body.classList.add("sales-sidebar-open");
    backdrop.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
  };
  const toggleSidebar = () => {
    if (document.body.classList.contains("sales-sidebar-open")) {
      closeSidebar();
      return;
    }
    openSidebar();
  };
  const syncSidebarState = () => {
    toggle.hidden = false;
    backdrop.hidden = !document.body.classList.contains("sales-sidebar-open");
  };

  toggle.setAttribute("aria-expanded", "false");
  toggle.addEventListener("click", toggleSidebar);
  backdrop.addEventListener("click", closeSidebar);
  sidebar.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeSidebar));
  window.addEventListener("resize", syncSidebarState);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("sales-sidebar-open")) {
      closeSidebar();
    }
  });
  syncSidebarState();
}

function renderDashboard() {
  const licenseSummary = getLicenseUiSummary();
  const activeSales = getActiveSales();
  const revenue = activeSales.reduce((sum, sale) => sum + sale.total, 0);
  const units = activeSales.reduce((sum, sale) => sum + sale.items.reduce((acc, item) => acc + item.quantity, 0), 0);
  const today = normalizeInputDateValue(new Date());
  const todaySales = activeSales.filter((sale) => normalizeInputDateValue(sale.date) === today);
  const low = state.inventory.filter((item) => item.stock <= 10).length;
  const out = state.inventory.filter((item) => item.stock === 0).length;
  const top = state.clients.slice().sort((a, b) => (b.purchases || 0) - (a.purchases || 0))[0];
  const pharmacy = normalizePharmacyProfile(state.pharmacyProfile);
  const pharmacyMeta = [pharmacy.address, pharmacy.email].filter(Boolean).join(" Â· ");

  setText("dailySalesValue", formatCurrency(todaySales.reduce((sum, sale) => sum + sale.total, 0)));
  setText("dailySalesCount", `${todaySales.length} transacciones`);
  setText("cashValue", formatCurrency(activeSales.filter((sale) => sale.paymentMethod === "Efectivo").reduce((sum, sale) => sum + sale.total, 0)));
  setText("inventoryCountValue", String(state.inventory.length));
  setText("lowStockValue", `${low} con stock bajo`);
  setText("clientCountValue", String(state.clients.length));
  setText("frequentClientValue", `${top?.purchases || 0} compras frecuentes`);
  setText("homeAverageTicket", formatCurrency(activeSales.length ? Math.round(revenue / activeSales.length) : 0));
  setText("homeUnitsSold", String(units));
  setText("dashboardTopClient", top?.name || "Cliente general");
  setText("dashboardLastTicket", activeSales.length ? activeSales[activeSales.length - 1].ticketNumber : "Sin ventas");
  setText("dashboardInventorySummary", `${state.inventory.length} productos`);
  setText("dashboardClientSummary", `${state.clients.length} clientes`);
  setText("dashboardSalesSummary", `${activeSales.length} ventas`);
  setText("dashboardCashSummary", formatCurrency(activeSales.filter((sale) => sale.paymentMethod === "Efectivo").reduce((sum, sale) => sum + sale.total, 0)));
  setText("dashboardStockHealth", out > 0 ? "CrÃ­tico" : low > 0 ? "AtenciÃ³n" : "Estable");

  setText("dashboardPharmacyName", pharmacy.name || "Farma POS");
  setText("dashboardPharmacyMeta", pharmacyMeta || "Configura los datos de la farmacia para personalizar el sistema.");
  setText("dashboardPharmacyCity", pharmacy.city || "Sin configurar");
  setText("dashboardPharmacyPhone", pharmacy.phone || "Sin configurar");
  setText("dashboardPharmacyNit", pharmacy.nit || "Sin configurar");
  setText("dashboardLicensePlan", licenseSummary.planLabel);
  setText("dashboardLicenseStatus", licenseSummary.statusLabel);
  setText("dashboardLicenseRemaining", licenseSummary.remainingLabel);
  setText("dashboardLicenseCutoff", licenseSummary.cutoffLabel);

  const licenseBadge = document.getElementById("dashboardLicenseStatus")?.closest(".dashboard-badge");
  if (licenseBadge) {
    licenseBadge.classList.remove("is-license-ok", "is-license-warn", "is-license-info");
    const tone = licenseSummary.statusLabel === "Activa"
      ? "is-license-ok"
      : (licenseSummary.statusLabel === "Sin licencia" || licenseSummary.statusLabel === "Vencida" ? "is-license-warn" : "is-license-info");
    licenseBadge.classList.add(tone);
  }

  const remainingBadge = document.getElementById("dashboardLicenseRemaining")?.closest(".dashboard-badge");
  if (remainingBadge) {
    remainingBadge.classList.remove("is-license-ok", "is-license-warn", "is-license-info");
    remainingBadge.classList.add(licenseSummary.statusLabel === "Activa" ? "is-license-ok" : "is-license-warn");
  }

  const alerts = document.getElementById("homeAlerts");
  if (alerts) {
    alerts.innerHTML = `
      <div class="list-card"><strong>${low} productos con stock bajo</strong><span>Revisa reposiciÃ³n para evitar quiebres.</span></div>
      <div class="list-card"><strong>${out} productos agotados</strong><span>No estÃ¡n disponibles para nuevas ventas.</span></div>
      <div class="list-card"><strong>${state.clients.length} clientes registrados</strong><span>Base comercial lista para usar.</span></div>
    `;
  }

  const recent = document.getElementById("recentSalesList");
  if (recent) {
    recent.innerHTML = activeSales.length
      ? activeSales.slice().reverse().slice(0, 5).map((sale) => `
          <div class="list-card">
            <strong>${escapeHtml(sale.ticketNumber)} Â· ${formatCurrency(sale.total)}</strong>
            <span>${escapeHtml(sale.clientName)} Â· ${escapeHtml(sale.paymentMethod)} Â· ${escapeHtml(sale.date)}</span>
          </div>
        `).join("")
      : `<div class="list-card"><strong>Sin ventas recientes</strong><span>Las prÃ³ximas ventas aparecerÃ¡n aquÃ­.</span></div>`;
  }
}

function renderInventory() {
  setText("inventoryMetricCount", String(state.inventory.length));
  setText("inventoryMetricLow", String(state.inventory.filter((item) => item.stock > 0 && item.stock <= 10).length));
  setText("inventoryMetricOut", String(state.inventory.filter((item) => item.stock === 0).length));
  setText("inventoryMetricValue", formatCurrency(state.inventory.reduce((sum, item) => sum + item.price * item.stock, 0)));

  const alerts = document.getElementById("inventoryAlerts");
  if (alerts) {
    const lowItems = state.inventory.filter((item) => item.stock > 0 && item.stock <= 10);
    const expirationAlerts = getExpirationAlerts().slice(0, 3);
    alerts.innerHTML = expirationAlerts.length
      ? expirationAlerts.map(({ item, meta }) => `
          <div class="list-card">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${meta.status === "expired" ? `Vencido hace ${meta.days} dÃ­a(s).` : `Vence en ${meta.days} dÃ­a(s).`}</span>
          </div>
        `).join("")
      : lowItems.length
      ? lowItems.map((item) => `
          <div class="list-card">
            <strong>${escapeHtml(item.name)}</strong>
            <span>Stock bajo: ${item.stock} unidades.</span>
          </div>
        `).join("")
      : `<div class="list-card"><strong>Inventario estable</strong><span>No hay alertas crÃ­ticas.</span></div>`;
  }

  const categories = document.getElementById("inventoryCategoryList");
  if (categories) {
    const grouped = [...new Set(state.inventory.map((item) => item.category))].map((category) => {
      const items = state.inventory.filter((item) => item.category === category);
      return {
        category,
        count: items.length,
        units: items.reduce((sum, item) => sum + item.stock, 0)
      };
    });
    categories.innerHTML = grouped.map((group) => `
      <div class="list-card">
        <strong>${escapeHtml(getCategoryLabel(group.category))} Â· ${group.count} productos</strong>
        <span>${group.units} unidades disponibles.</span>
      </div>
    `).join("");
  }

  const board = document.getElementById("inventoryBoard");
  if (board) {
    board.innerHTML = state.inventory.map((item) => `
      <article class="inventory-tile ${item.stock === 0 ? "is-stock-out" : item.stock <= 10 ? "is-stock-low" : "is-stock-ok"}">
        ${renderProductVisual(item, { className: "inventory-tile-visual" })}
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(getCategoryLabel(item.category))}</span>
        <span>${formatCurrency(item.price)}</span>
        <span>Stock: ${item.stock}</span>
      </article>
    `).join("");
  }

  const table = document.getElementById("inventoryTableBody");
  if (table) {
    const filters = getInventoryTableFilters();
    const filteredItems = state.inventory.filter((item) => matchesInventoryFilters(item, filters));
    table.innerHTML = filteredItems.map((item) => {
      const expirationMeta = getExpirationMeta(item);
      const expirationBadge = getExpirationBadge(expirationMeta);
      return `
      <tr class="inventory-row-${expirationBadge.className}">
        <td>${escapeHtml(item.sku)}</td>
        <td>${escapeHtml(item.name)}</td>
        <td>${renderProductVisual(item, { className: "inventory-table-thumb" })}</td>
        <td>${escapeHtml(getCategoryLabel(item.category))}</td>
        <td>${escapeHtml(item.batch || "-")}</td>
        <td>${escapeHtml(formatDisplayDate(item.expirationDate))}</td>
        <td><span class="state-pill expiration-${expirationBadge.className}">${expirationBadge.label}</span></td>
        <td>${escapeHtml(item.laboratory || "-")}</td>
        <td>${formatCurrency(item.price)}</td>
        <td>${item.stock}</td>
        <td><span class="state-pill ${item.active === "NO" || item.stock <= 10 ? "warn" : "ok"}">${item.active === "NO" ? "Inactivo" : item.stock <= 10 ? "Stock bajo" : "Disponible"}</span></td>
        <td><button class="btn btn-sm btn-outline-secondary inventory-edit-btn" type="button" data-id="${escapeHtml(item.id)}">Editar</button></td>
      </tr>
    `;
    }).join("");

    if (!filteredItems.length) {
      table.innerHTML = `<tr><td colspan="12"><div class="empty-state compact-empty"><p>No hay productos para esos filtros.</p></div></td></tr>`;
    }
  }

  renderExpirationModal();
  updateInventoryFormStatus();
}

function getInventoryForm() {
  return document.getElementById("inventoryForm");
}

function updateInventoryFormStatus(message = "Listo para guardar.", isError = false) {
  const status = document.getElementById("inventoryFormStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

function updateInventoryImagePreview(value = "") {
  const preview = document.getElementById("inventoryImagePreview");
  const emptyState = document.getElementById("inventoryImagePreviewEmpty");
  const imageUrl = normalizeInventoryImage(value);
  if (!preview || !emptyState) return;
  if (imageUrl) {
    preview.src = imageUrl;
    preview.hidden = false;
    emptyState.hidden = true;
    return;
  }
  preview.src = "";
  preview.hidden = true;
  emptyState.hidden = false;
}

function getInventoryFormImageValue() {
  const uploadedImage = normalizeInventoryImage(document.getElementById("inventoryImageData")?.value);
  const manualUrl = normalizeInventoryImage(document.getElementById("inventoryImageUrl")?.value);
  return uploadedImage || manualUrl;
}

function buildInventoryImageSearchUrl() {
  const name = String(document.getElementById("inventoryName")?.value || "").trim();
  const laboratory = String(document.getElementById("inventoryLaboratory")?.value || "").trim();
  const searchTerm = [name, laboratory, "medicamento"].filter(Boolean).join(" ");
  if (!searchTerm) return "";
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchTerm)}`;
}

function openInventoryImageSearch() {
  const url = buildInventoryImageSearchUrl();
  if (!url) {
    updateInventoryFormStatus("Escribe el nombre del producto antes de buscar una imagen.", true);
    return;
  }

  const searchWindow = window.open(url, "_blank", "noopener,noreferrer");
  if (!searchWindow) {
    updateInventoryFormStatus("No se pudo abrir la busqueda. Revisa si el navegador bloqueo la ventana.", true);
    return;
  }

  updateInventoryFormStatus("Busqueda abierta. Copia la URL de la imagen y pegala en el campo.");
}

function resetInventoryForm() {
  const form = getInventoryForm();
  if (!form) return;
  form.reset();
  document.getElementById("inventoryItemId").value = "";
  document.getElementById("inventoryCategory").value = "analgesico";
  document.getElementById("inventoryActive").value = "SI";
  const imageData = document.getElementById("inventoryImageData");
  if (imageData) imageData.value = "";
  const imageInput = document.getElementById("inventoryImageInput");
  if (imageInput) imageInput.value = "";
  updateInventoryImagePreview("");
  setText("inventoryFormTitle", "Nuevo producto");
  document.getElementById("inventorySaveButton")?.removeAttribute("disabled");
  updateInventoryFormStatus("Listo para guardar.");
}

function setInventoryScannerStatus(message = "") {
  const status = document.getElementById("inventoryScannerStatus");
  if (status) status.textContent = message;
}

function stopInventoryScanner() {
  inventoryScannerState.active = false;
  if (inventoryScannerState.rafId) {
    window.cancelAnimationFrame(inventoryScannerState.rafId);
    inventoryScannerState.rafId = 0;
  }
  if (inventoryScannerState.stream) {
    inventoryScannerState.stream.getTracks().forEach((track) => track.stop());
    inventoryScannerState.stream = null;
  }
  const video = document.getElementById("inventoryScannerVideo");
  if (video) {
    video.pause();
    video.srcObject = null;
  }
}

function closeInventoryScannerModal() {
  stopInventoryScanner();
  const modal = document.getElementById("inventoryScannerModal");
  if (modal) modal.hidden = true;
}

async function startInventoryScannerLoop() {
  const video = document.getElementById("inventoryScannerVideo");
  if (!video || !inventoryScannerState.detector || !inventoryScannerState.active) return;

  if (video.readyState >= 2) {
    try {
      const codes = await inventoryScannerState.detector.detect(video);
      const rawValue = String(codes?.[0]?.rawValue || "").trim();
      if (rawValue) {
        const barcodeInput = document.getElementById("inventoryBarcode");
        if (barcodeInput) {
          barcodeInput.value = rawValue;
          barcodeInput.dispatchEvent(new Event("input", { bubbles: true }));
          barcodeInput.focus();
        }
        updateInventoryFormStatus("Codigo capturado correctamente.");
        closeInventoryScannerModal();
        return;
      }
    } catch {
      // Seguimos intentando mientras la camara permanezca activa.
    }
  }

  inventoryScannerState.rafId = window.requestAnimationFrame(() => {
    startInventoryScannerLoop();
  });
}

async function openInventoryScannerModal() {
  const modal = document.getElementById("inventoryScannerModal");
  const video = document.getElementById("inventoryScannerVideo");
  if (!modal || !video) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    await showInfoDialog("Este dispositivo no permite usar la camara desde el navegador.", {
      title: "Camara no disponible",
      variant: "warn"
    });
    return;
  }

  if (typeof window.BarcodeDetector === "undefined") {
    await showInfoDialog("Este navegador no soporta lector QR integrado. Puedes usar un lector externo en el campo Codigo de barras.", {
      title: "Lector no disponible",
      variant: "warn"
    });
    return;
  }

  modal.hidden = false;
  setInventoryScannerStatus("Activando camara...");

  try {
    inventoryScannerState.detector = new window.BarcodeDetector({
      formats: ["qr_code", "ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "codabar", "itf"]
    });
  } catch {
    inventoryScannerState.detector = new window.BarcodeDetector();
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" }
      },
      audio: false
    });
    inventoryScannerState.stream = stream;
    inventoryScannerState.active = true;
    video.srcObject = stream;
    await video.play();
    setInventoryScannerStatus("Buscando codigo...");
    startInventoryScannerLoop();
  } catch (error) {
    closeInventoryScannerModal();
    await showInfoDialog(error.message || "No fue posible abrir la camara para escanear.", {
      title: "Error al abrir camara",
      variant: "warn"
    });
  }
}

function populateInventoryForm(item) {
  document.getElementById("inventoryItemId").value = item.id;
  document.getElementById("inventorySku").value = item.sku || "";
  document.getElementById("inventoryName").value = item.name || "";
  document.getElementById("inventoryCategory").value = item.category || "general";
  document.getElementById("inventoryPrice").value = item.price ?? 0;
  document.getElementById("inventoryStock").value = item.stock ?? 0;
  document.getElementById("inventoryBatch").value = item.batch || "";
  document.getElementById("inventoryExpirationDate").value = item.expirationDate || "";
  document.getElementById("inventoryLaboratory").value = item.laboratory || "";
  document.getElementById("inventoryBarcode").value = item.barcode || "";
  document.getElementById("inventoryDescription").value = item.description || "";
  const imageUrlInput = document.getElementById("inventoryImageUrl");
  const imageDataInput = document.getElementById("inventoryImageData");
  const imageValue = item.imageUrl || "";
  if (imageValue.startsWith("data:image/")) {
    if (imageUrlInput) imageUrlInput.value = "";
    if (imageDataInput) imageDataInput.value = imageValue;
  } else {
    if (imageUrlInput) imageUrlInput.value = imageValue;
    if (imageDataInput) imageDataInput.value = "";
  }
  const imageInput = document.getElementById("inventoryImageInput");
  if (imageInput) imageInput.value = "";
  updateInventoryImagePreview(imageValue);
  document.getElementById("inventoryActive").value = item.active || "SI";
  setText("inventoryFormTitle", `Editar: ${item.name}`);
  updateInventoryFormStatus("Editando producto existente.");
}

function readInventoryFormData() {
  const id = document.getElementById("inventoryItemId").value.trim();
  const sku = document.getElementById("inventorySku").value.trim();
  const name = document.getElementById("inventoryName").value.trim();
  const category = normalizeCategory(document.getElementById("inventoryCategory").value);
  const price = Number(document.getElementById("inventoryPrice").value || 0);
  const stock = Number(document.getElementById("inventoryStock").value || 0);
  const batch = document.getElementById("inventoryBatch").value.trim();
  const expirationDate = document.getElementById("inventoryExpirationDate").value.trim();
  const laboratory = document.getElementById("inventoryLaboratory").value.trim();
  const barcode = document.getElementById("inventoryBarcode").value.trim();
  const description = document.getElementById("inventoryDescription").value.trim();
  const imageUrl = getInventoryFormImageValue();
  const active = document.getElementById("inventoryActive").value || "SI";

  if (!sku || !name) {
    throw new Error("SKU y nombre son obligatorios.");
  }

  return {
    id: id || name,
    sku,
    nombre: name,
    categoria: category,
    precio: Number.isFinite(price) ? price : 0,
    stock: Number.isFinite(stock) ? stock : 0,
    lote: batch,
    fecha_vencimiento: expirationDate,
    laboratorio: laboratory,
    codigo_barras: barcode,
    descripcion: description,
    imagen_url: imageUrl,
    activo: active
  };
}

function applyRemoteInventoryState(items, updatedAt = null) {
  state.inventory = items.map(normalizeInventoryItem).filter((entry) => entry.name);
  state.inventorySyncMeta = {
    source: isDesktopDbEnabled() ? "MySQL/MariaDB" : INVENTORY_API_URL,
    lastSyncAt: new Date().toISOString(),
    updatedAt,
    total: state.inventory.length,
    status: `Sincronizado (${state.inventory.length} productos)`
  };
  saveData();
  saveSyncMeta(state.inventorySyncMeta);
  rerenderCurrentPage();
}

function normalizeSaleItem(item) {
  return {
    id: String(item?.id || "").trim(),
    name: String(item?.name || "").trim(),
    sku: String(item?.sku || "").trim(),
    price: Number(item?.price || 0),
    quantity: Number(item?.quantity || 0),
    originalSubtotal: Number(item?.originalSubtotal ?? Number(item?.price || 0) * Number(item?.quantity || 0)),
    promoDiscount: Number(item?.promoDiscount || item?.promotionDiscount || 0),
    lineTotal: Number(item?.lineTotal ?? item?.subtotal ?? Math.max(0, (Number(item?.price || 0) * Number(item?.quantity || 0)) - Number(item?.promoDiscount || item?.promotionDiscount || 0))),
    promotionId: String(item?.promotionId || "").trim(),
    promotionName: String(item?.promotionName || "").trim(),
    promotionDiscountType: String(item?.promotionDiscountType || "").trim(),
    promotionDiscountValue: Number(item?.promotionDiscountValue || 0)
  };
}

function normalizeCashClosureRecord(record, index) {
  const openingAmount = Number(record?.openingAmount || 0);
  const cashSales = Number(record?.cashSales || 0);
  const cardSales = Number(record?.cardSales || 0);
  const transferSales = Number(record?.transferSales || 0);
  const withdrawalsTotal = Number(record?.withdrawalsTotal || 0);
  const expenses = Math.max(0, Math.min(Number(record?.expenses || 0), 450000));
  const countedCash = Number(record?.countedCash || 0);
  const expectedDrawer = openingAmount + cashSales - withdrawalsTotal - expenses;

  return {
    id: String(record?.id || crypto.randomUUID()).trim(),
    date: normalizeInputDateValue(record?.date || new Date()),
    createdAt: String(record?.createdAt || new Date().toISOString()).trim(),
    user: String(record?.user || sessionState.user || "Administrador Farma POS").trim(),
    openingAmount,
    cashSales,
    cardSales,
    transferSales,
    withdrawalsTotal,
    expenses,
    countedCash,
    expectedDrawer,
    difference: countedCash - expectedDrawer,
    transactions: Number(record?.transactions || 0),
    totalSales: Number(record?.totalSales || 0),
    units: Number(record?.units || 0),
    observations: String(record?.observations || "").trim(),
    closureNumber: String(record?.closureNumber || `C-${String(index + 1).padStart(4, "0")}`).trim(),
    sales: Array.isArray(record?.sales)
      ? record.sales.map((sale) => ({
          ticketNumber: String(sale?.ticketNumber || "").trim(),
          total: Number(sale?.total || 0),
          time: String(sale?.time || "").trim(),
          clientName: String(sale?.clientName || "Cliente general").trim(),
          paymentMethod: String(sale?.paymentMethod || "Efectivo").trim()
        }))
      : []
  };
}

function normalizeCashWithdrawalRecord(record, index) {
  return {
    id: String(record?.id || crypto.randomUUID()).trim(),
    date: normalizeInputDateValue(record?.date || record?.fecha || new Date()),
    time: normalizeCashTimeValue(record?.time || record?.hora || ""),
    amount: Number(record?.amount ?? record?.monto ?? 0),
    reason: String(record?.reason || record?.motivo || "").trim(),
    cashierUsername: String(record?.cashierUsername || record?.cajero_usuario || sessionState.username || "").trim(),
    cashierName: String(record?.cashierName || record?.cajero_nombre || sessionState.user || "Cajero").trim(),
    supervisorUsername: String(record?.supervisorUsername || record?.supervisor_usuario || "").trim(),
    supervisorName: String(record?.supervisorName || record?.supervisor_nombre || "").trim(),
    createdAt: String(record?.createdAt || record?.creado_en || "").trim(),
    withdrawalNumber: String(record?.withdrawalNumber || record?.retiro_numero || `R-${String(index + 1).padStart(4, "0")}`).trim()
  };
}

function normalizeCashTimeValue(value) {
  if (!value) return "";

  if (Object.prototype.toString.call(value) === "[object Date]" && !Number.isNaN(value.getTime?.())) {
    return value.toLocaleTimeString("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  }

  const text = String(value).trim();
  if (!text) return "";

  const shortMatch = text.match(/^(\d{1,2}):(\d{2})/);
  if (shortMatch) {
    return `${shortMatch[1].padStart(2, "0")}:${shortMatch[2]}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  }

  return text;
}

function normalizeSaleRecord(sale, index) {
  return {
    id: String(sale?.id || crypto.randomUUID()).trim(),
    ticketNumber: String(sale?.ticketNumber || `T-${String(index + 1).padStart(4, "0")}`).trim(),
    clientName: String(sale?.clientName || "Cliente general").trim(),
    clientDocument: String(sale?.clientDocument || "").trim(),
    date: normalizeInputDateValue(sale?.date || ""),
    time: String(sale?.time || "").trim(),
    paymentMethod: String(sale?.paymentMethod || "Efectivo").trim(),
    cashReceived: Number(sale?.cashReceived || 0),
    change: Number(sale?.change || 0),
    subtotal: Number(sale?.subtotal || 0),
    promoDiscount: Number(sale?.promoDiscount || sale?.promotionDiscount || 0),
    tax: Number(sale?.tax || 0),
    redeemedPoints: Number(sale?.redeemedPoints || sale?.pointsUsed || 0),
    loyaltyDiscount: Number(sale?.loyaltyDiscount || sale?.discountFromPoints || 0),
    earnedPoints: Number(sale?.earnedPoints || 0),
    total: Number(sale?.total || 0),
    items: Array.isArray(sale?.items) ? sale.items.map(normalizeSaleItem) : [],
    status: String(sale?.status || "ACTIVA").trim().toUpperCase() === "ANULADA" ? "ANULADA" : "ACTIVA",
    annulledAt: String(sale?.annulledAt || "").trim(),
    annulledBy: String(sale?.annulledBy || "").trim(),
    annulledReason: String(sale?.annulledReason || "").trim()
  };
}

function getActiveSales() {
  return state.sales.filter((sale) => sale.status !== "ANULADA");
}

function applyRemoteSalesState(sales) {
  state.sales = Array.isArray(sales)
    ? sales.map((sale, index) => normalizeSaleRecord(sale, index))
    : [];

  saveSalesData();
  rerenderCurrentPage();
}

function applyRemoteCashWithdrawalsState(withdrawals) {
  state.cashWithdrawals = Array.isArray(withdrawals)
    ? withdrawals.map((withdrawal, index) => normalizeCashWithdrawalRecord(withdrawal, index))
    : [];
  saveCashWithdrawalsData();
  rerenderCurrentPage();
}

function applyRemoteCashClosuresState(closures) {
  state.cashClosures = Array.isArray(closures)
    ? closures.map((closure, index) => normalizeCashClosureRecord(closure, index))
    : [];
  saveCashClosureData();
  rerenderCurrentPage();
}

function getTodayCashWithdrawals() {
  const today = normalizeInputDateValue(new Date());
  return getCurrentCashSessionWithdrawals().filter((withdrawal) => normalizeInputDateValue(withdrawal.date) === today);
}

function getTodayCashWithdrawalsTotal() {
  return getTodayCashWithdrawals().reduce((sum, withdrawal) => sum + Number(withdrawal.amount || 0), 0);
}

function renderExpirationModal(forceOpen = false) {
  const button = document.getElementById("inventoryExpirationButton");
  const summary = document.getElementById("inventoryExpirationSummary");
  const list = document.getElementById("inventoryExpirationList");
  const modal = document.getElementById("inventoryExpirationModal");
  if (!button || !summary || !list || !modal) return;

  const alerts = getExpirationAlerts();
  const expiredCount = alerts.filter((entry) => entry.meta.status === "expired").length;
  const soonCount = alerts.filter((entry) => entry.meta.status === "soon").length;

  button.textContent = alerts.length ? `Ver vencimientos (${alerts.length})` : "Ver vencimientos";
  summary.textContent = alerts.length
    ? `${expiredCount} vencidos y ${soonCount} prÃ³ximos a vencer.`
    : "Sin alertas de vencimiento.";

  list.innerHTML = alerts.length
    ? alerts.map(({ item, meta }) => `
        <article class="inventory-alert-item ${meta.status === "expired" ? "is-expired" : "is-soon"}">
          <strong>${escapeHtml(item.name)}</strong>
          <span>Lote: ${escapeHtml(item.batch || "-")} Â· Vence: ${escapeHtml(formatDisplayDate(item.expirationDate))}</span>
          <span>${meta.status === "expired" ? `Vencido hace ${meta.days} dÃ­a(s)` : `Vence en ${meta.days} dÃ­a(s)`}</span>
          <span>Laboratorio: ${escapeHtml(item.laboratory || "-")}</span>
        </article>
      `).join("")
    : `<div class="list-card"><strong>Inventario al dÃ­a</strong><span>No hay productos vencidos ni prÃ³ximos a vencer.</span></div>`;

  if (forceOpen || (alerts.length && !state.expirationModalShown)) {
    modal.hidden = false;
    state.expirationModalShown = true;
  }
}

function closeInventoryExpirationModal() {
  const modal = document.getElementById("inventoryExpirationModal");
  if (modal) modal.hidden = true;
}

function openCashOpeningModal() {
  const modal = document.getElementById("cashOpeningModal");
  const input = document.getElementById("salesOpeningAmount");
  const printButton = document.getElementById("printOpeningTicketModal");
  const confirmButton = document.getElementById("confirmOpenCashDrawer");
  if (!modal || !input) return;
  input.value = String(state.cashClosureDraft.openingAmount || 0);
  if (printButton) {
    printButton.hidden = !state.cashClosureDraft.isOpen;
  }
  if (confirmButton) {
    confirmButton.textContent = state.cashClosureDraft.isOpen ? "Actualizar base" : "Abrir caja";
  }
  modal.hidden = false;
  window.setTimeout(() => input.focus(), 30);
}

function closeCashOpeningModal() {
  const modal = document.getElementById("cashOpeningModal");
  if (modal) modal.hidden = true;
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportInventoryAsJson() {
  downloadBlob("inventario-farmapos.json", JSON.stringify(state.inventory, null, 2), "application/json;charset=utf-8");
}

function exportInventoryAsCsv() {
  const headers = ["sku", "nombre", "categoria", "precio", "stock", "lote", "fecha_vencimiento", "laboratorio", "codigo_barras", "descripcion", "imagen_url", "activo"];
  const rows = state.inventory.map((item) => [
    item.sku,
    item.name,
    item.category,
    item.price,
    item.stock,
    item.batch,
    item.expirationDate,
    item.laboratory,
    item.barcode,
    item.description,
    item.imageUrl || "",
    item.active
  ]);
  const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  downloadBlob("inventario-farmapos.csv", csv, "text/csv;charset=utf-8");
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (insideQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === "," && !insideQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function parseCsvText(text) {
  const normalized = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawLines = normalized.split("\n").filter((line) => line.trim() !== "");
  if (rawLines.length < 2) {
    throw new Error("El CSV debe incluir encabezados y al menos una fila de datos.");
  }

  const headers = parseCsvLine(rawLines[0]).map((header) => header.trim().toLowerCase());
  const rows = rawLines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] != null ? values[index].trim() : "";
    });
    return row;
  });

  return { headers, rows };
}

function normalizeCsvHeader(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function mapCsvRowToInventoryItem(row, index) {
  const aliases = {
    id: ["id"],
    sku: ["sku", "codigo", "codigo_producto"],
    nombre: ["nombre", "producto", "name"],
    categoria: ["categoria", "category"],
    precio: ["precio", "price"],
    stock: ["stock", "cantidad", "existencia"],
    lote: ["lote", "batch"],
    fecha_vencimiento: ["fecha_vencimiento", "vencimiento", "fecha de vencimiento", "expiration_date"],
    laboratorio: ["laboratorio", "lab"],
    codigo_barras: ["codigo_barras", "codigo de barras", "barcode"],
    descripcion: ["descripcion", "descripciÃ³n", "description"],
    imagen_url: ["imagen_url", "image_url", "imagen", "foto", "image", "imageurl", "fotografia"],
    activo: ["activo", "estado", "active"]
  };

  const normalizedRow = {};
  Object.entries(row).forEach(([key, value]) => {
    normalizedRow[normalizeCsvHeader(key)] = value;
  });

  const pick = (field) => {
    const match = aliases[field].find((alias) => normalizedRow[normalizeCsvHeader(alias)] != null && normalizedRow[normalizeCsvHeader(alias)] !== "");
    return match ? normalizedRow[normalizeCsvHeader(match)] : "";
  };

  const sku = String(pick("sku")).trim();
  const nombre = String(pick("nombre")).trim() || sku;
  if (!sku) {
    throw new Error(`La fila ${index + 2} no tiene SKU.`);
  }

  return {
    id: String(pick("id")).trim() || nombre || sku,
    sku,
    nombre,
    categoria: String(pick("categoria")).trim() || "general",
    precio: Number(pick("precio") || 0),
    stock: Number(pick("stock") || 0),
    lote: String(pick("lote")).trim(),
    fecha_vencimiento: normalizeInputDateValue(pick("fecha_vencimiento")),
    laboratorio: String(pick("laboratorio")).trim(),
    codigo_barras: String(pick("codigo_barras")).trim(),
    descripcion: String(pick("descripcion")).trim(),
    imagen_url: normalizeInventoryImage(pick("imagen_url")),
    activo: String(pick("activo")).trim().toUpperCase() || "SI"
  };
}

async function bulkUpsertInventoryItemsToApi(items) {
  if (isDesktopDbEnabled()) {
    const result = await desktopDb.bulkUpsertInventoryItems(items.map((item) => getDesktopCompanyPayload(item)));
    applyRemoteInventoryState(result.items || [], new Date().toISOString());
    return result.summary || { processed: items.length, created: items.length, updated: 0 };
  }

  const data = await fetchJsonWithTimeout(INVENTORY_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "bulk_upsert",
      items
    })
  });

  if (!data?.ok || !Array.isArray(data.items)) {
    throw new Error(data?.error || "No fue posible importar el CSV.");
  }

  applyRemoteInventoryState(data.items, data.updated_at || null);
  return data.summary || { processed: items.length, created: 0, updated: 0 };
}

async function importInventoryFromCsvFile(file) {
  const text = await file.text();
  const parsed = parseCsvText(text);
  const items = parsed.rows.map((row, index) => mapCsvRowToInventoryItem(row, index));
  if (!items.length) {
    throw new Error("El archivo no contiene filas vÃ¡lidas para importar.");
  }

  return bulkUpsertInventoryItemsToApi(items);
}

async function saveInventoryItemToApi(item) {
  if (isDesktopDbEnabled()) {
    const items = await desktopDb.saveInventoryItem(getDesktopCompanyPayload(item));
    applyRemoteInventoryState(items || [], new Date().toISOString());
    await addAuditLog({
      module: "inventario",
      action: "actualizar",
      entityId: item.id,
      entityName: item.name,
      detail: `Producto guardado con stock ${item.stock} y precio ${formatCurrency(item.price || 0)}`
    });
    return;
  }

  const data = await fetchJsonWithTimeout(INVENTORY_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "upsert",
      item
    })
  });
  if (!data?.ok || !Array.isArray(data.items)) {
    throw new Error(data?.error || "No fue posible guardar el producto.");
  }
  applyRemoteInventoryState(data.items, data.updated_at || null);
  await addAuditLog({
    module: "inventario",
    action: "actualizar",
    entityId: item.id,
    entityName: item.name,
    detail: `Producto guardado con stock ${item.stock} y precio ${formatCurrency(item.price || 0)}`
  });
}

async function decrementInventoryStockInApi(items) {
  if (isDesktopDbEnabled()) {
    const nextItems = await desktopDb.decrementInventoryStock(items.map((item) => getDesktopCompanyPayload(item)));
    applyRemoteInventoryState(nextItems || [], new Date().toISOString());
    return;
  }

  const data = await fetchJsonWithTimeout(INVENTORY_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "decrement_stock",
      items: items.map((item) => ({
        id: item.id,
        sku: item.sku || "",
        quantity: item.quantity
      }))
    })
  });
  if (!data?.ok || !Array.isArray(data.items)) {
    throw new Error(data?.error || "No fue posible actualizar el stock en Google Sheets.");
  }
  applyRemoteInventoryState(data.items, data.updated_at || null);
}

async function syncSalesFromApi() {
  if (isDesktopDbEnabled()) {
    try {
      const bootstrap = await desktopDb.bootstrap(getDesktopCompanyPayload());
      applyRemoteSalesState(Array.isArray(bootstrap?.sales) ? bootstrap.sales : []);
      if (Array.isArray(bootstrap?.clients)) {
        state.clients = bootstrap.clients.map(normalizeClientRecord);
        state.selectedClientId = state.clients[0]?.id || state.selectedClientId;
        saveData();
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  if (!INVENTORY_API_URL) return false;

  try {
    const url = `${INVENTORY_API_URL}?mode=sales`;
    const data = await fetchJsonWithTimeout(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });

    if (!data?.ok || !Array.isArray(data.sales)) {
      throw new Error("Respuesta invÃ¡lida del Apps Script para ventas.");
    }

    applyRemoteSalesState(data.sales);
    return true;
  } catch (error) {
    return false;
  }
}

async function registerSaleInApi(sale) {
  if (isDesktopDbEnabled()) {
    const data = await desktopDb.registerSale(getDesktopCompanyPayload(sale));
    applyRemoteSalesState(Array.isArray(data?.sales) ? data.sales : []);
    const bootstrap = await desktopDb.bootstrap(getDesktopCompanyPayload());
      if (Array.isArray(bootstrap?.clients)) {
        state.clients = bootstrap.clients.map(normalizeClientRecord);
        saveData();
      }
      const saved = normalizeSaleRecord(data?.sale, 0);
      await addAuditLog({
        module: "ventas",
        action: "crear",
        entityId: saved.id,
        entityName: saved.ticketNumber,
        detail: `Venta registrada por ${formatCurrency(saved.total || 0)} para ${saved.clientName || "Cliente general"}`
      });
      return saved;
    }

  const data = await fetchJsonWithTimeout(INVENTORY_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "register_sale",
      sale
    })
  });

  if (!data?.ok || !Array.isArray(data.sales) || !data.sale) {
    throw new Error(data?.error || "No fue posible guardar la venta en Google Sheets.");
  }

  applyRemoteSalesState(data.sales);
  const saved = normalizeSaleRecord(data.sale, data.sales.length - 1);
  await addAuditLog({
    module: "ventas",
    action: "crear",
    entityId: saved.id,
    entityName: saved.ticketNumber,
    detail: `Venta registrada por ${formatCurrency(saved.total || 0)} para ${saved.clientName || "Cliente general"}`
  });
  return saved;
}

async function annulSaleInApi({ saleId, annulledBy, annulledReason }) {
  if (isDesktopDbEnabled()) {
    const data = await desktopDb.annulSale(getDesktopCompanyPayload({
      saleId,
      annulledBy,
      annulledReason
    }));
    if (!data?.sale || !Array.isArray(data?.sales)) {
      throw new Error("MariaDB no devolvio la venta anulada correctamente.");
    }
    applyRemoteSalesState(Array.isArray(data?.sales) ? data.sales : []);
    if (Array.isArray(data?.inventory)) {
      applyRemoteInventoryState(data.inventory, new Date().toISOString());
    }
      if (Array.isArray(data?.clients)) {
        state.clients = data.clients.map(normalizeClientRecord);
        saveData();
      }
      const saved = normalizeSaleRecord(data?.sale, 0);
      await addAuditLog({
        module: "ventas",
        action: "anular",
        entityId: saved.id,
        entityName: saved.ticketNumber,
        detail: `Venta anulada por ${annulledBy}: ${annulledReason}`
      });
      return saved;
    }

  throw new Error("La anulacion remota de ventas no esta disponible en este modo.")
}

async function syncPharmacyProfileFromApi() {
  if (!shouldAutoSyncSettingsProfile()) {
    return false;
  }

  if (isDesktopDbEnabled()) {
    try {
      const bootstrap = await desktopDb.bootstrap(getDesktopCompanyPayload());
      if (bootstrap?.profile) {
        applyRemotePharmacyProfile(bootstrap.profile);
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  if (!INVENTORY_API_URL) return false;

  try {
    const url = `${INVENTORY_API_URL}?mode=company`;
    const data = await fetchJsonWithTimeout(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });

    if (!data?.ok || !data.profile) {
      throw new Error("Respuesta invÃ¡lida del Apps Script para configuraciÃ³n.");
    }

    applyRemotePharmacyProfile(data.profile);
    return true;
  } catch (error) {
    return false;
  }
}

async function savePharmacyProfileToApi(profile) {
  if (isDesktopDbEnabled()) {
    const savedProfile = await desktopDb.saveCompanyProfile(getDesktopCompanyPayload(profile));
    const normalizedProfile = normalizePharmacyProfile(savedProfile);
    applyRemotePharmacyProfile(normalizedProfile);
    await addAuditLog({
      module: "configuracion",
      action: "actualizar",
      entityId: "pharmacy-profile",
      entityName: normalizedProfile.name || "Perfil farmacia",
      detail: "Perfil de empresa actualizado"
    });
    return normalizedProfile;
  }

  const data = await fetchJsonWithTimeout(INVENTORY_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "save_company_profile",
      profile
    })
  });

  if (!data?.ok || !data.profile) {
    throw new Error(data?.error || "No fue posible guardar los datos de la farmacia en Google Sheets.");
  }

  data.profile = normalizePharmacyProfile(data.profile);
  applyRemotePharmacyProfile(data.profile);
  await addAuditLog({
    module: "configuracion",
    action: "actualizar",
    entityId: "pharmacy-profile",
    entityName: data.profile.name || "Perfil farmacia",
    detail: "Perfil de empresa actualizado"
  });
  return data.profile;
}

async function loadUsersFromApi() {
  if (isDesktopDbEnabled()) {
    if (!state.licensingCompanies.length) {
      const overview = await desktopDb.licensingOverview();
      applyLicensingOverview(overview);
    }

    const users = await desktopDb.listUsers();
    state.users = Array.isArray(users) ? users.map(normalizeUserAdminRecord) : [];
    return state.users;
  }

  if (!isWebDbApiEnabled()) {
    throw new Error("La administracion de usuarios requiere la app desktop conectada a MariaDB.");
  }

  if (!state.licensingCompanies.length) {
    const data = await fetchWebDbApiJson("/v1/licensing/overview", { method: "GET" });
    applyLicensingOverview(data.overview || {});
  }

  const data = await fetchWebDbApiJson("/v1/users", { method: "GET" });
  const users = data.users || [];
  state.users = Array.isArray(users) ? users.map(normalizeUserAdminRecord) : [];
  return state.users;
}

async function saveUserToApi(user) {
  if (isDesktopDbEnabled()) {
    const users = await desktopDb.saveUser(user);
    state.users = Array.isArray(users) ? users.map(normalizeUserAdminRecord) : [];
    return state.users;
  }

  if (!isWebDbApiEnabled()) {
    throw new Error("La administracion de usuarios requiere la app desktop conectada a MariaDB.");
  }

  const data = await fetchWebDbApiJson("/v1/users", {
    method: "POST",
    body: JSON.stringify(user || {})
  });
  const users = data.users || [];
  state.users = Array.isArray(users) ? users.map(normalizeUserAdminRecord) : [];
  return state.users;
}

async function setUserActiveInApi(id, active) {
  if (isDesktopDbEnabled()) {
    const users = await desktopDb.setUserActive({ id, active });
    state.users = Array.isArray(users) ? users.map(normalizeUserAdminRecord) : [];
    return state.users;
  }

  if (!isWebDbApiEnabled()) {
    throw new Error("La administracion de usuarios requiere la app desktop conectada a MariaDB.");
  }

  const data = await fetchWebDbApiJson(`/v1/users/${encodeURIComponent(String(id || "").trim())}/active`, {
    method: "POST",
    body: JSON.stringify({ active })
  });
  const users = data.users || [];
  state.users = Array.isArray(users) ? users.map(normalizeUserAdminRecord) : [];
  return state.users;
}

function applyLicensingOverview(data) {
  state.licensingCompanies = Array.isArray(data?.companies) ? data.companies : [];
  state.licensingLicenses = Array.isArray(data?.licenses) ? data.licenses : [];
  state.licensingDevices = Array.isArray(data?.devices) ? data.devices : [];
  state.licensingHistory = Array.isArray(data?.history) ? data.history : [];
  state.licensingLoaded = true;
}

async function loadLicensingOverviewFromApi() {
  if (!isAdminSession()) {
    throw new Error("No tienes permisos para consultar el panel de licencias.");
  }
  if (isDesktopDbEnabled()) {
    const overview = await desktopDb.licensingOverview();
    applyLicensingOverview(overview);
    return overview;
  }
  if (!isWebDbApiEnabled()) {
    throw new Error("El panel de licencias requiere la app desktop conectada a MariaDB.");
  }
  const data = await fetchWebDbApiJson("/v1/licensing/overview", { method: "GET" });
  const overview = data.overview || {};
  applyLicensingOverview(overview);
  return overview;
}

async function saveCompanyToApi(company) {
  if (!isAdminSession()) {
    throw new Error("No tienes permisos para editar empresas.");
  }
  const overview = isDesktopDbEnabled()
    ? await desktopDb.saveCompany(company)
    : (await fetchWebDbApiJson("/v1/licensing/companies", {
        method: "POST",
        body: JSON.stringify(company || {})
      })).overview;
  applyLicensingOverview(overview);
  return overview;
}

async function saveLicenseToApi(license) {
  if (!isAdminSession()) {
    throw new Error("No tienes permisos para editar licencias.");
  }
  const overview = isDesktopDbEnabled()
    ? await desktopDb.saveLicense(license)
    : (await fetchWebDbApiJson("/v1/licensing/licenses", {
        method: "POST",
        body: JSON.stringify(license || {})
      })).overview;
  applyLicensingOverview(overview);
  return overview;
}

async function assignLicenseToCurrentInstallationInApi(id) {
  if (!isAdminSession()) {
    throw new Error("No tienes permisos para asignar licencias.");
  }
  const response = isDesktopDbEnabled()
    ? await desktopDb.assignLicenseToCurrentInstallation({ id })
    : (await fetchWebDbApiJson(`/v1/licensing/licenses/${encodeURIComponent(String(id || "").trim())}/assign-current`, {
        method: "POST",
        body: JSON.stringify({})
      })).response;
  applyLicensingOverview(response?.overview || {});
  return response?.assigned || null;
}

async function setLicenseStatusInApi(id, status) {
  if (!isAdminSession()) {
    throw new Error("No tienes permisos para cambiar el estado de licencias.");
  }
  const overview = isDesktopDbEnabled()
    ? await desktopDb.setLicenseStatus({ id, status })
    : (await fetchWebDbApiJson(`/v1/licensing/licenses/${encodeURIComponent(String(id || "").trim())}/status`, {
        method: "POST",
        body: JSON.stringify({ status })
      })).overview;
  applyLicensingOverview(overview);
  return overview;
}

async function renewLicenseInApi(id) {
  if (!isAdminSession()) {
    throw new Error("No tienes permisos para renovar licencias.");
  }
  const overview = isDesktopDbEnabled()
    ? await desktopDb.renewLicense({ id })
    : (await fetchWebDbApiJson(`/v1/licensing/licenses/${encodeURIComponent(String(id || "").trim())}/renew`, {
        method: "POST",
        body: JSON.stringify({})
      })).overview;
  applyLicensingOverview(overview);
  return overview;
}

async function releaseLicenseDeviceInApi(licenseId, installationId) {
  if (!isAdminSession()) {
    throw new Error("No tienes permisos para liberar equipos de licencias.");
  }
  const normalizedLicenseId = String(licenseId || "").trim();
  const normalizedInstallationId = String(installationId || "").trim();
  if (!normalizedLicenseId || !normalizedInstallationId) {
    throw new Error("No fue posible identificar la licencia o el equipo que deseas liberar.");
  }

  const overview = isDesktopDbEnabled()
    ? await desktopDb.releaseLicenseDevice({
        licenseId: normalizedLicenseId,
        installationId: normalizedInstallationId
      })
    : (await fetchWebDbApiJson(`/v1/licensing/licenses/${encodeURIComponent(normalizedLicenseId)}/devices/${encodeURIComponent(normalizedInstallationId)}/release`, {
        method: "POST",
        body: JSON.stringify({})
      })).overview;
  applyLicensingOverview(overview);
  return overview;
}

function applySupportOverview(data) {
  state.supportTickets = Array.isArray(data?.tickets) ? data.tickets : [];
  state.supportUnreadCompanyTotal = Number(data?.unreadCompanyTotal || 0);
  state.supportUnreadInternalTotal = Number(data?.unreadInternalTotal || 0);
  if (state.supportSelectedTicketId && !state.supportTickets.some((ticket) => ticket.id === state.supportSelectedTicketId)) {
    state.supportSelectedTicketId = "";
    state.supportMessages = [];
  }
  state.supportLoaded = true;
  renderSupportNavBadge();
}

async function loadSupportOverviewFromApi() {
  if (supportApiConfig.enabled) {
    const overview = await fetchSupportApiJson("/tickets", { method: "GET" });
    applySupportOverview(overview);
    return overview;
  }

  if (!isDesktopDbEnabled()) {
    throw new Error("El chat de soporte requiere la API central o la app desktop conectada a MariaDB.");
  }

  const overview = await desktopDb.supportOverview({
    companyId: getSupportCompanyIdentifier(),
    isInternal: isInternalSupportSession()
  });
  applySupportOverview(overview);
  return overview;
}

async function loadSupportThreadFromApi(ticketId) {
  if (supportApiConfig.enabled) {
    const thread = await fetchSupportApiJson(`/tickets/${encodeURIComponent(String(ticketId || "").trim())}`, { method: "GET" });
    state.supportSelectedTicketId = String(thread?.ticket?.id || "").trim();
    state.supportMessages = Array.isArray(thread?.messages) ? thread.messages : [];
    return thread;
  }

  if (!isDesktopDbEnabled()) {
    throw new Error("El chat de soporte requiere la API central o la app desktop conectada a MariaDB.");
  }

  const thread = await desktopDb.supportThread({
    ticketId,
    companyId: getSupportCompanyIdentifier(),
    isInternal: isInternalSupportSession()
  });
  state.supportSelectedTicketId = String(thread?.ticket?.id || "").trim();
  state.supportMessages = Array.isArray(thread?.messages) ? thread.messages : [];
  return thread;
}

async function markSupportTicketReadInApi(ticketId) {
  if (supportApiConfig.enabled) {
    await fetchSupportApiJson(`/tickets/${encodeURIComponent(String(ticketId || "").trim())}/read`, {
      method: "POST",
      body: JSON.stringify({})
    });
    const overview = await loadSupportOverviewFromApi();
    return overview;
  }

  if (!isDesktopDbEnabled()) return false;
  await desktopDb.markSupportTicketRead({
    ticketId,
    readerScope: getSupportScope()
  });
  const overview = await loadSupportOverviewFromApi();
  return overview;
}

async function createSupportTicketInApi(payload) {
  if (supportApiConfig.enabled) {
    const response = await fetchSupportApiJson("/tickets", {
      method: "POST",
      body: JSON.stringify({
        externalCompanyId: getSupportCompanyIdentifier(),
        companyName: String(getCurrentLicenseState()?.companyName || state.pharmacyProfile.name || "Empresa FarmaPOS").trim(),
        licenseCode: String(getCurrentLicenseState()?.code || "").trim(),
        contactName: String(sessionState?.user || "").trim(),
        contactEmail: String(state.pharmacyProfile.email || "").trim(),
        contactPhone: String(state.pharmacyProfile.phone || "").trim(),
        title: payload.title,
        category: payload.category,
        priority: payload.priority,
        message: payload.message,
        createdByUsername: sessionState?.username || "",
        createdByName: sessionState?.user || "Usuario empresa"
      })
    });
    const thread = await loadSupportThreadFromApi(response.ticketId);
    await loadSupportOverviewFromApi();
    await markSupportTicketReadInApi(response.ticketId);
    return thread;
  }

  const thread = await desktopDb.createSupportTicket({
    companyId: getSupportCompanyIdentifier(),
    title: payload.title,
    category: payload.category,
    priority: payload.priority,
    message: payload.message,
    createdByUsername: sessionState?.username || "",
    createdByName: sessionState?.user || "Usuario empresa"
  });
  await loadSupportOverviewFromApi();
  state.supportSelectedTicketId = String(thread?.ticket?.id || "").trim();
  state.supportMessages = Array.isArray(thread?.messages) ? thread.messages : [];
  await markSupportTicketReadInApi(state.supportSelectedTicketId);
  return thread;
}

async function sendSupportMessageInApi(ticketId, message) {
  if (supportApiConfig.enabled) {
    await fetchSupportApiJson(`/tickets/${encodeURIComponent(String(ticketId || "").trim())}/messages`, {
      method: "POST",
      body: JSON.stringify({
        authorUsername: sessionState?.username || "",
        authorName: sessionState?.user || "Usuario",
        message
      })
    });
    const thread = await loadSupportThreadFromApi(ticketId);
    await loadSupportOverviewFromApi();
    await markSupportTicketReadInApi(ticketId);
    return thread;
  }

  const thread = await desktopDb.sendSupportMessage({
    ticketId,
    companyId: getSupportCompanyIdentifier(),
    authorScope: getSupportScope(),
    authorUsername: sessionState?.username || "",
    authorName: sessionState?.user || "Usuario",
    message
  });
  await loadSupportOverviewFromApi();
  state.supportMessages = Array.isArray(thread?.messages) ? thread.messages : [];
  await markSupportTicketReadInApi(ticketId);
  return thread;
}

async function setSupportTicketStatusInApi(ticketId, status) {
  if (supportApiConfig.enabled) {
    await fetchSupportApiJson(`/tickets/${encodeURIComponent(String(ticketId || "").trim())}/status`, {
      method: "POST",
      body: JSON.stringify({ status })
    });
    const thread = await loadSupportThreadFromApi(ticketId);
    await loadSupportOverviewFromApi();
    return thread;
  }

  const thread = await desktopDb.setSupportTicketStatus({ ticketId, status });
  await loadSupportOverviewFromApi();
  state.supportMessages = Array.isArray(thread?.messages) ? thread.messages : state.supportMessages;
  return thread;
}

async function syncCashWithdrawalsFromApi() {
  if (isDesktopDbEnabled()) {
    try {
      const bootstrap = await desktopDb.bootstrap(getDesktopCompanyPayload());
      applyRemoteCashWithdrawalsState(Array.isArray(bootstrap?.withdrawals) ? bootstrap.withdrawals : []);
      return true;
    } catch (error) {
      return false;
    }
  }

  if (!INVENTORY_API_URL) return false;

  try {
    const url = `${INVENTORY_API_URL}?mode=withdrawals`;
    const data = await fetchJsonWithTimeout(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });

    if (!data?.ok || !Array.isArray(data.withdrawals)) {
      throw new Error("Respuesta invalida del Apps Script para retiros.");
    }

    applyRemoteCashWithdrawalsState(data.withdrawals);
    return true;
  } catch (error) {
    return false;
  }
}

async function registerCashWithdrawalInApi(withdrawal, supervisorUsername, supervisorPassword) {
  if (isDesktopDbEnabled()) {
    const data = await desktopDb.registerCashWithdrawal(getDesktopCompanyPayload({
      ...withdrawal,
      supervisorUsername,
      supervisorPassword,
      supervisorName: withdrawal.supervisorName || supervisorUsername
    }));
    applyRemoteCashWithdrawalsState(Array.isArray(data?.withdrawals) ? data.withdrawals : []);
    return normalizeCashWithdrawalRecord(data?.withdrawal, 0);
  }

  const data = await fetchJsonWithTimeout(INVENTORY_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "register_withdrawal",
      withdrawal,
      supervisor_username: supervisorUsername,
      supervisor_password: supervisorPassword
    })
  });

  if (!data?.ok || !data.withdrawal || !Array.isArray(data.withdrawals)) {
    throw new Error(data?.error || "No fue posible guardar el retiro en Google Sheets.");
  }

  applyRemoteCashWithdrawalsState(data.withdrawals);
  return normalizeCashWithdrawalRecord(data.withdrawal, data.withdrawals.length - 1);
}

async function updateCashWithdrawalInApi(withdrawal, supervisorUsername, supervisorPassword) {
  if (isDesktopDbEnabled()) {
    const data = await desktopDb.updateCashWithdrawal(getDesktopCompanyPayload({
      ...withdrawal,
      supervisorUsername,
      supervisorPassword,
      supervisorName: withdrawal.supervisorName || supervisorUsername
    }));
    applyRemoteCashWithdrawalsState(Array.isArray(data?.withdrawals) ? data.withdrawals : []);
    return normalizeCashWithdrawalRecord(data?.withdrawal, 0);
  }

  const data = await fetchJsonWithTimeout(INVENTORY_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "update_withdrawal",
      withdrawal,
      supervisorUsername,
      supervisorPassword
    })
  });

  if (!data?.ok || !data.withdrawal || !Array.isArray(data.withdrawals)) {
    throw new Error(data?.error || "No fue posible actualizar el retiro en Google Sheets.");
  }

  applyRemoteCashWithdrawalsState(data.withdrawals);
  return normalizeCashWithdrawalRecord(data.withdrawal, data.withdrawals.length - 1);
}

async function deleteCashWithdrawalInApi(withdrawalId) {
  if (isDesktopDbEnabled()) {
    const data = await desktopDb.deleteCashWithdrawal(getDesktopCompanyPayload({ id: withdrawalId }));
    applyRemoteCashWithdrawalsState(Array.isArray(data?.withdrawals) ? data.withdrawals : []);
    return normalizeCashWithdrawalRecord(data?.withdrawal, 0);
  }

  const data = await fetchJsonWithTimeout(INVENTORY_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "delete_withdrawal",
      withdrawalId
    })
  });

  if (!data?.ok || !data.withdrawal || !Array.isArray(data.withdrawals)) {
    throw new Error(data?.error || "No fue posible eliminar el retiro en Google Sheets.");
  }

  applyRemoteCashWithdrawalsState(data.withdrawals);
  return normalizeCashWithdrawalRecord(data.withdrawal, 0);
}

async function syncCashClosuresFromApi() {
  if (isDesktopDbEnabled()) {
    try {
      const bootstrap = await desktopDb.bootstrap(getDesktopCompanyPayload());
      applyRemoteCashClosuresState(Array.isArray(bootstrap?.closures) ? bootstrap.closures : []);
      return true;
    } catch (error) {
      return false;
    }
  }

  if (!INVENTORY_API_URL) return false;

  try {
    const url = `${INVENTORY_API_URL}?mode=closures`;
    const data = await fetchJsonWithTimeout(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });

    if (!data?.ok || !Array.isArray(data.closures)) {
      throw new Error("Respuesta invalida del Apps Script para cierres.");
    }

    applyRemoteCashClosuresState(data.closures);
    return true;
  } catch (error) {
    return false;
  }
}

async function registerCashClosureInApi(closure) {
  if (isDesktopDbEnabled()) {
    const data = await desktopDb.registerCashClosure(getDesktopCompanyPayload(closure));
    applyRemoteCashClosuresState(Array.isArray(data?.closures) ? data.closures : []);
    state.cashClosureDraft = {
      ...getDefaultCashClosureDraft(),
      openingAmount: 0,
      countedCash: 0,
      expenses: 0,
      observations: ""
    };
    saveCashClosureDraft();
    return normalizeCashClosureRecord(data?.closure, 0);
  }

  const data = await fetchJsonWithTimeout(INVENTORY_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "register_cash_closure",
      closure
    })
  });

  if (!data?.ok || !data.closure || !Array.isArray(data.closures)) {
    throw new Error(data?.error || "No fue posible guardar el cierre en Google Sheets.");
  }

  applyRemoteCashClosuresState(data.closures);
  state.cashClosureDraft = {
    ...getDefaultCashClosureDraft(),
    openingAmount: 0,
    countedCash: 0,
    expenses: 0,
    observations: ""
  };
  saveCashClosureDraft();
  return normalizeCashClosureRecord(data.closure, data.closures.length - 1);
}

async function updateCashClosureInApi(closure) {
  if (isDesktopDbEnabled()) {
    const data = await desktopDb.updateCashClosure(getDesktopCompanyPayload(closure));
    applyRemoteCashClosuresState(Array.isArray(data?.closures) ? data.closures : []);
    stopEditingCashClosure();
    return normalizeCashClosureRecord(data?.closure, 0);
  }

  const data = await fetchJsonWithTimeout(INVENTORY_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "update_cash_closure",
      closure
    })
  });

  if (!data?.ok || !data.closure || !Array.isArray(data.closures)) {
    throw new Error(data?.error || "No fue posible actualizar el cierre en Google Sheets.");
  }

  applyRemoteCashClosuresState(data.closures);
  stopEditingCashClosure();
  return normalizeCashClosureRecord(data.closure, data.closures.length - 1);
}

async function deleteCashClosureInApi(closureId) {
  if (isDesktopDbEnabled()) {
    const data = await desktopDb.deleteCashClosure(getDesktopCompanyPayload({ id: closureId }));
    applyRemoteCashClosuresState(Array.isArray(data?.closures) ? data.closures : []);
    if (state.editingCashClosureId === closureId) {
      stopEditingCashClosure();
    }
    return normalizeCashClosureRecord(data?.closure, 0);
  }

  const data = await fetchJsonWithTimeout(INVENTORY_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "delete_cash_closure",
      closure_id: closureId
    })
  });

  if (!data?.ok || !data.closure || !Array.isArray(data.closures)) {
    throw new Error(data?.error || "No fue posible eliminar el cierre en Google Sheets.");
  }

  applyRemoteCashClosuresState(data.closures);
  if (state.editingCashClosureId === closureId) {
    stopEditingCashClosure();
  }
  return normalizeCashClosureRecord(data.closure, 0);
}

function bindInventoryEvents() {
  const form = getInventoryForm();
  if (form && !form.dataset.bound) {
    form.dataset.bound = "true";
    resetInventoryForm();
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const saveButton = document.getElementById("inventorySaveButton");
      try {
        const item = readInventoryFormData();
        if (saveButton) saveButton.disabled = true;
        updateInventoryFormStatus("Guardando producto...");
        await saveInventoryItemToApi(item);
        resetInventoryForm();
        updateInventoryFormStatus("Producto guardado y sincronizado.");
      } catch (error) {
        updateInventoryFormStatus(error.message, true);
      } finally {
        if (saveButton) saveButton.disabled = false;
      }
    });
  }

  const resetButton = document.getElementById("inventoryResetButton");
  if (resetButton && !resetButton.dataset.bound) {
    resetButton.dataset.bound = "true";
    resetButton.addEventListener("click", () => {
      resetInventoryForm();
    });
  }

  const refreshButton = document.getElementById("inventoryRefreshButton");
  if (refreshButton && !refreshButton.dataset.bound) {
    refreshButton.dataset.bound = "true";
    refreshButton.addEventListener("click", async () => {
      updateInventoryFormStatus("Sincronizando inventario...");
      const ok = await syncInventoryFromApi();
      updateInventoryFormStatus(ok ? "Inventario sincronizado." : "No se pudo sincronizar el inventario.", !ok);
    });
  }

  const downloadButton = document.getElementById("inventoryDownloadButton");
  if (downloadButton && !downloadButton.dataset.bound) {
    downloadButton.dataset.bound = "true";
    downloadButton.addEventListener("click", () => {
      exportInventoryAsCsv();
      updateInventoryFormStatus("Inventario descargado en formato CSV.");
    });
  }

  const importButton = document.getElementById("inventoryImportButton");
  const importInput = document.getElementById("inventoryImportInput");
  if (importButton && importInput && !importButton.dataset.bound) {
    importButton.dataset.bound = "true";
    importButton.addEventListener("click", () => {
      importInput.click();
    });
  }

  if (importInput && !importInput.dataset.bound) {
    importInput.dataset.bound = "true";
    importInput.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        updateInventoryFormStatus("Importando CSV a Google Sheets...");
        const summary = await importInventoryFromCsvFile(file);
        updateInventoryFormStatus(`ImportaciÃ³n completa. ${summary.processed} filas procesadas, ${summary.created} creadas y ${summary.updated} actualizadas.`);
      } catch (error) {
        updateInventoryFormStatus(error.message || "No se pudo importar el CSV.", true);
      } finally {
        event.target.value = "";
      }
    });
  }

  const expirationButton = document.getElementById("inventoryExpirationButton");
  if (expirationButton && !expirationButton.dataset.bound) {
    expirationButton.dataset.bound = "true";
    expirationButton.addEventListener("click", () => {
      renderExpirationModal(true);
    });
  }

  const closeExpirationButton = document.getElementById("closeInventoryExpirationModal");
  if (closeExpirationButton && !closeExpirationButton.dataset.bound) {
    closeExpirationButton.dataset.bound = "true";
    closeExpirationButton.addEventListener("click", closeInventoryExpirationModal);
  }

  const expirationOverlay = document.getElementById("inventoryExpirationOverlay");
  if (expirationOverlay && !expirationOverlay.dataset.bound) {
    expirationOverlay.dataset.bound = "true";
    expirationOverlay.addEventListener("click", closeInventoryExpirationModal);
  }

  const imageUrlInput = document.getElementById("inventoryImageUrl");
  const imageDataInput = document.getElementById("inventoryImageData");
  if (imageUrlInput && !imageUrlInput.dataset.bound) {
    imageUrlInput.dataset.bound = "true";
    imageUrlInput.addEventListener("input", () => {
      if (imageDataInput) imageDataInput.value = "";
      updateInventoryImagePreview(imageUrlInput.value);
    });
  }

  const imageUploadButton = document.getElementById("inventoryImageUploadButton");
  const imageSearchButton = document.getElementById("inventoryImageSearchButton");
  const imageInput = document.getElementById("inventoryImageInput");
  if (imageSearchButton && !imageSearchButton.dataset.bound) {
    imageSearchButton.dataset.bound = "true";
    imageSearchButton.addEventListener("click", openInventoryImageSearch);
  }

  if (imageUploadButton && imageInput && !imageUploadButton.dataset.bound) {
    imageUploadButton.dataset.bound = "true";
    imageUploadButton.addEventListener("click", () => {
      imageInput.click();
    });
  }

  if (imageInput && !imageInput.dataset.bound) {
    imageInput.dataset.bound = "true";
    imageInput.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        updateInventoryFormStatus("Procesando imagen...");
        const imageUrl = await readProductImageFileAsDataUrl(file);
        if (imageDataInput) imageDataInput.value = imageUrl;
        if (imageUrlInput) imageUrlInput.value = "";
        updateInventoryImagePreview(imageUrl);
        updateInventoryFormStatus("Imagen lista para guardar con tamano optimizado.");
      } catch (error) {
        updateInventoryFormStatus(error.message || "No se pudo procesar la imagen.", true);
      } finally {
        event.target.value = "";
      }
    });
  }

  const imageClearButton = document.getElementById("inventoryImageClearButton");
  if (imageClearButton && !imageClearButton.dataset.bound) {
    imageClearButton.dataset.bound = "true";
    imageClearButton.addEventListener("click", () => {
      if (imageUrlInput) imageUrlInput.value = "";
      if (imageDataInput) imageDataInput.value = "";
      if (imageInput) imageInput.value = "";
      updateInventoryImagePreview("");
      updateInventoryFormStatus("Imagen eliminada del formulario.");
    });
  }

  const scanButton = document.getElementById("inventoryScanButton");
  if (scanButton && !scanButton.dataset.bound) {
    scanButton.dataset.bound = "true";
    scanButton.addEventListener("click", openInventoryScannerModal);
  }

  const closeScannerButton = document.getElementById("closeInventoryScannerModal");
  if (closeScannerButton && !closeScannerButton.dataset.bound) {
    closeScannerButton.dataset.bound = "true";
    closeScannerButton.addEventListener("click", closeInventoryScannerModal);
  }

  const scannerOverlay = document.getElementById("inventoryScannerOverlay");
  if (scannerOverlay && !scannerOverlay.dataset.bound) {
    scannerOverlay.dataset.bound = "true";
    scannerOverlay.addEventListener("click", closeInventoryScannerModal);
  }

  ["inventorySearchInput", "inventoryExpirationFilter", "inventoryBatchFilter", "inventoryLaboratoryFilter"].forEach((id) => {
    const element = document.getElementById(id);
    if (!element) return;
    const eventName = element.tagName === "SELECT" ? "change" : "input";
    if (element.dataset.bound) return;
    element.dataset.bound = "true";
    element.addEventListener(eventName, renderInventory);
  });

  const inventoryTableBody = document.getElementById("inventoryTableBody");
  if (inventoryTableBody && !inventoryTableBody.dataset.bound) {
    inventoryTableBody.dataset.bound = "true";
    inventoryTableBody.addEventListener("click", (event) => {
      const button = event.target.closest(".inventory-edit-btn");
      if (!button) return;
      const item = state.inventory.find((entry) => entry.id === button.dataset.id);
      if (!item) return;
      populateInventoryForm(item);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
}

function renderClients() {
  const cards = document.getElementById("clientCards");
  if (cards) {
    cards.innerHTML = state.clients.map((client) => `
      <article class="list-card">
        <strong>${escapeHtml(client.name)}</strong>
        <span>${escapeHtml(client.document)}</span>
        <span>${escapeHtml(client.phone || "Sin telefono")} Â· ${client.purchases || 0} compras</span>
        <span>${client.points || 0} puntos acumulados</span>
        <span>Acumulado ${formatCurrency(client.totalSpent || 0)}</span>
      </article>
    `).join("");
  }

  const table = document.getElementById("clientsTableBody");
  if (table) {
    table.innerHTML = state.clients.map((client) => `
      <tr>
        <td>${escapeHtml(client.name)}</td>
        <td>${escapeHtml(client.document)}</td>
        <td>${escapeHtml(client.phone || "-")}</td>
        <td>${client.purchases || 0}</td>
        <td>${client.points || 0}</td>
        <td>${formatCurrency(client.totalSpent || 0)}</td>
      </tr>
    `).join("");
  }
}

function renderClientsEnhanced() {
  const search = normalizeSearchTerm(document.getElementById("clientSearchInput")?.value || "");
  const filteredClients = state.clients.filter((client) => {
    if (!search) return true;
    return [client.name, client.document, client.phone].some((value) => normalizeSearchTerm(value).includes(search));
  });
  const totalPoints = state.clients.reduce((sum, client) => sum + Number(client.points || 0), 0);
  const totalRevenue = state.clients.reduce((sum, client) => sum + Number(client.totalSpent || 0), 0);
  const topClient = state.clients.slice().sort((a, b) => {
    const spentDiff = Number(b.totalSpent || 0) - Number(a.totalSpent || 0);
    if (spentDiff !== 0) return spentDiff;
    return Number(b.purchases || 0) - Number(a.purchases || 0);
  })[0] || null;

  setText("clientsMetricCount", String(state.clients.length));
  setText("clientsMetricTop", topClient?.name || "Sin datos");
  setText("clientsMetricTopMeta", topClient ? `${topClient.purchases || 0} compras Â· ${formatCurrency(topClient.totalSpent || 0)}` : "Aun no hay compras suficientes.");
  setText("clientsMetricPoints", String(totalPoints));
  setText("clientsMetricRevenue", formatCurrency(totalRevenue));

  const spotlight = document.getElementById("clientSpotlight");
  if (spotlight) {
    spotlight.innerHTML = topClient
      ? `
        <div class="client-spotlight-kicker">Cliente destacado</div>
        <strong>${escapeHtml(topClient.name)}</strong>
        <span>${escapeHtml(topClient.document || "Sin documento")} Â· ${escapeHtml(topClient.phone || "Sin telefono")}</span>
        <div class="client-spotlight-metrics">
          <div><small>Compras</small><strong>${topClient.purchases || 0}</strong></div>
          <div><small>Puntos</small><strong>${topClient.points || 0}</strong></div>
          <div><small>Acumulado</small><strong>${formatCurrency(topClient.totalSpent || 0)}</strong></div>
        </div>
      `
      : `
        <div class="client-spotlight-kicker">Base comercial</div>
        <strong>Empieza a registrar clientes</strong>
        <span>Asi podras seguir compras, puntos y frecuencia desde una sola vista.</span>
      `;
  }

  const cards = document.getElementById("clientCards");
  if (cards) {
    cards.innerHTML = filteredClients.length
      ? filteredClients.map((client) => {
        const isTop = topClient?.id === client.id;
        const level = Number(client.totalSpent || 0) >= 300000 ? "Premium" : Number(client.purchases || 0) >= 3 ? "Frecuente" : "Base";
        const isGeneral = normalizeSearchTerm(client.name) === "cliente general";
        return `
          <article class="client-card-entity ${isTop ? "is-top" : ""} ${client.active === "NO" ? "is-inactive" : ""}">
            <div class="client-card-entity-head">
              <div class="client-card-avatar">${escapeHtml(String(client.name || "C").trim().charAt(0).toUpperCase() || "C")}</div>
              <div class="client-card-copy">
                <strong>${escapeHtml(client.name)}</strong>
                <span>${escapeHtml(client.document || "Sin documento")} Â· ${client.active === "NO" ? "Inactivo" : "Activo"}</span>
              </div>
              <span class="client-level-pill">${level}</span>
            </div>
            <div class="client-card-meta">
              <span><i class="bi bi-telephone"></i>${escapeHtml(client.phone || "Sin telefono")}</span>
              <span><i class="bi bi-bag-check"></i>${client.purchases || 0} compras</span>
              <span><i class="bi bi-stars"></i>${client.points || 0} puntos</span>
            </div>
            <div class="client-card-total">
              <small>Valor acumulado</small>
              <strong>${formatCurrency(client.totalSpent || 0)}</strong>
            </div>
            <div class="client-card-actions">
              <button class="btn btn-sm btn-outline-secondary client-edit-btn" type="button" data-id="${escapeHtml(client.id)}">Editar</button>
              <button class="btn btn-sm btn-outline-secondary client-toggle-btn" type="button" data-id="${escapeHtml(client.id)}" data-active="${escapeHtml(client.active)}">${client.active === "NO" ? "Activar" : "Inactivar"}</button>
              ${isGeneral ? "" : `<button class="btn btn-sm btn-outline-danger client-delete-btn" type="button" data-id="${escapeHtml(client.id)}">Borrar</button>`}
            </div>
          </article>
        `;
      }).join("")
      : `<div class="empty-state compact-empty"><p>No hay clientes para esa busqueda.</p></div>`;
  }

  const table = document.getElementById("clientsTableBody");
  if (table) {
    table.innerHTML = filteredClients.map((client) => {
      const level = Number(client.totalSpent || 0) >= 300000 ? "Premium" : Number(client.purchases || 0) >= 3 ? "Frecuente" : "Base";
      const isGeneral = normalizeSearchTerm(client.name) === "cliente general";
      return `
        <tr>
          <td><strong>${escapeHtml(client.name)}</strong></td>
          <td>${escapeHtml(client.document)}</td>
          <td>${escapeHtml(client.phone || "-")}</td>
          <td><span class="client-level-pill">${level}</span></td>
          <td>${client.purchases || 0}</td>
          <td>${client.points || 0}</td>
          <td>${formatCurrency(client.totalSpent || 0)}</td>
          <td class="client-table-actions">
            <button class="btn btn-sm btn-outline-secondary client-edit-btn" type="button" data-id="${escapeHtml(client.id)}">Editar</button>
            <button class="btn btn-sm btn-outline-secondary client-toggle-btn" type="button" data-id="${escapeHtml(client.id)}" data-active="${escapeHtml(client.active)}">${client.active === "NO" ? "Activar" : "Inactivar"}</button>
            ${isGeneral ? "" : `<button class="btn btn-sm btn-outline-danger client-delete-btn" type="button" data-id="${escapeHtml(client.id)}">Borrar</button>`}
          </td>
        </tr>
      `;
    }).join("");

    if (!filteredClients.length) {
      table.innerHTML = `<tr><td colspan="8"><div class="empty-state compact-empty"><p>No hay clientes para esa busqueda.</p></div></td></tr>`;
    }
  }
}

function resetClientForm() {
  const defaults = {
    clientId: "",
    clientName: "",
    clientDoc: "",
    clientPhone: "",
    clientActive: "SI"
  };

  Object.entries(defaults).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.value = value;
  });

  setText("clientSaveButton", "Guardar cliente");
}

function populateClientForm(client) {
  document.getElementById("clientId").value = client.id || "";
  document.getElementById("clientName").value = client.name || "";
  document.getElementById("clientDoc").value = client.document || "";
  document.getElementById("clientPhone").value = client.phone || "";
  document.getElementById("clientActive").value = client.active || "SI";
  setText("clientSaveButton", "Actualizar cliente");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function saveClientRecord(client) {
  const isUpdating = state.clients.some((entry) => entry.id === client.id);
  if (isDesktopDbEnabled()) {
    const clients = await desktopDb.saveClient(getDesktopCompanyPayload(client));
    state.clients = Array.isArray(clients) ? clients.map(normalizeClientRecord) : state.clients;
    await addAuditLog({
      module: "clientes",
      action: isUpdating ? "actualizar" : "crear",
      entityId: client.id,
      entityName: client.name,
      detail: `${isUpdating ? "Cliente actualizado" : "Cliente creado"}: ${client.document || "sin documento"}`
    });
    return;
  }

  const existingIndex = state.clients.findIndex((entry) => entry.id === client.id);
  if (existingIndex >= 0) {
    state.clients.splice(existingIndex, 1, normalizeClientRecord(client));
  } else {
    state.clients.push(normalizeClientRecord(client));
  }
  await addAuditLog({
    module: "clientes",
    action: isUpdating ? "actualizar" : "crear",
    entityId: client.id,
    entityName: client.name,
    detail: `${isUpdating ? "Cliente actualizado" : "Cliente creado"}: ${client.document || "sin documento"}`
  });
}

async function setClientActiveState(clientId, nextActive) {
  if (isDesktopDbEnabled()) {
    const clients = await desktopDb.setClientActive(getDesktopCompanyPayload({ id: clientId, active: nextActive }));
    state.clients = Array.isArray(clients) ? clients.map(normalizeClientRecord) : state.clients;
    return;
  }

  const client = state.clients.find((entry) => entry.id === clientId);
  if (client) client.active = nextActive;
}

async function deleteClientRecord(clientId) {
  const client = state.clients.find((entry) => entry.id === clientId);
  if (isDesktopDbEnabled()) {
    const clients = await desktopDb.deleteClient(getDesktopCompanyPayload({ id: clientId }));
    state.clients = Array.isArray(clients) ? clients.map(normalizeClientRecord) : state.clients;
    await addAuditLog({
      module: "clientes",
      action: "borrar",
      entityId: clientId,
      entityName: client?.name || "Cliente",
      detail: "Cliente eliminado"
    });
    return;
  }

  state.clients = state.clients.filter((entry) => entry.id !== clientId);
  await addAuditLog({
    module: "clientes",
    action: "borrar",
    entityId: clientId,
    entityName: client?.name || "Cliente",
    detail: "Cliente eliminado"
  });
}

function resetSupplierForm() {
  const defaults = {
    supplierId: "",
    supplierName: "",
    supplierDoc: "",
    supplierPhone: "",
    supplierContact: "",
    supplierCity: "",
    supplierNotes: "",
    supplierActive: "SI"
  };

  Object.entries(defaults).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.value = value;
  });

  setText("supplierSaveButton", "Guardar proveedor");
}

function populateSupplierForm(supplier) {
  document.getElementById("supplierId").value = supplier.id || "";
  document.getElementById("supplierName").value = supplier.name || "";
  document.getElementById("supplierDoc").value = supplier.document || "";
  document.getElementById("supplierPhone").value = supplier.phone || "";
  document.getElementById("supplierContact").value = supplier.contact || "";
  document.getElementById("supplierCity").value = supplier.city || "";
  document.getElementById("supplierNotes").value = supplier.notes || "";
  document.getElementById("supplierActive").value = supplier.active || "SI";
  setText("supplierSaveButton", "Actualizar proveedor");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function saveSupplierRecord(supplier) {
  const isUpdating = state.suppliers.some((entry) => entry.id === supplier.id);
  if (isDesktopDbEnabled()) {
    const suppliers = await desktopDb.saveSupplier(getDesktopCompanyPayload(supplier));
    state.suppliers = Array.isArray(suppliers) ? suppliers.map(normalizeSupplierRecord) : state.suppliers;
    await addAuditLog({
      module: "proveedores",
      action: isUpdating ? "actualizar" : "crear",
      entityId: supplier.id,
      entityName: supplier.name,
      detail: `${isUpdating ? "Proveedor actualizado" : "Proveedor creado"}`
    });
    return;
  }

  const existingIndex = state.suppliers.findIndex((entry) => entry.id === supplier.id);
  if (existingIndex >= 0) {
    state.suppliers.splice(existingIndex, 1, normalizeSupplierRecord(supplier));
  } else {
    state.suppliers.push(normalizeSupplierRecord(supplier));
  }
  await addAuditLog({
    module: "proveedores",
    action: isUpdating ? "actualizar" : "crear",
    entityId: supplier.id,
    entityName: supplier.name,
    detail: `${isUpdating ? "Proveedor actualizado" : "Proveedor creado"}`
  });
}

async function setSupplierActiveState(supplierId, nextActive) {
  if (isDesktopDbEnabled()) {
    const suppliers = await desktopDb.setSupplierActive(getDesktopCompanyPayload({ id: supplierId, active: nextActive }));
    state.suppliers = Array.isArray(suppliers) ? suppliers.map(normalizeSupplierRecord) : state.suppliers;
    return;
  }

  const supplier = state.suppliers.find((entry) => entry.id === supplierId);
  if (supplier) supplier.active = nextActive;
}

async function deleteSupplierRecord(supplierId) {
  const supplier = state.suppliers.find((entry) => entry.id === supplierId);
  if (isDesktopDbEnabled()) {
    const suppliers = await desktopDb.deleteSupplier(getDesktopCompanyPayload({ id: supplierId }));
    state.suppliers = Array.isArray(suppliers) ? suppliers.map(normalizeSupplierRecord) : state.suppliers;
    await addAuditLog({
      module: "proveedores",
      action: "borrar",
      entityId: supplierId,
      entityName: supplier?.name || "Proveedor",
      detail: "Proveedor eliminado"
    });
    return;
  }

  if (state.purchases.some((purchase) => purchase.supplierId === supplierId)) {
    throw new Error("Este proveedor ya tiene compras registradas. Inactivalo en lugar de borrarlo.");
  }

  state.suppliers = state.suppliers.filter((entry) => entry.id !== supplierId);
  await addAuditLog({
    module: "proveedores",
    action: "borrar",
    entityId: supplierId,
    entityName: supplier?.name || "Proveedor",
    detail: "Proveedor eliminado"
  });
}

function renderSuppliersPage() {
  const search = normalizeSearchTerm(document.getElementById("supplierSearchInput")?.value || "");
  const purchasesBySupplier = new Map();

  state.purchases.forEach((purchase) => {
    const key = String(purchase.supplierId || "").trim();
    const current = purchasesBySupplier.get(key) || { count: 0, total: 0, lastDate: "" };
    current.count += 1;
    current.total += Number(purchase.total || 0);
    current.lastDate = [current.lastDate, purchase.date].sort().filter(Boolean).pop() || current.lastDate;
    purchasesBySupplier.set(key, current);
  });

  const filteredSuppliers = state.suppliers.filter((supplier) => {
    if (!search) return true;
    return [supplier.name, supplier.document, supplier.phone, supplier.contact, supplier.city]
      .some((value) => normalizeSearchTerm(value).includes(search));
  });

  const activeSuppliers = state.suppliers.filter((supplier) => supplier.active !== "NO");
  const cities = new Set(state.suppliers.map((supplier) => normalizeSearchTerm(supplier.city)).filter(Boolean));
  const topSupplier = state.suppliers.slice().sort((a, b) => {
    const totalDiff = Number(purchasesBySupplier.get(b.id)?.total || 0) - Number(purchasesBySupplier.get(a.id)?.total || 0);
    if (totalDiff !== 0) return totalDiff;
    return Number(purchasesBySupplier.get(b.id)?.count || 0) - Number(purchasesBySupplier.get(a.id)?.count || 0);
  })[0] || null;

  setText("suppliersMetricCount", String(state.suppliers.length));
  setText("suppliersMetricActive", String(activeSuppliers.length));
  setText("suppliersMetricCities", String(cities.size));
  setText("suppliersMetricPurchases", String(state.purchases.length));

  const spotlight = document.getElementById("supplierSpotlight");
  if (spotlight) {
    spotlight.innerHTML = topSupplier
      ? `
        <div class="client-spotlight-kicker">Proveedor destacado</div>
        <strong>${escapeHtml(topSupplier.name)}</strong>
        <span>${escapeHtml(topSupplier.contact || "Sin contacto")} Â· ${escapeHtml(topSupplier.city || "Sin ciudad")}</span>
        <div class="client-spotlight-metrics">
          <div><small>Compras</small><strong>${purchasesBySupplier.get(topSupplier.id)?.count || 0}</strong></div>
          <div><small>Total</small><strong>${formatCurrency(purchasesBySupplier.get(topSupplier.id)?.total || 0)}</strong></div>
          <div><small>Estado</small><strong>${topSupplier.active === "NO" ? "Inactivo" : "Activo"}</strong></div>
        </div>
      `
      : `
        <div class="client-spotlight-kicker">Abastecimiento</div>
        <strong>Empieza a crear proveedores</strong>
        <span>Asi podremos enlazar compras, costos y entradas de inventario desde una sola vista.</span>
      `;
  }

  const cards = document.getElementById("supplierCards");
  if (cards) {
    cards.innerHTML = filteredSuppliers.length
      ? filteredSuppliers.map((supplier) => {
        const summary = purchasesBySupplier.get(supplier.id) || { count: 0, total: 0, lastDate: "" };
        return `
          <article class="client-card-entity ${supplier.active === "NO" ? "is-inactive" : ""}">
            <div class="client-card-entity-head">
              <div class="client-card-avatar">${escapeHtml(String(supplier.name || "P").trim().charAt(0).toUpperCase() || "P")}</div>
              <div class="client-card-copy">
                <strong>${escapeHtml(supplier.name || "Proveedor")}</strong>
                <span>${escapeHtml(supplier.document || "Sin documento")} Â· ${supplier.active === "NO" ? "Inactivo" : "Activo"}</span>
              </div>
              <span class="client-level-pill">${summary.count > 0 ? "Activo" : "Nuevo"}</span>
            </div>
            <div class="client-card-meta">
              <span><i class="bi bi-person-badge"></i>${escapeHtml(supplier.contact || "Sin contacto")}</span>
              <span><i class="bi bi-telephone"></i>${escapeHtml(supplier.phone || "Sin telefono")}</span>
              <span><i class="bi bi-geo-alt"></i>${escapeHtml(supplier.city || "Sin ciudad")}</span>
              <span><i class="bi bi-bag-check"></i>${summary.count} compras</span>
              <span><i class="bi bi-currency-dollar"></i>${formatCurrency(summary.total || 0)}</span>
              <span><i class="bi bi-calendar-event"></i>${escapeHtml(summary.lastDate ? formatDisplayDate(summary.lastDate) : "Sin compras")}</span>
            </div>
            <div class="sales-history-actions">
              <button class="btn btn-sm btn-outline-secondary" type="button" data-supplier-action="edit" data-id="${escapeHtml(supplier.id)}">Editar</button>
              <button class="btn btn-sm btn-outline-secondary" type="button" data-supplier-action="toggle" data-id="${escapeHtml(supplier.id)}">${supplier.active === "NO" ? "Activar" : "Inactivar"}</button>
              <button class="btn btn-sm btn-outline-danger" type="button" data-supplier-action="delete" data-id="${escapeHtml(supplier.id)}">Borrar</button>
            </div>
          </article>
        `;
      }).join("")
      : `<div class="empty-state compact-empty"><p>No hay proveedores para esos filtros.</p></div>`;
  }

  const tableBody = document.getElementById("suppliersTableBody");
  if (tableBody) {
    tableBody.innerHTML = filteredSuppliers.length
      ? filteredSuppliers.map((supplier) => {
        const summary = purchasesBySupplier.get(supplier.id) || { count: 0, total: 0, lastDate: "" };
        return `
          <tr>
            <td><strong>${escapeHtml(supplier.name)}</strong></td>
            <td>${escapeHtml(supplier.document || "-")}</td>
            <td>${escapeHtml(supplier.contact || "-")}</td>
            <td>${escapeHtml(supplier.phone || "-")}</td>
            <td>${escapeHtml(supplier.city || "-")}</td>
            <td>${summary.count}</td>
            <td>${formatCurrency(summary.total || 0)}</td>
            <td><span class="state-pill ${supplier.active === "NO" ? "warn" : "ok"}">${supplier.active === "NO" ? "Inactivo" : "Activo"}</span></td>
            <td>
              <div class="d-flex flex-wrap gap-2">
                <button class="btn btn-sm btn-outline-secondary" type="button" data-supplier-action="edit" data-id="${escapeHtml(supplier.id)}">Editar</button>
                <button class="btn btn-sm btn-outline-secondary" type="button" data-supplier-action="toggle" data-id="${escapeHtml(supplier.id)}">${supplier.active === "NO" ? "Activar" : "Inactivar"}</button>
                <button class="btn btn-sm btn-outline-danger" type="button" data-supplier-action="delete" data-id="${escapeHtml(supplier.id)}">Borrar</button>
              </div>
            </td>
          </tr>
        `;
      }).join("")
      : `<tr><td colspan="9"><div class="empty-state compact-empty"><p>Aun no hay proveedores registrados.</p></div></td></tr>`;
  }
}

function resetPurchaseForm() {
  const defaults = {
    purchaseId: "",
    purchaseSupplier: "",
    purchaseProduct: "",
    purchaseQuantity: "1",
    purchaseUnitCost: "",
    purchaseBatch: "",
    purchaseDate: normalizeInputDateValue(new Date()),
    purchaseNotes: ""
  };

  Object.entries(defaults).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.value = value;
  });

  setText("purchaseSaveButton", "Registrar compra");
}

async function registerPurchaseRecord(purchase) {
  if (isDesktopDbEnabled()) {
    const result = await desktopDb.registerPurchase(getDesktopCompanyPayload(purchase));
    if (Array.isArray(result?.inventory)) {
      state.inventory = result.inventory.map(normalizeInventoryItem);
    }
      if (Array.isArray(result?.purchases)) {
        state.purchases = result.purchases.map(normalizePurchaseRecord);
      }
      saveData();
      await addAuditLog({
        module: "compras",
        action: "crear",
        entityId: purchase.id,
        entityName: purchase.productName,
        detail: `Compra registrada a ${purchase.supplierName} por ${purchase.quantity} unidad(es)`
      });
      return;
    }

  const normalizedPurchase = normalizePurchaseRecord(purchase);
  state.purchases.unshift(normalizedPurchase);
  const inventoryItem = state.inventory.find((entry) => entry.id === normalizedPurchase.inventoryItemId);
    if (inventoryItem) {
      inventoryItem.stock = Number(inventoryItem.stock || 0) + Number(normalizedPurchase.quantity || 0);
      if (normalizedPurchase.batch) inventoryItem.batch = normalizedPurchase.batch;
    }
    await addAuditLog({
      module: "compras",
      action: "crear",
      entityId: normalizedPurchase.id,
      entityName: normalizedPurchase.productName,
      detail: `Compra registrada a ${normalizedPurchase.supplierName} por ${normalizedPurchase.quantity} unidad(es)`
    });
  }

function getReturnedQuantityForSaleItem(saleId, inventoryItemId, saleLineId = "") {
  const normalizedSaleLineId = String(saleLineId || "").trim();
  return state.returns
    .filter((entry) => entry.saleId === saleId)
    .filter((entry) => {
      const entrySaleLineId = String(entry.saleLineId || "").trim();
      if (normalizedSaleLineId && entrySaleLineId) {
        return entrySaleLineId === normalizedSaleLineId;
      }
      return entry.inventoryItemId === inventoryItemId;
    })
    .reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
}

function getReturnableItemsForSale(sale) {
  return (sale?.items || []).map((item) => {
    const saleLineId = String(item.lineItemId || "").trim();
    const returnedQuantity = getReturnedQuantityForSaleItem(sale.id, item.id, saleLineId);
    return {
      ...item,
      saleLineId,
      returnedQuantity,
      remainingQuantity: Math.max(0, Number(item.quantity || 0) - returnedQuantity)
    };
  }).filter((item) => item.remainingQuantity > 0);
}

function getSalesEligibleForReturns() {
  return state.sales
    .filter((sale) => sale.status !== "ANULADA")
    .filter((sale) => getReturnableItemsForSale(sale).length > 0);
}

function getActivePromotionForItem(item) {
  const activePromotions = state.promotions.filter((promotion) => promotion.active !== "NO");
  const itemId = normalizeSearchTerm(item.id);
  const itemSku = normalizeSearchTerm(item.sku);
  const itemName = normalizeSearchTerm(item.name);
  const itemBarcode = normalizeSearchTerm(item.barcode);
  const matches = activePromotions.filter((promotion) => {
    if (promotion.scope === "all") return true;
    if (promotion.scope === "category") return normalizeSearchTerm(promotion.targetValue) === normalizeSearchTerm(item.category);
    const targetValue = normalizeSearchTerm(promotion.targetValue);
    return [itemId, itemSku, itemName, itemBarcode].filter(Boolean).includes(targetValue);
  });

  return matches.sort((a, b) => Number(b.discountValue || 0) - Number(a.discountValue || 0))[0] || null;
}

function getPromotionDiscountAmount(item, quantity = 1) {
  const promotion = getActivePromotionForItem(item);
  if (!promotion) return { promotion: null, discount: 0 };
  const subtotal = Number(item.price || 0) * Number(quantity || 0);
  const discount = promotion.discountType === "fixed"
    ? Math.min(subtotal, Number(promotion.discountValue || 0) * Number(quantity || 0))
    : Math.min(subtotal, Math.round(subtotal * (Number(promotion.discountValue || 0) / 100)));
  return { promotion, discount };
}

async function registerReturnRecord(returnEntry) {
  if (isDesktopDbEnabled()) {
    const result = await desktopDb.registerReturn(getDesktopCompanyPayload(returnEntry));
    if (Array.isArray(result?.inventory)) {
      state.inventory = result.inventory.map(normalizeInventoryItem);
    }
    if (Array.isArray(result?.clients)) {
      state.clients = result.clients.map(normalizeClientRecord);
    }
      if (Array.isArray(result?.returns)) {
        state.returns = result.returns.map(normalizeReturnRecord);
      }
      saveData();
      await addAuditLog({
        module: "devoluciones",
        action: "crear",
        entityId: returnEntry.id,
        entityName: returnEntry.productName,
        detail: `Devolucion registrada para ticket ${returnEntry.ticketNumber}`
      });
      return;
    }

  const normalized = normalizeReturnRecord(returnEntry);
  state.returns.unshift(normalized);

  if (normalized.restock !== "NO") {
    const inventoryItem = state.inventory.find((entry) => entry.id === normalized.inventoryItemId);
    if (inventoryItem) {
      inventoryItem.stock = Number(inventoryItem.stock || 0) + Number(normalized.quantity || 0);
    }
  }

  const relatedSale = state.sales.find((sale) => sale.id === normalized.saleId);
    if (relatedSale?.clientDocument) {
    const client = state.clients.find((entry) => entry.document === relatedSale.clientDocument);
    if (client) {
      client.totalSpent = Math.max(0, Number(client.totalSpent || 0) - Number(normalized.total || 0));
      client.points = Math.max(0, Number(client.points || 0) - calculateLoyaltyPointsFromTotal(normalized.total || 0));
      }
    }
    await addAuditLog({
      module: "devoluciones",
      action: "crear",
      entityId: normalized.id,
      entityName: normalized.productName,
      detail: `Devolucion registrada para ticket ${normalized.ticketNumber}`
    });
  }

function renderPurchasesPage() {
  const search = normalizeSearchTerm(document.getElementById("purchaseSearchInput")?.value || "");
  const filteredPurchases = state.purchases
    .slice()
    .sort((a, b) => {
      const dateDiff = String(b.date || "").localeCompare(String(a.date || ""));
      if (dateDiff !== 0) return dateDiff;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    })
    .filter((purchase) => {
      if (!search) return true;
      return [purchase.supplierName, purchase.productName, purchase.sku, purchase.batch, purchase.notes]
        .some((value) => normalizeSearchTerm(value).includes(search));
    });

  const activeSuppliers = state.suppliers.filter((supplier) => supplier.active !== "NO");
  const activeProducts = state.inventory.filter((item) => item.active !== "NO");
  const totalSpent = state.purchases.reduce((sum, purchase) => sum + Number(purchase.total || 0), 0);
  const totalUnits = state.purchases.reduce((sum, purchase) => sum + Number(purchase.quantity || 0), 0);
  const lastPurchase = filteredPurchases[0] || state.purchases[0] || null;

  setText("purchasesMetricCount", String(state.purchases.length));
  setText("purchasesMetricUnits", String(totalUnits));
  setText("purchasesMetricTotal", formatCurrency(totalSpent));
  setText("purchasesMetricLast", lastPurchase ? formatDisplayDate(lastPurchase.date) : "Sin datos");

  const supplierSelect = document.getElementById("purchaseSupplier");
  if (supplierSelect && supplierSelect.dataset.rendered !== "true") {
    supplierSelect.dataset.rendered = "true";
  }
  if (supplierSelect) {
    const currentValue = supplierSelect.value;
    supplierSelect.innerHTML = `<option value="">Selecciona proveedor</option>${activeSuppliers.map((supplier) => `<option value="${escapeHtml(supplier.id)}">${escapeHtml(supplier.name)}</option>`).join("")}`;
    supplierSelect.value = currentValue && activeSuppliers.some((supplier) => supplier.id === currentValue) ? currentValue : "";
  }

  const productSelect = document.getElementById("purchaseProduct");
  if (productSelect) {
    const currentValue = productSelect.value;
    productSelect.innerHTML = `<option value="">Selecciona producto</option>${activeProducts.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} Â· ${escapeHtml(item.sku)}</option>`).join("")}`;
    productSelect.value = currentValue && activeProducts.some((item) => item.id === currentValue) ? currentValue : "";
  }

  const supplierBadge = document.getElementById("purchaseSupplierBadge");
  const selectedSupplier = state.suppliers.find((supplier) => supplier.id === supplierSelect?.value);
  if (supplierBadge) {
    supplierBadge.innerHTML = selectedSupplier
      ? `<strong>${escapeHtml(selectedSupplier.name)}</strong><span>${escapeHtml(selectedSupplier.contact || "Sin contacto")} Â· ${escapeHtml(selectedSupplier.phone || "Sin telefono")}</span>`
      : `<strong>Proveedor pendiente</strong><span>Selecciona un proveedor para vincular la compra.</span>`;
  }

  const productBadge = document.getElementById("purchaseProductBadge");
  const selectedProduct = state.inventory.find((item) => item.id === productSelect?.value);
  if (productBadge) {
    productBadge.innerHTML = selectedProduct
      ? `<strong>${escapeHtml(selectedProduct.name)}</strong><span>Stock actual ${selectedProduct.stock} Â· SKU ${escapeHtml(selectedProduct.sku)}</span>`
      : `<strong>Producto pendiente</strong><span>Elige un producto del inventario para sumar existencias.</span>`;
  }

  const purchaseDateInput = document.getElementById("purchaseDate");
  if (purchaseDateInput && !purchaseDateInput.value) {
    purchaseDateInput.value = normalizeInputDateValue(new Date());
  }

  const list = document.getElementById("purchasesHistoryList");
  if (list) {
    list.innerHTML = filteredPurchases.length
      ? filteredPurchases.map((purchase) => `
        <article class="sales-history-item">
          <div class="sales-history-head">
            <strong>${escapeHtml(purchase.productName)} Â· ${formatCurrency(purchase.total)}</strong>
            <span class="sale-state-pill is-active">${purchase.quantity} und</span>
          </div>
          <div class="sales-history-meta-grid">
            <span><i class="bi bi-truck"></i>${escapeHtml(purchase.supplierName || "Sin proveedor")}</span>
            <span><i class="bi bi-upc-scan"></i>${escapeHtml(purchase.sku || "Sin SKU")}</span>
            <span><i class="bi bi-box-seam"></i>Lote ${escapeHtml(purchase.batch || "N/A")}</span>
            <span><i class="bi bi-calendar-event"></i>${escapeHtml(formatDisplayDate(purchase.date))}</span>
          </div>
          <div class="sales-history-items-preview">${escapeHtml(purchase.notes || "Compra registrada sin observaciones adicionales.")}</div>
        </article>
      `).join("")
      : `<div class="empty-state compact-empty"><p>No hay compras registradas con esos filtros.</p></div>`;
  }
}

function renderReturnsPage() {
  const eligibleSales = getSalesEligibleForReturns();
  const saleSelect = document.getElementById("returnSale");
  const querySaleId = new URLSearchParams(window.location.search).get("saleId") || "";

  if (saleSelect) {
    const currentValue = saleSelect.value || querySaleId;
    saleSelect.innerHTML = `<option value="">Selecciona ticket</option>${eligibleSales.map((sale) => `<option value="${escapeHtml(sale.id)}">${escapeHtml(sale.ticketNumber)} Â· ${escapeHtml(sale.clientName)} Â· ${formatDisplayDate(sale.date)}</option>`).join("")}`;
    saleSelect.value = eligibleSales.some((sale) => sale.id === currentValue) ? currentValue : "";
  }

  const selectedSale = eligibleSales.find((sale) => sale.id === saleSelect?.value) || null;
  const items = getReturnableItemsForSale(selectedSale);
  const itemSelect = document.getElementById("returnItem");

  if (itemSelect) {
    const currentItem = itemSelect.value;
    itemSelect.innerHTML = `<option value="">Selecciona producto</option>${items.map((item, index) => `<option value="${escapeHtml(item.saleLineId || item.id)}">${escapeHtml(item.name)} Â· ${item.remainingQuantity} disponible(s) Â· ${formatCurrency(item.price || 0)} Â· linea ${index + 1}</option>`).join("")}`;
    itemSelect.value = items.some((item) => (item.saleLineId || item.id) === currentItem) ? currentItem : "";
  }

  const selectedItem = items.find((item) => (item.saleLineId || item.id) === itemSelect?.value) || null;

  setText("returnsMetricCount", String(state.returns.length));
  setText("returnsMetricUnits", String(state.returns.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0)));
  setText("returnsMetricTotal", formatCurrency(state.returns.reduce((sum, entry) => sum + Number(entry.total || 0), 0)));
  setText("returnsMetricPending", String(eligibleSales.length));

  const saleBadge = document.getElementById("returnSaleBadge");
  if (saleBadge) {
    saleBadge.innerHTML = selectedSale
      ? `<strong>${escapeHtml(selectedSale.ticketNumber)}</strong><span>${escapeHtml(selectedSale.clientName)} Â· ${escapeHtml(formatDisplayDate(selectedSale.date))}</span>`
      : `<strong>Venta pendiente</strong><span>Selecciona un ticket activo con productos disponibles para devolver.</span>`;
  }

  const itemBadge = document.getElementById("returnItemBadge");
  if (itemBadge) {
    itemBadge.innerHTML = selectedItem
      ? `<strong>${escapeHtml(selectedItem.name)}</strong><span>Vendidos ${selectedItem.quantity} Â· Devueltos ${selectedItem.returnedQuantity} Â· Disponibles ${selectedItem.remainingQuantity}</span>`
      : `<strong>Producto pendiente</strong><span>Elige el item exacto que regresara a inventario o a ajuste.</span>`;
  }

  const quantityInput = document.getElementById("returnQuantity");
  if (quantityInput) {
    quantityInput.max = String(selectedItem?.remainingQuantity || 1);
    if (!quantityInput.value) quantityInput.value = "1";
    if (Number(quantityInput.value || 0) > Number(selectedItem?.remainingQuantity || 1)) {
      quantityInput.value = String(selectedItem?.remainingQuantity || 1);
    }
  }

  const dateInput = document.getElementById("returnDate");
  if (dateInput && !dateInput.value) {
    dateInput.value = normalizeInputDateValue(new Date());
  }

  const search = normalizeSearchTerm(document.getElementById("returnsSearchInput")?.value || "");
  const filteredReturns = state.returns
    .slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .filter((entry) => {
      if (!search) return true;
      return [entry.ticketNumber, entry.clientName, entry.productName, entry.reason]
        .some((value) => normalizeSearchTerm(value).includes(search));
    });

  const list = document.getElementById("returnsHistoryList");
  if (list) {
    list.innerHTML = filteredReturns.length
      ? filteredReturns.map((entry) => `
        <article class="sales-history-item">
          <div class="sales-history-head">
            <strong>${escapeHtml(entry.ticketNumber)} Â· ${escapeHtml(entry.productName)}</strong>
            <span class="sale-state-pill ${entry.restock === "NO" ? "is-annulled" : "is-active"}">${entry.quantity} und</span>
          </div>
          <div class="sales-history-meta-grid">
            <span><i class="bi bi-person"></i>${escapeHtml(entry.clientName || "Sin cliente")}</span>
            <span><i class="bi bi-calendar-event"></i>${escapeHtml(formatDisplayDate(entry.date))}</span>
            <span><i class="bi bi-currency-dollar"></i>${formatCurrency(entry.total || 0)}</span>
            <span><i class="bi bi-box-seam"></i>${entry.restock === "NO" ? "Sin reingreso" : "Repone stock"}</span>
          </div>
          <div class="sales-history-items-preview">${escapeHtml(entry.reason || "Sin motivo registrado")}</div>
        </article>
      `).join("")
      : `<div class="empty-state compact-empty"><p>No hay devoluciones registradas.</p></div>`;
  }
}

function bindSuppliersEvents() {
  const searchInput = document.getElementById("supplierSearchInput");
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = "true";
    searchInput.addEventListener("input", renderSuppliersPage);
  }

  const resetButton = document.getElementById("supplierResetButton");
  if (resetButton && !resetButton.dataset.bound) {
    resetButton.dataset.bound = "true";
    resetButton.addEventListener("click", resetSupplierForm);
  }

  const form = document.getElementById("supplierForm");
  if (form && form.dataset.bound !== "true") {
    form.dataset.bound = "true";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const supplier = normalizeSupplierRecord({
        id: document.getElementById("supplierId").value.trim() || crypto.randomUUID(),
        name: document.getElementById("supplierName").value.trim(),
        document: document.getElementById("supplierDoc").value.trim(),
        phone: document.getElementById("supplierPhone").value.trim(),
        contact: document.getElementById("supplierContact").value.trim(),
        city: document.getElementById("supplierCity").value.trim(),
        notes: document.getElementById("supplierNotes").value.trim(),
        active: document.getElementById("supplierActive").value || "SI"
      });

      if (!supplier.name) return;

      try {
        await saveSupplierRecord(supplier);
      } catch (error) {
        showInfoDialog(error.message || "No fue posible guardar el proveedor.", {
          title: "Error de base de datos",
          variant: "danger"
        });
        return;
      }

      saveData();
      renderSuppliersPage();
      resetSupplierForm();
    });
  }

  ["supplierCards", "suppliersTableBody"].forEach((id) => {
    const container = document.getElementById(id);
    if (!container || container.dataset.bound === "true") return;
    container.dataset.bound = "true";
    container.addEventListener("click", async (event) => {
      const actionButton = event.target.closest("button[data-supplier-action][data-id]");
      if (!actionButton) return;
      const supplier = state.suppliers.find((entry) => entry.id === actionButton.dataset.id);
      if (!supplier) return;

      if (actionButton.dataset.supplierAction === "edit") {
        populateSupplierForm(supplier);
        return;
      }

      if (actionButton.dataset.supplierAction === "toggle") {
        try {
          await setSupplierActiveState(supplier.id, supplier.active === "NO" ? "SI" : "NO");
          saveData();
          renderSuppliersPage();
        } catch (error) {
          showInfoDialog(error.message || "No fue posible actualizar el proveedor.", {
            title: "Operacion no completada",
            variant: "danger"
          });
        }
        return;
      }

      if (actionButton.dataset.supplierAction === "delete") {
        try {
          await deleteSupplierRecord(supplier.id);
          saveData();
          renderSuppliersPage();
        } catch (error) {
          showInfoDialog(error.message || "No fue posible borrar el proveedor.", {
            title: "Operacion no completada",
            variant: "warn"
          });
        }
      }
    });
  });
}

function bindPurchasesEvents() {
  const searchInput = document.getElementById("purchaseSearchInput");
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = "true";
    searchInput.addEventListener("input", renderPurchasesPage);
  }

  ["purchaseSupplier", "purchaseProduct"].forEach((id) => {
    const element = document.getElementById(id);
    if (!element || element.dataset.bound) return;
    element.dataset.bound = "true";
    element.addEventListener("change", renderPurchasesPage);
  });

  const resetButton = document.getElementById("purchaseResetButton");
  if (resetButton && !resetButton.dataset.bound) {
    resetButton.dataset.bound = "true";
    resetButton.addEventListener("click", () => {
      resetPurchaseForm();
      renderPurchasesPage();
    });
  }

  const form = document.getElementById("purchaseForm");
  if (form && form.dataset.bound !== "true") {
    form.dataset.bound = "true";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const selectedSupplierId = document.getElementById("purchaseSupplier").value;
      const selectedProductId = document.getElementById("purchaseProduct").value;
      if (isDesktopDbEnabled()) {
        try {
          const bootstrap = await desktopDb.bootstrap(getDesktopCompanyPayload());
          if (Array.isArray(bootstrap?.suppliers)) {
            state.suppliers = bootstrap.suppliers.map(normalizeSupplierRecord);
          }
          if (Array.isArray(bootstrap?.inventory)) {
            state.inventory = bootstrap.inventory.map(normalizeInventoryItem);
          }
        } catch (error) {
          console.warn("No fue posible refrescar proveedores/productos antes de guardar la compra:", error);
        }
      }

      const supplier = state.suppliers.find((entry) => entry.id === selectedSupplierId);
      const item = state.inventory.find((entry) => entry.id === selectedProductId);
      const quantity = Number(document.getElementById("purchaseQuantity").value || 0);
      const unitCost = Number(document.getElementById("purchaseUnitCost").value || 0);

      if (!supplier || !item || quantity <= 0 || unitCost <= 0) {
        showInfoDialog("Selecciona proveedor, producto y registra cantidad/costo validos.", {
          title: "Datos incompletos",
          variant: "warn"
        });
        return;
      }

      const purchase = normalizePurchaseRecord({
        id: crypto.randomUUID(),
        supplierId: supplier.id,
        supplierName: supplier.name,
        inventoryItemId: item.id,
        productName: item.name,
        sku: item.sku,
        quantity,
        unitCost,
        total: quantity * unitCost,
        batch: document.getElementById("purchaseBatch").value.trim(),
        date: document.getElementById("purchaseDate").value || new Date(),
        notes: document.getElementById("purchaseNotes").value.trim(),
        createdAt: new Date().toISOString()
      });

      try {
        await registerPurchaseRecord(purchase);
      } catch (error) {
        showInfoDialog(error.message || "No fue posible registrar la compra.", {
          title: "Error de base de datos",
          variant: "danger"
        });
        return;
      }

      saveData();
      resetPurchaseForm();
      renderPurchasesPage();
      rerenderCurrentPage();
    });
  }
}

function bindReturnsEvents() {
  const searchInput = document.getElementById("returnsSearchInput");
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = "true";
    searchInput.addEventListener("input", renderReturnsPage);
  }

  ["returnSale", "returnItem"].forEach((id) => {
    const element = document.getElementById(id);
    if (!element || element.dataset.bound) return;
    element.dataset.bound = "true";
    element.addEventListener("change", () => {
      if (id === "returnSale") {
        const targetUrl = new URL(window.location.href);
        const saleId = String(element.value || "").trim();
        if (saleId) {
          targetUrl.searchParams.set("saleId", saleId);
        } else {
          targetUrl.searchParams.delete("saleId");
        }
        window.history.replaceState({}, "", targetUrl.toString());
      }
      renderReturnsPage();
    });
  });

  const resetButton = document.getElementById("returnResetButton");
  if (resetButton && !resetButton.dataset.bound) {
    resetButton.dataset.bound = "true";
    resetButton.addEventListener("click", () => {
      ["returnSale", "returnItem", "returnReason", "returnDate"].forEach((id) => {
        const element = document.getElementById(id);
        if (element) element.value = "";
      });
      const quantity = document.getElementById("returnQuantity");
      if (quantity) quantity.value = "1";
      const restock = document.getElementById("returnRestock");
      if (restock) restock.value = "SI";
      const targetUrl = new URL(window.location.href);
      targetUrl.searchParams.delete("saleId");
      window.history.replaceState({}, "", targetUrl.toString());
      renderReturnsPage();
    });
  }

  const form = document.getElementById("returnForm");
  if (form && form.dataset.bound !== "true") {
    form.dataset.bound = "true";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const sale = state.sales.find((entry) => entry.id === document.getElementById("returnSale").value);
      const selectedItemId = document.getElementById("returnItem").value;
      const returnableItem = getReturnableItemsForSale(sale).find((item) => (item.saleLineId || item.id) === selectedItemId);
      const quantity = Number(document.getElementById("returnQuantity").value || 0);
      const reason = document.getElementById("returnReason").value.trim();
      const restock = document.getElementById("returnRestock").value || "SI";

      if (!sale || !returnableItem) {
        await showInfoDialog("Selecciona una venta y un producto valido para la devolucion.", {
          title: "Datos incompletos",
          variant: "warn"
        });
        return;
      }

      if (!quantity || quantity <= 0 || quantity > Number(returnableItem.remainingQuantity || 0)) {
        await showInfoDialog("La cantidad debe ser mayor a cero y no puede superar lo disponible por devolver.", {
          title: "Cantidad invalida",
          variant: "warn"
        });
        return;
      }

      if (!reason) {
        await showInfoDialog("Escribe el motivo de la devolucion para dejar trazabilidad.", {
          title: "Motivo requerido",
          variant: "warn"
        });
        return;
      }

      const payload = normalizeReturnRecord({
        id: crypto.randomUUID(),
        saleId: sale.id,
        saleLineId: returnableItem.saleLineId,
        ticketNumber: sale.ticketNumber,
        clientName: sale.clientName,
        inventoryItemId: returnableItem.id,
        productName: returnableItem.name,
        quantity,
        unitPrice: Number(returnableItem.price || 0),
        total: Number(returnableItem.price || 0) * quantity,
        reason,
        restock,
        date: document.getElementById("returnDate").value || new Date(),
        createdAt: new Date().toISOString(),
        processedBy: sessionState.user || "Administrador"
      });

      try {
        await registerReturnRecord(payload);
      } catch (error) {
        await showInfoDialog(error.message || "No fue posible registrar la devolucion.", {
          title: "Error de base de datos",
          variant: "danger"
        });
        return;
      }

      saveData();
      renderReturnsPage();
      rerenderCurrentPage();
      showAppToast(`Devolucion registrada por ${formatCurrency(payload.total)}.`, {
        title: "Devolucion guardada",
        variant: "success"
      });
    });
  }
}

function resetPromotionForm() {
  const defaults = {
    promotionId: "",
    promotionName: "",
    promotionScope: "product",
    promotionTargetValue: "",
    promotionDiscountType: "percent",
    promotionDiscountValue: "",
    promotionActive: "SI"
  };

  Object.entries(defaults).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.value = value;
  });

  updatePromotionTargetOptions("product", "");
}

// Convierte el valor almacenado en una etiqueta legible para la tabla.
function getPromotionTargetLabel(promotion) {
  if (!promotion || promotion.scope === "all") return "Todo el catalogo";
  if (promotion.scope === "category") {
    return getCategoryLabel(promotion.targetValue || "general");
  }

  const inventoryItem = state.inventory.find((item) => String(item.id || "").trim() === String(promotion.targetValue || "").trim());
  if (!inventoryItem) return promotion.targetValue || "Producto";
  return `${inventoryItem.name}${inventoryItem.sku ? ` (${inventoryItem.sku})` : ""}`;
}

// Sincroniza el selector de destino con el inventario activo para evitar IDs escritos a mano.
function updatePromotionTargetOptions(scope = "product", selectedValue = "") {
  const targetSelect = document.getElementById("promotionTargetValue");
  const helpText = document.getElementById("promotionTargetHelp");
  if (!targetSelect) {
    console.warn("Promociones: no se encontro el selector promotionTargetValue.");
    return;
  }

  const normalizedScope = String(scope || "product").trim().toLowerCase();
  const activeInventory = state.inventory
    .filter((item) => item.active !== "NO")
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es"));

  if (normalizedScope === "all") {
    targetSelect.innerHTML = `<option value="">Todo el catalogo</option>`;
    targetSelect.value = "";
    targetSelect.disabled = true;
    if (helpText) helpText.textContent = "La promocion se aplicara a todos los productos activos.";
    return;
  }

  targetSelect.disabled = false;

  if (normalizedScope === "category") {
    const categories = Array.from(new Set(activeInventory.map((item) => item.category).filter(Boolean)));
    targetSelect.innerHTML = categories.length
      ? categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(getCategoryLabel(category))}</option>`).join("")
      : `<option value="">Sin categorias disponibles</option>`;
    if (!categories.length) {
      console.warn("Promociones: no hay categorias activas disponibles para asociar.");
    }
    if (helpText) helpText.textContent = "La promocion se aplicara a todos los productos de la categoria elegida.";
  } else {
    targetSelect.innerHTML = activeInventory.length
      ? activeInventory.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}${item.sku ? ` (${escapeHtml(item.sku)})` : ""}</option>`).join("")
      : `<option value="">Sin productos disponibles</option>`;
    if (!activeInventory.length) {
      console.warn("Promociones: no hay productos activos disponibles para asociar.");
    }
    if (helpText) helpText.textContent = "La promocion se aplicara al producto seleccionado en el POS.";
  }

  if (selectedValue && Array.from(targetSelect.options).some((option) => option.value === selectedValue)) {
    targetSelect.value = selectedValue;
    return;
  }

  targetSelect.value = targetSelect.options[0]?.value || "";
}

function renderPromotionsPage() {
  const search = normalizeSearchTerm(document.getElementById("promotionSearchInput")?.value || "");
  const filtered = state.promotions.filter((promotion) => {
    if (!search) return true;
    return [promotion.name, promotion.scope, promotion.targetValue]
      .some((value) => normalizeSearchTerm(value).includes(search));
  });

  setText("promotionsMetricCount", String(state.promotions.length));
  setText("promotionsMetricActive", String(state.promotions.filter((promotion) => promotion.active !== "NO").length));
  setText("promotionsMetricProducts", String(state.promotions.filter((promotion) => promotion.scope === "product").length));
  setText("promotionsMetricCategories", String(state.promotions.filter((promotion) => promotion.scope === "category").length));

  const tbody = document.getElementById("promotionsTableBody");
  if (tbody) {
    tbody.innerHTML = filtered.length
      ? filtered.map((promotion) => `
        <tr>
          <td><strong>${escapeHtml(promotion.name)}</strong></td>
          <td>${escapeHtml(promotion.scope === "all" ? "General" : promotion.scope === "category" ? "Categoria" : "Producto")}</td>
          <td>${escapeHtml(getPromotionTargetLabel(promotion))}</td>
          <td>${escapeHtml(promotion.discountType === "fixed" ? formatCurrency(promotion.discountValue) : `${promotion.discountValue}%`)}</td>
          <td><span class="state-pill ${promotion.active === "NO" ? "warn" : "ok"}">${promotion.active === "NO" ? "Inactiva" : "Activa"}</span></td>
          <td>
            <div class="d-flex flex-wrap gap-2">
              <button class="btn btn-sm btn-outline-secondary" type="button" data-promotion-action="edit" data-id="${escapeHtml(promotion.id)}">Editar</button>
              <button class="btn btn-sm btn-outline-secondary" type="button" data-promotion-action="toggle" data-id="${escapeHtml(promotion.id)}">${promotion.active === "NO" ? "Activar" : "Inactivar"}</button>
              <button class="btn btn-sm btn-outline-danger" type="button" data-promotion-action="delete" data-id="${escapeHtml(promotion.id)}">Borrar</button>
            </div>
          </td>
        </tr>
      `).join("")
      : `<tr><td colspan="6"><div class="empty-state compact-empty"><p>No hay promociones creadas.</p></div></td></tr>`;
  }
}

function bindPromotionsEvents() {
  const searchInput = document.getElementById("promotionSearchInput");
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = "true";
    searchInput.addEventListener("input", renderPromotionsPage);
  }

  const resetButton = document.getElementById("promotionResetButton");
  if (resetButton && !resetButton.dataset.bound) {
    resetButton.dataset.bound = "true";
    resetButton.addEventListener("click", resetPromotionForm);
  }

  const scopeSelect = document.getElementById("promotionScope");
  if (scopeSelect && !scopeSelect.dataset.bound) {
    scopeSelect.dataset.bound = "true";
    scopeSelect.addEventListener("change", (event) => {
      updatePromotionTargetOptions(event.target.value, "");
    });
  }

  const form = document.getElementById("promotionForm");
  if (form && form.dataset.bound !== "true") {
    form.dataset.bound = "true";
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      // Validamos antes de guardar para que cualquier fallo operativo quede trazable en consola.
      const promotion = normalizePromotionRecord({
        id: document.getElementById("promotionId").value.trim() || crypto.randomUUID(),
        name: document.getElementById("promotionName").value.trim(),
        scope: document.getElementById("promotionScope").value,
        targetValue: document.getElementById("promotionTargetValue").value.trim(),
        discountType: document.getElementById("promotionDiscountType").value,
        discountValue: document.getElementById("promotionDiscountValue").value,
        active: document.getElementById("promotionActive").value
      });

      if (!promotion.name || !promotion.discountValue) {
        console.warn("Promociones: intento de guardado sin nombre o valor de descuento.", promotion);
        showInfoDialog("Completa el nombre y el valor del descuento antes de guardar.", { title: "Datos incompletos", variant: "warn" });
        return;
      }
      if (promotion.scope !== "all" && !promotion.targetValue) {
        console.warn("Promociones: intento de guardado sin producto o categoria seleccionada.", promotion);
        showInfoDialog("Selecciona un producto o una categoria para la promocion.", { title: "Destino requerido", variant: "warn" });
        return;
      }

      const index = state.promotions.findIndex((entry) => entry.id === promotion.id);
      if (index >= 0) {
        state.promotions.splice(index, 1, promotion);
      } else {
        state.promotions.unshift(promotion);
      }

      console.info("Promociones: configuracion guardada correctamente.", promotion);
      saveData();
      resetPromotionForm();
      renderPromotionsPage();
      rerenderCurrentPage();
    });
  }

  const table = document.getElementById("promotionsTableBody");
  if (table && !table.dataset.bound) {
    table.dataset.bound = "true";
    table.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-promotion-action][data-id]");
      if (!button) return;
      const promotion = state.promotions.find((entry) => entry.id === button.dataset.id);
      if (!promotion) {
        console.warn("Promociones: no se encontro la promocion seleccionada para la accion.", button.dataset.id);
        return;
      }

      if (button.dataset.promotionAction === "edit") {
        document.getElementById("promotionId").value = promotion.id;
        document.getElementById("promotionName").value = promotion.name;
        document.getElementById("promotionScope").value = promotion.scope;
        updatePromotionTargetOptions(promotion.scope, promotion.targetValue);
        document.getElementById("promotionTargetValue").value = promotion.targetValue;
        document.getElementById("promotionDiscountType").value = promotion.discountType;
        document.getElementById("promotionDiscountValue").value = promotion.discountValue;
        document.getElementById("promotionActive").value = promotion.active;
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      if (button.dataset.promotionAction === "toggle") {
        promotion.active = promotion.active === "NO" ? "SI" : "NO";
        console.info("Promociones: cambio de estado aplicado.", { id: promotion.id, active: promotion.active });
      }

      if (button.dataset.promotionAction === "delete") {
        state.promotions = state.promotions.filter((entry) => entry.id !== promotion.id);
        console.info("Promociones: promocion eliminada.", { id: promotion.id, name: promotion.name });
      }

      saveData();
      renderPromotionsPage();
      rerenderCurrentPage();
    });
  }

  updatePromotionTargetOptions(document.getElementById("promotionScope")?.value || "product", document.getElementById("promotionTargetValue")?.value || "");
}

function buildBackupPayload() {
  return {
    exportedAt: new Date().toISOString(),
    profile: state.pharmacyProfile,
    inventory: state.inventory,
    clients: state.clients,
    suppliers: state.suppliers,
    purchases: state.purchases,
    returns: state.returns,
    promotions: state.promotions,
    sales: state.sales,
    cashClosures: state.cashClosures,
    cashClosureDraft: state.cashClosureDraft
  };
}

function downloadBackupSnapshot() {
  const payload = buildBackupPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `farmapos-backup-${normalizeInputDateValue(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importBackupSnapshot(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);

  state.inventory = Array.isArray(parsed.inventory) ? parsed.inventory.map(normalizeInventoryItem) : state.inventory;
  state.clients = Array.isArray(parsed.clients) ? parsed.clients.map(normalizeClientRecord) : state.clients;
  state.suppliers = Array.isArray(parsed.suppliers) ? parsed.suppliers.map(normalizeSupplierRecord) : state.suppliers;
  state.purchases = Array.isArray(parsed.purchases) ? parsed.purchases.map(normalizePurchaseRecord) : state.purchases;
  state.returns = Array.isArray(parsed.returns) ? parsed.returns.map(normalizeReturnRecord) : state.returns;
  state.promotions = Array.isArray(parsed.promotions) ? parsed.promotions.map(normalizePromotionRecord) : state.promotions;
  state.sales = Array.isArray(parsed.sales) ? parsed.sales.map((entry, index) => normalizeSaleRecord(entry, index)) : state.sales;
  state.cashClosures = Array.isArray(parsed.cashClosures) ? parsed.cashClosures.map((entry, index) => normalizeCashClosureRecord(entry, index)) : state.cashClosures;
  state.cashClosureDraft = parsed.cashClosureDraft ? normalizeCashClosureDraft(parsed.cashClosureDraft) : state.cashClosureDraft;
  state.pharmacyProfile = parsed.profile ? normalizePharmacyProfile(parsed.profile) : state.pharmacyProfile;
  state.selectedClientId = state.clients.find((client) => client.active !== "NO")?.id || state.clients[0]?.id || "";
  saveData();
  savePharmacyProfile();
  saveCashClosureData();
  saveCashClosureDraft();
  rerenderCurrentPage();
}

function renderBackupsPage() {
  const payload = buildBackupPayload();
  const backupSizeKb = Math.max(1, Math.round(JSON.stringify(payload).length / 1024));

  setText("backupMetricInventory", String(state.inventory.length));
  setText("backupMetricSales", String(state.sales.length));
  setText("backupMetricClients", String(state.clients.length));
  setText("backupMetricSize", `${backupSizeKb} KB`);

  setText("backupSummaryInventory", `${state.inventory.length} productos`);
  setText("backupSummaryClients", `${state.clients.length} clientes`);
  setText("backupSummarySales", `${state.sales.length} ventas`);
  setText("backupSummaryPromotions", `${state.promotions.length} promociones`);
}

function bindBackupsEvents() {
  const exportButton = document.getElementById("downloadBackupButton");
  if (exportButton && !exportButton.dataset.bound) {
    exportButton.dataset.bound = "true";
    exportButton.addEventListener("click", () => {
      downloadBackupSnapshot();
      showAppToast("Respaldo generado correctamente.", {
        title: "Backup listo",
        variant: "success"
      });
    });
  }

  const fileInput = document.getElementById("backupRestoreFile");
  if (fileInput && !fileInput.dataset.bound) {
    fileInput.dataset.bound = "true";
    fileInput.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        await importBackupSnapshot(file);
        await showInfoDialog("El respaldo fue restaurado en este equipo correctamente.", {
          title: "Restauracion completada",
          variant: "success"
        });
      } catch (error) {
        await showInfoDialog(error.message || "No fue posible restaurar el respaldo.", {
          title: "Error de restauracion",
          variant: "danger"
        });
      } finally {
        event.target.value = "";
      }
    });
  }
}

function getFilteredAuditLogs() {
  const search = normalizeSearchTerm(document.getElementById("auditSearchInput")?.value || "");
  const moduleFilter = String(document.getElementById("auditModuleFilter")?.value || "all").trim();

  return state.auditLogs
    .slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .filter((entry) => {
      const matchesSearch = !search || [entry.entityName, entry.detail, entry.user, entry.module, entry.action]
        .some((value) => normalizeSearchTerm(value).includes(search));
      const matchesModule = moduleFilter === "all" || entry.module === moduleFilter;
      return matchesSearch && matchesModule;
    });
}

function renderAuditPage() {
  const filtered = getFilteredAuditLogs();
  const modules = [...new Set(state.auditLogs.map((entry) => entry.module).filter(Boolean))].sort();
  const moduleFilter = document.getElementById("auditModuleFilter");
  if (moduleFilter) {
    const currentValue = moduleFilter.value || "all";
    moduleFilter.innerHTML = `<option value="all">Todos</option>${modules.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
    moduleFilter.value = modules.includes(currentValue) || currentValue === "all" ? currentValue : "all";
  }

  setText("auditMetricCount", String(state.auditLogs.length));
  setText("auditMetricUsers", String(new Set(state.auditLogs.map((entry) => entry.user).filter(Boolean)).size));
  setText("auditMetricModules", String(modules.length));
  setText("auditMetricToday", String(state.auditLogs.filter((entry) => normalizeInputDateValue(entry.createdAt) === normalizeInputDateValue(new Date())).length));

  const list = document.getElementById("auditLogList");
  if (list) {
    list.innerHTML = filtered.length
      ? filtered.map((entry) => `
        <article class="sales-history-item">
          <div class="sales-history-head">
            <strong>${escapeHtml(entry.module)} Â· ${escapeHtml(entry.action)}</strong>
            <span class="sale-state-pill is-active">${escapeHtml(formatSessionDateTime(entry.createdAt))}</span>
          </div>
          <div class="sales-history-meta-grid">
            <span><i class="bi bi-person"></i>${escapeHtml(entry.user || "Sistema")}</span>
            <span><i class="bi bi-tag"></i>${escapeHtml(entry.entityName || entry.entityId || "Sin referencia")}</span>
            <span><i class="bi bi-terminal"></i>${escapeHtml(entry.username || "sin-login")}</span>
            <span><i class="bi bi-folder2-open"></i>${escapeHtml(entry.module)}</span>
          </div>
          <div class="sales-history-items-preview">${escapeHtml(entry.detail || "Sin detalle adicional")}</div>
        </article>
      `).join("")
      : `<div class="empty-state compact-empty"><p>No hay eventos de auditoria para esos filtros.</p></div>`;
  }
}

function bindAuditEvents() {
  ["auditSearchInput", "auditModuleFilter"].forEach((id) => {
    const element = document.getElementById(id);
    if (!element || element.dataset.bound) return;
    element.dataset.bound = "true";
    element.addEventListener(element.tagName === "SELECT" ? "change" : "input", renderAuditPage);
  });
}

function renderDashboard() {
  const licenseSummary = getLicenseUiSummary();
  const activeSales = getActiveSales();
  const revenue = activeSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const units = activeSales.reduce((sum, sale) => sum + sale.items.reduce((acc, item) => acc + Number(item.quantity || 0), 0), 0);
  const today = normalizeInputDateValue(new Date());
  const todaySales = activeSales.filter((sale) => normalizeInputDateValue(sale.date) === today);
  const low = state.inventory.filter((item) => Number(item.stock || 0) <= 10).length;
  const out = state.inventory.filter((item) => Number(item.stock || 0) === 0).length;
  const top = state.clients.slice().sort((a, b) => Number(b.purchases || 0) - Number(a.purchases || 0))[0];
  const promotionCount = state.promotions.filter((promotion) => promotion.active !== "NO").length;
  const purchaseTotal = state.purchases.reduce((sum, purchase) => sum + Number(purchase.total || 0), 0);
  const pharmacy = normalizePharmacyProfile(state.pharmacyProfile);
  const pharmacyMeta = [pharmacy.address, pharmacy.email].filter(Boolean).join(" Â· ");

  const productSales = new Map();
  activeSales.forEach((sale) => {
    sale.items.forEach((item) => {
      const current = productSales.get(item.id) || { name: item.name, units: 0, revenue: 0 };
      current.units += Number(item.quantity || 0);
      current.revenue += Number(item.price || 0) * Number(item.quantity || 0);
      productSales.set(item.id, current);
    });
  });
  const topProducts = Array.from(productSales.values()).sort((a, b) => b.units - a.units).slice(0, 5);

  setText("dailySalesValue", formatCurrency(todaySales.reduce((sum, sale) => sum + Number(sale.total || 0), 0)));
  setText("dailySalesCount", `${todaySales.length} transacciones`);
  setText("cashValue", formatCurrency(activeSales.filter((sale) => sale.paymentMethod === "Efectivo").reduce((sum, sale) => sum + Number(sale.total || 0), 0)));
  setText("inventoryCountValue", String(state.inventory.length));
  setText("lowStockValue", `${low} con stock bajo`);
  setText("clientCountValue", String(state.clients.length));
  setText("frequentClientValue", `${top?.purchases || 0} compras frecuentes`);
  setText("homeAverageTicket", formatCurrency(activeSales.length ? Math.round(revenue / activeSales.length) : 0));
  setText("homeUnitsSold", String(units));
  setText("dashboardTopClient", top?.name || "Cliente general");
  setText("dashboardLastTicket", activeSales.length ? activeSales[activeSales.length - 1].ticketNumber : "Sin ventas");
  setText("dashboardInventorySummary", `${state.inventory.length} productos`);
  setText("dashboardClientSummary", `${state.clients.length} clientes`);
  setText("dashboardSalesSummary", `${activeSales.length} ventas`);
  setText("dashboardCashSummary", formatCurrency(activeSales.filter((sale) => sale.paymentMethod === "Efectivo").reduce((sum, sale) => sum + Number(sale.total || 0), 0)));
  setText("dashboardStockHealth", out > 0 ? "Critico" : low > 0 ? "Atencion" : "Estable");
  setText("dashboardPromoCount", String(promotionCount));
  setText("dashboardPromoMeta", promotionCount ? `${promotionCount} descuento(s) aplicandose en POS` : "Sin descuentos configurados");
  setText("dashboardPurchaseCount", String(state.purchases.length));
  setText("dashboardPurchaseMeta", `${formatCurrency(purchaseTotal)} en abastecimiento`);

  setText("dashboardPharmacyName", pharmacy.name || "Farma POS");
  setText("dashboardPharmacyMeta", pharmacyMeta || "Configura los datos de la farmacia para personalizar el sistema.");
  setText("dashboardPharmacyCity", pharmacy.city || "Sin configurar");
  setText("dashboardPharmacyPhone", pharmacy.phone || "Sin configurar");
  setText("dashboardPharmacyNit", pharmacy.nit || "Sin configurar");
  setText("dashboardLicensePlan", licenseSummary.planLabel);
  setText("dashboardLicenseStatus", licenseSummary.statusLabel);
  setText("dashboardLicenseRemaining", licenseSummary.remainingLabel);
  setText("dashboardLicenseCutoff", licenseSummary.cutoffLabel);

  const alerts = document.getElementById("homeAlerts");
  if (alerts) {
    alerts.innerHTML = `
      <div class="list-card"><strong>${low} productos con stock bajo</strong><span>Revisa reposicion para evitar quiebres.</span></div>
      <div class="list-card"><strong>${out} productos agotados</strong><span>No estan disponibles para nuevas ventas.</span></div>
      <div class="list-card"><strong>${promotionCount} promociones activas</strong><span>Descuentos visibles en el punto de venta.</span></div>
    `;
  }

  const recent = document.getElementById("recentSalesList");
  if (recent) {
    recent.innerHTML = activeSales.length
      ? activeSales.slice().reverse().slice(0, 5).map((sale) => `
        <div class="list-card">
          <strong>${escapeHtml(sale.ticketNumber)} Â· ${formatCurrency(sale.total)}</strong>
          <span>${escapeHtml(sale.clientName)} Â· ${escapeHtml(sale.paymentMethod)} Â· ${escapeHtml(sale.date)}</span>
        </div>
      `).join("")
      : `<div class="list-card"><strong>Sin ventas recientes</strong><span>Las proximas ventas apareceran aqui.</span></div>`;
  }

  const topProductsNode = document.getElementById("dashboardTopProducts");
  if (topProductsNode) {
    topProductsNode.innerHTML = topProducts.length
      ? topProducts.map((item) => `
        <div class="list-card">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${item.units} und Â· ${formatCurrency(item.revenue)}</span>
        </div>
      `).join("")
      : `<div class="list-card"><strong>Sin productos destacados</strong><span>Las ventas nuevas alimentaran este ranking.</span></div>`;
  }

  const riskNode = document.getElementById("dashboardRiskList");
  if (riskNode) {
    const expirationRisks = getExpirationAlerts().slice(0, 3);
    const lowStockItems = state.inventory.filter((item) => Number(item.stock || 0) > 0 && Number(item.stock || 0) <= 10).slice(0, 2);
    const cards = [
      ...lowStockItems.map((item) => ({ title: item.name, detail: `Stock bajo: ${item.stock} unidad(es).` })),
      ...expirationRisks.map(({ item, meta }) => ({ title: item.name, detail: meta.status === "expired" ? `Vencido hace ${meta.days} dia(s).` : `Vence en ${meta.days} dia(s).` }))
    ].slice(0, 4);

    riskNode.innerHTML = cards.length
      ? cards.map((entry) => `
        <div class="list-card">
          <strong>${escapeHtml(entry.title)}</strong>
          <span>${escapeHtml(entry.detail)}</span>
        </div>
      `).join("")
      : `<div class="list-card"><strong>Operacion estable</strong><span>No hay alertas criticas de stock ni vencimiento.</span></div>`;
  }
}

function renderSalesHistory() {
  const container = document.getElementById("salesHistoryList");
  if (!container) return;

  const filteredSales = getFilteredSalesHistoryItems();
  const activeSales = state.sales.filter((sale) => sale.status !== "ANULADA");
  const annulledSales = state.sales.filter((sale) => sale.status === "ANULADA");
  const revenue = activeSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const average = activeSales.length ? Math.round(revenue / activeSales.length) : 0;

  setText("salesHistoryMetricActive", String(activeSales.length));
  setText("salesHistoryMetricAnnulled", String(annulledSales.length));
  setText("salesHistoryMetricRevenue", formatCurrency(revenue));
  setText("salesHistoryMetricAverage", formatCurrency(average));

  container.innerHTML = filteredSales.length
    ? filteredSales.map((sale) => {
        const units = sale.items.reduce((sum, item) => sum + item.quantity, 0);
        const itemsPreview = sale.items.slice(0, 3).map((item) => `${item.quantity}x ${item.name}`).join(" Â· ");
        return `<article class="sales-history-item ${sale.status === "ANULADA" ? "is-annulled" : ""}">
          <div class="sales-history-head">
            <strong>${escapeHtml(sale.ticketNumber)} - ${formatCurrency(sale.total)}</strong>
            <span class="sale-state-pill ${sale.status === "ANULADA" ? "is-annulled" : "is-active"}">${sale.status === "ANULADA" ? "Anulada" : "Activa"}</span>
          </div>
          <div class="sales-history-meta-grid">
            <span><i class="bi bi-person"></i>${escapeHtml(sale.clientName)}${sale.clientDocument ? ` Â· ${escapeHtml(sale.clientDocument)}` : ""}</span>
            <span><i class="bi bi-calendar-event"></i>${escapeHtml(formatDisplayDate(sale.date))} ${escapeHtml(sale.time)}</span>
            <span><i class="bi bi-wallet2"></i>${escapeHtml(sale.paymentMethod)}</span>
            <span><i class="bi bi-bag-check"></i>${units} producto(s)</span>
          </div>
          <div class="sales-history-items-preview">${escapeHtml(itemsPreview || "Sin detalle de productos")}</div>
          ${sale.status === "ANULADA" ? `<span>Anulada por ${escapeHtml(sale.annulledBy || "Supervisor")} - ${escapeHtml(sale.annulledReason || "Sin motivo")}.</span>` : ""}
          <div class="sales-history-actions">
            <button class="btn btn-sm btn-outline-secondary sales-ticket-view" type="button" data-sale-id="${escapeHtml(sale.id)}">Ver ticket</button>
            <button class="btn btn-sm btn-outline-secondary sales-ticket-print" type="button" data-sale-id="${escapeHtml(sale.id)}">Imprimir</button>
            <button class="btn btn-sm btn-outline-secondary sales-ticket-download" type="button" data-sale-id="${escapeHtml(sale.id)}">Descargar</button>
            ${sale.status !== "ANULADA" ? `<button class="btn btn-sm btn-outline-danger sales-ticket-annul" type="button" data-sale-id="${escapeHtml(sale.id)}">Anular venta</button>` : ""}
          </div>
        </article>`;
      }).join("")
    : `<div class="empty-state compact-empty"><p>No hay ventas para esos filtros.</p></div>`;
}

function bindSalesHistoryEvents() {
  ["salesHistorySearchInput", "salesHistoryStatusFilter", "salesHistoryPaymentFilter", "salesHistoryDateFilter"].forEach((id) => {
    const element = document.getElementById(id);
    if (!element || element.dataset.bound) return;
    element.dataset.bound = "true";
    element.addEventListener(element.tagName === "SELECT" ? "change" : "input", renderSalesHistory);
  });

  document.getElementById("closeTicket")?.addEventListener("click", closeTicket);
  document.getElementById("ticketOverlay")?.addEventListener("click", closeTicket);
  document.getElementById("printTicket")?.addEventListener("click", printCurrentTicket);
  document.getElementById("downloadTicket")?.addEventListener("click", () => {
    if (!state.lastTicketHtml) return;
    downloadTicketPdf(state.lastTicketHtml, "ticket-farmapos.pdf");
  });

  document.getElementById("salesHistoryList")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-sale-id]");
    if (!button) return;

    if (button.classList.contains("sales-ticket-annul")) {
      annulSaleById(button.dataset.saleId);
      return;
    }

    const result = openSaleTicketById(button.dataset.saleId);
    if (!result) return;

    if (button.classList.contains("sales-ticket-view")) return;
    if (button.classList.contains("sales-ticket-print")) {
      printCurrentTicket();
      return;
    }
    if (button.classList.contains("sales-ticket-download")) {
      downloadTicketPdf(result.html, `${result.sale.ticketNumber}.pdf`, `Ticket ${result.sale.ticketNumber}`);
    }
  });
}

function renderReports() {
  const activeSales = getActiveSales();
  const revenue = activeSales.reduce((sum, sale) => sum + sale.total, 0);
  const units = activeSales.reduce((sum, sale) => sum + sale.items.reduce((acc, item) => acc + item.quantity, 0), 0);
  const average = activeSales.length ? Math.round(revenue / activeSales.length) : 0;
  const top = state.clients.slice().sort((a, b) => (b.purchases || 0) - (a.purchases || 0))[0];

  setText("reportRevenue", formatCurrency(revenue));
  setText("reportUnits", String(units));
  setText("reportAverage", formatCurrency(average));
  setText("reportTopClient", top?.name || "General");

  const bars = document.getElementById("reportBars");
  if (bars) {
    const categories = [...new Set(state.inventory.map((item) => item.category))].map((category) => ({
      category,
      sold: activeSales.reduce((sum, sale) => sum + sale.items.filter((item) => state.inventory.find((entry) => entry.id === item.id)?.category === category).reduce((acc, item) => acc + item.quantity, 0), 0)
    }));
    const max = Math.max(...categories.map((item) => item.sold), 1);

    bars.innerHTML = categories.map((item) => `
      <div class="bar-card">
        <strong><span>${escapeHtml(getCategoryLabel(item.category))}</span><span>${item.sold} und</span></strong>
        <div class="bar-track"><div class="bar-fill" style="width:${(item.sold / max) * 100}%"></div></div>
      </div>
    `).join("");
  }

  const insights = document.getElementById("reportInsights");
  if (insights) {
    const biggest = activeSales.slice().sort((a, b) => b.total - a.total)[0];
    insights.innerHTML = `
      <div class="list-card"><strong>Ingreso acumulado ${formatCurrency(revenue)}</strong><span>Total generado por ventas registradas.</span></div>
      <div class="list-card"><strong>${biggest ? `Venta mayor ${escapeHtml(biggest.ticketNumber)}` : "Sin ventas destacadas"}</strong><span>${biggest ? `${formatCurrency(biggest.total)} a ${escapeHtml(biggest.clientName)}.` : "AÃºn no hay suficiente actividad."}</span></div>
      <div class="list-card"><strong>${escapeHtml(top?.name || "Cliente general")} destaca en compras</strong><span>Mayor frecuencia registrada.</span></div>
    `;
  }
  renderSalesReportPreview();
}

function bindReportsEvents() {
  document.querySelectorAll(".report-period-btn").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".report-period-btn").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.reportPeriod = button.dataset.period || "day";
      renderSalesReportPreview();
    });
  });

  document.getElementById("printSalesReport")?.addEventListener("click", printSalesReport);
  document.getElementById("downloadSalesReport")?.addEventListener("click", downloadSalesReport);
}

function resetUserAdminForm() {
  state.editingUserId = "";
  const defaults = {
    userAdminId: "",
    userAdminCompanyId: "",
    userAdminName: "",
    userAdminUsername: "",
    userAdminPassword: "",
    userAdminRole: "cajero",
    userAdminActive: "SI"
  };

  Object.entries(defaults).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.value = value;
  });

  setText("userAdminSummary", "Crea usuarios para caja, supervisor o administracion.");
}

function populateUserAdminForm(user) {
  const normalized = normalizeUserAdminRecord(user);
  state.editingUserId = normalized.id;
  const fieldMap = {
    userAdminId: normalized.id,
    userAdminCompanyId: normalized.companyId,
    userAdminName: normalized.name,
    userAdminUsername: normalized.username,
    userAdminPassword: "",
    userAdminRole: normalized.role,
    userAdminActive: normalized.active
  };

  Object.entries(fieldMap).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.value = value;
  });

  setText("userAdminSummary", `Editando a ${normalized.name || normalized.username}. Deja la clave vacia si no deseas cambiarla.`);
}

function getRoleLabel(role) {
  if (role === "admin") return "Administrador";
  if (role === "operador") return "Operador";
  if (role === "admin_empresa") return "Administrador farmacia";
  if (role === "supervisor") return "Supervisor";
  return "Cajero";
}

function renderUserAdminSection() {
  const restrictedNode = document.getElementById("userAdminRestricted");
  const contentNode = document.getElementById("userAdminContent");
  const listNode = document.getElementById("userAdminList");
  if (!restrictedNode || !contentNode || !listNode) return;

  if (!isAdminSession()) {
    restrictedNode.hidden = false;
    contentNode.hidden = true;
    return;
  }

  restrictedNode.hidden = true;
  contentNode.hidden = false;

  if (state.usersLoading) {
    listNode.innerHTML = `<div class="user-admin-empty">Cargando usuarios desde MariaDB...</div>`;
    return;
  }

  if (state.usersError) {
    listNode.innerHTML = `<div class="user-admin-empty">${escapeHtml(state.usersError)}</div>`;
    return;
  }

  const users = state.users.slice().sort((left, right) => left.name.localeCompare(right.name, "es"));
  const companySelect = document.getElementById("userAdminCompanyId");
  if (companySelect) {
    const options = [`<option value="">Sin empresa</option>`].concat(
      state.licensingCompanies.map((company) => `<option value="${escapeHtml(company.id)}">${escapeHtml(company.name)}</option>`)
    );
    companySelect.innerHTML = options.join("");
    if (!state.editingUserId) {
      companySelect.value = "";
    }
  }
  if (state.usersLoaded && !users.length) {
    listNode.innerHTML = `<div class="user-admin-empty">No hay usuarios cargados en MariaDB.</div>`;
    return;
  }

  listNode.innerHTML = users.map((user) => `
    <article class="user-admin-item">
      <div class="user-admin-head">
        <div>
          <strong>${escapeHtml(user.name)}</strong>
          <div class="user-admin-meta">
            <span>@${escapeHtml(user.username)}</span>
            <span>${escapeHtml(state.licensingCompanies.find((company) => company.id === user.companyId)?.name || "Sin empresa")}</span>
            <span class="user-role-badge">${escapeHtml(getRoleLabel(user.role))}</span>
            <span class="user-state-badge ${user.active === "SI" ? "is-active" : "is-inactive"}">${escapeHtml(user.active === "SI" ? "Activo" : "Deshabilitado")}</span>
          </div>
        </div>
        <span>${escapeHtml(user.createdAt ? formatSessionDateTime(user.createdAt) : "Sin fecha")}</span>
      </div>
      <div class="user-admin-actions">
        <button class="btn btn-sm btn-outline-secondary" type="button" data-user-edit="${escapeHtml(user.id)}">Editar</button>
        <button class="btn btn-sm ${user.active === "SI" ? "btn-outline-danger" : "btn-outline-success"}" type="button" data-user-toggle="${escapeHtml(user.id)}" data-next-active="${user.active === "SI" ? "NO" : "SI"}">
          ${escapeHtml(user.active === "SI" ? "Deshabilitar" : "Habilitar")}
        </button>
      </div>
    </article>
  `).join("");
}

async function refreshUserAdminSection() {
  if (!isAdminSession()) {
    renderUserAdminSection();
    return;
  }

  state.usersLoading = true;
  state.usersError = "";
  renderUserAdminSection();

  try {
    await loadUsersFromApi();
    state.usersLoaded = true;
  } catch (error) {
    state.usersError = error.message || "No fue posible cargar los usuarios desde MariaDB.";
    setText("userAdminSummary", state.usersError);
  } finally {
    state.usersLoading = false;
  }

  renderUserAdminSection();
}

function bindUserAdminEvents() {
  document.getElementById("cancelUserAdminEdit")?.addEventListener("click", () => {
    resetUserAdminForm();
  });

  document.getElementById("userAdminForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isAdminSession()) return;

    const payload = normalizeUserAdminRecord({
      id: document.getElementById("userAdminId")?.value,
      companyId: document.getElementById("userAdminCompanyId")?.value,
      name: document.getElementById("userAdminName")?.value,
      username: document.getElementById("userAdminUsername")?.value,
      password: document.getElementById("userAdminPassword")?.value,
      role: document.getElementById("userAdminRole")?.value,
      active: document.getElementById("userAdminActive")?.value
    });
    payload.password = String(document.getElementById("userAdminPassword")?.value || "").trim();

    if (!payload.name || !payload.username) {
      await showInfoDialog("Debes completar nombre y usuario.", {
        title: "Datos requeridos",
        variant: "warn"
      });
      return;
    }

    try {
      await withLoading(async () => {
        await saveUserToApi(payload);
      }, {
        title: "Guardando usuario",
        message: "Actualizando usuarios en MySQL/MariaDB..."
      });

      resetUserAdminForm();
      renderUserAdminSection();
      await showInfoDialog("El usuario quedo guardado correctamente.", {
        title: "Usuario guardado",
        variant: "success"
      });
    } catch (error) {
      await showInfoDialog(error.message || "No fue posible guardar el usuario.", {
        title: "Error al guardar",
        variant: "danger"
      });
    }
  });

  document.getElementById("userAdminList")?.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-user-edit]");
    const toggleButton = event.target.closest("[data-user-toggle]");
    if (!editButton && !toggleButton) return;
    if (!isAdminSession()) return;

    if (editButton) {
      const user = state.users.find((entry) => entry.id === editButton.dataset.userEdit);
      if (user) populateUserAdminForm(user);
      return;
    }

    const user = state.users.find((entry) => entry.id === toggleButton.dataset.userToggle);
    if (!user) return;

    const nextActive = String(toggleButton.dataset.nextActive || "SI").trim().toUpperCase() === "NO" ? "NO" : "SI";
    const confirmed = await showConfirmDialog(
      `${nextActive === "SI" ? "Se habilitara" : "Se inhabilitara"} el usuario ${user.name}.`,
      {
        title: nextActive === "SI" ? "Habilitar usuario" : "Inhabilitar usuario",
        confirmText: nextActive === "SI" ? "Habilitar" : "Inhabilitar",
        cancelText: "Cancelar",
        variant: nextActive === "SI" ? "success" : "warn"
      }
    );
    if (!confirmed) return;

    try {
      await withLoading(async () => {
        await setUserActiveInApi(user.id, nextActive);
      }, {
        title: nextActive === "SI" ? "Habilitando usuario" : "Inhabilitando usuario",
        message: "Actualizando estado en MySQL/MariaDB..."
      });

      renderUserAdminSection();
      if (state.editingUserId === user.id) {
        const updated = state.users.find((entry) => entry.id === user.id);
        if (updated) populateUserAdminForm(updated);
      }
    } catch (error) {
      await showInfoDialog(error.message || "No fue posible actualizar el estado del usuario.", {
        title: "Error al actualizar",
        variant: "danger"
      });
    }
  });
}

function resetLicensingCompanyForm() {
  state.editingCompanyId = "";
  const defaults = {
    licensingCompanyId: "",
    licensingCompanyName: "",
    licensingCompanyNit: "",
    licensingCompanyPhone: "",
    licensingCompanyEmail: "",
    licensingCompanyContact: "",
    licensingCompanyStatus: "ACTIVA"
  };
  Object.entries(defaults).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.value = value;
  });
  setText("licensingCompanySummary", "Registra la empresa antes de emitir una licencia.");
}

function resetLicensingLicenseForm() {
  state.editingLicenseId = "";
  const defaultPlan = "ANUAL";
  const defaultExpiry = calculateLicenseExpiryByPlan(defaultPlan, new Date());
  const defaults = {
    licensingLicenseId: "",
    licensingLicenseCode: generateRobustLicenseCodeValue("", defaultPlan),
    licensingLicenseCustomer: "",
    licensingLicenseDocument: "",
    licensingLicensePhone: "",
    licensingLicenseEmail: "",
    licensingLicensePlan: defaultPlan,
    licensingLicenseMaxDevices: "1",
    licensingLicenseExpiresAt: defaultExpiry,
    licensingLicenseStatus: "PENDIENTE",
    licensingLicenseNotes: "Licencia emitida por el equipo desarrollador. Hecho en Colombia. Soporte 24/7."
  };
  Object.entries(defaults).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.value = value;
  });
  updateLicensingLicenseSummary(defaultPlan, defaultExpiry, false);
}

function populateLicensingCompanyForm(company) {
  state.editingCompanyId = String(company?.id || "").trim();
  const fieldMap = {
    licensingCompanyId: company?.id || "",
    licensingCompanyName: company?.name || "",
    licensingCompanyNit: company?.nit || "",
    licensingCompanyPhone: company?.phone || "",
    licensingCompanyEmail: company?.email || "",
    licensingCompanyContact: company?.contact || "",
    licensingCompanyStatus: company?.status || "ACTIVA"
  };
  Object.entries(fieldMap).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.value = value;
  });
  setText("licensingCompanySummary", `Editando empresa ${company?.name || ""}.`);
}

function populateLicensingLicenseForm(license) {
  state.editingLicenseId = String(license?.id || "").trim();
  const normalizedPlan = normalizeLicensePlanValue(license?.plan || "ANUAL");
  const expiresAt = String(license?.expiresAt || "").slice(0, 10);
  const fieldMap = {
    licensingLicenseId: license?.id || "",
    licensingLicenseCompanyId: license?.companyId || "",
    licensingLicenseCode: license?.code || "",
    licensingLicenseCustomer: license?.customerName || "",
    licensingLicenseDocument: license?.customerDocument || "",
    licensingLicensePhone: license?.phone || "",
    licensingLicenseEmail: license?.email || "",
    licensingLicensePlan: normalizedPlan,
    licensingLicenseMaxDevices: String(license?.maxDevices || 1),
    licensingLicenseExpiresAt: expiresAt,
    licensingLicenseStatus: license?.status || "PENDIENTE",
    licensingLicenseNotes: license?.notes || ""
  };
  Object.entries(fieldMap).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.value = value;
  });
  updateLicensingLicenseSummary(normalizedPlan, expiresAt, true);
}

function applyCompanyDataToLicenseForm(company, force = false) {
  if (!company) return;

  const fieldMap = {
    licensingLicenseCustomer: company.contact || company.name || "",
    licensingLicenseDocument: company.nit || "",
    licensingLicensePhone: company.phone || "",
    licensingLicenseEmail: company.email || ""
  };

  Object.entries(fieldMap).forEach(([id, nextValue]) => {
    const element = document.getElementById(id);
    if (!element) return;

    const currentValue = String(element.value || "").trim();
    if (force || !currentValue) {
      element.value = String(nextValue || "").trim();
    }
  });

  const codeInput = document.getElementById("licensingLicenseCode");
  const planInput = document.getElementById("licensingLicensePlan");
  if (codeInput && planInput && (!String(codeInput.value || "").trim() || !state.editingLicenseId)) {
    codeInput.value = generateRobustLicenseCodeValue(company.name || "", planInput.value || "ANUAL");
  }
}

function getLicenseStatusLabel(status) {
  const normalized = String(status || "").trim().toUpperCase();
  if (normalized === "ACTIVA") return "Activa";
  if (normalized === "BLOQUEADA") return "Bloqueada";
  if (normalized === "VENCIDA") return "Vencida";
  return "Pendiente";
}

function getLicenseStatusBadgeClass(status) {
  const normalized = String(status || "").trim().toUpperCase();
  if (normalized === "ACTIVA") return "is-active";
  if (normalized === "BLOQUEADA" || normalized === "VENCIDA") return "is-inactive";
  return "";
}

function getLicensePlanLabel(plan) {
  const normalized = normalizeLicensePlanValue(plan);
  if (normalized === "QUINCENAL") return "Quincenal";
  if (normalized === "MENSUAL") return "Mensual";
  return "Anual";
}

function updateLicensingLicenseSummary(plan, expiresAt, isEditing = false) {
  const planLabel = getLicensePlanLabel(plan || "ANUAL");
  const expiryLabel = expiresAt ? formatDisplayDate(expiresAt) : "--";
  const prefix = isEditing ? "Editando licencia" : "Nueva licencia robusta";
  setText("licensingLicenseSummary", `${prefix}: plan ${planLabel}, corte ${expiryLabel}.`);
}

function renderLicensingPage() {
  if (!isAdminSession()) {
    window.location.href = "dashboard.html";
    return;
  }

  setText("licensingTotalLicenses", String(state.licensingLicenses.length));
  setText("licensingActiveLicenses", String(state.licensingLicenses.filter((item) => item.status === "ACTIVA").length));
  setText("licensingTotalCompanies", String(state.licensingCompanies.length));
  setText("licensingTotalDevices", String(state.licensingDevices.length));

  const companySelect = document.getElementById("licensingLicenseCompanyId");
  if (companySelect) {
    companySelect.innerHTML = `<option value="">Selecciona empresa</option>${state.licensingCompanies.map((company) => `<option value="${escapeHtml(company.id)}">${escapeHtml(company.name)}</option>`).join("")}`;
    if (!state.editingLicenseId) companySelect.value = "";
  }

  if (!state.editingCompanyId) resetLicensingCompanyForm();
  if (!state.editingLicenseId) resetLicensingLicenseForm();
  if (!state.editingUserId) resetUserAdminForm();
  renderUserAdminSection();

  const companiesList = document.getElementById("licensingCompaniesList");
  if (companiesList) {
    companiesList.innerHTML = state.licensingCompanies.length
      ? state.licensingCompanies.map((company) => `
        <article class="user-admin-item">
          <div class="user-admin-head"><strong>${escapeHtml(company.name)}</strong><span>${escapeHtml(company.nit || "Sin NIT")}</span></div>
          <div class="user-admin-meta"><span>${escapeHtml(company.contact || "Sin contacto")}</span><span class="user-state-badge ${company.status === "ACTIVA" ? "is-active" : "is-inactive"}">${escapeHtml(company.status === "ACTIVA" ? "Activa" : "Inactiva")}</span></div>
          <div class="user-admin-actions"><button class="btn btn-sm btn-outline-secondary" type="button" data-company-edit="${escapeHtml(company.id)}">Editar</button></div>
        </article>`).join("")
      : `<div class="user-admin-empty">No hay empresas registradas.</div>`;
  }

  const licensesList = document.getElementById("licensingLicensesList");
  if (licensesList) {
    licensesList.innerHTML = state.licensingLicenses.length
      ? state.licensingLicenses.map((license) => `
        <article class="user-admin-item">
          <div class="user-admin-head"><strong>${escapeHtml(license.code)}</strong><span>${escapeHtml(license.companyName || "Sin empresa")}</span></div>
          <div class="user-admin-meta">
            <span>${escapeHtml(license.customerName || "Sin cliente")} Â· ${escapeHtml(getLicensePlanLabel(license.plan))} Â· ${escapeHtml(license.maxDevices)} equipo(s)</span>
            <span class="user-state-badge ${getLicenseStatusBadgeClass(license.status)}">${escapeHtml(getLicenseStatusLabel(license.status))}</span>
          </div>
          <div class="user-admin-meta"><span>Vence ${escapeHtml(license.expiresAt ? formatSessionDateTime(license.expiresAt) : "--")}</span><span>${escapeHtml(license.installationName || "Sin equipo principal")}</span></div>
          <div class="user-admin-actions">
            <button class="btn btn-sm btn-outline-secondary" type="button" data-license-edit="${escapeHtml(license.id)}">Editar</button>
            <button class="btn btn-sm btn-outline-secondary" type="button" data-license-bind="${escapeHtml(license.id)}">Aplicar en este equipo</button>
            <button class="btn btn-sm btn-outline-secondary" type="button" data-license-renew="${escapeHtml(license.id)}">Renovar plan</button>
            <button class="btn btn-sm ${license.status === "ACTIVA" ? "btn-outline-danger" : "btn-outline-success"}" type="button" data-license-status="${escapeHtml(license.id)}" data-next-status="${license.status === "ACTIVA" ? "BLOQUEADA" : "ACTIVA"}">${escapeHtml(license.status === "ACTIVA" ? "Bloquear" : "Activar")}</button>
          </div>
        </article>`).join("")
      : `<div class="user-admin-empty">No hay licencias registradas.</div>`;
  }

  const devicesList = document.getElementById("licensingDevicesList");
  if (devicesList) {
    devicesList.innerHTML = state.licensingDevices.length
      ? state.licensingDevices.map((device) => `
        <article class="user-admin-item">
          <div class="user-admin-head"><strong>${escapeHtml(device.installationName || device.installationId)}</strong><span>${escapeHtml(device.installationId)}</span></div>
          <div class="user-admin-meta"><span>Licencia ${escapeHtml(device.licenseId)}</span><span>${escapeHtml(device.lastValidationAt ? formatSessionDateTime(device.lastValidationAt) : "--")}</span></div>
          <div class="user-admin-actions"><button class="btn btn-sm btn-outline-danger" type="button" data-device-release="${escapeHtml(device.licenseId)}" data-installation-id="${escapeHtml(device.installationId)}">Liberar equipo</button></div>
        </article>`).join("")
      : `<div class="user-admin-empty">No hay equipos vinculados.</div>`;
  }

  const historyList = document.getElementById("licensingHistoryList");
  if (historyList) {
    historyList.innerHTML = state.licensingHistory.length
      ? state.licensingHistory.slice(0, 20).map((entry) => `
        <article class="user-admin-item">
          <div class="user-admin-head"><strong>${escapeHtml(entry.eventType)}</strong><span>${escapeHtml(entry.createdAt ? formatSessionDateTime(entry.createdAt) : "--")}</span></div>
          <div class="user-admin-meta"><span>Licencia ${escapeHtml(entry.licenseId)}</span><span>${escapeHtml(entry.installationName || entry.installationId || "Sin equipo")}</span></div>
          <div class="user-admin-meta"><span>${escapeHtml(entry.detail || "Sin detalle")}</span></div>
        </article>`).join("")
      : `<div class="user-admin-empty">No hay historial disponible.</div>`;
  }
}

async function loadSupportApiConfig() {
  if (!desktopDb?.supportConfig) return supportApiConfig;

  try {
    const nextConfig = await desktopDb.supportConfig();
    supportApiConfig = {
      enabled: Boolean(nextConfig?.enabled),
      url: String(nextConfig?.url || "").trim(),
      apiKey: String(nextConfig?.apiKey || "").trim()
    };
  } catch {
    supportApiConfig = {
      enabled: false,
      url: "",
      apiKey: ""
    };
  }

  return supportApiConfig;
}

function getSupportApiBaseUrl() {
  return String(supportApiConfig?.url || "").trim().replace(/\/+$/, "");
}

async function fetchSupportApiJson(path, options = {}, timeoutMs = 15000) {
  const baseUrl = getSupportApiBaseUrl();
  if (!supportApiConfig.enabled || !baseUrl) {
    throw new Error("La API central de soporte no esta configurada.");
  }

  const separator = path.includes("?") ? "&" : "?";
  const externalCompanyId = encodeURIComponent(String(sessionState?.companyId || "").trim());
  const supportCompanyId = encodeURIComponent(getSupportCompanyIdentifier());
  const scopedPath = path.includes("externalCompanyId=")
    ? path
    : `${path}${separator}externalCompanyId=${supportCompanyId}`;

  return fetchJsonWithTimeout(`${baseUrl}${scopedPath}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-support-api-key": supportApiConfig.apiKey,
      "x-support-scope": isInternalSupportSession() ? "internal" : "company",
      ...(options.headers || {})
    }
  }, timeoutMs);
}

async function refreshLicensingOverview() {
  state.licensingLoading = true;
  state.licensingError = "";
  try {
    await loadLicensingOverviewFromApi();
  } catch (error) {
    state.licensingError = error.message || "No fue posible cargar el panel de licencias.";
    await showInfoDialog(state.licensingError, {
      title: "Licencias",
      variant: "danger"
    });
  } finally {
    state.licensingLoading = false;
    renderLicensingPage();
  }
}

async function syncAdminRealtimeState() {
  if (!isDesktopDbEnabled() || !isAdminSession()) return false;

  try {
    const [overview, users, supportOverview] = await Promise.all([
      desktopDb.licensingOverview(),
      desktopDb.listUsers(),
      desktopDb.supportOverview({
        companyId: getSupportCompanyIdentifier(),
        isInternal: true
      })
    ]);

    applyLicensingOverview(overview);
    state.users = Array.isArray(users) ? users.map(normalizeUserAdminRecord) : [];
    applySupportOverview(supportOverview);
    return true;
  } catch (error) {
    console.error("No fue posible sincronizar administracion en vivo:", error);
    return false;
  }
}

async function syncSupportRealtimeState() {
  if (!isDesktopDbEnabled()) return false;

  try {
    const overview = await desktopDb.supportOverview({
      companyId: getSupportCompanyIdentifier(),
      isInternal: isInternalSupportSession()
    });
    applySupportOverview(overview);
    if (!state.supportSelectedTicketId && state.supportTickets[0]?.id) {
      await loadSupportThreadFromApi(state.supportTickets[0].id);
      await markSupportTicketReadInApi(state.supportTickets[0].id);
    }
    return true;
  } catch (error) {
    console.error("No fue posible sincronizar soporte en vivo:", error);
    return false;
  }
}

async function syncRealtimeState() {
  if (liveSyncState.running || document.hidden) return false;

  liveSyncState.running = true;
  try {
    const hasValidLicense = await ensureLicenseAccess();
    if (!hasValidLicense) {
      return false;
    }

    const results = await Promise.allSettled([
      syncDesktopBootstrapState(),
      syncAdminRealtimeState(),
      syncSupportRealtimeState()
    ]);

    const desktopSynced = results[0]?.status === "fulfilled" && Boolean(results[0].value);
    const adminSynced = results[1]?.status === "fulfilled" && Boolean(results[1].value);
    const supportSynced = results[2]?.status === "fulfilled" && Boolean(results[2].value);

    if (adminSynced && document.body.dataset.page === "licensing") {
      renderLicensingPage();
    }

    if (supportSynced && document.body.dataset.page === "support") {
      renderSupportPage();
    }

    return desktopSynced || adminSynced || supportSynced;
  } finally {
    liveSyncState.running = false;
  }
}

function scheduleLiveSync() {
  if (liveSyncState.timerId) {
    window.clearInterval(liveSyncState.timerId);
  }

  liveSyncState.timerId = window.setInterval(() => {
    syncRealtimeState();
  }, LIVE_SYNC_INTERVAL_MS);

  window.addEventListener("focus", () => {
    syncRealtimeState();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      syncRealtimeState();
    }
  });
}

function buildLicensingPendingModalHtml() {
  const inactiveCompanies = state.licensingCompanies.filter((company) => company.status !== "ACTIVA");
  const pendingLicenses = state.licensingLicenses.filter((license) => license.status !== "ACTIVA");

  const companiesHtml = inactiveCompanies.length
    ? inactiveCompanies.map((company) => `
      <article class="licensing-pending-item">
        <strong>${escapeHtml(company.name)}</strong>
        <span>Contacto: ${escapeHtml(company.contact || "Sin contacto")}</span>
        <span>NIT: ${escapeHtml(company.nit || "Sin NIT")}</span>
        <span>Estado: ${escapeHtml(company.status)}</span>
      </article>
    `).join("")
    : `<div class="licensing-pending-empty">No hay empresas inactivas en este momento.</div>`;

  const licensesHtml = pendingLicenses.length
    ? pendingLicenses.map((license) => `
      <article class="licensing-pending-item">
        <strong>${escapeHtml(license.code)}</strong>
        <span>Empresa: ${escapeHtml(license.companyName || "Sin empresa")}</span>
        <span>Cliente/usuario: ${escapeHtml(license.customerName || "Sin cliente")}</span>
        <span>Estado: ${escapeHtml(getLicenseStatusLabel(license.status))}</span>
        <span>Vence: ${escapeHtml(license.expiresAt ? formatSessionDateTime(license.expiresAt) : "--")}</span>
      </article>
    `).join("")
    : `<div class="licensing-pending-empty">No hay licencias pendientes, bloqueadas o vencidas.</div>`;

  return `
    <div class="licensing-pending-grid">
      <section class="licensing-pending-block">
        <h3>Empresas aun no activadas</h3>
        <p class="licensing-pending-copy">Empresas registradas que siguen en estado inactivo.</p>
        <div class="licensing-pending-list">${companiesHtml}</div>
      </section>
      <section class="licensing-pending-block">
        <h3>Licencias aun no activadas</h3>
        <p class="licensing-pending-copy">Incluye pendientes, bloqueadas y vencidas con su cliente asociado.</p>
        <div class="licensing-pending-list">${licensesHtml}</div>
      </section>
    </div>
  `;
}

function openLicensingPendingModal() {
  const modal = document.getElementById("licensingPendingModal");
  const content = document.getElementById("licensingPendingContent");
  if (!modal || !content) return;
  content.innerHTML = buildLicensingPendingModalHtml();
  modal.hidden = false;
}

function closeLicensingPendingModal() {
  const modal = document.getElementById("licensingPendingModal");
  if (modal) modal.hidden = true;
}

function renderSettings() {
  if (!canAccessSettingsPage()) {
    window.location.href = "dashboard.html";
    return;
  }

  const licenseSummary = getLicenseUiSummary();
  const profile = normalizePharmacyProfile(state.pharmacyProfile);
  const canEditProfile = canEditCompanyProfile();
  const isInternalSession = isAdminSession();
  const dianConfig = normalizeDianConfig(state.dianConfig);
  const fieldMap = {
    pharmacyName: profile.name,
    pharmacyNit: profile.nit,
    pharmacyPhone: profile.phone,
    pharmacyEmail: profile.email,
    pharmacyAddress: profile.address,
    pharmacyCity: profile.city,
    pharmacyManager: profile.manager
  };

  if (!state.settingsProfileDirty) {
    Object.entries(fieldMap).forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (input) input.value = value;
    });
  }

  const dianFieldMap = {
    dianEnvironment: dianConfig.environment,
    dianProviderMode: dianConfig.providerMode,
    dianPrefix: dianConfig.prefix,
    dianResolution: dianConfig.resolution,
    dianSoftwareId: dianConfig.softwareId,
    dianSoftwarePin: dianConfig.softwarePin,
    dianCertificateName: dianConfig.certificateName,
    dianCertificatePassword: dianConfig.certificatePassword,
    dianApiUrl: dianConfig.apiUrl,
    dianTestSetId: dianConfig.testSetId
  };
  Object.entries(dianFieldMap).forEach(([id, value]) => {
    const input = document.getElementById(id);
    if (input) input.value = value;
  });

  const logoInput = document.getElementById("pharmacyLogoFile");
  if (logoInput) logoInput.value = "";
  const restrictedNode = document.getElementById("settingsProfileRestricted");
  const profileContentNode = document.getElementById("settingsProfileContent");
  const internalCardNode = document.getElementById("userAdminCard");
  const supportCardNode = document.getElementById("settingsSupportCard");
  const settingsLayoutNode = document.querySelector(".settings-layout-grid");
  if (restrictedNode) restrictedNode.hidden = canEditProfile;
  if (profileContentNode) profileContentNode.hidden = !canEditProfile;
  if (internalCardNode) internalCardNode.hidden = !isInternalSession;
  if (supportCardNode) supportCardNode.hidden = false;
  if (settingsLayoutNode) {
    settingsLayoutNode.dataset.internalSession = isInternalSession ? "true" : "false";
  }
  applyBrandLogo();
  document.querySelectorAll("#pharmacyProfileForm input, #pharmacyProfileForm button").forEach((element) => {
    element.disabled = !canEditProfile;
  });

  if (state.settingsProfileDirty) {
    setText("pharmacyProfileSummary", "Tienes cambios sin guardar en el perfil de empresa.");
  } else {
    const summaryParts = [profile.name, profile.city, profile.phone].filter(Boolean);
    setText("pharmacyProfileSummary", summaryParts.length ? summaryParts.join(" Â· ") : "Sin datos registrados todavÃ­a.");
  }
  setText("settingsPaymentMethod", "Efectivo");
  const activeSales = getActiveSales();
  setText("settingsLastTicket", activeSales.length ? activeSales[activeSales.length - 1].ticketNumber : "Sin ventas");
  setText("inventorySourceUrl", isDesktopDbEnabled() ? "MySQL/MariaDB" : INVENTORY_API_URL);
  setText("inventorySyncStatus", state.inventorySyncMeta.status || "Pendiente");
  setText("inventorySyncAt", state.inventorySyncMeta.lastSyncAt ? formatSessionDateTime(state.inventorySyncMeta.lastSyncAt) : "Sin sincronizar");
  setText("settingsLicenseCode", licenseSummary.code);
  setText("settingsLicensePlan", licenseSummary.planLabel);
  setText("settingsLicenseStatus", licenseSummary.statusLabel);
  setText("settingsLicenseDaysRemaining", licenseSummary.remainingLabel);
  setText("settingsLicenseExpiry", licenseSummary.cutoffLabel);
  setText("settingsLicenseCutoff", licenseSummary.cutoffLabel);
  renderPrinterSettingsPanel();
  setText(
    "settingsSupportSummary",
    isInternalSession
      ? "Hecho en Colombia. Soporte 24/7 para instalacion, activacion, logo, NIT y despliegue de clientes."
      : "Si necesitas ayuda con el perfil de tu empresa, el equipo desarrollador puede acompanarte en tiempo real."
  );
  setText("dianConfigSummary", getDianConfigSummary(dianConfig));
  setText("dianTestResultSummary", getDianTestResultSummary(state.dianTestResult));
}

function renderSupportPage() {
  const supportScope = getSupportScope();
  const supportContextLabel = supportScope === "INTERNO"
    ? "Modo interno: aqui ves los tickets de todas las empresas."
    : "Modo empresa: aqui solo deben aparecer los tickets de tu negocio.";

  setText("supportTicketTotal", String(state.supportTickets.length));
  setText("supportTicketOpen", String(state.supportTickets.filter((ticket) => ["ABIERTO", "EN_PROCESO"].includes(ticket.status)).length));
  setText("supportUnreadCounter", String(getSupportUnreadCount()));
  setText(
    "supportInboxSummary",
    isInternalSupportSession()
      ? `${supportContextLabel} Aqui ves todos los tickets enviados por las empresas.`
      : `${supportContextLabel} Tus tickets quedan visibles para el equipo interno de soporte.`
  );

  const ticketList = document.getElementById("supportTicketList");
  if (ticketList) {
    ticketList.innerHTML = state.supportTickets.length
      ? state.supportTickets.map((ticket) => {
        const unread = isInternalSupportSession() ? Number(ticket.unreadInternal || 0) : Number(ticket.unreadCompany || 0);
        return `
          <article class="support-ticket-item ${state.supportSelectedTicketId === ticket.id ? "is-active" : ""}" data-support-ticket-id="${escapeHtml(ticket.id)}">
            <div class="support-ticket-head">
              <strong>${escapeHtml(ticket.ticketCode || ticket.title)}</strong>
              <span class="support-status-pill ${getSupportStatusClass(ticket.status)}">${escapeHtml(getSupportStatusLabel(ticket.status))}</span>
            </div>
            <div class="support-ticket-meta">
              <span>${escapeHtml(ticket.companyName || "Empresa")}</span>
              ${unread > 0 ? `<span class="support-unread-pill">${unread} nuevo(s)</span>` : `<span>${escapeHtml(ticket.priority || "MEDIA")}</span>`}
            </div>
            <div class="support-ticket-preview">${escapeHtml(ticket.title || "Sin asunto")}</div>
            <div class="support-ticket-meta">
              <span>${escapeHtml(ticket.createdByName || "Usuario")}</span>
              <span>${escapeHtml(ticket.lastMessageAt ? formatSessionDateTime(ticket.lastMessageAt) : "--")}</span>
            </div>
          </article>
        `;
      }).join("")
      : `<div class="user-admin-empty">Aun no hay tickets de soporte registrados.</div>`;
  }

  const selectedTicket = state.supportTickets.find((ticket) => ticket.id === state.supportSelectedTicketId) || null;
  setText("supportThreadTitle", selectedTicket ? `${selectedTicket.ticketCode} Â· ${selectedTicket.title}` : "Soporte interno");
  setText(
    "supportThreadMeta",
    selectedTicket
      ? `${selectedTicket.companyName || "Empresa"} Â· ${getSupportStatusLabel(selectedTicket.status)} Â· ${selectedTicket.lastMessageAt ? formatSessionDateTime(selectedTicket.lastMessageAt) : "--"}`
      : "Selecciona un ticket o crea uno nuevo para iniciar la conversacion."
  );

  const statusSelect = document.getElementById("supportStatusSelect");
  const updateStatusButton = document.getElementById("supportUpdateStatusButton");
  const newTicketButton = document.getElementById("supportNewTicketButton");
  if (newTicketButton) {
    newTicketButton.hidden = isInternalSupportSession();
  }
  if (statusSelect) {
    statusSelect.hidden = !(isInternalSupportSession() && selectedTicket);
    statusSelect.value = selectedTicket?.status || "ABIERTO";
  }
  if (updateStatusButton) {
    updateStatusButton.hidden = !(isInternalSupportSession() && selectedTicket);
  }

  const createCard = document.getElementById("supportTicketCreateCard");
  if (createCard) {
    createCard.hidden = isInternalSupportSession() || Boolean(selectedTicket);
  }

  const replyInput = document.getElementById("supportReplyInput");
  const sendButton = document.getElementById("supportSendReplyButton");
  if (replyInput) {
    replyInput.disabled = !selectedTicket;
  }
  if (sendButton) {
    sendButton.disabled = !selectedTicket;
  }

  const messageFeed = document.getElementById("supportThreadMessages");
  if (messageFeed) {
    messageFeed.innerHTML = state.supportMessages.length
      ? state.supportMessages.map((message) => `
        <article class="support-message ${message.authorScope === "INTERNO" ? "is-internal" : "is-company"}">
          <div class="support-message-bubble">
            <div class="support-message-meta">
              <strong>${escapeHtml(message.authorName || "Usuario")}</strong>
              <span>${escapeHtml(message.createdAt ? formatSessionDateTime(message.createdAt) : "--")}</span>
            </div>
            <p>${escapeHtml(message.message || "")}</p>
          </div>
        </article>
      `).join("")
      : `<div class="user-admin-empty">Aun no hay mensajes en esta conversacion.</div>`;
  }
}

function bindSupportEvents() {
  document.getElementById("supportRefreshButton")?.addEventListener("click", async () => {
    await loadSupportOverviewFromApi();
    renderSupportPage();
  });

  document.getElementById("supportNewTicketButton")?.addEventListener("click", () => {
    state.supportSelectedTicketId = "";
    state.supportMessages = [];
    renderSupportPage();
  });

  document.getElementById("supportTicketList")?.addEventListener("click", async (event) => {
    const ticketCard = event.target.closest("[data-support-ticket-id]");
    if (!ticketCard) return;
    const ticketId = String(ticketCard.getAttribute("data-support-ticket-id") || "").trim();
    if (!ticketId) return;
    await loadSupportThreadFromApi(ticketId);
    await markSupportTicketReadInApi(ticketId);
    renderSupportPage();
  });

  document.getElementById("supportCreateTicketButton")?.addEventListener("click", async () => {
    const payload = {
      title: document.getElementById("supportTicketTitleInput")?.value || "",
      category: document.getElementById("supportTicketCategoryInput")?.value || "GENERAL",
      priority: document.getElementById("supportTicketPriorityInput")?.value || "MEDIA",
      message: document.getElementById("supportTicketMessageInput")?.value || ""
    };

    try {
      await withLoading(async () => {
        await createSupportTicketInApi(payload);
      }, {
        title: "Creando ticket",
        message: "Enviando la solicitud al chat interno de soporte..."
      });

      ["supportTicketTitleInput", "supportTicketCategoryInput", "supportTicketMessageInput"].forEach((id) => {
        const element = document.getElementById(id);
        if (element) element.value = "";
      });
      const priorityInput = document.getElementById("supportTicketPriorityInput");
      if (priorityInput) priorityInput.value = "MEDIA";
      renderSupportPage();
    } catch (error) {
      await showInfoDialog(error.message || "No fue posible crear el ticket.", { title: "Soporte", variant: "danger" });
    }
  });

  document.getElementById("supportSendReplyButton")?.addEventListener("click", async () => {
    const ticketId = state.supportSelectedTicketId;
    const message = document.getElementById("supportReplyInput")?.value || "";
    if (!ticketId) return;

    try {
      await withLoading(async () => {
        await sendSupportMessageInApi(ticketId, message);
      }, {
        title: "Enviando mensaje",
        message: "Actualizando la conversacion de soporte..."
      });
      const input = document.getElementById("supportReplyInput");
      if (input) input.value = "";
      renderSupportPage();
    } catch (error) {
      await showInfoDialog(error.message || "No fue posible enviar el mensaje.", { title: "Soporte", variant: "danger" });
    }
  });

  document.getElementById("supportUpdateStatusButton")?.addEventListener("click", async () => {
    if (!isInternalSupportSession() || !state.supportSelectedTicketId) return;
    const status = document.getElementById("supportStatusSelect")?.value || "ABIERTO";

    try {
      await withLoading(async () => {
        await setSupportTicketStatusInApi(state.supportSelectedTicketId, status);
      }, {
        title: "Actualizando ticket",
        message: "Guardando nuevo estado del ticket..."
      });
      await loadSupportThreadFromApi(state.supportSelectedTicketId);
      renderSupportPage();
    } catch (error) {
      await showInfoDialog(error.message || "No fue posible actualizar el ticket.", { title: "Soporte", variant: "danger" });
    }
  });
}

function normalizeSearchTerm(value) {
  return repairMojibake(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeScannerTerm(value) {
  return normalizeSearchTerm(value).replace(/[\s-]+/g, "");
}

function getSalesSearchMatches(search = "", filter = "all") {
  const normalizedSearch = normalizeSearchTerm(search);
  const normalizedScannerSearch = normalizeScannerTerm(search);
  return state.inventory.filter((item) => {
    const isActive = item.active !== "NO";
    const matchesFilter = filter === "all" || item.category === filter;
    const matchesSearch = !normalizedSearch || [
      item.name,
      item.sku,
      item.barcode,
      item.id
    ].some((value) => {
      const normalizedValue = normalizeSearchTerm(value);
      const normalizedScannerValue = normalizeScannerTerm(value);
      return normalizedValue.includes(normalizedSearch) || (!!normalizedScannerSearch && normalizedScannerValue.includes(normalizedScannerSearch));
    });
    return isActive && matchesFilter && matchesSearch;
  });
}

function findInventoryItemByScannerTerm(search = "") {
  const normalizedSearch = normalizeSearchTerm(search);
  const normalizedScannerSearch = normalizeScannerTerm(search);
  if (!normalizedSearch) return null;

  const exactMatch = state.inventory.find((item) => {
    if (item.active === "NO") return false;
    return [
      item.barcode,
      item.sku,
      item.id,
      item.name
    ].some((value) => {
      const normalizedValue = normalizeSearchTerm(value);
      const normalizedScannerValue = normalizeScannerTerm(value);
      return normalizedValue === normalizedSearch || (!!normalizedScannerSearch && normalizedScannerValue === normalizedScannerSearch);
    });
  });

  if (exactMatch) return exactMatch;

  const filteredMatches = getSalesSearchMatches(search, getActiveSalesFilter());
  return filteredMatches.length === 1 ? filteredMatches[0] : null;
}

function addInventoryItemToCartById(itemId) {
  const card = document.createElement("article");
  card.dataset.id = String(itemId || "").trim();
  addToCart(card);
}

function renderProductGrid(filter = "all", search = "") {
  const grid = document.getElementById("productGrid");
  if (!grid) return;

  const filtered = getSalesSearchMatches(search, filter);

  grid.innerHTML = filtered.map((item) => `
    <article class="product-card ${item.stock === 0 ? "out-of-stock" : item.stock <= 10 ? "low-stock" : ""}" data-category="${escapeHtml(item.category)}" data-id="${escapeHtml(item.id)}">
      <div class="product-tag">SKU ${escapeHtml(item.sku)}</div>
      ${(() => {
        const promo = getActivePromotionForItem(item);
        return promo
          ? `<span class="promotion-badge">${escapeHtml(promo.discountType === "fixed" ? `${formatCurrency(promo.discountValue)} OFF` : `${promo.discountValue}% OFF`)}</span>`
          : "";
      })()}
      ${renderProductVisual(item)}
      <h3>${escapeHtml(item.name)}</h3>
      <p>${escapeHtml(item.description)}</p>
      <div class="product-meta"><strong>${formatCurrency(item.price)}</strong><span>Stock ${item.stock}</span></div>
      <button class="btn btn-brand add-to-cart" type="button" ${item.stock === 0 ? "disabled" : ""}>${item.stock === 0 ? "Agotado" : "Agregar"}</button>
    </article>
  `).join("");

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state"><i class="bi bi-search"></i><p>No hay productos para este filtro.</p></div>`;
  }
}

function renderSalesPage() {
  const select = document.getElementById("saleClient");
  if (select) {
    const availableClients = state.clients.filter((client) => client.active !== "NO");
    select.innerHTML = availableClients.map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)} - ${escapeHtml(client.document)}</option>`).join("");
    select.value = availableClients.find((client) => client.id === state.selectedClientId)?.id || availableClients[0]?.id || "";
  }

  setText("cartClientLabel", getSelectedClient()?.name || "Cliente general");
  setText("cashDrawerStatus", getCashDrawerStatusLabel());
  const cashDrawerAlert = document.getElementById("cashDrawerAlert");
  if (cashDrawerAlert) {
    cashDrawerAlert.hidden = !shouldWarnCashWithdrawal();
  }
  const openCashDrawerTrigger = document.getElementById("openCashDrawerTrigger");
  if (openCashDrawerTrigger) {
    openCashDrawerTrigger.hidden = !!state.cashClosureDraft.isOpen;
  }
  const goCashClosureButton = document.getElementById("goCashClosureButton");
  if (goCashClosureButton) {
    goCashClosureButton.hidden = !state.cashClosureDraft.isOpen;
  }
  const openingInput = document.getElementById("salesOpeningAmount");
  if (openingInput) openingInput.value = String(state.cashClosureDraft.openingAmount || 0);
  renderProductGrid(getActiveSalesFilter(), document.getElementById("salesSearchInput")?.value || "");
  renderCart();
  renderSalesHistory();
  updateSalesAvailability();

  if (!state.cashClosureDraft.isOpen && !salesOpeningPromptShown) {
    salesOpeningPromptShown = true;
    window.setTimeout(() => openCashOpeningModal(), 120);
  }
}

function updateSalesAvailability() {
  const isOpen = isCashDrawerOpen();
  const checkoutButton = document.getElementById("checkoutSale");
  const clearCartButton = document.getElementById("clearCart");
  const cashInput = document.getElementById("cashReceived");

  document.querySelectorAll(".add-to-cart").forEach((button) => {
    const card = button.closest(".product-card");
    const id = card?.dataset.id;
    const inventoryItem = state.inventory.find((item) => item.id === id);
    const noStock = !inventoryItem || inventoryItem.stock <= 0;
    button.disabled = !isOpen || noStock;
  });

  document.querySelectorAll(".payment-btn").forEach((button) => {
    button.disabled = !isOpen;
  });

  if (checkoutButton) checkoutButton.disabled = !isOpen;
  if (clearCartButton) clearCartButton.disabled = !isOpen;
  if (cashInput) cashInput.disabled = !isOpen;
}

function getFilteredSalesHistoryItems() {
  const search = normalizeSearchTerm(document.getElementById("salesHistorySearchInput")?.value || "");
  const statusFilter = String(document.getElementById("salesHistoryStatusFilter")?.value || "all").trim();
  const paymentFilter = String(document.getElementById("salesHistoryPaymentFilter")?.value || "all").trim();
  const dateFilter = normalizeInputDateValue(document.getElementById("salesHistoryDateFilter")?.value || "");

  return state.sales.slice().reverse().filter((sale) => {
    const matchesSearch = !search || [
      sale.ticketNumber,
      sale.clientName,
      sale.clientDocument
    ].some((value) => normalizeSearchTerm(value).includes(search));
    const matchesStatus = statusFilter === "all" || sale.status === statusFilter;
    const matchesPayment = paymentFilter === "all" || sale.paymentMethod === paymentFilter;
    const matchesDate = !dateFilter || normalizeInputDateValue(sale.date) === dateFilter;
    return matchesSearch && matchesStatus && matchesPayment && matchesDate;
  });
}

function renderSalesHistory() {
  const container = document.getElementById("salesHistoryList");
  if (!container) return;

  const filteredSales = getFilteredSalesHistoryItems();
  const activeSales = state.sales.filter((sale) => sale.status !== "ANULADA");
  const annulledSales = state.sales.filter((sale) => sale.status === "ANULADA");
  const revenue = activeSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const average = activeSales.length ? Math.round(revenue / activeSales.length) : 0;

  setText("salesHistoryMetricActive", String(activeSales.length));
  setText("salesHistoryMetricAnnulled", String(annulledSales.length));
  setText("salesHistoryMetricRevenue", formatCurrency(revenue));
  setText("salesHistoryMetricAverage", formatCurrency(average));

  container.innerHTML = filteredSales.length
    ? filteredSales.map((sale) => {
        const units = sale.items.reduce((sum, item) => sum + item.quantity, 0);
        const itemsPreview = sale.items.slice(0, 3).map((item) => `${item.quantity}x ${item.name}`).join(" Â· ");
        return `<article class="sales-history-item ${sale.status === "ANULADA" ? "is-annulled" : ""}">
          <div class="sales-history-head">
            <strong>${escapeHtml(sale.ticketNumber)} - ${formatCurrency(sale.total)}</strong>
            <span class="sale-state-pill ${sale.status === "ANULADA" ? "is-annulled" : "is-active"}">${sale.status === "ANULADA" ? "Anulada" : "Activa"}</span>
          </div>
          <div class="sales-history-meta-grid">
            <span><i class="bi bi-person"></i>${escapeHtml(sale.clientName)}${sale.clientDocument ? ` Â· ${escapeHtml(sale.clientDocument)}` : ""}</span>
            <span><i class="bi bi-calendar-event"></i>${escapeHtml(formatDisplayDate(sale.date))} ${escapeHtml(sale.time)}</span>
            <span><i class="bi bi-wallet2"></i>${escapeHtml(sale.paymentMethod)}</span>
            <span><i class="bi bi-bag-check"></i>${units} producto(s)</span>
          </div>
          <div class="sales-history-items-preview">${escapeHtml(itemsPreview || "Sin detalle de productos")}</div>
          ${sale.status === "ANULADA" ? `<span>Anulada por ${escapeHtml(sale.annulledBy || "Supervisor")} - ${escapeHtml(sale.annulledReason || "Sin motivo")}.</span>` : ""}
          <div class="sales-history-actions">
            <button class="btn btn-sm btn-outline-secondary sales-ticket-view" type="button" data-sale-id="${escapeHtml(sale.id)}">Ver ticket</button>
            <button class="btn btn-sm btn-outline-secondary sales-ticket-print" type="button" data-sale-id="${escapeHtml(sale.id)}">Imprimir</button>
            <button class="btn btn-sm btn-outline-secondary sales-ticket-download" type="button" data-sale-id="${escapeHtml(sale.id)}">Descargar</button>
            ${sale.status !== "ANULADA" ? `<button class="btn btn-sm btn-outline-danger sales-ticket-annul" type="button" data-sale-id="${escapeHtml(sale.id)}">Anular venta</button>` : ""}
          </div>
        </article>`;
      }).join("")
    : `<div class="empty-state compact-empty"><p>No hay ventas para esos filtros.</p></div>`;
}

function restoreInventoryForSale(sale) {
  sale.items.forEach((saleItem) => {
    const inventoryItem = state.inventory.find((item) => item.id === saleItem.id);
    if (inventoryItem) {
      inventoryItem.stock = Number(inventoryItem.stock || 0) + Number(saleItem.quantity || 0);
    }
  });
}

async function annulSaleById(saleId) {
  const sale = state.sales.find((entry) => entry.id === saleId);
  if (!sale || sale.status === "ANULADA") return;

  const supervisorName = document.getElementById("supervisorName")?.value.trim() || "";
  const supervisorReason = document.getElementById("supervisorReason")?.value.trim() || "";

  if (!supervisorName) {
    showInfoDialog("Ingresa el nombre del supervisor que autoriza la anulaciÃ³n.", { title: "Supervisor requerido", variant: "warn" });
    return;
  }

  if (!supervisorReason) {
    showInfoDialog("Ingresa el motivo de la anulaciÃ³n para dejar trazabilidad.", { title: "Motivo requerido", variant: "warn" });
    return;
  }

  const confirmed = await showConfirmDialog(`Se anularÃ¡ el ticket ${sale.ticketNumber} y se repondrÃ¡ el stock local de sus productos.`, {
    title: "Confirmar anulaciÃ³n",
    confirmText: "Anular venta",
    cancelText: "Cancelar",
    variant: "danger"
  });
  if (!confirmed) return;

  try {
    if (isDesktopDbEnabled()) {
      await withLoading(async () => {
        await annulSaleInApi({
          saleId: sale.id,
          annulledBy: supervisorName,
          annulledReason: supervisorReason
        });
      }, {
        title: "Anulando venta",
        message: "Actualizando estado, stock y cliente en MySQL/MariaDB..."
      });
    } else {
      throw new Error("La anulacion SQL no esta disponible porque la app no detecto la conexion desktop con MariaDB.");
    }
  } catch (error) {
    console.error("No fue posible anular la venta:", error);
    await showInfoDialog(error?.message || "No fue posible anular la venta en MariaDB.", {
      title: "Error al anular",
      variant: "danger"
    });
    return;
  }

  await showInfoDialog("La venta fue anulada correctamente y el cambio quedÃ³ aplicado en el sistema.", {
    title: "Venta anulada",
    variant: "success"
  });
}

function renderCart() {
  const cartList = document.getElementById("cartList");
  const emptyCart = document.getElementById("emptyCart");
  if (!cartList) return;

  const pricing = getCartPricing();
  const { items } = pricing;
  cartList.innerHTML = "";

    if (!items.length) {
      if (emptyCart) cartList.appendChild(emptyCart);
      setText("subtotalValue", formatCurrency(0));
      setText("promoDiscountValue", formatCurrency(0));
      setText("taxValue", formatCurrency(0));
      setText("loyaltyDiscountValue", formatCurrency(0));
    setText("availablePointsValue", "0");
    const redeemInput = document.getElementById("redeemPointsInput");
    if (redeemInput) redeemInput.value = "0";
    setText("totalValue", formatCurrency(0));
    setText("changeValue", formatCurrency(0));
    return;
  }

  items.forEach((item) => {
    const article = document.createElement("article");
    article.className = "cart-item";
    article.innerHTML = `
      <div class="cart-item-row">
        <div class="cart-item-main">
          ${renderProductVisual(item, { className: "cart-item-thumb" })}
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <span>${formatCurrency(item.price)} c/u</span>
            ${item.promotionName && item.promoDiscount ? `<span>Promo ${escapeHtml(item.promotionName)}: -${formatCurrency(item.promoDiscount)}</span>` : ""}
          </div>
        </div>
        <button class="icon-action remove-item" type="button" data-id="${escapeHtml(item.id)}"><i class="bi bi-x-lg"></i></button>
      </div>
      <div class="cart-item-row mt-3">
        <div class="qty-box">
          <button class="qty-btn decrease-item" type="button" data-id="${escapeHtml(item.id)}">-</button>
          <strong>${item.quantity}</strong>
          <button class="qty-btn increase-item" type="button" data-id="${escapeHtml(item.id)}">+</button>
        </div>
        <strong>${formatCurrency(item.lineTotal)}</strong>
      </div>
    `;
    cartList.appendChild(article);
  });

    state.redeemedPoints = pricing.redeemedPoints;
    setText("subtotalValue", formatCurrency(pricing.subtotal));
    setText("promoDiscountValue", formatCurrency(pricing.promoDiscount || 0));
    setText("taxValue", formatCurrency(pricing.tax));
  setText("loyaltyDiscountValue", formatCurrency(pricing.loyaltyDiscount));
  setText("availablePointsValue", String(pricing.availablePoints));
  const redeemInput = document.getElementById("redeemPointsInput");
  if (redeemInput) {
    redeemInput.max = String(Math.min(pricing.availablePoints, pricing.grossTotal));
    redeemInput.value = String(pricing.redeemedPoints);
    redeemInput.disabled = !pricing.availablePoints;
  }
  setText("totalValue", formatCurrency(pricing.total));
  bindCartActions();
  updateChange();
}

function bindCartActions() {
  document.querySelectorAll(".increase-item").forEach((button) => {
    button.onclick = () => {
      const item = state.cart.get(button.dataset.id);
      const inventoryItem = state.inventory.find((entry) => entry.id === button.dataset.id);
      if (!item || !inventoryItem || item.quantity >= inventoryItem.stock) return;
      item.quantity += 1;
      renderCart();
    };
  });

  document.querySelectorAll(".decrease-item").forEach((button) => {
    button.onclick = () => {
      const item = state.cart.get(button.dataset.id);
      if (!item) return;
      item.quantity -= 1;
      if (item.quantity <= 0) state.cart.delete(button.dataset.id);
      renderCart();
    };
  });

  document.querySelectorAll(".remove-item").forEach((button) => {
    button.onclick = () => {
      state.cart.delete(button.dataset.id);
      renderCart();
    };
  });
}

function updateChange() {
  const total = Number((document.getElementById("totalValue")?.textContent || "").replace(/[^\d]/g, ""));
  const received = Number(document.getElementById("cashReceived")?.value || 0);
  setText("changeValue", formatCurrency(Math.max(0, received - total)));
}

function addToCart(card) {
  if (!isCashDrawerOpen()) {
    showInfoDialog("Debes abrir caja antes de iniciar una venta.", { title: "Caja cerrada", variant: "warn" });
    return;
  }

  const id = card.dataset.id;
  const inventoryItem = state.inventory.find((item) => item.id === id);
  if (!inventoryItem || inventoryItem.stock <= 0) {
    showInfoDialog("Este producto no tiene stock disponible.", { title: "Sin stock", variant: "warn" });
    return;
  }

  const quantity = state.cart.get(id)?.quantity || 0;
  if (quantity >= inventoryItem.stock) {
    showInfoDialog("No puedes agregar mas unidades que el stock disponible.", { title: "Stock limitado", variant: "warn" });
    return;
  }

  if (state.cart.has(id)) {
    state.cart.get(id).quantity += 1;
  } else {
    state.cart.set(id, {
      id,
      name: inventoryItem.name,
      price: inventoryItem.price,
      imageUrl: inventoryItem.imageUrl || "",
      category: inventoryItem.category,
      quantity: 1
    });
  }

  renderCart();
  showAppToast(`${inventoryItem.name} agregado al carrito.`, {
    title: "Producto agregado",
    variant: inventoryItem.stock <= 10 ? "warn" : "success",
    duration: 1800
  });
}

function buildTicketQrPayload(sale) {
  const pharmacy = getTicketPharmacyProfile();
  const items = (sale.items || []).map((item) => `${item.quantity}x ${item.name}`).join(" | ");
  const isAnnulled = String(sale.status || "").trim().toUpperCase() === "ANULADA";

  return [
    `Farmacia: ${pharmacy.name || "Farma POS"}`,
    `Ticket: ${sale.ticketNumber || sale.id || ""}`,
    `Estado: ${isAnnulled ? "ANULADA" : "ACTIVA"}`,
    `Fecha: ${sale.date || ""} ${sale.time || ""}`.trim(),
    `Cliente: ${sale.clientName || "Cliente general"}`,
    `Documento: ${sale.clientDocument || "Consumidor final"}`,
    `Pago: ${sale.paymentMethod || "Efectivo"}`,
    `Subtotal: ${sale.subtotal || 0}`,
    `IVA: ${sale.tax || 0}`,
    `Total: ${sale.total || 0}`,
    `Items: ${items || "Sin detalle"}`,
    isAnnulled ? `Anulada por: ${sale.annulledBy || "Supervisor"}` : "",
    isAnnulled ? `Motivo: ${sale.annulledReason || "Sin motivo"}` : ""
  ].filter(Boolean).join("\n");
}

function buildTicketQrUrl(sale) {
  const payload = buildTicketQrPayload(sale);
  return `https://quickchart.io/qr?size=180&margin=1&text=${encodeURIComponent(payload)}`;
}

function buildTicketHtml(sale) {
  const pharmacy = getTicketPharmacyProfile();
  const isAnnulled = String(sale.status || "").trim().toUpperCase() === "ANULADA";
  const pharmacyLocation = [pharmacy.address, pharmacy.city].filter(Boolean).join(" | ");
  const pharmacyContact = [pharmacy.phone, pharmacy.email].filter(Boolean).join(" | ");
  const qrUrl = buildTicketQrUrl(sale);
  const ticketBrandVisual = pharmacy.logoUrl
    ? `<img class="ticket-brand-logo" src="${escapeHtml(pharmacy.logoUrl)}" alt="Logo ${escapeHtml(pharmacy.name)}">`
    : "FP";
  const itemsHtml = sale.items.map((item) => `
    <article class="ticket-item">
      <div class="ticket-item-head">
        <strong>${escapeHtml(item.name)}</strong>
        <strong>${formatCurrency(item.lineTotal || Math.max(0, (Number(item.price || 0) * Number(item.quantity || 0)) - Number(item.promoDiscount || 0)))}</strong>
      </div>
      <div class="ticket-item-meta">
        <span>${item.quantity} x ${formatCurrency(item.price)}</span>
        ${item.promoDiscount ? `<span>${escapeHtml(item.promotionName || "Promocion aplicada")} -${formatCurrency(item.promoDiscount)}</span>` : ""}
      </div>
    </article>
  `).join("");

  return `
    <section class="ticket-receipt">
      <div class="ticket-watermark ${isAnnulled ? "is-annulled" : ""}">
        <strong>${escapeHtml(isAnnulled ? "TICKET ANULADO" : (pharmacy.name || "Farma POS").toUpperCase())}</strong>
        <span>${escapeHtml(isAnnulled ? "VENTA REVERSADA" : "VENTA DIGITAL")}</span>
      </div>
      <header class="ticket-brand">
        <div class="ticket-brand-mark">${ticketBrandVisual}</div>
        <div class="ticket-brand-copy ticket-center">
          <h3>${escapeHtml(pharmacy.name)}</h3>
          <p class="ticket-muted ticket-pharmacy-line">${escapeHtml(pharmacy.nit)}</p>
          ${pharmacyLocation ? `<p class="ticket-muted ticket-pharmacy-line">${escapeHtml(pharmacyLocation)}</p>` : ""}
          ${pharmacyContact ? `<p class="ticket-muted ticket-pharmacy-line">${escapeHtml(pharmacyContact)}</p>` : ""}
          <p class="ticket-muted">${escapeHtml(isAnnulled ? "Comprobante de venta anulada" : "Comprobante de venta")}</p>
          <span class="ticket-status-pill ${isAnnulled ? "is-annulled" : "is-active"}">${escapeHtml(isAnnulled ? "Estado: ANULADA" : "Estado: ACTIVA")}</span>
        </div>
      </header>

      <section class="ticket-meta-grid">
        <div class="ticket-meta-card">
          <span>Ticket</span>
          <strong>${escapeHtml(sale.ticketNumber)}</strong>
        </div>
        <div class="ticket-meta-card">
          <span>Fecha</span>
          <strong>${escapeHtml(formatDisplayDate(sale.date))}</strong>
        </div>
        <div class="ticket-meta-card">
          <span>Hora</span>
          <strong>${escapeHtml(sale.time)}</strong>
        </div>
        <div class="ticket-meta-card">
          <span>Estado</span>
          <strong>${escapeHtml(isAnnulled ? "ANULADA" : "ACTIVA")}</strong>
        </div>
      </section>

      <section class="ticket-block">
        <div class="ticket-row"><span>Cliente</span><strong>${escapeHtml(sale.clientName)}</strong></div>
        <div class="ticket-row"><span>Documento</span><strong>${escapeHtml(sale.clientDocument || "Consumidor final")}</strong></div>
        <div class="ticket-row"><span>Metodo de pago</span><strong>${escapeHtml(sale.paymentMethod)}</strong></div>
        ${isAnnulled ? `<div class="ticket-row"><span>Anulada por</span><strong>${escapeHtml(sale.annulledBy || "Supervisor")}</strong></div>` : ""}
        ${isAnnulled ? `<div class="ticket-row"><span>Motivo</span><strong>${escapeHtml(sale.annulledReason || "Sin motivo")}</strong></div>` : ""}
        ${sale.cashReceived ? `<div class="ticket-row"><span>Recibido</span><strong>${formatCurrency(sale.cashReceived)}</strong></div>` : ""}
        ${sale.change ? `<div class="ticket-row"><span>Cambio</span><strong>${formatCurrency(sale.change)}</strong></div>` : ""}
      </section>

      <section class="ticket-block">
        <div class="ticket-section-title">Detalle</div>
        <div class="ticket-items">${itemsHtml}</div>
      </section>

      <section class="ticket-totals">
        <div class="ticket-row"><span>Subtotal</span><strong>${formatCurrency(sale.subtotal)}</strong></div>
        ${sale.promoDiscount ? `<div class="ticket-row"><span>Promociones</span><strong>- ${formatCurrency(sale.promoDiscount)}</strong></div>` : ""}
        <div class="ticket-row"><span>IVA</span><strong>${formatCurrency(sale.tax)}</strong></div>
        ${sale.loyaltyDiscount ? `<div class="ticket-row"><span>Descuento por puntos</span><strong>- ${formatCurrency(sale.loyaltyDiscount)}</strong></div>` : ""}
        <div class="ticket-row ticket-total"><span>Total</span><strong>${formatCurrency(sale.total)}</strong></div>
        ${sale.redeemedPoints ? `<div class="ticket-row"><span>Puntos redimidos</span><strong>${sale.redeemedPoints}</strong></div>` : ""}
        ${Number(sale.earnedPoints || 0) > 0 ? `<div class="ticket-row"><span>Puntos ganados</span><strong>${sale.earnedPoints}</strong></div>` : ""}
      </section>

      <section class="ticket-qr-block">
        <img class="ticket-qr-image" src="${escapeHtml(qrUrl)}" alt="${escapeHtml(isAnnulled ? "QR con resumen de la venta anulada" : "QR con resumen de la venta")}">
        <div class="ticket-qr-copy">
          <strong>${escapeHtml(isAnnulled ? "Ticket anulado" : "Venta digital")}</strong>
          <span>${escapeHtml(isAnnulled ? "El resumen QR indica que este comprobante fue anulado." : "Escanea para ver el resumen de este comprobante.")}</span>
        </div>
      </section>

      <footer class="ticket-footer">
        <p>${escapeHtml(isAnnulled ? "Venta anulada correctamente." : "Gracias por su compra.")}</p>
        <p class="ticket-muted">${escapeHtml(isAnnulled ? "Este comprobante ya no representa una venta activa." : "Conserve este comprobante para cambios o seguimiento.")}</p>
        <p class="ticket-soft-signature">Software desarrollado en Colombia</p>
        <p class="ticket-soft-contact">Soporte 24/7: 3127947484</p>
      </footer>
    </section>
  `;
}

function openTicket(html) {
  const modal = document.getElementById("ticketModal");
  const content = document.getElementById("ticketContent");
  if (!modal || !content) return;
  content.innerHTML = html;
  modal.hidden = false;
}

function closeTicket() {
  const modal = document.getElementById("ticketModal");
  if (modal) modal.hidden = true;
}

function printCurrentTicket() {
  if (!state.lastTicketHtml) return;

  const printDocument = buildTicketPrintableDocument(state.lastTicketHtml);
  printHtmlDocument(printDocument, "El navegador bloqueo la ventana de impresion. Permite ventanas emergentes e intentalo de nuevo.");
}

function buildTicketPrintableDocument(ticketHtml, title = "") {
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(title || `Ticket ${state.sales[state.sales.length - 1]?.ticketNumber || ""}`)}</title>
      <style>
        :root {
          --text: #193040;
          --muted: #718295;
          --border: rgba(25, 48, 64, 0.18);
          --primary: #ff6a3d;
        }
        * { box-sizing: border-box; }
        html, body {
          margin: 0;
          padding: 0;
          background: #fff;
          color: var(--text);
          font-family: "Courier New", monospace;
          font-weight: 600;
        }
        body {
          display: grid;
          place-items: start center;
          padding: 8px;
        }
        .ticket-paper {
          position: relative;
          overflow: hidden;
          width: 302px;
          padding: 12px 13px;
          border: 1px dashed var(--border);
          border-radius: 14px;
          background: #fff;
          font-size: 11px;
        }
        .ticket-receipt {
          position: relative;
          display: grid;
          gap: 10px;
        }
        .ticket-watermark {
          position: absolute;
          top: 43%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-24deg);
          display: grid;
          justify-items: center;
          gap: 2px;
          pointer-events: none;
          text-align: center;
          white-space: nowrap;
        }
        .ticket-watermark strong {
          font-family: Arial, sans-serif;
          font-size: 20px;
          font-weight: 800;
          letter-spacing: .18em;
          color: rgba(25, 48, 64, .08);
        }
        .ticket-watermark span {
          font-family: Arial, sans-serif;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: .32em;
          text-transform: uppercase;
          color: rgba(255, 106, 61, .12);
        }
        .ticket-watermark.is-annulled strong {
          color: rgba(190, 38, 55, .16);
        }
        .ticket-watermark.is-annulled span {
          color: rgba(190, 38, 55, .22);
        }
        .ticket-brand {
          display: grid;
          justify-items: center;
          gap: 8px;
          text-align: center;
          padding-bottom: 8px;
          border-bottom: 1px dashed var(--border);
        }
        .ticket-brand-mark {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 56px;
          height: 56px;
          overflow: hidden;
          border-radius: 16px;
          color: #fff;
          background: linear-gradient(135deg, #132c43, var(--primary));
          font-family: sans-serif;
          font-weight: 800;
        }
        .ticket-brand-logo {
          width: 56px;
          height: 56px;
          object-fit: contain;
        }
        .ticket-brand-copy {
          display: grid;
          justify-items: center;
          gap: 2px;
        }
        .ticket-center { text-align: center; }
        .ticket-center h3, .ticket-center p { margin: 0; }
        .ticket-center h3 { font-size: 16px; font-weight: 800; line-height: 1.15; }
        .ticket-pharmacy-line { font-size: 10px; line-height: 1.3; }
        .ticket-muted { color: var(--muted); }
        .ticket-status-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-top: 6px;
          padding: 4px 10px;
          border-radius: 999px;
          font-family: Arial, sans-serif;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        .ticket-status-pill.is-active {
          color: #1f6f43;
          background: rgba(31, 111, 67, .12);
        }
        .ticket-status-pill.is-annulled {
          color: #9f1d2e;
          background: rgba(190, 38, 55, .12);
        }
        .ticket-meta-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0,1fr));
          gap: 5px;
        }
        .ticket-meta-card {
          padding: 7px 5px;
          border-radius: 9px;
          background: rgba(25,48,64,.05);
          text-align: center;
          font-family: sans-serif;
        }
        .ticket-meta-card span,
        .ticket-meta-card strong { display: block; }
        .ticket-meta-card strong { font-weight: 800; }
        .ticket-meta-card span {
          margin-bottom: 3px;
          color: var(--muted);
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: .04em;
        }
        .ticket-block,
        .ticket-totals {
          display: grid;
          gap: 5px;
          padding: 8px 0;
          border-top: 1px dashed var(--border);
          border-bottom: 1px dashed var(--border);
        }
        .ticket-section-title {
          margin-bottom: 4px;
          font-family: sans-serif;
          font-size: 10px;
          font-weight: 800;
          color: #4a6072;
          text-transform: uppercase;
          letter-spacing: .05em;
        }
        .ticket-row,
        .ticket-item-head,
        .ticket-item-meta {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: baseline;
        }
        .ticket-row strong,
        .ticket-item-head strong { font-weight: 800; }
        .ticket-row span,
        .ticket-item-meta { color: var(--muted); }
        .ticket-items {
          display: grid;
          gap: 7px;
        }
        .ticket-item {
          padding-bottom: 7px;
          border-bottom: 1px dashed rgba(25,48,64,.12);
        }
        .ticket-item:last-child {
          padding-bottom: 0;
          border-bottom: 0;
        }
        .ticket-total {
          margin-top: 4px;
          padding-top: 7px;
          border-top: 1px dashed var(--border);
          font-size: 13px;
          font-weight: 800;
        }
        .ticket-footer {
          display: grid;
          gap: 3px;
          text-align: center;
          font-weight: 700;
        }
        .ticket-footer p { margin: 0; }
        .ticket-soft-signature {
          margin-top: 4px !important;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .03em;
          text-transform: uppercase;
          color: #3e5568;
        }
        .ticket-soft-contact {
          font-size: 9px;
          color: var(--muted);
          font-weight: 700;
        }
        .ticket-qr-block {
          display: grid;
          justify-items: center;
          gap: 7px;
          padding: 8px 0 2px;
          border-top: 1px dashed var(--border);
        }
        .ticket-qr-image {
          width: 104px;
          height: 104px;
          object-fit: contain;
          padding: 6px;
          border-radius: 12px;
          background: #fff;
          border: 1px solid rgba(25,48,64,.12);
        }
        .ticket-qr-copy {
          display: grid;
          gap: 2px;
          text-align: center;
          font-family: sans-serif;
        }
        .ticket-qr-copy strong {
          font-size: 11px;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        .ticket-qr-copy span {
          color: var(--muted);
          font-size: 9px;
          line-height: 1.35;
        }
        @page {
          size: auto;
          margin: 4mm;
        }
        @media print {
          body { padding: 0; }
          .ticket-paper {
            width: auto;
            border: 0;
            border-radius: 0;
            padding: 2mm 2.5mm;
          }
        }
      </style>
    </head>
    <body>
      <div class="ticket-paper">${ticketHtml}</div>
      <script>
        window.addEventListener("load", function() {
          window.print();
          window.setTimeout(function() { window.close(); }, 300);
        });
      <\/script>
    </body>
    </html>
  `;
}

async function downloadTicketPdf(ticketHtml, filename = "ticket-farmapos.pdf", title = "") {
  if (!ticketHtml) return;

  const pdfFilename = String(filename || "ticket-farmapos.pdf").replace(/\.html?$/i, ".pdf");
  const documentHtml = buildTicketPrintableDocument(ticketHtml, title);

  if (window.farmaposDesktop?.print?.savePdf) {
    try {
      const result = await window.farmaposDesktop.print.savePdf({
        filename: pdfFilename,
        html: documentHtml
      });
      if (!result?.canceled) {
        await showInfoDialog("El ticket se guardo en PDF correctamente.", {
          title: "PDF generado",
          variant: "success"
        });
      }
      return;
    } catch (error) {
      const rawMessage = String(error?.message || error || "").trim();
      if (rawMessage.includes("No handler registered for 'print:savePdf'")) {
        printHtmlDocument(documentHtml, "El navegador bloqueo la ventana de impresion. Permite ventanas emergentes e intentalo de nuevo.");
        await showInfoDialog("La app necesita reiniciarse para activar la descarga PDF. Mientras tanto se abrio la impresion para que lo guardes como PDF.", {
          title: "Reinicia la app",
          variant: "warn"
        });
        return;
      }
      await showInfoDialog(error.message || "No fue posible generar el PDF.", {
        title: "Error al exportar",
        variant: "warn"
      });
      return;
    }
  }

  await showInfoDialog("La descarga en PDF esta disponible en la app de escritorio. En navegador puedes usar Imprimir y elegir Guardar como PDF.", {
    title: "PDF no disponible aqui",
    variant: "warn"
  });
}

function downloadTicketHtml(ticketHtml, filename = "ticket-farmapos.html") {
  if (!ticketHtml) return;
  const blob = new Blob([ticketHtml], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function openSaleTicketById(saleId) {
  const sale = state.sales.find((entry) => entry.id === saleId);
  if (!sale) return null;
  const html = buildTicketHtml(sale);
  state.lastTicketHtml = html;
  openTicket(html);
  return { sale, html };
}

function resetSaleFlow() {
  state.cart.clear();
  state.redeemedPoints = 0;
  state.selectedClientId = state.clients[0]?.id || "";

  const cashInput = document.getElementById("cashReceived");
  if (cashInput) cashInput.value = "";

  const searchInput = document.getElementById("salesSearchInput");
  if (searchInput) searchInput.value = "";

  document.querySelectorAll(".payment-btn").forEach((item) => item.classList.remove("active"));
  document.querySelector(".payment-btn")?.classList.add("active");

  renderSalesPage();
  updateChange();
}

async function finishSale() {
  if (!state.cashClosureDraft.isOpen) {
    showInfoDialog("Debes abrir caja e ingresar la base inicial antes de cobrar.", { title: "Caja cerrada", variant: "warn" });
    return;
  }

  const pricing = getCartPricing();
  const items = pricing.items;
  if (!items.length) {
    showInfoDialog("Agrega productos antes de cobrar.", { title: "Venta vacia", variant: "warn" });
    return;
  }

  const subtotal = pricing.subtotal;
  const tax = pricing.tax;
  const total = pricing.total;
  const redeemedPoints = pricing.redeemedPoints;
  const loyaltyDiscount = pricing.loyaltyDiscount;
  const paymentMethod = document.querySelector(".payment-btn.active")?.textContent?.trim() || "Efectivo";
  const cashReceived = paymentMethod === "Efectivo" ? Number(document.getElementById("cashReceived")?.value || 0) : 0;
  const change = paymentMethod === "Efectivo" ? Math.max(0, cashReceived - total) : 0;

  if (paymentMethod === "Efectivo" && cashReceived < total) {
    showInfoDialog("El valor recibido no cubre el total de la venta.", { title: "Pago insuficiente", variant: "warn" });
    return;
  }

  const client = getSelectedClient();
  const now = new Date();
  const draftSale = {
    id: crypto.randomUUID(),
    clientName: client?.name || "Cliente general",
    clientDocument: client?.document || "",
    date: now.toLocaleDateString("es-CO"),
    time: now.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
    paymentMethod,
    cashReceived,
    change,
    subtotal,
    promoDiscount: pricing.promoDiscount,
    tax,
    redeemedPoints,
    loyaltyDiscount,
    total,
    items
  };

  let savedSale;
  let inventoryUpdated = false;
  try {
    await withLoading(async () => {
      await decrementInventoryStockInApi(items);
      inventoryUpdated = true;
      savedSale = await registerSaleInApi(draftSale);
    }, {
      title: "Procesando venta",
      message: "Actualizando inventario y registrando la venta..."
    });
  } catch (error) {
    if (!inventoryUpdated) {
      showInfoDialog(`No se pudo actualizar el inventario en ${getPersistenceBackendLabel()}. ${error.message}`, { title: "Error de sincronizacion", variant: "danger" });
      return;
    }

    const fallbackSale = {
      ...draftSale,
      ticketNumber: `LOCAL-${Date.now()}`
    };
    state.sales.push(fallbackSale);
    state.lastTicketHtml = buildTicketHtml(fallbackSale);
    saveData();
    resetSaleFlow();
    renderInventory();
    openTicket(state.lastTicketHtml);
    showInfoDialog(`El stock se actualizo en ${getPersistenceBackendLabel()}, pero no se pudo registrar la venta completa. Se guardo una copia local temporal. ${error.message}`, { title: "Venta guardada localmente", variant: "warn" });
    return;
  }

  const matched = state.clients.find((entry) => entry.id === client?.id);
  const saleTotalForPoints = Number(savedSale?.total || total || 0);
  const earnedPoints = calculateLoyaltyPointsFromTotal(saleTotalForPoints);
  if (matched) {
    matched.purchases = Number(matched.purchases || 0) + 1;
    matched.totalSpent = Number(matched.totalSpent || 0) + saleTotalForPoints;
    matched.points = Math.max(0, Number(matched.points || 0) - redeemedPoints) + earnedPoints;
  }

  savedSale = {
    ...savedSale,
    promoDiscount: pricing.promoDiscount,
    redeemedPoints,
    loyaltyDiscount,
    earnedPoints
  };
  state.lastTicketHtml = buildTicketHtml(savedSale);
  saveData();
  resetSaleFlow();
  renderInventory();
  openTicket(state.lastTicketHtml);
  showAppToast(`Venta registrada por ${formatCurrency(saleTotalForPoints)}.`, {
    title: "Cobro exitoso",
    variant: "success",
    duration: 2600
  });

  if (shouldWarnCashWithdrawal()) {
    showInfoDialog(`Las ventas en efectivo superan los ${formatCurrency(CASH_WITHDRAWAL_WARNING_LIMIT)} en el turno. Se recomienda hacer un retiro o cierre de caja.`, {
      title: "Aviso de retiro",
      variant: "warn"
    });
  }
}

function getActiveSalesFilter() {
  return document.querySelector(".soft-pill.active")?.dataset.filter || "all";
}

function bindSalesEvents() {
  document.getElementById("productGrid")?.addEventListener("click", (event) => {
    const button = event.target.closest(".add-to-cart");
    if (!button) return;
    const card = button.closest(".product-card");
    if (card) addToCart(card);
  });

  document.querySelectorAll(".soft-pill").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".soft-pill").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderProductGrid(button.dataset.filter, document.getElementById("salesSearchInput")?.value || "");
    });
  });

  document.getElementById("salesSearchInput")?.addEventListener("input", (event) => {
    renderProductGrid(getActiveSalesFilter(), event.target.value || "");
  });

  document.getElementById("salesSearchInput")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    const searchTerm = String(event.target.value || "").trim();
    const matchedItem = findInventoryItemByScannerTerm(searchTerm);
    if (!matchedItem) {
      showInfoDialog("No se encontro un producto asociado a ese codigo, SKU o nombre exacto.", {
        title: "Producto no encontrado",
        variant: "warn"
      });
      return;
    }

    addInventoryItemToCartById(matchedItem.id);
    event.target.value = "";
    renderProductGrid(getActiveSalesFilter(), "");
  });

  requestAnimationFrame(() => {
    document.getElementById("salesSearchInput")?.focus();
  });

  document.getElementById("saleClient")?.addEventListener("change", (event) => {
    state.selectedClientId = event.target.value;
    const selected = getSelectedClient();
    const availablePoints = Math.max(0, Number(selected?.points || 0));
    state.redeemedPoints = Math.min(Number(state.redeemedPoints || 0), availablePoints);
    renderSalesPage();
  });

  document.getElementById("redeemPointsInput")?.addEventListener("input", (event) => {
    state.redeemedPoints = Math.max(0, Number(event.target.value || 0));
    renderCart();
  });

  document.getElementById("salesOpeningAmount")?.addEventListener("input", (event) => {
    state.cashClosureDraft = {
      ...state.cashClosureDraft,
      openingAmount: Number(event.target.value || 0)
    };
    saveCashClosureDraft();
  });

  document.getElementById("cashReceived")?.addEventListener("input", updateChange);

  document.querySelectorAll(".payment-btn").forEach((button) => {
    button.addEventListener("click", () => {
      if (!isCashDrawerOpen()) {
        showInfoDialog("Debes abrir caja antes de seleccionar un metodo de pago.", { title: "Caja cerrada", variant: "warn" });
        return;
      }
      document.querySelectorAll(".payment-btn").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
    });
  });

  document.getElementById("clearCart")?.addEventListener("click", () => {
    if (!isCashDrawerOpen()) return;
    state.cart.clear();
    renderCart();
  });

  document.getElementById("newSaleButton")?.addEventListener("click", () => {
    resetSaleFlow();
  });

  document.getElementById("openCashDrawerTrigger")?.addEventListener("click", () => {
    openCashOpeningModal();
  });

  document.getElementById("closeCashOpeningModal")?.addEventListener("click", closeCashOpeningModal);
  document.getElementById("cashOpeningOverlay")?.addEventListener("click", closeCashOpeningModal);
  document.getElementById("cancelCashOpening")?.addEventListener("click", closeCashOpeningModal);

  document.getElementById("confirmOpenCashDrawer")?.addEventListener("click", async () => {
    const openingAmount = Number(document.getElementById("salesOpeningAmount")?.value || 0);
    if (!openingAmount || openingAmount < 0) {
      showInfoDialog("Ingresa un valor inicial valido para abrir caja.", { title: "Apertura requerida", variant: "warn" });
      return;
    }

    state.cashClosureDraft = {
      ...state.cashClosureDraft,
      isOpen: true,
      openingAmount,
      openingBase: openingAmount,
      openedAt: new Date().toISOString(),
      openingNumber: state.cashClosureDraft.openingNumber || `A-${String(state.cashClosures.length + 1).padStart(4, "0")}`
    };
    saveCashClosureDraft();
    const printButton = document.getElementById("printOpeningTicketModal");
    if (printButton) {
      printButton.hidden = false;
    }
    renderSalesPage();
    closeCashOpeningModal();
    showAppToast("Caja abierta correctamente y base inicial registrada.", {
      title: "Apertura registrada",
      variant: "success"
    });
  });

  document.getElementById("printOpeningTicketModal")?.addEventListener("click", () => {
    if (!state.cashClosureDraft.isOpen) {
      showInfoDialog("Primero abre la caja para generar el comprobante de apertura.", { title: "Caja cerrada", variant: "warn" });
      return;
    }
    const opening = buildCashOpeningModel();
    openPrintableDocument(`Apertura de caja - ${opening.openingNumber}`, buildCashOpeningHtml(opening));
  });

  document.getElementById("checkoutSale")?.addEventListener("click", finishSale);
  document.getElementById("closeTicket")?.addEventListener("click", closeTicket);
  document.getElementById("ticketOverlay")?.addEventListener("click", closeTicket);
  document.getElementById("printTicket")?.addEventListener("click", printCurrentTicket);
  document.getElementById("downloadTicket")?.addEventListener("click", () => {
    if (!state.lastTicketHtml) return;
    downloadTicketPdf(state.lastTicketHtml, "ticket-farmapos.pdf");
  });

  document.getElementById("salesHistoryList")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-sale-id]");
    if (!button) return;

    if (button.classList.contains("sales-ticket-annul")) {
      annulSaleById(button.dataset.saleId);
      return;
    }

    const result = openSaleTicketById(button.dataset.saleId);
    if (!result) return;

    if (button.classList.contains("sales-ticket-view")) {
      return;
    }

    if (button.classList.contains("sales-ticket-print")) {
      printCurrentTicket();
      return;
    }

    if (button.classList.contains("sales-ticket-download")) {
      downloadTicketPdf(result.html, `${result.sale.ticketNumber}.pdf`, `Ticket ${result.sale.ticketNumber}`);
    }
  });
}

function bindSalesHistoryEvents() {
  ["salesHistorySearchInput", "salesHistoryStatusFilter", "salesHistoryPaymentFilter", "salesHistoryDateFilter"].forEach((id) => {
    const element = document.getElementById(id);
    if (!element || element.dataset.bound) return;
    element.dataset.bound = "true";
    element.addEventListener(element.tagName === "SELECT" ? "change" : "input", renderSalesHistory);
  });

  document.getElementById("closeTicket")?.addEventListener("click", closeTicket);
  document.getElementById("ticketOverlay")?.addEventListener("click", closeTicket);
  document.getElementById("printTicket")?.addEventListener("click", printCurrentTicket);
  document.getElementById("downloadTicket")?.addEventListener("click", () => {
    if (!state.lastTicketHtml) return;
    downloadTicketPdf(state.lastTicketHtml, "ticket-farmapos.pdf");
  });

  document.getElementById("salesHistoryList")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-sale-id]");
    if (!button) return;

    if (button.classList.contains("sales-ticket-annul")) {
      annulSaleById(button.dataset.saleId);
      return;
    }

    const result = openSaleTicketById(button.dataset.saleId);
    if (!result) return;

    if (button.classList.contains("sales-ticket-view")) return;
    if (button.classList.contains("sales-ticket-print")) {
      printCurrentTicket();
      return;
    }
    if (button.classList.contains("sales-ticket-download")) {
      downloadTicketPdf(result.html, `${result.sale.ticketNumber}.pdf`, `Ticket ${result.sale.ticketNumber}`);
    }
  });
}

function bindClientsEvents() {
  const clientSearchInput = document.getElementById("clientSearchInput");
  if (clientSearchInput && !clientSearchInput.dataset.bound) {
    clientSearchInput.dataset.bound = "true";
    clientSearchInput.addEventListener("input", renderClientsEnhanced);
  }

  const resetButton = document.getElementById("clientResetButton");
  if (resetButton && !resetButton.dataset.bound) {
    resetButton.dataset.bound = "true";
    resetButton.addEventListener("click", resetClientForm);
  }

  const clientForm = document.getElementById("clientForm");
  if (clientForm && clientForm.dataset.bound !== "true") {
    clientForm.dataset.bound = "true";
    clientForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const clientId = document.getElementById("clientId").value.trim();
    const name = document.getElementById("clientName").value.trim();
    const documentId = document.getElementById("clientDoc").value.trim();
    const phone = document.getElementById("clientPhone").value.trim();
    const active = document.getElementById("clientActive").value || "SI";
    if (!name || !documentId) return;

    const current = state.clients.find((entry) => entry.id === clientId);
    const nextClient = normalizeClientRecord({
      id: clientId || crypto.randomUUID(),
      name,
      document: documentId,
      phone,
      purchases: current?.purchases || 0,
      points: current?.points || 0,
      totalSpent: current?.totalSpent || 0,
      active
    });

    try {
      await saveClientRecord(nextClient);
    } catch (error) {
      showInfoDialog(error.message || "No fue posible guardar el cliente.", {
        title: "Error de base de datos",
        variant: "danger"
      });
      return;
    }

    state.selectedClientId = nextClient.active === "SI" ? nextClient.id : (state.clients.find((entry) => entry.active !== "NO")?.id || nextClient.id);
    saveData();
    renderClientsEnhanced();
      resetClientForm();
    });
  }

  const cards = document.getElementById("clientCards");
  if (cards && !cards.dataset.bound) {
    cards.dataset.bound = "true";
    cards.addEventListener("click", async (event) => {
      const actionButton = event.target.closest("button[data-id]");
      if (!actionButton) return;
      const client = state.clients.find((entry) => entry.id === actionButton.dataset.id);
      if (!client) return;

      if (actionButton.classList.contains("client-edit-btn")) {
        populateClientForm(client);
        return;
      }

      if (actionButton.classList.contains("client-toggle-btn")) {
        const nextActive = client.active === "NO" ? "SI" : "NO";
        try {
          await setClientActiveState(client.id, nextActive);
          if (state.selectedClientId === client.id && nextActive === "NO") {
            state.selectedClientId = state.clients.find((entry) => entry.active !== "NO")?.id || state.selectedClientId;
          }
          saveData();
          renderClientsEnhanced();
        } catch (error) {
          showInfoDialog(error.message || "No fue posible actualizar el estado del cliente.", { title: "Clientes", variant: "danger" });
        }
        return;
      }

      if (actionButton.classList.contains("client-delete-btn")) {
        const confirmed = await showConfirmDialog(`Se borrara el cliente ${client.name}. Esta accion no se puede deshacer.`, {
          title: "Borrar cliente",
          confirmText: "Borrar",
          cancelText: "Cancelar",
          variant: "danger"
        });
        if (!confirmed) return;
        try {
          await deleteClientRecord(client.id);
          if (state.selectedClientId === client.id) {
            state.selectedClientId = state.clients.find((entry) => entry.active !== "NO")?.id || "";
          }
          saveData();
          renderClientsEnhanced();
          resetClientForm();
        } catch (error) {
          showInfoDialog(error.message || "No fue posible borrar el cliente.", { title: "Clientes", variant: "danger" });
        }
      }
    });
  }

  const table = document.getElementById("clientsTableBody");
  if (table && !table.dataset.bound) {
    table.dataset.bound = "true";
    table.addEventListener("click", (event) => {
      const sourceButton = event.target.closest("button[data-id]");
      if (!sourceButton) return;
      const mirrorTarget = cards?.querySelector(`button[data-id="${sourceButton.dataset.id}"].${Array.from(sourceButton.classList).find((name) => name.startsWith("client-")) || ""}`);
      if (mirrorTarget) {
        mirrorTarget.click();
        return;
      }

      const client = state.clients.find((entry) => entry.id === sourceButton.dataset.id);
      if (client && sourceButton.classList.contains("client-edit-btn")) {
        populateClientForm(client);
      }
    });
  }
}

function bindSettingsEvents() {
  document.querySelectorAll("#pharmacyProfileForm input").forEach((input) => {
    input.addEventListener("input", () => {
      if (!canEditCompanyProfile()) return;
      state.settingsProfileDirty = true;
      setText("pharmacyProfileSummary", "Tienes cambios sin guardar en el perfil de empresa.");
    });
  });

  document.getElementById("settingsPrinterSelect")?.addEventListener("change", (event) => {
    const selectedValue = String(event.target?.value || "").trim();
    state.printerPreferences = normalizePrinterPreferences({
      ...state.printerPreferences,
      ticketPrinterName: selectedValue
    });
    savePrinterPreferences();
    renderPrinterSettingsPanel();
  });

  document.getElementById("refreshPrinterList")?.addEventListener("click", async () => {
    await loadAvailablePrinters(true);
    await showInfoDialog(
      state.availablePrinters.length
        ? `Se detectaron ${state.availablePrinters.length} impresora(s) disponibles.`
        : "No se detectaron impresoras en la app de escritorio.",
      {
        title: "Impresoras actualizadas",
        variant: state.availablePrinters.length ? "success" : "warn"
      }
    );
  });

  document.getElementById("pharmacyLogoFile")?.addEventListener("change", async (event) => {
    if (!canEditCompanyProfile()) {
      event.target.value = "";
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      await showInfoDialog("El logo no debe superar 2 MB.", {
        title: "Archivo muy grande",
        variant: "warn"
      });
      event.target.value = "";
      return;
    }

    try {
      const logoUrl = await readImageFileAsDataUrl(file);
      state.pharmacyProfile = normalizePharmacyProfile({
        ...state.pharmacyProfile,
        logoUrl
      });
      state.settingsProfileDirty = true;
      applyBrandLogo();
      setText("pharmacyProfileSummary", "Tienes cambios sin guardar en el perfil de empresa.");
    } catch (error) {
      await showInfoDialog(error.message || "No fue posible cargar el logo.", {
        title: "Error al cargar logo",
        variant: "danger"
      });
    }
  });

  document.getElementById("removePharmacyLogo")?.addEventListener("click", () => {
    if (!canEditCompanyProfile()) return;
    state.pharmacyProfile = normalizePharmacyProfile({
      ...state.pharmacyProfile,
      logoUrl: ""
    });
    state.settingsProfileDirty = true;
    applyBrandLogo();
    setText("pharmacyProfileSummary", "Tienes cambios sin guardar en el perfil de empresa.");
    const logoInput = document.getElementById("pharmacyLogoFile");
    if (logoInput) logoInput.value = "";
  });

  document.getElementById("pharmacyProfileForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!canEditCompanyProfile()) return;

    const profile = normalizePharmacyProfile({
      name: document.getElementById("pharmacyName")?.value,
      nit: document.getElementById("pharmacyNit")?.value,
      phone: document.getElementById("pharmacyPhone")?.value,
      email: document.getElementById("pharmacyEmail")?.value,
      address: document.getElementById("pharmacyAddress")?.value,
      city: document.getElementById("pharmacyCity")?.value,
      manager: document.getElementById("pharmacyManager")?.value,
      logoUrl: state.pharmacyProfile?.logoUrl || ""
    });

    if (!profile.name) {
      showInfoDialog("Ingresa al menos el nombre comercial de la farmacia.", {
        title: "Dato requerido",
        variant: "warn"
      });
      return;
    }

    setLoadingState(true, {
      title: "Guardando configuraciÃ³n",
      message: isDesktopDbEnabled()
        ? "Actualizando los datos de la farmacia en MySQL/MariaDB..."
        : "Actualizando los datos de la farmacia en Google Sheets..."
    });

    let dialogMessage = "";
    let dialogOptions = null;

    try {
      await savePharmacyProfileToApi(profile);
      state.settingsProfileDirty = false;
      dialogMessage = isDesktopDbEnabled()
        ? "Los datos de la farmacia quedaron guardados correctamente en MySQL/MariaDB."
        : "Los datos de la farmacia quedaron guardados en este equipo y en la hoja enlazada.";
      dialogOptions = {
        title: "ConfiguraciÃ³n guardada",
        variant: "success"
      };
    } catch (error) {
      state.pharmacyProfile = profile;
      savePharmacyProfile();
      state.settingsProfileDirty = false;
      renderSettings();
      dialogMessage = `${error.message} Los datos quedaron guardados solo en este equipo.`;
      dialogOptions = {
        title: "Guardado parcial",
        variant: "warn"
      };
    } finally {
      setLoadingState(false);
    }

    if (dialogMessage && dialogOptions) {
      await showInfoDialog(dialogMessage, dialogOptions);
    }
  });

  document.getElementById("resetPharmacyProfile")?.addEventListener("click", async () => {
    if (!canEditCompanyProfile()) return;
    const confirmed = await showConfirmDialog("Esto limpiara los datos de la farmacia guardados en este navegador.", {
      title: "Limpiar datos",
      confirmText: "Limpiar",
      cancelText: "Cancelar",
      variant: "warn"
    });
    if (!confirmed) return;

    state.pharmacyProfile = getDefaultPharmacyProfile();
    state.settingsProfileDirty = false;
    savePharmacyProfile();
    renderSettings();
    applyBrandLogo();
  });

  document.getElementById("testDianConfig")?.addEventListener("click", async () => {
    const validation = validateDianConfig({
      environment: document.getElementById("dianEnvironment")?.value,
      providerMode: document.getElementById("dianProviderMode")?.value,
      prefix: document.getElementById("dianPrefix")?.value,
      resolution: document.getElementById("dianResolution")?.value,
      softwareId: document.getElementById("dianSoftwareId")?.value,
      softwarePin: document.getElementById("dianSoftwarePin")?.value,
      certificateName: document.getElementById("dianCertificateName")?.value,
      certificatePassword: document.getElementById("dianCertificatePassword")?.value,
      apiUrl: document.getElementById("dianApiUrl")?.value,
      testSetId: document.getElementById("dianTestSetId")?.value
    });

    if (!validation.ok) {
      await showInfoDialog(validation.errors.join(" "), {
        title: "Validacion DIAN",
        variant: "warn"
      });
      return;
    }

    await showInfoDialog(
      `La configuracion de prueba quedo consistente para ${validation.config.environment === "production" ? "produccion" : "habilitacion/pruebas"}. Aun falta conectar el envio real a DIAN o a tu proveedor tecnologico.`,
      {
        title: "Validacion correcta",
        variant: "success"
      }
    );
  });

  document.getElementById("dianConfigForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const config = normalizeDianConfig({
      environment: document.getElementById("dianEnvironment")?.value,
      providerMode: document.getElementById("dianProviderMode")?.value,
      prefix: document.getElementById("dianPrefix")?.value,
      resolution: document.getElementById("dianResolution")?.value,
      softwareId: document.getElementById("dianSoftwareId")?.value,
      softwarePin: document.getElementById("dianSoftwarePin")?.value,
      certificateName: document.getElementById("dianCertificateName")?.value,
      certificatePassword: document.getElementById("dianCertificatePassword")?.value,
      apiUrl: document.getElementById("dianApiUrl")?.value,
      testSetId: document.getElementById("dianTestSetId")?.value
    });

    state.dianConfig = config;
    saveDianConfig();
    renderSettings();

    await showInfoDialog("La prueba de configuracion DIAN quedo guardada en este equipo.", {
      title: "Configuracion guardada",
      variant: "success"
    });
  });

  document.getElementById("generateDianTestInvoice")?.addEventListener("click", async () => {
    const sale = [...getActiveSales()].pop();
    if (!sale) {
      await showInfoDialog("Necesitas al menos una venta registrada para generar la factura electronica de prueba.", {
        title: "Sin ventas",
        variant: "warn"
      });
      return;
    }

    const validation = validateDianConfig({
      environment: document.getElementById("dianEnvironment")?.value,
      providerMode: document.getElementById("dianProviderMode")?.value,
      prefix: document.getElementById("dianPrefix")?.value,
      resolution: document.getElementById("dianResolution")?.value,
      softwareId: document.getElementById("dianSoftwareId")?.value,
      softwarePin: document.getElementById("dianSoftwarePin")?.value,
      certificateName: document.getElementById("dianCertificateName")?.value,
      certificatePassword: document.getElementById("dianCertificatePassword")?.value,
      apiUrl: document.getElementById("dianApiUrl")?.value,
      testSetId: document.getElementById("dianTestSetId")?.value
    });
    if (!validation.ok) {
      await showInfoDialog(validation.errors.join(" "), { title: "Validacion DIAN", variant: "warn" });
      return;
    }

    const payload = buildDianTestInvoiceFromSale(sale, validation.config);
    state.dianConfig = validation.config;
    saveDianConfig();
    state.dianTestResult = normalizeDianTestResult({
      generatedAt: payload.generatedAt,
      status: "GENERADA_LOCAL",
      saleId: sale.id,
      ticketNumber: sale.ticketNumber,
      invoiceNumber: payload.invoiceNumber,
      environment: payload.environment,
      payload
    });
    saveDianTestResult();
    renderSettings();

    await showInfoDialog(`Factura de prueba ${payload.invoiceNumber} generada con base en la venta ${sale.ticketNumber}.`, {
      title: "Prueba generada",
      variant: "success"
    });
  });

  document.getElementById("downloadDianTestJson")?.addEventListener("click", async () => {
    if (!state.dianTestResult?.payload) {
      await showInfoDialog("Primero genera una factura de prueba para poder descargar el JSON.", {
        title: "Sin documento",
        variant: "warn"
      });
      return;
    }

    downloadJsonFile(
      state.dianTestResult.payload,
      `${state.dianTestResult.invoiceNumber || "dian-test"}.json`
    );
  });

  document.getElementById("simulateDianSend")?.addEventListener("click", async () => {
    if (!state.dianTestResult?.payload) {
      await showInfoDialog("Primero genera una factura de prueba antes de simular el envio.", {
        title: "Sin documento",
        variant: "warn"
      });
      return;
    }

    const simulationId = crypto.randomUUID();
    state.dianTestResult = normalizeDianTestResult({
      ...state.dianTestResult,
      simulatedAt: new Date().toISOString(),
      status: "ENVIO_SIMULADO_OK",
      simulationId
    });
    saveDianTestResult();
    renderSettings();

    await showInfoDialog(
      `Envio simulado correctamente. Factura ${state.dianTestResult.invoiceNumber} marcada como enviada en modo ${state.dianTestResult.environment === "production" ? "produccion" : "pruebas"}. Id simulacion: ${simulationId}.`,
      {
        title: "Envio simulado",
        variant: "success"
      }
    );
  });

  document.getElementById("resetDianConfig")?.addEventListener("click", async () => {
    const confirmed = await showConfirmDialog("Esto limpiara la configuracion DIAN de prueba guardada en este equipo.", {
      title: "Limpiar configuracion DIAN",
      confirmText: "Limpiar",
      cancelText: "Cancelar",
      variant: "warn"
    });
    if (!confirmed) return;

    state.dianConfig = getDefaultDianConfig();
    saveDianConfig();
    state.dianTestResult = getDefaultDianTestResult();
    saveDianTestResult();
    renderSettings();
  });

  document.getElementById("printLastTicket")?.addEventListener("click", () => {
    if (!state.lastTicketHtml) {
      showInfoDialog("Aun no hay tickets generados.", { title: "Sin tickets", variant: "warn" });
      return;
    }
    showInfoDialog("Abre ventas para visualizar el ultimo ticket.", { title: "Ticket disponible", variant: "info" });
  });

  document.getElementById("exportData")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ inventory: state.inventory, clients: state.clients, sales: state.sales }, null, 2)], {
      type: "application/json;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "farmapos-data.json";
    link.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("resetData")?.addEventListener("click", async () => {
    const confirmed = await showConfirmDialog("Esto limpiara cache, tickets temporales, configuraciones locales y sesiones guardadas en este equipo. Los datos reales de MariaDB no se borraran. Deseas continuar?", {
      title: "Limpiar equipo",
      confirmText: "Si, borrar",
      cancelText: "Cancelar",
      variant: "danger"
    });
    if (!confirmed) return;
    Object.values(STORAGE_KEYS).forEach((key) => {
      browserStorage.removeItem(key);
      persistentStorage.removeItem(key);
    });
    persistentStorage.removeItem(WEB_DB_API_STORAGE_KEY);
    persistentStorage.removeItem(DAILY_WELCOME_STORAGE_KEY);
    persistentStorage.removeItem(SESSION_WELCOME_STORAGE_KEY);
    persistentStorage.removeItem(AUTH_DEBUG_STORAGE_KEY);
    window.location.reload();
  });

  document.getElementById("cancelUserAdminEdit")?.addEventListener("click", () => {
    resetUserAdminForm();
  });

  document.getElementById("userAdminForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isAdminSession()) return;

    const payload = normalizeUserAdminRecord({
      id: document.getElementById("userAdminId")?.value,
      companyId: document.getElementById("userAdminCompanyId")?.value,
      name: document.getElementById("userAdminName")?.value,
      username: document.getElementById("userAdminUsername")?.value,
      password: document.getElementById("userAdminPassword")?.value,
      role: document.getElementById("userAdminRole")?.value,
      active: document.getElementById("userAdminActive")?.value
    });
    payload.password = String(document.getElementById("userAdminPassword")?.value || "").trim();

    if (!payload.name || !payload.username) {
      await showInfoDialog("Debes completar nombre y usuario.", {
        title: "Datos requeridos",
        variant: "warn"
      });
      return;
    }

    try {
      await withLoading(async () => {
        await saveUserToApi(payload);
      }, {
        title: "Guardando usuario",
        message: "Actualizando usuarios en MySQL/MariaDB..."
      });

      resetUserAdminForm();
      renderUserAdminSection();
      await showInfoDialog("El usuario quedÃ³ guardado correctamente.", {
        title: "Usuario guardado",
        variant: "success"
      });
    } catch (error) {
      await showInfoDialog(error.message || "No fue posible guardar el usuario.", {
        title: "Error al guardar",
        variant: "danger"
      });
    }
  });

  document.getElementById("userAdminList")?.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-user-edit]");
    const toggleButton = event.target.closest("[data-user-toggle]");
    if (!editButton && !toggleButton) return;
    if (!isAdminSession()) return;

    if (editButton) {
      const user = state.users.find((entry) => entry.id === editButton.dataset.userEdit);
      if (user) populateUserAdminForm(user);
      return;
    }

    const user = state.users.find((entry) => entry.id === toggleButton.dataset.userToggle);
    if (!user) return;

    const nextActive = String(toggleButton.dataset.nextActive || "SI").trim().toUpperCase() === "NO" ? "NO" : "SI";
    const confirmed = await showConfirmDialog(
      `${nextActive === "SI" ? "Se habilitara" : "Se inhabilitara"} el usuario ${user.name}.`,
      {
        title: nextActive === "SI" ? "Habilitar usuario" : "Inhabilitar usuario",
        confirmText: nextActive === "SI" ? "Habilitar" : "Inhabilitar",
        cancelText: "Cancelar",
        variant: nextActive === "SI" ? "success" : "warn"
      }
    );
    if (!confirmed) return;

    try {
      await withLoading(async () => {
        await setUserActiveInApi(user.id, nextActive);
      }, {
        title: nextActive === "SI" ? "Habilitando usuario" : "Inhabilitando usuario",
        message: "Actualizando estado en MySQL/MariaDB..."
      });

      renderUserAdminSection();
      if (state.editingUserId === user.id) {
        const updated = state.users.find((entry) => entry.id === user.id);
        if (updated) populateUserAdminForm(updated);
      }
    } catch (error) {
      await showInfoDialog(error.message || "No fue posible actualizar el estado del usuario.", {
        title: "Error al actualizar",
        variant: "danger"
      });
    }
  });
}

function bindLicensingEvents() {
  refreshLicensingOverview();
  if (isAdminSession() && isDesktopDbEnabled() && !state.usersLoading && !state.usersLoaded) {
    refreshUserAdminSection();
  } else {
    renderUserAdminSection();
  }
  bindUserAdminEvents();

  document.getElementById("openLicensingPendingModal")?.addEventListener("click", openLicensingPendingModal);
  document.getElementById("closeLicensingPendingModal")?.addEventListener("click", closeLicensingPendingModal);
  document.getElementById("closeLicensingPendingModalFooter")?.addEventListener("click", closeLicensingPendingModal);
  document.getElementById("licensingPendingOverlay")?.addEventListener("click", closeLicensingPendingModal);

  document.getElementById("licensingCompanyReset")?.addEventListener("click", resetLicensingCompanyForm);
  document.getElementById("licensingLicenseReset")?.addEventListener("click", resetLicensingLicenseForm);
  document.getElementById("licensingLicensePlan")?.addEventListener("change", (event) => {
    const expiresAtInput = document.getElementById("licensingLicenseExpiresAt");
    const codeInput = document.getElementById("licensingLicenseCode");
    const companyId = String(document.getElementById("licensingLicenseCompanyId")?.value || "").trim();
    const company = state.licensingCompanies.find((entry) => entry.id === companyId);
    if (!expiresAtInput) return;
    const nextPlan = event.target?.value || "ANUAL";
    if (!state.editingLicenseId) {
      expiresAtInput.value = calculateLicenseExpiryByPlan(nextPlan, new Date());
    }
    if (codeInput && !state.editingLicenseId) {
      codeInput.value = generateRobustLicenseCodeValue(company?.name || "", nextPlan);
    }
    updateLicensingLicenseSummary(nextPlan, expiresAtInput.value, Boolean(state.editingLicenseId));
  });
  document.getElementById("licensingLicenseExpiresAt")?.addEventListener("change", (event) => {
    const currentPlan = document.getElementById("licensingLicensePlan")?.value || "ANUAL";
    updateLicensingLicenseSummary(currentPlan, event.target?.value || "", Boolean(state.editingLicenseId));
  });
  document.getElementById("licensingLicenseCompanyId")?.addEventListener("change", (event) => {
    const companyId = String(event.target?.value || "").trim();
    const company = state.licensingCompanies.find((entry) => entry.id === companyId);
    applyCompanyDataToLicenseForm(company, true);
  });

  document.getElementById("licensingCompanyForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      id: document.getElementById("licensingCompanyId")?.value,
      name: document.getElementById("licensingCompanyName")?.value,
      nit: document.getElementById("licensingCompanyNit")?.value,
      phone: document.getElementById("licensingCompanyPhone")?.value,
      email: document.getElementById("licensingCompanyEmail")?.value,
      contact: document.getElementById("licensingCompanyContact")?.value,
      status: document.getElementById("licensingCompanyStatus")?.value
    };

    try {
      await withLoading(async () => {
        await saveCompanyToApi(payload);
      }, {
        title: "Guardando empresa",
        message: "Actualizando empresas en MariaDB..."
      });
      resetLicensingCompanyForm();
      renderLicensingPage();
    } catch (error) {
      await showInfoDialog(error.message || "No fue posible guardar la empresa.", { title: "Empresas", variant: "danger" });
    }
  });

  document.getElementById("licensingLicenseForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const companyId = document.getElementById("licensingLicenseCompanyId")?.value || "";
    const company = state.licensingCompanies.find((entry) => entry.id === companyId);
    const payload = {
      id: document.getElementById("licensingLicenseId")?.value,
      companyId,
      companyName: company?.name || "",
      code: normalizeLicenseCodeValue(document.getElementById("licensingLicenseCode")?.value),
      customerName: document.getElementById("licensingLicenseCustomer")?.value,
      customerDocument: document.getElementById("licensingLicenseDocument")?.value,
      phone: document.getElementById("licensingLicensePhone")?.value,
      email: document.getElementById("licensingLicenseEmail")?.value,
      plan: document.getElementById("licensingLicensePlan")?.value,
      maxDevices: document.getElementById("licensingLicenseMaxDevices")?.value,
      expiresAt: document.getElementById("licensingLicenseExpiresAt")?.value,
      status: document.getElementById("licensingLicenseStatus")?.value,
      notes: document.getElementById("licensingLicenseNotes")?.value
    };

    try {
      await withLoading(async () => {
        await saveLicenseToApi(payload);
      }, {
        title: "Guardando licencia",
        message: "Actualizando licencias en MariaDB..."
      });
      resetLicensingLicenseForm();
      renderLicensingPage();
    } catch (error) {
      await showInfoDialog(error.message || "No fue posible guardar la licencia.", { title: "Licencias", variant: "danger" });
    }
  });

  document.getElementById("licensingCompaniesList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-company-edit]");
    if (!button) return;
    const company = state.licensingCompanies.find((entry) => entry.id === button.dataset.companyEdit);
    if (company) populateLicensingCompanyForm(company);
  });

  document.getElementById("licensingLicensesList")?.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-license-edit]");
    const bindButton = event.target.closest("[data-license-bind]");
    const renewButton = event.target.closest("[data-license-renew]");
    const statusButton = event.target.closest("[data-license-status]");

    if (editButton) {
      const license = state.licensingLicenses.find((entry) => entry.id === editButton.dataset.licenseEdit);
      if (license) populateLicensingLicenseForm(license);
      return;
    }

    if (bindButton) {
      try {
        await withLoading(async () => {
          await assignLicenseToCurrentInstallationInApi(bindButton.dataset.licenseBind);
        }, {
          title: "Aplicando licencia",
          message: "Actualizando la licencia y sincronizando los datos de la empresa en este equipo..."
        });
        await showInfoDialog("La licencia quedo aplicada en este equipo y los datos de la empresa fueron actualizados en MariaDB.", {
          title: "Equipo actualizado",
          variant: "success"
        });
      } catch (error) {
        await showInfoDialog(error.message || "No fue posible aplicar la licencia en el equipo actual.", {
          title: "Licencias",
          variant: "danger"
        });
      }
      return;
    }

    if (renewButton) {
      try {
        await withLoading(async () => {
          await renewLicenseInApi(renewButton.dataset.licenseRenew);
        }, {
          title: "Renovando licencia",
          message: "Extendiendo vigencia segun el plan comercial..."
        });
        renderLicensingPage();
      } catch (error) {
        await showInfoDialog(error.message || "No fue posible renovar la licencia.", { title: "Licencias", variant: "danger" });
      }
      return;
    }

    if (statusButton) {
      try {
        await withLoading(async () => {
          await setLicenseStatusInApi(statusButton.dataset.licenseStatus, statusButton.dataset.nextStatus);
        }, {
          title: "Actualizando licencia",
          message: "Aplicando cambio de estado..."
        });
        renderLicensingPage();
      } catch (error) {
        await showInfoDialog(error.message || "No fue posible actualizar la licencia.", { title: "Licencias", variant: "danger" });
      }
    }
  });

  document.getElementById("licensingDevicesList")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-device-release]");
    if (!button) return;

    const licenseId = String(button.getAttribute("data-device-release") || button.dataset.deviceRelease || "").trim();
    const installationId = String(button.getAttribute("data-installation-id") || button.dataset.installationId || "").trim();

    const confirmed = await showConfirmDialog(
      "Se liberara este equipo de la licencia seleccionada y podra asignarse de nuevo.",
      {
        title: "Liberar equipo",
        confirmText: "Liberar",
        cancelText: "Cancelar",
        variant: "warn"
      }
    );
    if (!confirmed) return;

    try {
      await withLoading(async () => {
        await releaseLicenseDeviceInApi(licenseId, installationId);
      }, {
        title: "Liberando equipo",
        message: "Quitando el equipo de la licencia..."
      });
      renderLicensingPage();
    } catch (error) {
      await showInfoDialog(error.message || "No fue posible liberar el equipo.", { title: "Licencias", variant: "danger" });
    }
  });
}

async function syncInventoryFromApi() {
  if (isDesktopDbEnabled()) {
    try {
      const bootstrap = await desktopDb.bootstrap(getDesktopCompanyPayload());
      applyRemoteInventoryState(Array.isArray(bootstrap?.inventory) ? bootstrap.inventory : [], new Date().toISOString());
      if (Array.isArray(bootstrap?.clients)) {
        state.clients = bootstrap.clients.map(normalizeClientRecord);
        state.selectedClientId = state.clients[0]?.id || state.selectedClientId;
        saveData();
      }
      return true;
    } catch (error) {
      state.inventorySyncMeta = {
        ...state.inventorySyncMeta,
        source: "MySQL/MariaDB",
        lastSyncAt: state.inventorySyncMeta.lastSyncAt || null,
        status: `Error de sincronizacion: ${error.message}`
      };
      saveSyncMeta(state.inventorySyncMeta);
      renderSettings();
      return false;
    }
  }

  if (!INVENTORY_API_URL) return false;

  try {
    const data = await fetchJsonWithTimeout(INVENTORY_API_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    if (!data?.ok || !Array.isArray(data.items)) {
      throw new Error("Respuesta invÃ¡lida del Apps Script");
    }

    applyRemoteInventoryState(data.items, data.updated_at || null);
    return true;
  } catch (error) {
    state.inventorySyncMeta = {
      ...state.inventorySyncMeta,
      source: INVENTORY_API_URL,
      lastSyncAt: state.inventorySyncMeta.lastSyncAt || null,
      status: `Error de sincronizaciÃ³n: ${error.message}`
    };
    saveSyncMeta(state.inventorySyncMeta);
    renderSettings();
    return false;
  }
}

function rerenderCurrentPage() {
  applyBrandLogo();
  const page = document.body.dataset.page;
  if (page === "dashboard") renderDashboard();
  if (page === "inventory") renderInventory();
  if (page === "suppliers") renderSuppliersPage();
  if (page === "purchases") renderPurchasesPage();
  if (page === "promotions") renderPromotionsPage();
  if (page === "backups") renderBackupsPage();
  if (page === "audit") renderAuditPage();
  if (page === "clients") renderClientsEnhanced();
  if (page === "reports") {
    renderReports();
    bindReportsEvents();
  }
  if (page === "cash-closure") renderCashClosurePage();
  if (page === "cash-withdrawal") renderCashWithdrawalsPage();
  if (page === "support") renderSupportPage();
  if (page === "settings") renderSettings();
  if (page === "licensing") renderLicensingPage();
  if (page === "sales") renderSalesPage();
  if (page === "sales-history") renderSalesHistory();
}

function initializePage() {
  const page = document.body.dataset.page;
  ensureFeedbackUi();
  renderSessionInfo();
  ensureReleaseNotesCenter();
  renderTopbarSystemStatus();
  applyBrandLogo();
  applyRolePermissions();
  setupMobileNav();
  setupSalesWorkspace();
  setupSalesKeyboardShortcuts();
  if (page === "dashboard") renderDashboard();
  if (page === "inventory") {
    renderInventory();
    bindInventoryEvents();
  }
  if (page === "suppliers") {
    renderSuppliersPage();
    bindSuppliersEvents();
  }
  if (page === "purchases") {
    renderPurchasesPage();
    bindPurchasesEvents();
  }
  if (page === "promotions") {
    renderPromotionsPage();
    bindPromotionsEvents();
  }
  if (page === "backups") {
    renderBackupsPage();
    bindBackupsEvents();
  }
  if (page === "audit") {
    renderAuditPage();
    bindAuditEvents();
  }
  if (page === "clients") {
    renderClientsEnhanced();
    bindClientsEvents();
  }
  if (page === "reports") {
    renderReports();
    bindReportsEvents();
  }
  if (page === "cash-closure") {
    renderCashClosurePage();
    bindCashClosureEvents();
  }
  if (page === "cash-withdrawal") {
    renderCashWithdrawalsPage();
    bindCashWithdrawalEvents();
  }
  if (page === "support") {
    renderSupportPage();
    bindSupportEvents();
  }
  if (page === "settings") {
    renderSettings();
    bindSettingsEvents();
    loadAvailablePrinters();
  }
  if (page === "licensing") {
    renderLicensingPage();
    bindLicensingEvents();
  }
  if (page === "sales") {
    renderSalesPage();
    bindSalesEvents();
  }
  if (page === "sales-history") {
    renderSalesHistory();
    bindSalesHistoryEvents();
  }
}

async function ensureLicenseAccess() {
  if (isAdminSession()) {
    return true;
  }

  if (!isDesktopDbEnabled()) {
    browserStorage.removeItem(STORAGE_KEYS.session);
    browserStorage.removeItem(STORAGE_KEYS.license);
    window.location.href = "pos.html";
    return false;
  }

  try {
    const validation = await desktopDb.validateLicense({ code: licenseState.code });
    browserStorage.setItem(STORAGE_KEYS.license, JSON.stringify({
      ...licenseState,
      code: validation.code,
      customerName: validation.customerName,
      companyName: validation.companyName,
      expiresAt: validation.expiresAt,
      validatedAt: new Date().toISOString()
    }));
    return true;
  } catch (error) {
    browserStorage.removeItem(STORAGE_KEYS.session);
    browserStorage.removeItem(STORAGE_KEYS.license);
    window.location.href = "pos.html";
    return false;
  }
}

function getCurrentWithdrawableCashAmount() {
  return Math.max(0, getCurrentCashSalesExposureAmount());
}

function getCashDrawerStatusLabel() {
  if (!state.cashClosureDraft.isOpen) return "Caja cerrada";
  const salesNet = getCurrentWithdrawableCashAmount();
  const openingAmount = Number(state.cashClosureDraft.openingBase || state.cashClosureDraft.openingAmount || 0);
  const openedAt = state.cashClosureDraft.openedAt ? formatSessionDateTime(state.cashClosureDraft.openedAt) : "--";
  return `Ventas netas ${formatCurrency(salesNet)} | Base ${formatCurrency(openingAmount)} | ${openedAt}`;
}

(async () => {
  await showStartupSplash(true);
  await loadSupportApiConfig();
  const hasValidLicense = await ensureLicenseAccess();
  if (!hasValidLicense) return;

  initializePage();
  window.setTimeout(() => {
    showStartupSplash(false);
  }, 700);
  window.setTimeout(() => {
    showDailyWelcomeNotification();
  }, 980);
  scheduleLiveSync();
  syncDesktopBootstrapState().then((synced) => {
    if (synced) return;
    syncInventoryFromApi();
    syncSalesFromApi();
    syncPharmacyProfileFromApi();
    syncCashWithdrawalsFromApi();
    syncCashClosuresFromApi();
  });
  syncAdminRealtimeState().then((synced) => {
    if (!synced) return;
    if (document.body.dataset.page === "licensing") {
      renderLicensingPage();
    }
    if (document.body.dataset.page === "settings") {
      renderSettings();
    }
  });
  syncSupportRealtimeState().then((synced) => {
    if (!synced) return;
    if (document.body.dataset.page === "support") {
      renderSupportPage();
    }
  });
})();







