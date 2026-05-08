const mysql = require('mysql2/promise');

const dbConfig = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'admin',
  database: 'db_posfarma',
};

const COMPANY_SCHEMA = `
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
  UNIQUE KEY uq_sku (sku),
  KEY idx_categoria (categoria),
  KEY idx_nombre (nombre)
);

CREATE TABLE IF NOT EXISTS clientes (
  id VARCHAR(80) PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  documento VARCHAR(40) NOT NULL,
  telefono VARCHAR(30) NULL,
  compras INT NOT NULL DEFAULT 0,
  puntos INT NOT NULL DEFAULT 0,
  total_gastado DECIMAL(14,2) NOT NULL DEFAULT 0,
  activo ENUM('SI', 'NO') NOT NULL DEFAULT 'SI',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_documento (documento),
  KEY idx_nombre (nombre)
);

CREATE TABLE IF NOT EXISTS proveedores (
  id VARCHAR(80) PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  documento VARCHAR(40) NULL,
  telefono VARCHAR(30) NULL,
  email VARCHAR(120) NULL,
  direccion VARCHAR(255) NULL,
  ciudad VARCHAR(60) NULL,
  contacto VARCHAR(120) NULL,
  activo ENUM('SI', 'NO') NOT NULL DEFAULT 'SI',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS compras (
  id VARCHAR(80) PRIMARY KEY,
  numero_compra VARCHAR(40) NOT NULL UNIQUE,
  proveedor_id VARCHAR(80) NULL,
  proveedor_nombre VARCHAR(120) NULL,
  fecha DATE NOT NULL,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  estado VARCHAR(40) NOT NULL DEFAULT 'completada',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_numero (numero_compra),
  KEY idx_fecha (fecha)
);

CREATE TABLE IF NOT EXISTS devoluciones (
  id VARCHAR(80) PRIMARY KEY,
  numero_devolucion VARCHAR(40) NOT NULL UNIQUE,
  proveedor_id VARCHAR(80) NULL,
  proveedor_nombre VARCHAR(120) NULL,
  razon TEXT NULL,
  fecha DATE NOT NULL,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  estado VARCHAR(40) NOT NULL DEFAULT 'completada',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_numero (numero_devolucion),
  KEY idx_fecha (fecha)
);

CREATE TABLE IF NOT EXISTS ventas (
  id VARCHAR(80) PRIMARY KEY,
  ticket_numero VARCHAR(40) NOT NULL UNIQUE,
  cliente_id VARCHAR(80) NULL,
  cliente_nombre VARCHAR(120) NULL,
  cliente_documento VARCHAR(40) NULL,
  fecha DATE NOT NULL,
  hora TIME NOT NULL,
  metodo_pago VARCHAR(40) NOT NULL DEFAULT 'Efectivo',
  efectivo_recibido DECIMAL(14,2) NOT NULL DEFAULT 0,
  cambio DECIMAL(14,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  iva DECIMAL(14,2) NOT NULL DEFAULT 0,
  puntos_redimidos INT NOT NULL DEFAULT 0,
  descuento_fidelidad DECIMAL(14,2) NOT NULL DEFAULT 0,
  puntos_ganados INT NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ticket (ticket_numero),
  KEY idx_fecha (fecha),
  KEY idx_cliente (cliente_id)
);

CREATE TABLE IF NOT EXISTS detalle_venta (
  id VARCHAR(80) PRIMARY KEY,
  venta_id VARCHAR(80) NOT NULL,
  inventario_id VARCHAR(80) NOT NULL,
  nombre_producto VARCHAR(160) NOT NULL,
  precio_unitario DECIMAL(14,2) NOT NULL,
  cantidad INT NOT NULL,
  subtotal_linea DECIMAL(14,2) NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_venta (venta_id)
);

CREATE TABLE IF NOT EXISTS retiros_caja (
  id VARCHAR(80) PRIMARY KEY,
  retiro_numero VARCHAR(40) NOT NULL UNIQUE,
  monto DECIMAL(14,2) NOT NULL,
  concepto TEXT NULL,
  fecha DATE NOT NULL,
  usuario VARCHAR(120) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_numero (retiro_numero),
  KEY idx_fecha (fecha)
);

CREATE TABLE IF NOT EXISTS cierres_caja (
  id VARCHAR(80) PRIMARY KEY,
  numero_cierre VARCHAR(40) NOT NULL UNIQUE,
  fecha DATE NOT NULL,
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
  usuario VARCHAR(120) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_numero (numero_cierre),
  KEY idx_fecha (fecha)
);

CREATE TABLE IF NOT EXISTS auditoria (
  id VARCHAR(80) PRIMARY KEY,
  modulo VARCHAR(60) NOT NULL,
  accion VARCHAR(40) NOT NULL,
  entidad_id VARCHAR(80) NULL,
  entidad_nombre VARCHAR(160) NULL,
  detalle TEXT NULL,
  usuario VARCHAR(120) NULL,
  fecha DATETIME NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_modulo (modulo),
  KEY idx_usuario (usuario),
  KEY idx_fecha (fecha)
);

CREATE TABLE IF NOT EXISTS perfil_farmacia (
  id VARCHAR(80) PRIMARY KEY,
  nombre VARCHAR(160) NOT NULL,
  nit VARCHAR(40) NULL,
  telefono VARCHAR(30) NULL,
  email VARCHAR(120) NULL,
  direccion VARCHAR(255) NULL,
  ciudad VARCHAR(60) NULL,
  responsable VARCHAR(120) NULL,
  logo_url LONGTEXT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dian_config (
  company_id VARCHAR(80) PRIMARY KEY,
  environment VARCHAR(20),
  provider_mode VARCHAR(20),
  prefix VARCHAR(40),
  resolution VARCHAR(80),
  software_id VARCHAR(160),
  software_pin VARCHAR(160),
  certificate_name VARCHAR(160),
  certificate_password VARCHAR(160),
  api_url VARCHAR(300),
  test_set_id VARCHAR(160),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
`;

async function createCompanyDatabases() {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);

    // Obtener todas las empresas
    const [companies] = await connection.execute('SELECT id, nombre, db_name FROM empresas WHERE estado = "ACTIVA"');
    console.log(`Procesando ${companies.length} empresas...`);

    for (const company of companies) {
      const companyId = company.id;
      const dbName = company.db_name || `db_posfarma_${companyId}`;

      try {
        console.log(`\nProcesando empresa: ${company.nombre} (ID: ${companyId}, DB: ${dbName})`);

        // Crear la base de datos si no existe
        await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        console.log(`  ✓ Base de datos ${dbName} verificada/creada`);

        // Usar la base de datos
        await connection.execute(`USE \`${dbName}\``);

        // Ejecutar el schema
        const sqlStatements = COMPANY_SCHEMA.split(';').filter(s => s.trim());
        for (const stmt of sqlStatements) {
          if (stmt.trim()) {
            await connection.execute(stmt);
          }
        }
        console.log(`  ✓ Tablas creadas en ${dbName}`);

        // Volver a la BD principal
        await connection.execute('USE db_posfarma');

        // Actualizar la empresa con el nombre de la BD
        if (company.db_name !== dbName) {
          await connection.execute('UPDATE empresas SET db_name = ? WHERE id = ?', [dbName, companyId]);
          console.log(`  ✓ Empresa actualizada con db_name = ${dbName}`);
        }
      } catch (error) {
        console.error(`  ✗ Error procesando empresa ${company.nombre}:`, error.message);
      }
    }

    console.log('\n✓ Todas las bases de datos de empresa han sido procesadas');
  } catch (error) {
    console.error('Error fatal:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

createCompanyDatabases();
