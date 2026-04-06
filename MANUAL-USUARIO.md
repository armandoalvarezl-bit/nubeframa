# Manual de Usuario y Uso de la Plataforma Farma POS

## 1. Objetivo del sistema

Farma POS es una plataforma para la operacion diaria de farmacias o puntos de venta similares. Permite:

- Iniciar sesion con usuarios validados en linea.
- Registrar ventas y emitir tickets.
- Controlar inventario y sincronizarlo con Google Sheets.
- Gestionar clientes y puntos.
- Registrar retiros de caja.
- Realizar cierres de caja.
- Consultar historico de ventas.
- Generar reportes imprimibles.
- Personalizar los datos de la farmacia.

El sistema funciona en interfaz web y tambien en version de escritorio con Electron.

## Documentos de apoyo interno

Para el equipo comercial y tecnico tambien estan disponibles:

- `PLAN-COMERCIAL.md`
- `CHECKLIST-LANZAMIENTO.md`

## 2. Estructura general de la plataforma

Las pantallas principales del sistema son:

- `pos.html`: ingreso al sistema.
- `dashboard.html`: panel general.
- `ventas.html`: punto de venta.
- `historico-ventas.html`: consulta y anulacion de tickets.
- `retiros-caja.html`: retiros de caja con autorizacion.
- `cierre-caja.html`: cierre diario o por turno.
- `inventario.html`: administracion de productos.
- `clientes.html`: registro y consulta de clientes.
- `reportes.html`: reportes de gestion.
- `configuracion.html`: datos de la farmacia, logo y utilidades.
- `soporte.html`: canales de ayuda.

## 3. Requisitos de uso

Para operar correctamente la plataforma se recomienda:

- Tener conexion a internet para validar usuarios y sincronizar informacion.
- Tener configurado Google Sheets + Apps Script cuando se usen inventario, ventas, retiros, cierres o perfil remoto.
- Usar un navegador moderno o la app de escritorio.

Para modo escritorio:

- Node.js 20 o superior.
- `npm install`
- `npm start`

## 4. Inicio de sesion

La entrada principal del sistema se realiza desde `pos.html`.

### 4.1 Como ingresar

1. Escribe el usuario.
2. Escribe la contrasena.
3. Pulsa `Entrar al sistema`.

### 4.2 Como funciona el acceso

- El sistema valida credenciales contra la hoja de usuarios en linea.
- Si el acceso es correcto, se guarda la sesion localmente y se redirige al dashboard.
- Si ya existe una sesion activa, el sistema entra directamente al dashboard.

### 4.3 Datos de marca en login

El login puede mostrar:

- Logo por defecto del sistema.
- Nombre y logo personalizados de la farmacia si vienen desde configuracion remota.

## 5. Roles y permisos

La plataforma maneja restricciones por rol.

### 5.1 Administrador y supervisor

Pueden acceder sin restriccion a los modulos del sistema.

### 5.2 Cajero o usuario basico

Tiene acceso solamente a:

- `dashboard.html`
- `ventas.html`
- `historico-ventas.html`
- `retiros-caja.html`
- `cierre-caja.html`

Los enlaces a otros modulos se ocultan automaticamente.

## 6. Dashboard general

La pantalla `dashboard.html` funciona como centro de control.

### 6.1 Que muestra

- Usuario activo, rol e hora de ingreso.
- Nombre de la farmacia y datos principales.
- Ventas del dia.
- Caja disponible.
- Unidades vendidas.
- Numero de productos.
- Numero de clientes.
- Ticket promedio.
- Salud del inventario.
- Alertas rapidas.
- Actividad reciente.
- Resumen general del negocio.

### 6.2 Para que sirve

- Tener una lectura rapida del negocio.
- Entrar rapidamente a ventas, inventario, clientes y reportes.
- Confirmar la informacion general de la farmacia.

## 7. Punto de venta

La pantalla `ventas.html` es el modulo principal para registrar ventas.

## 7.1 Flujo recomendado de trabajo

1. Abrir caja.
2. Seleccionar cliente.
3. Buscar y agregar productos.
4. Elegir metodo de pago.
5. Registrar valor recibido si el pago es en efectivo.
6. Cobrar.
7. Imprimir o descargar el ticket.

## 7.2 Apertura de caja

Antes de cobrar, la caja debe estar abierta.

- El sistema solicita una base inicial.
- Sin apertura, no permite finalizar ventas.
- La apertura genera un comprobante.

## 7.3 Catalogo de productos

