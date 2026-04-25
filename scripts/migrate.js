const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const databaseUrl = process.env.DATABASE_URL || './data/timeoff.db';
const resolved =
  databaseUrl === ':memory:'
    ? ':memory:'
    : path.isAbsolute(databaseUrl)
      ? databaseUrl
      : path.join(process.cwd(), databaseUrl);

if (resolved !== ':memory:') {
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const db = new Database(resolved);
const migrationFile = path.join(__dirname, '..', 'migrations', '001_initial.sql');
const sql = fs.readFileSync(migrationFile, 'utf8');
db.exec(sql);
db.close();
console.log('Migrations applied to', resolved);
