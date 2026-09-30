import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_PATH = resolve(process.cwd(), "server", "data", "quoteflow.sqlite");

mkdirSync(dirname(DB_PATH), { recursive: true });

export const database = new DatabaseSync(DB_PATH);
database.exec("PRAGMA foreign_keys = ON;");

database.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    password_hash TEXT NOT NULL DEFAULT '',
    password_salt TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS business_settings (
    user_id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS counters (
    user_id TEXT PRIMARY KEY,
    quotation_next INTEGER NOT NULL,
    invoice_next INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    company TEXT NOT NULL,
    address TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    last_used_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS catalog_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    unit_price REAL NOT NULL,
    discount REAL NOT NULL,
    tax REAL NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    number TEXT NOT NULL,
    client_key TEXT NOT NULL DEFAULT 'unassigned',
    status TEXT NOT NULL,
    currency TEXT NOT NULL,
    issue_date TEXT NOT NULL,
    valid_until TEXT,
    due_date TEXT,
    business_json TEXT NOT NULL,
    client_json TEXT NOT NULL,
    items_json TEXT NOT NULL,
    notes TEXT NOT NULL,
    terms TEXT NOT NULL,
    payment_method TEXT,
    amount_paid REAL NOT NULL,
    source_quotation_id TEXT,
    history_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizePhone(value) {
  const compact = normalizeText(value).replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  const digits = compact.replace(/^\+/, "");

  if (/^0[67]\d{8}$/.test(digits)) {
    return `+255${digits.slice(1)}`;
  }

  if (/^255[67]\d{8}$/.test(digits)) {
    return `+${digits}`;
  }

  if (/^[67]\d{8}$/.test(digits)) {
    return `+255${digits}`;
  }

  return compact;
}

function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function documentClientIdentityKey(client = {}) {
  const email = normalizeEmail(client.email);
  if (email) return `email:${email}`;

  const phone = normalizePhone(client.phone);
  if (phone) return `phone:${phone}`;

  const company = normalizeText(client.company).toLowerCase().replace(/\s+/g, " ");
  if (company) return `company:${company}`;

  const name = normalizeText(client.name).toLowerCase().replace(/\s+/g, " ");
  if (name) return `name:${name}`;

  const clientId = normalizeText(client.clientId).toLowerCase();
  if (clientId) return `id:${clientId}`;

  return "unassigned";
}

function documentClientKeyFromJson(value) {
  return documentClientIdentityKey(safeJsonParse(value, {}));
}

function documentIndexColumns(indexName) {
  return database.prepare(`PRAGMA index_info(${JSON.stringify(indexName)})`).all().map((column) => column.name);
}

function needsDocumentTableMigration(columns) {
  if (!columns.has("client_key")) {
    return true;
  }

  return database.prepare("PRAGMA index_list(documents)").all().some((index) => {
    if (!index.unique) return false;
    const indexColumns = documentIndexColumns(index.name);
    return indexColumns.length === 2 && indexColumns[0] === "user_id" && indexColumns[1] === "number";
  });
}

let documentColumns = new Set(
  database.prepare("PRAGMA table_info(documents)").all().map((column) => column.name),
);

if (needsDocumentTableMigration(documentColumns)) {
  const rows = database.prepare("SELECT * FROM documents").all();
  database.exec(`
    DROP TABLE IF EXISTS documents_migration_new;
    CREATE TABLE documents_migration_new (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      number TEXT NOT NULL,
      client_key TEXT NOT NULL DEFAULT 'unassigned',
      status TEXT NOT NULL,
      currency TEXT NOT NULL,
      issue_date TEXT NOT NULL,
      valid_until TEXT,
      due_date TEXT,
      business_json TEXT NOT NULL,
      client_json TEXT NOT NULL,
      items_json TEXT NOT NULL,
      notes TEXT NOT NULL,
      terms TEXT NOT NULL,
      payment_method TEXT,
      amount_paid REAL NOT NULL,
      source_quotation_id TEXT,
      history_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  const insertMigratedDocument = database.prepare(`
    INSERT INTO documents_migration_new (
      id, user_id, type, number, client_key, status, currency, issue_date, valid_until, due_date,
      business_json, client_json, items_json, notes, terms, payment_method, amount_paid,
      source_quotation_id, history_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  database.exec("BEGIN");
  try {
    for (const row of rows) {
      insertMigratedDocument.run(
        row.id,
        row.user_id,
        row.type,
        row.number,
        row.client_key || documentClientKeyFromJson(row.client_json),
        row.status,
        row.currency,
        row.issue_date,
        row.valid_until,
        row.due_date,
        row.business_json,
        row.client_json,
        row.items_json,
        row.notes,
        row.terms,
        row.payment_method,
        row.amount_paid,
        row.source_quotation_id,
        row.history_json,
        row.created_at,
        row.updated_at,
      );
    }

    database.exec(`
      DROP TABLE documents;
      ALTER TABLE documents_migration_new RENAME TO documents;
    `);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

database.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS documents_user_type_number_client_unique
  ON documents (user_id, type, number, client_key);
`);

const userColumns = new Set(
  database.prepare("PRAGMA table_info(users)").all().map((column) => column.name),
);

if (!userColumns.has("password_hash")) {
  database.exec("ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT '';");
}

if (!userColumns.has("password_salt")) {
  database.exec("ALTER TABLE users ADD COLUMN password_salt TEXT NOT NULL DEFAULT '';");
}