El modulo de ventas permite:

- Buscar productos.
- Filtrar por categoria.
- Ver precio y stock.
- Agregar productos al carrito.

Si el producto no tiene stock:

- No se puede agregar.
- El sistema lo marca como no disponible.

## 7.4 Cliente de la venta

Se puede asociar un cliente a cada venta.

- Por defecto existe `Cliente general`.
- Se puede seleccionar otro cliente desde la lista.

## 7.5 Metodos de pago

La venta admite:

- Efectivo
- Tarjeta
- Transferencia

Si el metodo es efectivo:

- Debe registrarse el valor recibido.
- El sistema calcula automaticamente el cambio.
- No permite cobrar si el recibido es menor al total.

## 7.6 Puntos y fidelizacion

El sistema incluye un esquema de puntos.

- Cada cliente acumula puntos por compra.
- Regla actual: `1 punto por cada 1.000 COP vendidos`.
- Redencion actual: `1 punto = 1 COP de descuento`.

Durante la venta:

- Se muestra el saldo disponible de puntos.
- El usuario puede indicar cuantos puntos desea redimir.
- El descuento se refleja antes del cobro final.

Despues de vender:

- Se descuentan los puntos redimidos.
- Se suman los puntos ganados.
- Se incrementa el numero de compras del cliente.
- Se actualiza el total acumulado del cliente.

## 7.7 Impuestos

La configuracion actual calcula IVA del 19%.

En cada venta se generan:

- Subtotal
- IVA
- Descuento por puntos, si aplica
- Total final

## 7.8 Que pasa al cobrar

Cuando una venta se confirma:

- Se descuenta stock en Google Sheets.
- Se registra la venta en la fuente remota.
- Se genera ticket.
- Se guarda copia local.
- Se actualizan clientes y puntos.

Si la actualizacion de inventario falla:

- La venta no continua.

Si el inventario se actualiza pero falla el registro remoto de la venta:

- El sistema guarda una copia local temporal.
- El ticket queda con numeracion local.

## 7.9 Ticket de venta

Cada ticket puede:

- Visualizarse en pantalla.
- Imprimirse.
- Descargarse como HTML.

El ticket incluye:

- Logo y datos de la farmacia.
- Numero de ticket.
- Fecha y hora.
- Cliente.
- Metodo de pago.
- Valor recibido y cambio si aplica.
- Detalle de productos.
- Subtotal, IVA, descuento y total.
- Puntos usados y ganados.
- Codigo QR con resumen de la venta.

## 7.10 Control de efectivo en caja

El sistema vigila la exposicion de efectivo.

- Si las ventas en efectivo del turno superan `400.000 COP`, muestra recomendacion de retiro o cierre.

## 8. Historico de ventas

La pantalla `historico-ventas.html` permite revisar tickets ya generados.

### 8.1 Funciones disponibles

- Ver tickets recientes.
- Abrir ticket.
- Imprimir ticket.
- Descargar ticket.
- Anular una venta.

### 8.2 Anulacion de ventas

El modulo incluye un bloque de supervisor para documentar anulaciones.

Debe registrarse:

- Nombre del supervisor.
- Motivo de anulacion.

Al anular una venta:

- Se cambia el estado del ticket.
- Se deja trazabilidad local.
- Se repone el stock local de los productos de esa venta.

## 9. Inventario

La pantalla `inventario.html` permite administrar productos y sincronizarlos con Google Sheets.

## 9.1 Indicadores del inventario

El sistema muestra:

- Total de productos.
- Productos con stock bajo.
- Productos agotados.
- Valor estimado del inventario.

## 9.2 Crear o editar productos

Cada producto puede incluir:

- SKU
- Nombre
- Categoria
- Precio
- Stock
- Lote
- Fecha de vencimiento
- Laboratorio
- Codigo de barras
- Descripcion
- Estado activo

## 9.3 Acciones disponibles

- Guardar producto.
- Editar desde la tabla.
- Descargar inventario.
- Importar CSV.
- Sincronizar.
- Limpiar formulario.

## 9.4 Importacion y exportacion

Se puede:

- Exportar inventario en JSON.
- Exportar inventario en CSV.
- Importar un archivo CSV para carga masiva.

## 9.5 Alertas y vencimientos

El sistema muestra:

- Productos con stock bajo.
- Productos agotados.
- Alertas de vencimiento.
- Clasificacion por categoria.

Tambien tiene un modal para consultar productos:

