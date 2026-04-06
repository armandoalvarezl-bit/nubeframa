# Apps Script Web

Este script permite usar Google Sheets como backend de la app web y crear automaticamente las hojas necesarias.

## Archivo

Usa:

- `apps-script-inventario.gs`

## Hojas que crea

- `Inventario`
- `Ventas`
- `Usuarios`
- `Retiros`
- `CierresCaja`
- `Info`
- `Empresas`
- `Licencias`
- `LicenciasEquipos`
- `LicenciasHistorial`

## Despliegue

1. Crea una hoja de calculo nueva en Google Sheets.
2. Abre `Extensiones -> Apps Script`.
3. Reemplaza el contenido del proyecto por el archivo `apps-script-inventario.gs`.
4. Guarda el proyecto.
5. Ejecuta una vez la funcion `doGet` o `setupWebApp_` para autorizar permisos.
6. Publica como aplicacion web.

## Setup inicial

Haz un `POST` al Apps Script con:

```json
{
  "action": "setup_web_app",
  "admin": {
    "name": "Administrador Web",
    "username": "adminweb",
    "password": "admin12345",
    "role": "admin"
  }
}
```

Tambien puedes revisar el estado con:

- `GET ?mode=setup`
- `GET ?mode=users`
- `GET ?mode=licensing`

## Acciones web nuevas

- `authenticate_user`
- `setup_web_app`
- `list_users`
- `save_user`
- `set_user_active`
- `licensing_overview`
- `save_company`
- `save_license`
- `validate_license_web`
- `set_license_status`
- `renew_license`
- `release_license_device`

## Nota

Este backend es para la app web con Google Sheets. No reemplaza MariaDB de la app desktop.
