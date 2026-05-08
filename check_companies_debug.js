const mysql = require('mysql2/promise');
const fs = require('fs');

async function checkCompanies() {
  try {
    console.log('Conectando a la base de datos...');
    const config = JSON.parse(fs.readFileSync('db.config.json', 'utf8'));
    console.log('Configuración cargada');

    const connection = await mysql.createConnection(config);
    console.log('Conexión establecida');

    console.log('Verificando tabla empresas...');
    const [companies] = await connection.execute('SELECT id, nombre, db_name FROM empresas ORDER BY id');

    console.log('Empresas existentes:');
    companies.forEach(company => {
      console.log('ID:', company.id, 'Nombre:', company.nombre, 'DB:', company.db_name || 'SIN ASIGNAR');
    });

    await connection.end();
    console.log('Conexión cerrada');
  } catch (error) {
    console.error('Error completo:', error);
  }
}

checkCompanies();