- Vencidos.
- Proximos a vencer.
- Vigentes.
- Sin fecha registrada.

## 9.6 Filtros del inventario

La tabla permite filtrar por:

- Texto libre.
- Vencimiento.
- Lote.
- Laboratorio.

## 9.7 Sincronizacion

La informacion se puede sincronizar con Apps Script y Google Sheets.

El estado visible en configuracion incluye:

- Estado de sincronizacion.
- Ultima sincronizacion.
- URL de origen.

## 10. Clientes

La pantalla `clientes.html` administra la base comercial.

### 10.1 Funciones

- Ver directorio visual de clientes.
- Registrar nuevos clientes.
- Consultar tabla administrativa.

### 10.2 Datos del cliente

La tabla de clientes maneja:

- Nombre
- Documento
- Telefono
- Numero de compras
- Puntos
- Total acumulado

### 10.3 Uso recomendado

- Registrar clientes antes de cobrar si se desea acumular puntos.
- Mantener actualizado telefono y documento para trazabilidad.

## 11. Retiros de caja

La pantalla `retiros-caja.html` controla salidas autorizadas de efectivo.

## 11.1 Reglas del modulo

- El cajero no puede guardar retiros sin autorizacion de supervisor.
- El monto maximo por retiro es `450.000 COP`.
- No se puede retirar mas de lo disponible en caja.

## 11.2 Datos requeridos

Para registrar un retiro se solicita:

- Valor a retirar.
- Motivo.
- Usuario supervisor.
- Clave supervisor.

Si el motivo es `Otro`, se puede escribir una descripcion adicional.

## 11.3 Que guarda el sistema

Cada retiro registra:

- Numero de retiro.
- Fecha y hora.
- Monto.
- Motivo.
- Usuario y nombre del cajero.
- Usuario y nombre del supervisor.

## 11.4 Sincronizacion

Los retiros se guardan en la hoja en linea `Retiros`.

La pantalla tambien muestra:

- Efectivo disponible para retirar.
- Total retirado en el dia.
- Cantidad de retiros del dia.
- Historial de retiros sincronizados.

## 12. Cierre de caja

La pantalla `cierre-caja.html` permite realizar el cierre del turno o del dia.

## 12.1 Datos que usa el sistema

El cierre toma en cuenta:

- Base inicial de apertura.
- Ventas del dia.
- Transacciones.
- Ventas por metodo de pago.
- Retiros autorizados.
- Ajuste manual.
- Efectivo contado.

## 12.2 Calculo principal

El sistema calcula:

- Efectivo esperado = base inicial + ventas en efectivo - retiros - ajuste manual
- Diferencia = efectivo contado - efectivo esperado

## 12.3 Operacion

El usuario puede:

- Ver la base inicial.
- Registrar el efectivo contado.
- Registrar ajuste manual.
- Escribir observaciones.
- Guardar cierre.
- Imprimir cierre.
- Descargar cierre.
- Editar un cierre guardado.

## 12.4 Historial

La pagina muestra cierres recientes guardados en el equipo.

Tambien puede sincronizarse con la hoja remota de cierres.

## 13. Reportes

La pantalla `reportes.html` consolida informacion comercial.

### 13.1 Indicadores principales

- Ingresos acumulados.
- Productos vendidos.
- Ticket promedio.
- Cliente top.

### 13.2 Cortes imprimibles

Se pueden generar reportes por:

- Dia
- Mes
- Ano

### 13.3 Contenido del reporte

Cada reporte incluye:

- Periodo analizado.
- Numero de ventas.
- Ingresos.
- Unidades.
- Ticket promedio.
- Resumen por metodo de pago.
- Detalle de ventas.

### 13.4 Acciones

- Vista previa.
- Descargar reporte.
- Imprimir reporte.

## 14. Configuracion

La pantalla `configuracion.html` sirve para personalizar el sistema y ejecutar utilidades.

## 14.1 Datos de la farmacia

Permite registrar o modificar:

- Nombre comercial.
- Logo.
- NIT o documento.
- Telefono.
- Correo.
- Direccion.
- Ciudad.
- Responsable.

## 14.2 Uso del logo

El logo configurado puede reflejarse en:

- Login.
- Ticket de venta.
- Distintas vistas del sistema.

## 14.3 Acciones rapidas

Desde configuracion se puede:

- Abrir el ultimo ticket.
- Exportar datos.
- Restablecer el demo.

## 14.4 Estado del entorno

Muestra:

