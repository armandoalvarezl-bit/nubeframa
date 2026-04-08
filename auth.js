const SESSION_STORAGE_KEY = "farmapos_session";
const LICENSE_STORAGE_KEY = "farmapos_license";
const PHARMACY_PROFILE_STORAGE_KEY = "farmapos_pharmacy_profile";
const WEB_DB_API_STORAGE_KEY = "farmapos_web_db_api_url";
const AUTH_DEBUG_STORAGE_KEY = "farmapos_auth_debug";
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const desktopDb = window.farmaposDesktop?.db || null;
const browserStorage = window.sessionStorage;
const persistentStorage = window.localStorage;
const LOGIN_SCOPE = String(document.body?.dataset?.loginScope || "company").trim().toLowerCase();
const WEB_DB_API_URL = resolveWebDbApiUrl();
const DEFAULT_PUBLIC_LOGO = "assets/logo/logo-farmapos.png";
const DEFAULT_INTERNAL_LOGO = "assets/logo/logo-nubefarma-clean.png";
const MONTHLY_PROMO_STORAGE_KEY = "farmapos_monthly_promo_seen";
const MONTHLY_PROMO_SLIDES = [
  {
    src: "assets/promo/nubefarma-promo-01.png",
    alt: "Anuncio promocional NubeFarma con beneficios y oferta de lanzamiento",
    title: "NubeFarma",
    caption: "Gestion farmaceutica inteligente para ventas, inventario y facturacion."
  },
  {
    src: "assets/promo/nubefarma-promo-02.png",
    alt: "Anuncio comercial NubeFarma con plataforma en la nube y plan mensual",
    title: "FarmaPOS Cloud",
    caption: "Plataforma en la nube para operar farmacias con una experiencia simple y potente."
  }
];
let cachedAuthVersionLabel = "";
let cachedAuthRuntimeStatus = null;
let authPromoResolver = null;

function isAppsScriptWebDbUrl(url = WEB_DB_API_URL) {
  return /script\.google\.com\/macros\/s\//i.test(String(url || ""));
}

[SESSION_STORAGE_KEY, LICENSE_STORAGE_KEY].forEach((key) => {
  try {
    if (window.location.pathname.toLowerCase().endsWith("/pos.html") || window.location.pathname.toLowerCase().endsWith("pos.html")) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignoramos errores de limpieza del almacenamiento persistente.
  }
});

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

async function fetchWebDbApi(path, payload) {
  if (!isWebDbApiEnabled()) {
    throw new Error("No hay una API web configurada para MariaDB. Inicia la API en http://127.0.0.1:8787 o configura la URL en pos.html.");
  }
  try {
    const isAppsScript = isAppsScriptWebDbUrl();
    const requestUrl = isAppsScript ? WEB_DB_API_URL : `${WEB_DB_API_URL}${path}`;
    const requestBody = isAppsScript
      ? JSON.stringify(buildAppsScriptRequest(path, payload))
      : JSON.stringify(payload || {});
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": isAppsScript ? "text/plain;charset=utf-8" : "application/json"
      },
      body: requestBody
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || "No fue posible completar la conexion con MariaDB.");
    }

    return data;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`No fue posible conectarse a la API web de MariaDB en ${WEB_DB_API_URL}. Verifica que el servidor este iniciado.`);
    }
    throw error;
  }
}

async function fetchWebDbStatus() {
  if (!isWebDbApiEnabled()) {
    return { ok: false, error: "No hay una API web configurada para MariaDB." };
  }

  try {
    const response = await fetch(`${WEB_DB_API_URL}?action=status`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.ok) {
      return { ok: false, error: data?.error || "No fue posible conectarse a la API web." };
    }

    // 🔥 ESTE ES EL FIX
    return { ok: true };

  } catch {
    return {
      ok: false,
      error: `No fue posible conectarse a la API web de MariaDB en ${WEB_DB_API_URL}. Verifica que el servidor este iniciado.`
    };
  }
}

