import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

/**
 * @param {string} databaseUrl
 * @param {{ runMigrations?: boolean }} [options]
 */
export function openDatabase(databaseUrl, options = {}) {
  let db;
  if (databaseUrl === ':memory:') {
    db = new Database(':memory:');
  } else {
    const resolved = path.isAbsolute(databaseUrl)
      ? databaseUrl
      : path.join(process.cwd(), databaseUrl);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(resolved);
  }
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  if (options.runMigrations !== false) {
    const migrationFile = path.join(process.cwd(), 'migrations', '001_initial.sql');
    if (fs.existsSync(migrationFile)) {
      const sql = fs.readFileSync(migrationFile, 'utf8');
      db.exec(sql);
    }
  }
  return db;
}
