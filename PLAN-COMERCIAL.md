# Plan Comercial Farma POS

## 1. Objetivo

Este documento define una base comercial simple para empezar a vender Farma POS con planes por tiempo, control de equipos, soporte y renovaciones.

## 2. Estructura de planes

Los planes comerciales activos del sistema son:

- `QUINCENAL`
- `MENSUAL`
- `ANUAL`

Cada licencia puede manejar:

- empresa asociada
- codigo de licencia
- fecha de corte
- estado de licencia
- cantidad maxima de equipos

## 3. Precios sugeridos

Estos valores son sugeridos para salir al mercado y pueden ajustarse despues de los primeros clientes piloto.

| Plan | Vigencia | 1 equipo | 2 equipos | 3 equipos |
| --- | --- | ---: | ---: | ---: |
| Quincenal | 15 dias | $35.000 COP | $55.000 COP | $75.000 COP |
| Mensual | 30 dias aprox. | $60.000 COP | $85.000 COP | $110.000 COP |
| Anual | 12 meses | $600.000 COP | $780.000 COP | $950.000 COP |

## 4. Reglas comerciales

- Cada licencia pertenece a una empresa.
- Una empresa puede tener varios usuarios con distintos roles.
- La licencia define cuantos equipos pueden activarse al mismo tiempo.
- La renovacion respeta el plan de la licencia: quincenal, mensual o anual.
- Si la licencia vence, el sistema debe advertir la fecha de corte y el tiempo restante.
- Solo `admin` y `operador` pueden crear, editar, activar, bloquear o renovar licencias.
- Los roles de empresa no deben administrar licencias.

## 5. Que incluye cada plan

### Plan quincenal

- acceso al sistema por 15 dias
- 1 a 3 equipos segun compra
- soporte por ticket/chat
- actualizaciones menores durante vigencia

### Plan mensual

- acceso al sistema por ciclo mensual
- 1 a 3 equipos segun compra
- soporte por ticket/chat
- acompanamiento operativo basico

### Plan anual

- acceso al sistema por 12 meses
- mejor precio por permanencia
- 1 a 3 equipos segun compra
- soporte por ticket/chat
- prioridad comercial para renovacion

## 6. Proceso de venta

1. Registrar prospecto.
2. Confirmar nombre de empresa, NIT, telefono, correo y ciudad.
3. Definir plan: quincenal, mensual o anual.
4. Definir cantidad de equipos.
5. Crear empresa en el sistema.
6. Crear licencia y asignar plan.
7. Activar licencia en el equipo principal del cliente.
8. Crear usuarios iniciales:
   - `admin_empresa`
   - `supervisor`
   - `cajero`
9. Entregar acceso y manual.

## 7. Flujo de activacion

1. Instalar la app.
2. Validar conexion y acceso a MariaDB.
3. Ingresar con un usuario autorizado.
4. Aplicar licencia al equipo.
5. Confirmar:
   - empresa asociada
   - plan activo
   - vigencia
   - fecha de corte
6. Configurar perfil de empresa y logo.
7. Cargar inventario inicial.

## 8. Flujo de renovacion

1. Revisar licencias proximas a vencer.
2. Confirmar pago del cliente.
3. Abrir modulo de licencias.
4. Renovar la licencia.
5. Verificar nueva fecha de corte.
6. Confirmar con el cliente que el acceso sigue activo.

## 9. Politica sugerida de soporte

- Horario base: lunes a sabado de 7:00 a.m. a 7:00 p.m.
- Canal principal: soporte interno por tickets/chat.
- Canal alterno: WhatsApp comercial.
- Tiempo sugerido de primera respuesta:
  - alta prioridad: menos de 1 hora
  - media prioridad: menos de 4 horas
  - baja prioridad: mismo dia habil

## 10. Guion corto de venta

Farma POS es un sistema de facturacion e inventario para farmacias y puntos de venta que permite controlar ventas, clientes, caja, retiros, cierres, soporte y licencias por empresa. Se instala rapido, se personaliza con los datos del negocio y puede manejar usuarios por rol dentro de la misma empresa.

## 11. Recomendacion para salida comercial

- vender primero a 3 clientes piloto
- documentar dudas frecuentes
- ajustar precios despues de 30 dias
- dejar claro desde el inicio cuantos equipos incluye cada plan
- ofrecer anual como plan principal de permanencia