function getStoredPharmacyProfile() {
  try {
    return JSON.parse(persistentStorage.getItem(PHARMACY_PROFILE_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function buildAppsScriptRequest(path, payload = {}) {
  if (path === "/v1/licenses/validate") {
    return {
      action: "validate_license_web",
      code: String(payload.code || payload.licenseCode || "").trim()
    };
  }

  if (path === "/v1/auth/login") {
    return {
      action: "authenticate_user",
      username: String(payload.username || "").trim(),
      password: String(payload.password || "").trim(),
      code: String(payload.code || payload.licenseCode || "").trim()
    };
  }

  throw new Error(`La operacion web ${path} no esta disponible en Apps Script.`);
}

function normalizePharmacyProfile(profile) {
  return {
    name: String(profile?.name || "").trim(),
    logoUrl: String(profile?.logoUrl || profile?.logo_url || "").trim()
  };
}

function applyLogoWithFallback(imageNode, preferredSrc, fallbackSrc, altText) {
  if (!imageNode) return;
  const safePreferredSrc = String(preferredSrc || "").trim();
  const safeFallbackSrc = String(fallbackSrc || "").trim() || DEFAULT_PUBLIC_LOGO;
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

function applyAuthBrand(profile) {
  if (LOGIN_SCOPE === "internal") {
    const logo = document.querySelector(".auth-card-logo-image");
    const brandNameNode = document.getElementById("authBrandName");
    applyLogoWithFallback(logo, DEFAULT_INTERNAL_LOGO, DEFAULT_INTERNAL_LOGO, "Logo NubeFarma Interno");
    if (brandNameNode) {
      brandNameNode.textContent = "NubeFarma Interno";
    }
    return;
  }

  const normalized = normalizePharmacyProfile(profile);
  const logoSrc = normalized.logoUrl || DEFAULT_PUBLIC_LOGO;
  const brandName = normalized.name || "Farma POS";
  const logo = document.querySelector(".auth-card-logo-image");
  const brandNameNode = document.getElementById("authBrandName");

  applyLogoWithFallback(logo, logoSrc, DEFAULT_PUBLIC_LOGO, `Logo ${brandName}`);

  if (brandNameNode) {
    brandNameNode.textContent = brandName;
  }
}

async function getAuthVersionLabel() {
  if (cachedAuthVersionLabel) return cachedAuthVersionLabel;
  if (window.farmaposDesktop?.app?.version) {
    try {
      const version = String(await window.farmaposDesktop.app.version() || "").trim();
      cachedAuthVersionLabel = version ? `Version ${version}` : "Version Desktop";
      return cachedAuthVersionLabel;
    } catch {
      // Si falla la consulta, usamos el texto de respaldo.
    }
  }
  if (isWebDbApiEnabled()) {
    cachedAuthVersionLabel = "Version web + API";
    return cachedAuthVersionLabel;
  }
  cachedAuthVersionLabel = "Version web";
  return cachedAuthVersionLabel;
}

async function getAuthRuntimeStatus() {
  if (cachedAuthRuntimeStatus) return cachedAuthRuntimeStatus;
  if (!desktopDb?.status) return null;
  try {
    cachedAuthRuntimeStatus = await desktopDb.status();
    return cachedAuthRuntimeStatus;
  } catch {
    return null;
  }
}

function formatAuthRuntimeLabel(status) {
  const runtime = status?.runtime;
  if (!runtime?.backendFile) return "";
  const helper = runtime.hasNormalizeDateTimeValue ? "backend actualizado" : "backend viejo";
  const stamp = runtime.backendFileStamp
    ? new Date(runtime.backendFileStamp).toLocaleString("es-CO", {
        dateStyle: "short",
        timeStyle: "short"
      })
    : "";
  return [helper, stamp].filter(Boolean).join(" · ");
}

async function renderAuthVersion() {
  const versionLabel = await getAuthVersionLabel();
  const runtimeStatus = await getAuthRuntimeStatus();
  const runtimeLabel = formatAuthRuntimeLabel(runtimeStatus);
  const runtimeTitle = runtimeStatus?.runtime?.backendFile
    ? `Backend: ${runtimeStatus.runtime.backendFile}${runtimeStatus.runtime.executablePath ? `\nEjecutable: ${runtimeStatus.runtime.executablePath}` : ""}`
    : "";
  document.querySelectorAll("[data-app-version]").forEach((node) => {
    node.textContent = versionLabel;
    node.title = runtimeTitle;
    let runtimeNode = node.parentElement?.querySelector("[data-app-runtime]");
    if (!runtimeNode && node.parentElement) {
      runtimeNode = document.createElement("small");
      runtimeNode.className = "auth-runtime";
      runtimeNode.setAttribute("data-app-runtime", "true");
      node.insertAdjacentElement("afterend", runtimeNode);
    }
    if (runtimeNode) {
      runtimeNode.textContent = runtimeLabel || "Runtime sin diagnostico";
      runtimeNode.title = runtimeTitle;
    }
  });
}

async function syncAuthBrandFromApi() {
  if (desktopDb) {
    try {
      const profile = await desktopDb.bootstrap();
      if (profile?.profile) {
        persistentStorage.setItem(PHARMACY_PROFILE_STORAGE_KEY, JSON.stringify(profile.profile));
        applyAuthBrand(profile.profile);
        return;
      }
    } catch {
      // Si falla SQL, intentamos el flujo anterior.
    }
  }
}

function ensureAuthFeedbackUi() {
  if (document.getElementById("appFeedbackModal")) return;

  const shell = document.createElement("div");
  shell.innerHTML = `
    <div class="app-feedback-modal" id="appFeedbackModal" hidden>
      <div class="app-feedback-backdrop"></div>
      <div class="app-feedback-card" role="dialog" aria-modal="true" aria-labelledby="appFeedbackTitle">
        <div class="app-feedback-icon is-success" id="appFeedbackIcon">
          <i class="bi bi-check2-circle"></i>
        </div>
        <div class="app-feedback-copy">
          <h3 id="appFeedbackTitle">Acceso correcto</h3>
          <p id="appFeedbackMessage"></p>
        </div>
        <div class="app-feedback-actions">
          <button type="button" class="btn btn-brand" id="appFeedbackConfirm">Continuar</button>
        </div>
      </div>
    </div>
    <div class="app-loading-overlay" id="appLoadingOverlay" hidden>
      <div class="app-loading-card" role="status" aria-live="polite">
        <div class="app-loading-spinner"></div>
        <strong id="appLoadingTitle">Validando acceso</strong>
        <span id="appLoadingMessage">Consultando usuario en linea...</span>
      </div>
    </div>
    <div class="auth-promo-modal" id="authPromoModal" hidden>
      <div class="auth-promo-backdrop" data-auth-promo-close="true"></div>
      <div class="auth-promo-card" role="dialog" aria-modal="true" aria-labelledby="authPromoTitle">
        <button type="button" class="auth-promo-close" id="authPromoClose" aria-label="Cerrar anuncio">
          <i class="bi bi-x-lg"></i>
        </button>
        <div class="auth-promo-media-shell">
          <img id="authPromoImage" class="auth-promo-image" src="" alt="">
        </div>
        <div class="auth-promo-copy">
          <p class="auth-promo-kicker">Novedad del mes</p>
          <h3 id="authPromoTitle">NubeFarma</h3>
          <p id="authPromoCaption"></p>
        </div>
        <div class="auth-promo-dots" id="authPromoDots" aria-label="Slides promocionales"></div>
        <div class="auth-promo-actions">
          <button type="button" class="btn btn-outline-secondary" id="authPromoPrev">Anterior</button>
          <button type="button" class="btn btn-outline-secondary" id="authPromoNext">Siguiente</button>
          <button type="button" class="btn btn-brand" id="authPromoContinue">Continuar</button>
        </div>
      </div>
    </div>
  `;

  document.body.append(...shell.children);
  document.getElementById("appFeedbackConfirm")?.addEventListener("click", () => {
    const modal = document.getElementById("appFeedbackModal");
    if (modal) modal.hidden = true;
  });
  document.getElementById("authPromoClose")?.addEventListener("click", closeMonthlyPromo);
  document.getElementById("authPromoContinue")?.addEventListener("click", closeMonthlyPromo);
  document.getElementById("authPromoPrev")?.addEventListener("click", () => stepMonthlyPromo(-1));
  document.getElementById("authPromoNext")?.addEventListener("click", () => stepMonthlyPromo(1));
  document.querySelector('[data-auth-promo-close="true"]')?.addEventListener("click", closeMonthlyPromo);
  document.addEventListener("keydown", (event) => {
    const promo = document.getElementById("authPromoModal");
    if (!promo || promo.hidden) return;
    if (event.key === "Escape") closeMonthlyPromo();
    if (event.key === "ArrowLeft") stepMonthlyPromo(-1);
    if (event.key === "ArrowRight") stepMonthlyPromo(1);
  });
}

function getMonthlyPromoPeriodKey() {
  const currentDate = new Date();
  return `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;
}

function hasSeenMonthlyPromo() {
  try {
    return String(persistentStorage.getItem(MONTHLY_PROMO_STORAGE_KEY) || "").trim() === getMonthlyPromoPeriodKey();
  } catch {
    return false;
  }
}

function markMonthlyPromoSeen() {
  try {
    persistentStorage.setItem(MONTHLY_PROMO_STORAGE_KEY, getMonthlyPromoPeriodKey());
  } catch {
    // Ignoramos errores del almacenamiento local.
  }
}

function renderMonthlyPromoSlide(index = 0) {
  const promo = document.getElementById("authPromoModal");
  if (!promo) return;
  const totalSlides = MONTHLY_PROMO_SLIDES.length;
  if (!totalSlides) return;

  const normalizedIndex = ((Number(index) || 0) % totalSlides + totalSlides) % totalSlides;
  promo.dataset.slideIndex = String(normalizedIndex);
  const slide = MONTHLY_PROMO_SLIDES[normalizedIndex];

  const image = document.getElementById("authPromoImage");
  const title = document.getElementById("authPromoTitle");
  const caption = document.getElementById("authPromoCaption");
  const dots = document.getElementById("authPromoDots");
  const prevButton = document.getElementById("authPromoPrev");
  const nextButton = document.getElementById("authPromoNext");

  if (image) {
    image.src = slide.src;
    image.alt = slide.alt;
  }
  if (title) title.textContent = slide.title;
  if (caption) caption.textContent = slide.caption;
  if (dots) {
    dots.innerHTML = MONTHLY_PROMO_SLIDES.map((item, itemIndex) => `
      <button
        type="button"
        class="auth-promo-dot ${itemIndex === normalizedIndex ? "is-active" : ""}"
        data-auth-promo-index="${itemIndex}"
        aria-label="Ver anuncio ${itemIndex + 1}"
      ></button>
    `).join("");
    dots.querySelectorAll("[data-auth-promo-index]").forEach((button) => {
      button.addEventListener("click", () => {
        renderMonthlyPromoSlide(Number(button.dataset.authPromoIndex || 0));
      });
    });
  }
  if (prevButton) prevButton.disabled = totalSlides <= 1;
  if (nextButton) nextButton.disabled = totalSlides <= 1;
}

function stepMonthlyPromo(direction = 1) {
  const promo = document.getElementById("authPromoModal");
  if (!promo || promo.hidden) return;
  const currentIndex = Number(promo.dataset.slideIndex || 0);
  renderMonthlyPromoSlide(currentIndex + Number(direction || 0));
}

function closeMonthlyPromo() {
  const promo = document.getElementById("authPromoModal");
  if (!promo || promo.hidden) return;
  markMonthlyPromoSeen();
  promo.hidden = true;
  if (authPromoResolver) {
    const resolve = authPromoResolver;
    authPromoResolver = null;
    resolve();
  }
}

async function showMonthlyPromoIfNeeded() {
  ensureAuthFeedbackUi();
  const promo = document.getElementById("authPromoModal");
  if (!promo || hasSeenMonthlyPromo() || !MONTHLY_PROMO_SLIDES.length) {
    return;
  }

  renderMonthlyPromoSlide(0);
  promo.hidden = false;

  await new Promise((resolve) => {
    authPromoResolver = resolve;
  });
}

function getStoredSession() {
  try {
    return JSON.parse(browserStorage.getItem(SESSION_STORAGE_KEY) || persistentStorage.getItem(SESSION_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function saveAuthDebug(event, payload = {}) {
  try {
    persistentStorage.setItem(AUTH_DEBUG_STORAGE_KEY, JSON.stringify({
      event,
      payload,
      at: new Date().toISOString()
    }));
  } catch {
    // Ignoramos errores de depuracion.
  }
}

function getStoredLicense() {
  try {
    return JSON.parse(browserStorage.getItem(LICENSE_STORAGE_KEY) || persistentStorage.getItem(LICENSE_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function getNormalizedRole(value, options = {}) {
  const role = String(value || "").trim().toLowerCase();
  const username = String(options.username || "").trim().toLowerCase();
  const companyId = String(options.companyId || "").trim();
  const licenseCode = String(options.licenseCode || "").trim();
  const loginScope = String(options.loginScope || LOGIN_SCOPE || "").trim().toLowerCase();
  const hasCompanyContext = Boolean(companyId || licenseCode);
  const isGlobalAdminUser = ["admin", "administrador", "operador"].includes(username);

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
    if (loginScope !== "internal" && hasCompanyContext && !isGlobalAdminUser) {
      return "admin_empresa";
    }
    return "admin";
  }
  if (role.includes("super")) return "supervisor";
  if (role.includes("caj") || role.includes("cash") || role.includes("user")) return "cajero";
  return "cajero";
}

function isSessionExpired(session) {
  const loginAt = String(session?.loginAt || "").trim();
  if (!loginAt) return true;
  const sessionDate = new Date(loginAt);
  if (Number.isNaN(sessionDate.getTime())) return true;
  return Date.now() - sessionDate.getTime() > SESSION_MAX_AGE_MS;
}

function saveLicense(license) {
  const payload = JSON.stringify({
    code: String(license.code || "").trim(),
    companyId: String(license.companyId || license.licenseCompanyId || "").trim(),
    customerName: String(license.customerName || "").trim(),
    companyName: String(license.companyName || "").trim(),
    plan: String(license.plan || "ANUAL").trim(),
    installationId: String(license.installationId || "").trim(),
    installationName: String(license.installationName || "").trim(),
    expiresAt: String(license.expiresAt || "").trim(),
    validatedAt: new Date().toISOString()
  });
  browserStorage.setItem(LICENSE_STORAGE_KEY, payload);
  persistentStorage.setItem(LICENSE_STORAGE_KEY, payload);
  saveAuthDebug("license_saved", JSON.parse(payload));
}

function getFallbackLicense(user, licenseCode = "") {
  const resolvedCode = String(user?.licenseCode || user?.license?.code || licenseCode || "").trim();
  if (!resolvedCode) return null;

  return {
    code: resolvedCode,
    companyId: String(user?.license?.companyId || user?.licenseCompanyId || user?.companyId || "").trim(),
    customerName: String(user?.license?.customerName || "").trim(),
    companyName: String(user?.license?.companyName || "").trim(),
    plan: String(user?.license?.plan || "ANUAL").trim(),
    installationId: String(user?.license?.installationId || "").trim(),
    installationName: String(user?.license?.installationName || "").trim(),
    expiresAt: String(user?.license?.expiresAt || "").trim()
  };
}

function clearStoredAccess() {
  browserStorage.removeItem(SESSION_STORAGE_KEY);
  browserStorage.removeItem(LICENSE_STORAGE_KEY);
  persistentStorage.removeItem(SESSION_STORAGE_KEY);
  persistentStorage.removeItem(LICENSE_STORAGE_KEY);
  saveAuthDebug("access_cleared");
}

function resetLoginForm(options = {}) {
  const clearLicense = Boolean(options.clearLicense);
  const licenseInput = document.getElementById("loginLicense");
  const usernameInput = document.getElementById("loginUsername");
  const passwordInput = document.getElementById("loginPassword");

  if (clearLicense && licenseInput) {
    licenseInput.value = "";
  }
  if (usernameInput) {
    usernameInput.value = "";
  }
  if (passwordInput) {
    passwordInput.value = "";
    passwordInput.type = "password";
  }

  const togglePassword = document.getElementById("togglePassword");
  if (togglePassword) {
    togglePassword.innerHTML = '<i class="bi bi-eye"></i>';
  }

  const focusTarget = clearLicense && licenseInput ? licenseInput : usernameInput;
  focusTarget?.focus();
}

function renderAssignedLicenseState(license) {
  const field = document.getElementById("loginLicenseField");
  const input = document.getElementById("loginLicense");
  const hint = document.getElementById("loginLicenseHint");
  if (!field || !input || !hint) return;

  if (LOGIN_SCOPE === "internal") {
    field.hidden = true;
    input.value = "";
    hint.textContent = "Usa aqui solo usuarios internos globales del equipo FarmaPOS.";
    return;
  }

  if (license?.code) {
    field.hidden = true;
    input.value = String(license.code || "").trim();
    hint.textContent = `Equipo activado para ${String(license.companyName || "la empresa").trim()}. Solo debes ingresar usuario y contrasena.`;
    return;
  }

  field.hidden = Boolean(desktopDb);
  hint.textContent = desktopDb
    ? "Este equipo aun no tiene una licencia asignada. Debe activarlo un operador desde el panel de licencias."
    : "Acceso seguro con licencia activa y usuario autorizado.";
}

async function validateLicenseWithApi(code) {
  if (!desktopDb && !isWebDbApiEnabled()) {
    throw new Error("La validacion de licencias requiere la app desktop o una API web conectada a MariaDB.");
  }

  if (desktopDb) {
    try {
      return await desktopDb.validateLicense({ code });
    } catch (error) {
      throw new Error(String(error?.message || error || "").replace(/^Error invoking remote method '[^']+': Error:\s*/i, "").trim());
    }
  }

  try {
    const data = await fetchWebDbApi("/v1/licenses/validate", { code });
    return data.license || null;
  } catch (error) {
    throw new Error(String(error?.message || error || "").trim());
  }
}

async function authenticateWithApi(username, password, code = "") {
  if (!desktopDb && !isWebDbApiEnabled()) {
    throw new Error("Este acceso requiere la app desktop o una API web conectada a MariaDB.");
  }

  if (desktopDb) {
    let user;
    try {
      user = await desktopDb.authenticate({ username, password, code, loginScope: LOGIN_SCOPE });
    } catch (error) {
      throw new Error(String(error?.message || error || "").replace(/^Error invoking remote method '[^']+': Error:\s*/i, "").trim());
    }

    return {
      id: String(user.id || "").trim(),
      companyId: String(user.companyId || "").trim(),
      username: String(user.username || username).trim(),
      name: String(user.name || username).trim(),
      role: getNormalizedRole(user.role || "user", {
        companyId: user.companyId
      }),
      licenseCode: String(user.licenseCode || user.license?.code || code || "").trim(),
      licenseCompanyId: String(user.licenseCompanyId || "").trim(),
      license: user.license || null
    };
  }

  let user;
  try {
    const data = await fetchWebDbApi("/v1/auth/login", { username, password, code });
    user = data.user || {};
  } catch (error) {
    throw new Error(String(error?.message || error || "").trim());
  }

  return {
    id: String(user.id || "").trim(),
    companyId: String(user.companyId || "").trim(),
    username: String(user.username || username).trim(),
    name: String(user.name || username).trim(),
    role: getNormalizedRole(user.role || "user", {
      username: String(user.username || username).trim(),
      companyId: String(user.companyId || "").trim(),
      licenseCode: String(user.license?.code || code || "").trim(),
      loginScope: LOGIN_SCOPE
    }),
    licenseCode: String(user.licenseCode || user.license?.code || code || "").trim(),
    licenseCompanyId: String(user.licenseCompanyId || "").trim(),
    license: user.license || null
  };
}

function saveSession(user) {
  const payload = JSON.stringify({
    user: user.name,
    userId: user.id,
    companyId: user.companyId || "",
    username: user.username,
    role: user.role,
    loginAt: new Date().toISOString()
  });
  browserStorage.setItem(SESSION_STORAGE_KEY, payload);
  persistentStorage.setItem(SESSION_STORAGE_KEY, payload);
  saveAuthDebug("session_saved", JSON.parse(payload));
}

function showLoginError(message) {
  const errorBox = document.getElementById("loginError");
  if (!errorBox) return;
  errorBox.hidden = !message;
  errorBox.textContent = message || "";
}

function renderLastAuthDebug() {
  const errorBox = document.getElementById("loginError");
  if (!errorBox) return;
  try {
    const debug = JSON.parse(persistentStorage.getItem(AUTH_DEBUG_STORAGE_KEY) || "null");
    if (!debug?.event) return;
    if (!String(debug.event).startsWith("dashboard_redirect_")) return;
    errorBox.hidden = false;
    errorBox.textContent = `Debug: ${debug.event}`;
  } catch {
    // Ignoramos errores de depuracion.
  }
}

async function showLoginDialog(title, message, variant = "danger") {
  ensureAuthFeedbackUi();
  const modal = document.getElementById("appFeedbackModal");
  const titleNode = document.getElementById("appFeedbackTitle");
  const messageNode = document.getElementById("appFeedbackMessage");
  const iconNode = document.getElementById("appFeedbackIcon");
  if (!modal || !titleNode || !messageNode || !iconNode) return;

  titleNode.textContent = title || "Acceso";
  messageNode.textContent = message || "";
  iconNode.className = `app-feedback-icon is-${variant}`;
  iconNode.innerHTML = `<i class="bi bi-${variant === "warn" ? "exclamation-triangle" : "shield-exclamation"}"></i>`;
  modal.hidden = false;
}

function getFriendlyLoginError(error) {
  const rawMessage = String(error?.message || "").trim();

  if (rawMessage.includes("Debes ingresar un codigo de licencia")) {
    return {
      title: "Licencia requerida",
      message: "Sistema no reconoce una empresa con licencia activa. Ingresa el codigo de licencia asignado a la empresa.",
      variant: "warn"
    };
  }

  if (rawMessage.includes("La licencia indicada no existe")) {
    return {
      title: "Licencia no reconocida",
      message: "Sistema no reconoce una empresa asociada a esa licencia. Verifica el codigo o contacta al operador.",
      variant: "danger"
    };
  }

  if (rawMessage.includes("no se encuentra activa")) {
    return {
      title: "Licencia no activada",
      message: "La empresa existe, pero su licencia aun no esta activada para operar en este equipo.",
      variant: "warn"
    };
  }

  if (rawMessage.includes("ya se encuentra vencida")) {
    return {
      title: "Licencia vencida",
      message: "La licencia de esta empresa ya vencio. Debes renovarla para continuar usando el sistema.",
      variant: "danger"
    };
  }

  if (rawMessage.includes("ya esta asignada a otro equipo")) {
    return {
      title: "Equipo no autorizado",
      message: "Esta licencia ya fue vinculada a otro equipo. Si necesitas moverla, debes liberarla desde el panel de licencias.",
      variant: "danger"
    };
  }

  if (rawMessage.includes("alcanzo el limite")) {
    return {
      title: "Limite de equipos alcanzado",
      message: "La licencia ya uso todos los equipos permitidos. Libera uno desde el panel comercial o amplia la licencia.",
      variant: "danger"
    };
  }

  if (rawMessage.includes("no tiene una empresa asignada")) {
    return {
      title: "Usuario sin empresa",
      message: "Este usuario aun no esta asociado a una empresa. Debes asignarlo desde el panel de administracion.",
      variant: "danger"
    };
  }

  if (rawMessage.includes("no pertenece a la empresa asociada")) {
    return {
      title: "Usuario no autorizado",
      message: "El usuario ingresado no pertenece a la empresa de la licencia suministrada.",
      variant: "danger"
    };
  }

  if (rawMessage.includes("esta asignado a otra empresa")) {
    return {
      title: "Equipo asignado a otra empresa",
      message: "Este equipo esta vinculado a otra empresa. Debes ingresar con el usuario correcto o reasignar la licencia desde el panel comercial.",
      variant: "danger"
    };
  }

  return {
    title: "Acceso no permitido",
    message: rawMessage || "No fue posible validar el acceso.",
    variant: "danger"
  };
}

function setAuthLoadingState(active, title = "Validando acceso", message = "Consultando usuario en linea...") {
  ensureAuthFeedbackUi();
  const overlay = document.getElementById("appLoadingOverlay");
  const titleNode = document.getElementById("appLoadingTitle");
  const messageNode = document.getElementById("appLoadingMessage");
  if (!overlay || !titleNode || !messageNode) return;

  titleNode.textContent = title;
  messageNode.textContent = message;
  overlay.hidden = !active;
}

async function showLoginSuccess(user) {
  ensureAuthFeedbackUi();
  const modal = document.getElementById("appFeedbackModal");
  const titleNode = document.getElementById("appFeedbackTitle");
  const messageNode = document.getElementById("appFeedbackMessage");
  const iconNode = document.getElementById("appFeedbackIcon");
  if (!modal || !titleNode || !messageNode || !iconNode) return;

  titleNode.textContent = "Inicio exitoso";
  messageNode.textContent = `Bienvenido, ${user.name}. Estamos preparando tu dashboard.`;
  iconNode.className = "app-feedback-icon is-success";
  iconNode.innerHTML = '<i class="bi bi-check2-circle"></i>';
  modal.hidden = false;

  await new Promise((resolve) => window.setTimeout(resolve, 900));
  modal.hidden = true;
}

function redirectToDashboard() {
  const dashboardUrl = new URL("dashboard.html", window.location.href).toString();
  saveAuthDebug("redirect_dashboard", {
    dashboardUrl,
    sessionStorageSession: browserStorage.getItem(SESSION_STORAGE_KEY),
    localStorageSession: persistentStorage.getItem(SESSION_STORAGE_KEY),
    sessionStorageLicense: browserStorage.getItem(LICENSE_STORAGE_KEY),
    localStorageLicense: persistentStorage.getItem(LICENSE_STORAGE_KEY)
  });
  try {
    window.location.replace(dashboardUrl);
  } catch {
    window.location.href = dashboardUrl;
  }
}

function setSubmitting(isSubmitting) {
  const submitButton = document.querySelector('#loginForm button[type="submit"]');
  if (!submitButton) return;
  submitButton.disabled = isSubmitting;
  submitButton.textContent = isSubmitting ? "Validando..." : "Entrar al sistema";
}

async function setupLoginPage() {
  ensureAuthFeedbackUi();
  renderLastAuthDebug();
  applyAuthBrand(getStoredPharmacyProfile());
  syncAuthBrandFromApi();
  renderAuthVersion();
  let existingSession = getStoredSession();
  let existingLicense = getStoredLicense();

  if (existingSession && isSessionExpired(existingSession)) {
    clearStoredAccess();
    existingSession = null;
  }

  const form = document.getElementById("loginForm");
  const licenseInput = document.getElementById("loginLicense");
  const passwordInput = document.getElementById("loginPassword");
  const togglePassword = document.getElementById("togglePassword");
  let assignedLicense = null;

  if (LOGIN_SCOPE !== "internal" && desktopDb?.assignedLicense) {
    desktopDb.assignedLicense()
      .then((license) => {
        assignedLicense = license || null;
        if (assignedLicense?.code) {
          saveLicense(assignedLicense);
          existingLicense = assignedLicense;
        }
        renderAssignedLicenseState(assignedLicense);
        if (licenseInput && existingLicense?.code) {
          licenseInput.value = existingLicense.code;
        }
      })
      .catch(() => {
        renderAssignedLicenseState(null);
      });
  } else {
    renderAssignedLicenseState(null);
  }

  if (LOGIN_SCOPE !== "internal" && licenseInput && existingLicense?.code) {
    licenseInput.value = existingLicense.code;
  }

  await showMonthlyPromoIfNeeded();

  const existingRole = getNormalizedRole(existingSession?.role);
  if (existingSession?.user && ["admin", "operador"].includes(existingRole)) {
    if (LOGIN_SCOPE === "internal") {
      redirectToDashboard();
      return;
    }
    clearStoredAccess();
    existingSession = null;
    existingLicense = null;
  }

  if (LOGIN_SCOPE !== "internal" && existingSession?.user && existingLicense?.code && (desktopDb || isWebDbApiEnabled())) {
    setAuthLoadingState(true, "Validando licencia", "Comprobando licencia activa en MariaDB...");
    validateLicenseWithApi(existingLicense.code)
      .then(() => {
        redirectToDashboard();
      })
      .catch(() => {
        clearStoredAccess();
      })
      .finally(() => {
        setAuthLoadingState(false);
      });
  }

  togglePassword?.addEventListener("click", () => {
    if (!passwordInput) return;
    const isPassword = passwordInput.type === "password";
    passwordInput.type = isPassword ? "text" : "password";
    togglePassword.innerHTML = `<i class="bi bi-${isPassword ? "eye-slash" : "eye"}"></i>`;
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    showLoginError("");
    setSubmitting(true);
    setAuthLoadingState(true);

    const licenseCode = LOGIN_SCOPE === "internal"
      ? ""
      : (assignedLicense?.code || document.getElementById("loginLicense")?.value || "");
    const username = document.getElementById("loginUsername")?.value || "";
    const password = passwordInput?.value || "";

    try {
      if (desktopDb) {
        const status = await desktopDb.status();
        if (!status?.ok) {
          throw new Error(status?.error || "No fue posible conectarse a MySQL/MariaDB.")
        }
      } else if (isWebDbApiEnabled()) {
        const status = await fetchWebDbStatus();
        if (!status?.ok) {
          throw new Error(status?.error || "No fue posible conectarse a MySQL/MariaDB.");
        }
      }

      const user = await authenticateWithApi(username, password, licenseCode);
      if (LOGIN_SCOPE === "internal" && !["admin", "operador"].includes(getNormalizedRole(user.role))) {
        throw new Error("Este acceso interno solo permite usuarios globales del equipo FarmaPOS.");
      }
      if (LOGIN_SCOPE !== "internal" && ["admin", "operador"].includes(getNormalizedRole(user.role))) {
        throw new Error("Los usuarios globales del equipo FarmaPOS solo pueden ingresar desde el acceso interno.");
      }
      if (!["admin", "operador"].includes(getNormalizedRole(user.role))) {
        const license = user.license
          || assignedLicense
          || (licenseCode ? await validateLicenseWithApi(licenseCode) : null)
          || getFallbackLicense(user, licenseCode);
        if (!license) {
          throw new Error("Este equipo no tiene una licencia asignada para operar.");
        }
        saveLicense(license);
      } else {
        browserStorage.removeItem(LICENSE_STORAGE_KEY);
      }
      saveSession(user);
      setAuthLoadingState(false);
      redirectToDashboard();
      return;
    } catch (error) {
      const friendlyError = getFriendlyLoginError(error);
      const shouldClearLicense = friendlyError.title !== "Licencia no activada" && friendlyError.title !== "Licencia vencida";
      resetLoginForm({ clearLicense: shouldClearLicense });
      showLoginError("");
      await showLoginDialog(friendlyError.title, friendlyError.message, friendlyError.variant);
    } finally {
      setAuthLoadingState(false);
      setSubmitting(false);
    }
  });
}

setupLoginPage();