- Caja activa.
- Persistencia.
- Metodo de pago por defecto.
- Ultimo ticket.
- Estado de sincronizacion.
- Fecha de ultima sincronizacion.
- URL de inventario.

## 15. Soporte

La pantalla `soporte.html` centraliza la ayuda al usuario.

Los contactos visibles actualmente en el sistema son:

- Correo: `farmapossft@gmail.com`
- Telefono: `3127947484`
- WhatsApp: `3206135719`

Se recomienda validar estos datos antes de distribuir el manual a clientes finales.

## 16. Persistencia y almacenamiento

La plataforma usa dos tipos de almacenamiento:

### 16.1 Local

Se guardan localmente datos como:

- Sesion activa.
- Inventario local.
- Clientes.
- Ventas.
- Ultimo ticket.
- Perfil de farmacia.
- Cierres de caja.
- Borrador de apertura y cierre.

### 16.2 Remoto

Mediante Apps Script y Google Sheets se sincronizan:

- Inventario
- Ventas
- Usuarios
- Retiros
- Cierres
- Perfil de empresa

## 17. Estructura esperada en Google Sheets

La automatizacion del proyecto espera hojas como:

- `Inventario`
- `Ventas`
- `Usuarios`
- `Retiros`
- `CierresCaja`, `Cierres de Caja` o `Cierres`
- `Info`

## 18. Flujos operativos recomendados

## 18.1 Apertura y ventas del dia

1. Iniciar sesion.
2. Revisar dashboard.
3. Abrir caja en ventas.
4. Registrar ventas durante el turno.
5. Hacer retiros si el efectivo supera el limite sugerido.
6. Revisar historico si se requiere reimpresion o anulacion.
7. Ejecutar cierre al terminar el turno.

## 18.2 Carga de inventario

1. Ir a inventario.
2. Crear productos manualmente o importar CSV.
3. Sincronizar con Google Sheets.
4. Revisar alertas de stock y vencimiento.

## 18.3 Registro de clientes

1. Ir a clientes.
2. Crear cliente.
3. Asociarlo a la venta en el POS.
4. Usar la tabla para controlar puntos y compras acumuladas.

## 19. Reglas importantes del sistema

- No se puede cobrar si la caja no ha sido abierta.
- No se puede vender sin productos en el carrito.
- No se puede cobrar en efectivo si el recibido no cubre el total.
- No se puede vender una cantidad superior al stock disponible.
- No se puede retirar caja sin supervisor.
- No se puede retirar por encima del limite permitido ni del efectivo disponible.
- La anulacion de ventas debe dejar trazabilidad.

## 20. Problemas comunes y recomendaciones

### 20.1 No deja iniciar sesion

Verificar:

- Conexion a internet.
- Usuario y contrasena.
- Que la hoja `Usuarios` este operativa.
- Que el Apps Script este publicado.

### 20.2 No sincroniza inventario o ventas

Verificar:

- URL correcta del Apps Script.
- Permisos de la implementacion web.
- Nombre correcto de las hojas.
- Encabezados esperados.

### 20.3 No se puede vender

Revisar:

- Caja abierta.
- Productos con stock.
- Cliente seleccionado si se usaran puntos.
- Valor recibido en efectivo.

### 20.4 El logo o nombre no cambia

Revisar:

- Datos guardados en configuracion.
- Sincronizacion de perfil remoto.
- Cache local del navegador o app.

## 21. Anexo tecnico breve

Documentos existentes en el proyecto:

- [README.md](/c:/Users/Tecnico/Downloads/sistema_facturacion-main/sistema_facturacion-main/README.md)
- [DESKTOP-SETUP.md](/c:/Users/Tecnico/Downloads/sistema_facturacion-main/sistema_facturacion-main/DESKTOP-SETUP.md)
- [INVENTARIO-SETUP.md](/c:/Users/Tecnico/Downloads/sistema_facturacion-main/sistema_facturacion-main/INVENTARIO-SETUP.md)
- [apps-script-inventario.gs](/c:/Users/Tecnico/Downloads/sistema_facturacion-main/sistema_facturacion-main/apps-script-inventario.gs)

Estos archivos complementan este manual con la parte de instalacion, despliegue y sincronizacion tecnica.

## 22. Recomendacion final de entrega

Si este manual va para usuarios finales, conviene antes:

- Ajustar nombre comercial definitivo.
- Confirmar contactos de soporte reales.
- Validar logo final.
- Revisar si todas las funciones descritas estaran habilitadas para el cliente.
