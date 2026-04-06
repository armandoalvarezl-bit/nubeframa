<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Farma POS | Ingreso</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700;800&display=swap" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
  <link rel="stylesheet" href="pos.css">
</head>
<body class="auth-body">
  <main class="auth-shell">
    <section class="auth-stage">
      <div class="auth-device auth-device-a">
        <div class="auth-device-screen">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
      <div class="auth-device auth-device-b">
        <div class="auth-device-screen auth-device-screen-bars">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
      <div class="auth-device auth-device-c">
        <div class="auth-device-screen">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
      <div class="auth-device auth-device-d">
        <div class="auth-device-screen auth-device-screen-panels">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </section>

    <section class="auth-card">
      <div class="auth-card-frame">
        <div class="auth-card-logo">
          <img class="auth-card-logo-image" src="assets/logo/logo-farmapos.png" alt="Logo Farma POS">
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
            <div><strong>Farma POS</strong><span>Acceso principal</span></div>
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

        <form id="loginForm" class="form-stack auth-form">
          <div class="auth-form-caption">
            <span></span>
            <small>Ingreso protegido</small>
          </div>
          <div class="auth-form-panel">
            <div class="auth-form-panel-head">
              <strong>Credenciales</strong>
              <span>Validacion remota contra la hoja de usuarios</span>
            </div>

            <div class="auth-form-fields">
              <div class="form-field">
                <label for="loginUsername">Usuario</label>
                <input id="loginUsername" class="form-control" type="text" autocomplete="username" placeholder="Ej. admin-2024" required>
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
                <span>Acceso seguro con validacion remota.</span>
              </div>
              <button class="btn btn-brand w-100 auth-submit" type="submit">Entrar al sistema</button>
            </div>
          </div>
        </form>
        <div class="auth-error" id="loginError" hidden></div>
      </div>
    </section>
  </main>

  <script src="auth.js"></script>
</body>
</html>
