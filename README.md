
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="farmapos-web-db-api-url" content="https://script.google.com/macros/s/AKfycbzHUL3P2stEDpjjbUh3pr4wGO6_KNAPv18KLz3Y8DiGuscV06esTduDmEhpe63yUqWS/exec">
  <title>FarmaPOS Desktop | Ingreso</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700;800&display=swap" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
  <link rel="stylesheet" href="pos.css">
</head>
<body class="auth-body" data-login-scope="main">
  <main class="auth-shell">
    <section class="auth-stage">
      <div class="auth-hero auth-hero-phone">
        <div class="auth-phone-topbar">
          <span class="auth-phone-search-icon"></span>
        </div>
        <div class="auth-phone-awning">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div class="auth-phone-body">
          <div class="auth-phone-bag">
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
      <div class="auth-hero auth-hero-card">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div class="auth-hero auth-hero-ticket">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div class="auth-hero auth-hero-tag">
        <span>%</span>
      </div>
      <div class="auth-hero auth-hero-cart">
        <div class="auth-cart-basket">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div class="auth-cart-handle"></div>
        <div class="auth-cart-wheel auth-cart-wheel-a"></div>
        <div class="auth-cart-wheel auth-cart-wheel-b"></div>
      </div>
      <div class="auth-hero auth-hero-coins">
        <span class="auth-coin auth-coin-main">$</span>
        <span class="auth-coin auth-coin-stack auth-coin-stack-a"></span>
        <span class="auth-coin auth-coin-stack auth-coin-stack-b"></span>
      </div>
    </section>

    <section class="auth-card">
      <div class="auth-card-frame">
        <div class="auth-card-logo">
          <img class="auth-card-logo-image" src="assets/logo-nubefarma-clean.png" alt="Logo Farma POS">
        </div>

        <div class="auth-card-intro">
          <p class="section-kicker auth-kicker-center">Sistema de facturacion</p>
          <p class="auth-welcome-line"><strong>Bienvenido</strong> Por favor inicia con tu cuenta de usuario.</p>
        </div>

        <div class="auth-info-panel auth-info-panel-compact">
          <strong>Todo en un solo lugar</strong>
          <ul class="auth-info-list">
            <li>Ventas, inventario y reportes en una sola vista.</li>
            <li>Acceso seguro con validacion de usuarios en linea.</li>
          </ul>
        </div>

        <div class="auth-card-top">
          <div class="brand-box auth-brand">
            <div><strong id="authBrandName">Farma POS</strong><span>Acceso principal</span></div>
          </div>
          <div class="auth-card-chip">
            <i class="bi bi-shield-check"></i>
            <span>Validacion segura</span>
          </div>
        </div>

        <div class="auth-head">
          <h2>Iniciar sesion</h2>
          <p>Ingresa con tu usuario autorizado para entrar al dashboard principal.</p>
        </div>

        <div class="auth-access-switch">
          <a class="auth-access-link" href="login-interno.html">
            <i class="bi bi-person-badge"></i>
            <span>Acceso interno FarmaPOS</span>
          </a>
        </div>

        <form id="loginForm" class="form-stack auth-form">
          <div class="auth-form-caption">
            <span></span>
            <small>Ingreso protegido</small>
          </div>
          <div class="auth-form-panel">
            <div class="auth-form-panel-head">
              <strong>Credenciales</strong>
              <span>Validacion de licencia y usuarios contra MariaDB</span>
            </div>

            <div class="auth-form-fields">
              <div class="form-field" id="loginLicenseField">
                <label for="loginLicense">Licencia</label>
                <input id="loginLicense" class="form-control" type="text" autocomplete="off" placeholder="Codigo de licencia activa">
              </div>
              <div class="form-field">
                <label for="loginUsername">Usuario</label>
                <input id="loginUsername" class="form-control" type="text" autocomplete="username" placeholder="Usuario" required>
              </div>
              <div class="form-field">
                <label for="loginPassword">Contrasena</label>
                <div class="auth-password-wrap">
                  <input id="loginPassword" class="form-control" type="password" autocomplete="current-password" placeholder="Ingresa tu clave" required>
                  <button class="icon-action auth-password-toggle" id="togglePassword" type="button" aria-label="Mostrar contrasena">
                    <i class="bi bi-eye"></i>
                  </button>
                </div>
              </div>
            </div>

            <div class="auth-form-bottom">
              <div class="auth-form-hint">
                <i class="bi bi-shield-check"></i>
                <span id="loginLicenseHint">Acceso seguro con licencia activa y usuario autorizado.</span>
              </div>
              <button class="btn btn-brand w-100 auth-submit" type="submit">Entrar al sistema</button>
            </div>
          </div>
        </form>
        <div class="auth-error" id="loginError" hidden></div>
        <div class="auth-version" data-app-version>Version Desktop</div>
      </div>
    </section>
  </main>

  <script src="auth.js"></script>
</body>
</html>
