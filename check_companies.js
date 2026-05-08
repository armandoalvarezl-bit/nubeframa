const mysql = require('mysql2/promise');
const fs = require('fs');

async function checkCompanies() {
  try {
    const config = JSON.parse(fs.readFileSync('db.config.json', 'utf8'));
    const connection = await mysql.createConnection(config);

    console.log('Empresas existentes:');
    const [companies] = await connection.execute('SELECT id, nombre, db_name FROM empresas ORDER BY id');

    companies.forEach(company => {
      console.log(`ID: ${company.id}, Nombre: ${company.nombre}, DB: ${company.db_name || 'SIN ASIGNAR'}`);
    });

    await connection.end();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkCompanies();