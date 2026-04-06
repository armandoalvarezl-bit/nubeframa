# FarmaPOS Desktop

## Requisitos

- Node.js 20 o superior

## Instalar dependencias

```bash
npm install
```

## Ejecutar en modo escritorio

```bash
npm start
```

## Generar instalador para Windows

```bash
npm run dist
```

El instalador se genera dentro de la carpeta `dist/`.

## Notas

- La aplicacion conserva la funcionalidad web actual.
- Sigue consumiendo el Apps Script online configurado en `farmapos-data.js`.
- Si cambias la URL del Apps Script, la app de escritorio usara la nueva sin reescribir la logica.
