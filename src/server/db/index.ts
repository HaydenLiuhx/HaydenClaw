import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLogger } from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _db: Database.Database | null = null;

/**
 * Initialize the SQLite database with WAL mode and schema.
 */
export function initDb(dbPath: string): Database.Database {
  const logger = getLogger();

  // Ensure directory exists
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Run schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  logger.info({ dbPath }, 'Database initialized');
  _db = db;
  return db;
}

/**
 * Get the database instance. Throws if not initialized.
 */
export function getDb(): Database.Database {
  if (!_db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return _db;
}

/**
 * Set the database instance (for testing).
 */
export function setDb(db: Database.Database): void {
  _db = db;
}

/**
 * Close the database connection.
 */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/**
 * Create an in-memory database with schema applied (for testing).
 */
export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  _db = db;
  return db;
}
