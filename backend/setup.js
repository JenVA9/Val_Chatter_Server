#!/usr/bin/env node
/**
 * Val Tactics — First-time setup script
 * Run once:  node setup.js
 */
const readline = require('readline');
const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question, defaultVal = '') {
  return new Promise(resolve => {
    const hint = defaultVal ? ` [${defaultVal}]` : '';
    rl.question(`${question}${hint}: `, answer => {
      resolve(answer.trim() || defaultVal);
    });
  });
}

function askSecret(question) {
  return new Promise(resolve => {
    process.stdout.write(`${question}: `);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      let secret = '';
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      function onData(ch) {
        if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode(false);
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(secret);
        } else if (ch === '') {
          process.exit();
        } else if (ch === '') {
          secret = secret.slice(0, -1);
        } else {
          secret += ch;
          process.stdout.write('*');
        }
      }
      process.stdin.on('data', onData);
    } else {
      rl.question('', answer => resolve(answer.trim()));
    }
  });
}

function commandExists(cmd) {
  try { execSync(`which ${cmd}`, { stdio: 'pipe' }); return true; } catch { return false; }
}

async function main() {
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║      Val Tactics — Setup Wizard       ║');
  console.log('╚═══════════════════════════════════════╝\n');

  // ── Check / install MySQL ──────────────────────────────────────────────
  if (!commandExists('mysql')) {
    console.log('MySQL not found.');
    const install = await ask('Install MySQL Server via apt? (y/n)', 'y');
    if (install.toLowerCase() === 'y') {
      console.log('Installing MySQL...');
      execSync('sudo apt-get update -qq && sudo apt-get install -y mysql-server', { stdio: 'inherit' });
      execSync('sudo service mysql start', { stdio: 'inherit' });
      console.log('MySQL installed and started.\n');
    } else {
      console.log('Install MySQL manually, then re-run setup.js.');
      process.exit(1);
    }
  }

  // ── Database config ────────────────────────────────────────────────────
  console.log('── Database Setup ──────────────────────\n');
  const dbHost     = await ask('DB host',             'localhost');
  const dbRootUser = await ask('MySQL admin user (for setup only)', 'root');
  const dbRootPass = await askSecret('MySQL admin password (blank if using sudo)');
  const dbUser     = await ask('App DB username',     'valtactics');
  const dbPass     = await askSecret('App DB password');
  const dbName     = await ask('Database name',       'val_tactics');

  // ── App config ─────────────────────────────────────────────────────────
  console.log('\n── Server Config ───────────────────────\n');
  const port = await ask('Server port', '3000');
  const jwtInput = await ask('JWT secret (Enter to auto-generate)', '');
  const jwtSecret = jwtInput || crypto.randomBytes(48).toString('hex');
  if (!jwtInput) console.log(`  Generated JWT secret: ${jwtSecret}`);

  // ── Create DB + user via mysql2 (avoids shell quoting issues) ──────────
  console.log('\nCreating database and user...');
  const bcrypt = require('bcryptjs');
  const mysql2 = require('mysql2/promise');

  let rootConn;
  try {
    rootConn = await mysql2.createConnection({
      host: dbHost, user: dbRootUser,
      password: dbRootPass || undefined,
    });
  } catch {
    // Root may use auth_socket — try unix socket (works when run as root/sudo)
    rootConn = await mysql2.createConnection({
      socketPath: '/var/run/mysqld/mysqld.sock',
      user: dbRootUser,
    });
  }
  await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  // CREATE USER IF NOT EXISTS is MySQL 5.7.7+; fall back gracefully if user exists
  try {
    await rootConn.query(
      `CREATE USER '${dbUser}'@'localhost' IDENTIFIED BY ?`, [dbPass]
    );
  } catch (e) {
    if (e.code !== 'ER_CANNOT_USER') throw e; // 'user already exists' is fine
    await rootConn.query(
      `ALTER USER '${dbUser}'@'localhost' IDENTIFIED BY ?`, [dbPass]
    );
  }
  await rootConn.query(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'localhost'`);
  await rootConn.query('FLUSH PRIVILEGES');
  await rootConn.end();
  console.log('Database and user created.');

  // ── Open app DB connection + apply schema ──────────────────────────────
  console.log('Applying schema...');
  const conn = await mysql2.createConnection({
    host: dbHost, user: dbUser, password: dbPass, database: dbName,
    multipleStatements: false,
  });

  const schemaPath = path.join(__dirname, 'src', 'db', 'schema.sql');
  const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
  const statements = schemaSQL
    .split(';')
    .map(s =>
      s.split('\n')
       .filter(line => !line.trim().startsWith('--'))
       .join('\n')
       .trim()
    )
    .filter(s => s.length > 0);
  // Dedup existing data before applying unique key constraint
  await conn.query(`UPDATE nodes SET parent_key = COALESCE(parent_id, 0)`).catch(() => {});
  await conn.query(`DELETE n1 FROM nodes n1 JOIN nodes n2 ON n1.type=n2.type AND n1.name=n2.name AND n1.parent_key=n2.parent_key AND n1.id>n2.id`).catch(() => {});

  for (const stmt of statements) {
    try {
      await conn.query(stmt);
    } catch (err) {
      // 1060 = Duplicate column, 1061 = Duplicate key name,
      // 1062 = Duplicate entry (adding UNIQUE KEY to table with existing dupes — already deduped above but catch anyway),
      // 1348 = Column not updatable (generated column from old schema)
      if (![1060, 1061, 1062, 1348].includes(err.errno)) throw err;
    }
  }
  console.log('Schema applied.');

  // ── Admin account ──────────────────────────────────────────────────────
  console.log('\n── Admin Account ───────────────────────\n');
  const adminUser = await ask('Admin username', 'admin');
  const adminPass = await askSecret('Admin password');
  const adminHash = await bcrypt.hash(adminPass, 12);

  await conn.execute(
    `INSERT INTO users (username, password_hash, is_admin)
     VALUES (?, ?, TRUE)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), is_admin = TRUE`,
    [adminUser, adminHash]
  );

  // ── Guest user ─────────────────────────────────────────────────────────
  const guestChoice = await ask('\nEnable guest login? (guest/guest, view-only)', 'y');
  if (guestChoice.toLowerCase() === 'y') {
    const guestHash = await bcrypt.hash('guest', 12);
    await conn.execute(
      `INSERT IGNORE INTO users (username, password_hash, is_guest)
       VALUES ('guest', ?, TRUE)`,
      [guestHash]
    );
    await conn.execute(`INSERT INTO server_config (\`key\`, \`value\`) VALUES ('guest_enabled', 'true')
      ON DUPLICATE KEY UPDATE \`value\` = 'true'`);
    console.log('  Guest user enabled.');
  } else {
    await conn.execute(`INSERT INTO server_config (\`key\`, \`value\`) VALUES ('guest_enabled', 'false')
      ON DUPLICATE KEY UPDATE \`value\` = 'false'`);
  }

  await conn.end();

  // ── Write .env ─────────────────────────────────────────────────────────
  const envPath = path.join(__dirname, '.env');
  const envContent = `DB_HOST=${dbHost}
DB_USER=${dbUser}
DB_PASS=${dbPass}
DB_NAME=${dbName}
JWT_SECRET=${jwtSecret}
PORT=${port}
`;
  fs.writeFileSync(envPath, envContent);
  console.log(`\n.env written to ${envPath}`);

  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║         Setup complete!               ║');
  console.log(`║  Start the server:  node server.js    ║`);
  console.log('╚═══════════════════════════════════════╝\n');

  rl.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
