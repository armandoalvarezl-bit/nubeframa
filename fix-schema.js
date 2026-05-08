const mysql = require('mysql2/promise');

const dbConfig = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'admin',
  database: 'db_posfarma',
};

async function fixSchema() {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);

    console.log('Verificando si existe la columna db_name en empresas...');
    const [columns] = await connection.execute("SHOW COLUMNS FROM empresas LIKE 'db_name'");
    
    if (columns.length === 0) {
      console.log('Columna db_name no existe. Agregándola...');
      await connection.execute('ALTER TABLE empresas ADD COLUMN db_name VARCHAR(100) NULL AFTER estado');
      console.log('✓ Columna db_name agregada correctamente');
    } else {
      console.log('✓ Columna db_name ya existe');
    }

    // Verificar que hay al menos una empresa
    const [companies] = await connection.execute('SELECT COUNT(*) as total FROM empresas');
    const totalCompanies = companies[0]?.total || 0;
    console.log(`Total de empresas: ${totalCompanies}`);

    if (totalCompanies === 0) {
      console.log('Insertando empresa de prueba...');
      await connection.execute(
        'INSERT INTO empresas (nombre, nit, telefono, email, contacto, db_name, estado) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['Farmacia Prueba', '123456789', '555-1234', 'info@farmacia.test', 'Contacto', 'db_posfarma', 'ACTIVA']
      );
      console.log('✓ Empresa de prueba insertada');
    }

    // Verificar que usuarios existe y tiene registros
    const [users] = await connection.execute('SELECT COUNT(*) as total FROM usuarios');
    const totalUsers = users[0]?.total || 0;
    console.log(`Total de usuarios: ${totalUsers}`);

    if (totalUsers === 0) {
      console.log('Insertando usuarios de prueba...');
      const adminPassword = require('crypto').createHash('sha256').update('admin').digest('hex');
      await connection.execute(
        'INSERT INTO usuarios (nombre, username, password_hash, rol, activo) VALUES (?, ?, ?, ?, ?)',
        ['Administrador', 'admin', adminPassword, 'admin', 'SI']
      );
      await connection.execute(
        'INSERT INTO usuarios (nombre, username, password_hash, rol, activo) VALUES (?, ?, ?, ?, ?)',
        ['Operador', 'operador', adminPassword, 'operador', 'SI']
      );
      console.log('✓ Usuarios de prueba insertados');
    }

    console.log('\n✓ Schema corregido exitosamente');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

fixSchema();
