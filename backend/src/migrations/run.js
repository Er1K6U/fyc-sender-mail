require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function ejecutarMigraciones() {
  console.log('🚀 Iniciando migraciones...');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    multipleStatements: true,
  });

  try {
    // Crear base de datos si no existe
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'emailbuilder'}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await conn.query(`USE \`${process.env.DB_NAME || 'emailbuilder'}\``);
    console.log(`✅ Base de datos '${process.env.DB_NAME}' lista`);

    // Ejecutar migraciones SQL en orden (todos los .sql del directorio)
    const archivosSql = fs
      .readdirSync(__dirname)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const archivo of archivosSql) {
      const sql = fs.readFileSync(path.join(__dirname, archivo), 'utf8');
      await conn.query(sql);
      console.log(`✅ Migración aplicada: ${archivo}`);
    }

    // Crear usuario administrador inicial si no existe
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminName = process.env.ADMIN_NAME || 'Administrador';

    if (adminEmail && adminPassword) {
      const [existentes] = await conn.query(
        'SELECT id FROM users WHERE email = ?',
        [adminEmail]
      );

      if (existentes.length === 0) {
        const hash = await bcrypt.hash(adminPassword, 12);
        await conn.query(
          'INSERT INTO users (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)',
          [adminName, adminEmail, hash, 'admin']
        );
        console.log(`✅ Usuario admin creado: ${adminEmail}`);
      } else {
        console.log(`ℹ️  Usuario admin ya existe: ${adminEmail}`);
      }
    }

    console.log('\n🎉 Migraciones completadas exitosamente');
  } finally {
    await conn.end();
  }
}

ejecutarMigraciones().catch((err) => {
  console.error('❌ Error en migración:', err);
  process.exit(1);
});
