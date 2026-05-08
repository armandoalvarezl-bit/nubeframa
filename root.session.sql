CREATE DATABASE IF NOT EXISTS db_posfarma_23
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE db_posfarma;

CREATE TABLE IF NOT EXISTS empresas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(160) NOT NULL,
  nit VARCHAR(40) NULL,
  telefono VARCHAR(30) NULL,
  email VARCHAR(120) NULL,
  contacto VARCHAR(120) NULL,
  db_name VARCHAR(100) NULL,
  estado ENUM('ACTIVA', 'INACTIVA') NOT NULL DEFAULT 'ACTIVA',
  creada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_empresas_nombre (nombre)
);

CREATE TABLE IF NOT EXISTS licencias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  empresa_id INT NULL,
  codigo_licencia VARCHAR(80) NOT NULL UNIQUE,
  cliente_nombre VARCHAR(150) NOT NULL,
  cliente_documento VARCHAR(50) NULL,
  empresa_nombre VARCHAR(150) NULL,
  telefono VARCHAR(30) NULL,
  email VARCHAR(120) NULL,
  equipo_id VARCHAR(150) NULL,
  equipo_nombre VARCHAR(150) NULL,
  plan VARCHAR(50) NOT NULL DEFAULT 'ANUAL',
  max_equipos INT NOT NULL DEFAULT 1,
  fecha_activacion DATETIME NULL,
  fecha_vencimiento DATETIME NOT NULL,
  estado ENUM('PENDIENTE', 'ACTIVA', 'VENCIDA', 'BLOQUEADA') NOT NULL DEFAULT 'PENDIENTE',
  observaciones TEXT NULL,
  creada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_licencias_empresa (empresa_id),
  KEY idx_licencias_estado (estado),
  KEY idx_licencias_vencimiento (fecha_vencimiento),
  KEY idx_licencias_equipo (equipo_id)
);

CREATE TABLE IF NOT EXISTS licencias_equipos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  licencia_id INT NOT NULL,
  equipo_id VARCHAR(150) NOT NULL,
  equipo_nombre VARCHAR(150) NULL,
  primera_activacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultima_validacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado ENUM('ACTIVO', 'BLOQUEADO') NOT NULL DEFAULT 'ACTIVO',
  UNIQUE KEY uq_licencia_equipo (licencia_id, equipo_id),
  KEY idx_licencias_equipos_equipo (equipo_id)
);

CREATE TABLE IF NOT EXISTS licencias_historial (
  id INT AUTO_INCREMENT PRIMARY KEY,
  licencia_id INT NOT NULL,
  tipo_evento VARCHAR(40) NOT NULL,
  detalle VARCHAR(255) NULL,
  equipo_id VARCHAR(150) NULL,
  equipo_nombre VARCHAR(150) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_licencias_historial_licencia (licencia_id),
  KEY idx_licencias_historial_evento (tipo_evento)
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  empresa_id INT NULL,
  nombre VARCHAR(120) NOT NULL,
  username VARCHAR(60) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rol ENUM('admin', 'operador', 'admin_empresa', 'supervisor', 'cajero') NOT NULL DEFAULT 'cajero',
  activo ENUM('SI', 'NO') NOT NULL DEFAULT 'SI',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_usuarios_empresa (empresa_id),
  KEY idx_usuarios_rol (rol)
);

CREATE TABLE IF NOT EXISTS clientes (
  id VARCHAR(80) PRIMARY KEY,
  empresa_id INT NULL,
  nombre VARCHAR(120) NOT NULL,
  documento VARCHAR(40) NOT NULL,
  telefono VARCHAR(30) NULL,
  compras INT NOT NULL DEFAULT 0,
  puntos INT NOT NULL DEFAULT 0,
  total_gastado DECIMAL(14,2) NOT NULL DEFAULT 0,
  activo ENUM('SI', 'NO') NOT NULL DEFAULT 'SI',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_clientes_empresa_documento (empresa_id, documento),
  KEY idx_clientes_nombre (nombre)
);

ALTER TABLE clientes
ADD COLUMN IF NOT EXISTS activo ENUM('SI', 'NO') NOT NULL DEFAULT 'SI' AFTER total_gastado;

CREATE TABLE IF NOT EXISTS inventario (
  id VARCHAR(80) PRIMARY KEY,
  empresa_id INT NULL,
  sku VARCHAR(50) NOT NULL,
  nombre VARCHAR(160) NOT NULL,
  categoria VARCHAR(60) NOT NULL,
  precio DECIMAL(14,2) NOT NULL DEFAULT 0,
  stock INT NOT NULL DEFAULT 0,
  lote VARCHAR(80) NULL,
  fecha_vencimiento DATE NULL,
  laboratorio VARCHAR(120) NULL,
  codigo_barras VARCHAR(80) NULL,
  descripcion TEXT NULL,
  imagen_url LONGTEXT NULL,
  activo ENUM('SI', 'NO') NOT NULL DEFAULT 'SI',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_inventario_empresa_sku (empresa_id, sku),
  KEY idx_inventario_categoria (categoria),
  KEY idx_inventario_nombre (nombre)
);

ALTER TABLE inventario
ADD COLUMN IF NOT EXISTS imagen_url LONGTEXT NULL AFTER descripcion;

CREATE TABLE IF NOT EXISTS proveedores (
  id VARCHAR(80) PRIMARY KEY,
  empresa_id INT NULL,
  nombre VARCHAR(160) NOT NULL,
  documento VARCHAR(50) NULL,
  telefono VARCHAR(30) NULL,
  contacto VARCHAR(120) NULL,
  ciudad VARCHAR(120) NULL,
  notas TEXT NULL,
  activo ENUM('SI', 'NO') NOT NULL DEFAULT 'SI',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_proveedores_nombre (nombre),
  KEY idx_proveedores_documento (documento)
);

CREATE TABLE IF NOT EXISTS compras (
  id VARCHAR(80) PRIMARY KEY,
  empresa_id INT NULL,
  proveedor_id VARCHAR(80) NOT NULL,
  proveedor_nombre VARCHAR(160) NOT NULL,
  inventario_id VARCHAR(80) NOT NULL,
  producto_nombre VARCHAR(160) NOT NULL,
  sku VARCHAR(50) NULL,
  cantidad INT NOT NULL DEFAULT 0,
  costo_unitario DECIMAL(14,2) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  lote VARCHAR(80) NULL,
  fecha DATE NOT NULL,
  notas TEXT NULL,
  creado_en DATETIME NOT NULL,
  KEY idx_compras_fecha (fecha),
  KEY idx_compras_proveedor (proveedor_id),
  KEY idx_compras_inventario (inventario_id),
  CONSTRAINT fk_compras_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
  CONSTRAINT fk_compras_inventario FOREIGN KEY (inventario_id) REFERENCES inventario(id)
);

CREATE TABLE IF NOT EXISTS devoluciones (
  id VARCHAR(80) PRIMARY KEY,
  empresa_id INT NULL,
  venta_id VARCHAR(80) NOT NULL,
  ticket_numero VARCHAR(40) NOT NULL,
  cliente_nombre VARCHAR(120) NULL,
  inventario_id VARCHAR(80) NOT NULL,
  producto_nombre VARCHAR(160) NOT NULL,
  cantidad INT NOT NULL DEFAULT 0,
  precio_unitario DECIMAL(14,2) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  motivo VARCHAR(255) NULL,
  repone_stock ENUM('SI', 'NO') NOT NULL DEFAULT 'SI',
  fecha DATE NOT NULL,
  procesado_por VARCHAR(120) NULL,
  creado_en DATETIME NOT NULL,
  KEY idx_devoluciones_fecha (fecha),
  KEY idx_devoluciones_venta (venta_id),
  KEY idx_devoluciones_inventario (inventario_id)
);

CREATE TABLE IF NOT EXISTS auditoria (
  id VARCHAR(80) PRIMARY KEY,
  empresa_id INT NULL,
  modulo VARCHAR(60) NOT NULL,
  accion VARCHAR(60) NOT NULL,
  entidad_id VARCHAR(80) NULL,
  entidad_nombre VARCHAR(180) NULL,
  detalle TEXT NULL,
  usuario_nombre VARCHAR(120) NULL,
  usuario_login VARCHAR(80) NULL,
  creado_en DATETIME NOT NULL,
  KEY idx_auditoria_fecha (creado_en),
  KEY idx_auditoria_modulo (modulo)
);

CREATE TABLE IF NOT EXISTS ventas (
  id VARCHAR(80) PRIMARY KEY,
  empresa_id INT NULL,
  ticket_numero VARCHAR(40) NOT NULL,
  cliente_id VARCHAR(80) NULL,
  cliente_nombre VARCHAR(120) NOT NULL,
  cliente_documento VARCHAR(40) NULL,
  fecha DATE NOT NULL,
  hora TIME NULL,
  metodo_pago VARCHAR(30) NOT NULL,
  efectivo_recibido DECIMAL(14,2) NOT NULL DEFAULT 0,
  cambio DECIMAL(14,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  iva DECIMAL(14,2) NOT NULL DEFAULT 0,
  puntos_redimidos INT NOT NULL DEFAULT 0,
  descuento_fidelidad DECIMAL(14,2) NOT NULL DEFAULT 0,
  puntos_ganados INT NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  estado ENUM('ACTIVA', 'ANULADA') NOT NULL DEFAULT 'ACTIVA',
  anulada_en DATETIME NULL,
  anulada_por VARCHAR(120) NULL,
  motivo_anulacion VARCHAR(255) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ventas_empresa_ticket (empresa_id, ticket_numero),
  KEY idx_ventas_fecha (fecha),
  KEY idx_ventas_estado (estado),
  CONSTRAINT fk_ventas_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

CREATE TABLE IF NOT EXISTS detalle_venta (
  id INT AUTO_INCREMENT PRIMARY KEY,
  venta_id VARCHAR(80) NOT NULL,
  inventario_id VARCHAR(80) NOT NULL,
  nombre_producto VARCHAR(160) NOT NULL,
  precio_unitario DECIMAL(14,2) NOT NULL DEFAULT 0,
  cantidad INT NOT NULL DEFAULT 1,
  subtotal_linea DECIMAL(14,2) NOT NULL DEFAULT 0,
  KEY idx_detalle_venta_venta_id (venta_id),
  CONSTRAINT fk_detalle_venta FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
  CONSTRAINT fk_detalle_inventario FOREIGN KEY (inventario_id) REFERENCES inventario(id)
);

CREATE TABLE IF NOT EXISTS cierres_caja (
  id VARCHAR(80) PRIMARY KEY,
  empresa_id INT NULL,
  numero_cierre VARCHAR(40) NOT NULL,
  fecha DATE NOT NULL,
  creado_en DATETIME NOT NULL,
  usuario VARCHAR(120) NOT NULL,
  monto_apertura DECIMAL(14,2) NOT NULL DEFAULT 0,
  ventas_efectivo DECIMAL(14,2) NOT NULL DEFAULT 0,
  ventas_tarjeta DECIMAL(14,2) NOT NULL DEFAULT 0,
  ventas_transferencia DECIMAL(14,2) NOT NULL DEFAULT 0,
  retiros_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  gastos DECIMAL(14,2) NOT NULL DEFAULT 0,
  efectivo_contado DECIMAL(14,2) NOT NULL DEFAULT 0,
  efectivo_esperado DECIMAL(14,2) NOT NULL DEFAULT 0,
  diferencia DECIMAL(14,2) NOT NULL DEFAULT 0,
  transacciones INT NOT NULL DEFAULT 0,
  total_ventas DECIMAL(14,2) NOT NULL DEFAULT 0,
  unidades INT NOT NULL DEFAULT 0,
  observaciones TEXT NULL,
  UNIQUE KEY uq_cierres_empresa_numero (empresa_id, numero_cierre),
  KEY idx_cierres_caja_fecha (fecha)
);

CREATE TABLE IF NOT EXISTS cierres_caja_ventas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cierre_id VARCHAR(80) NOT NULL,
  venta_id VARCHAR(80) NULL,
  ticket_numero VARCHAR(40) NOT NULL,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  hora TIME NULL,
  cliente_nombre VARCHAR(120) NOT NULL,
  metodo_pago VARCHAR(30) NOT NULL,
  CONSTRAINT fk_cierre_ventas_cierre FOREIGN KEY (cierre_id) REFERENCES cierres_caja(id) ON DELETE CASCADE,
  CONSTRAINT fk_cierre_ventas_venta FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS retiros_caja (
  id VARCHAR(80) PRIMARY KEY,
  empresa_id INT NULL,
  retiro_numero VARCHAR(40) NOT NULL,
  fecha DATE NOT NULL,
  hora TIME NULL,
  monto DECIMAL(14,2) NOT NULL,
  motivo VARCHAR(255) NULL,
  cajero_usuario VARCHAR(60) NULL,
  cajero_nombre VARCHAR(120) NOT NULL,
  supervisor_usuario VARCHAR(60) NULL,
  supervisor_nombre VARCHAR(120) NULL,
  creado_en DATETIME NULL,
  UNIQUE KEY uq_retiros_empresa_numero (empresa_id, retiro_numero),
  KEY idx_retiros_caja_fecha (fecha)
);

CREATE TABLE IF NOT EXISTS perfil_farmacia (
  id INT AUTO_INCREMENT PRIMARY KEY,
  empresa_id INT NULL,
  nombre VARCHAR(160) NOT NULL,
  nit VARCHAR(40) NULL,
  telefono VARCHAR(30) NULL,
  email VARCHAR(120) NULL,
  direccion VARCHAR(180) NULL,
  ciudad VARCHAR(120) NULL,
  encargado VARCHAR(120) NULL,
  logo_url TEXT NULL,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_perfil_farmacia_empresa (empresa_id)
);

SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM detalle_venta;
DELETE FROM cierres_caja_ventas;
DELETE FROM devoluciones;
DELETE FROM compras;
DELETE FROM auditoria;
DELETE FROM retiros_caja;
DELETE FROM cierres_caja;
DELETE FROM ventas;
DELETE FROM proveedores;
DELETE FROM inventario;
DELETE FROM clientes;
DELETE FROM perfil_farmacia;
DELETE FROM licencias_historial;
DELETE FROM licencias_equipos;
DELETE FROM licencias;
DELETE FROM empresas;
DELETE FROM usuarios WHERE empresa_id IS NOT NULL OR username NOT IN ('admin', 'operador');

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO usuarios (empresa_id, nombre, username, password_hash, rol, activo)
VALUES
(NULL, 'Administrador desarrollador', 'admin', 'cambia_esta_clave', 'admin', 'SI'),
(NULL, 'Operador desarrollador', 'operador', 'cambia_esta_clave', 'operador', 'SI')
ON DUPLICATE KEY UPDATE
empresa_id = VALUES(empresa_id),
nombre = VALUES(nombre),
rol = VALUES(rol),
activo = VALUES(activo);

SELECT 'BASE LIMPIA OK' AS mensaje;
SHOW TABLES;
SELECT COUNT(*) AS total_empresas FROM empresas;
SELECT COUNT(*) AS total_licencias FROM licencias;
SELECT COUNT(*) AS total_usuarios_globales FROM usuarios WHERE empresa_id IS NULL;
