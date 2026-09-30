import { createHmac, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { URL } from "node:url";
import { database } from "./db.js";

const API_PORT = Number(process.env.QUOTEFLOW_API_PORT || 8787);
const TOKEN_SECRET = process.env.QUOTEFLOW_TOKEN_SECRET;
if (process.env.NODE_ENV === "production" && !TOKEN_SECRET) {
  throw new Error("QUOTEFLOW_TOKEN_SECRET must be set in production.");
}
const AUTH_TOKEN_SECRET = TOKEN_SECRET || "quoteflow-dev-secret";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;

const DEFAULT_BUSINESS_PROFILE = {
  name: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  logoDataUrl: "",
  signatureDataUrl: "",
  stampLabel: "",
  bankDetails: "",
  accentColor: "#DD8201",
  showTax: false,
  showDiscount: false,
  defaultTaxRate: 18,
  defaultDiscountRate: 0,
  showClientDetails: true,
  showNotes: true,
  showTerms: true,
  defaultNotes: "",
  defaultTerms: "",
};

const statements = {
  getUserByEmail: database.prepare(`
    SELECT id, name, email, phone, password_hash, password_salt, created_at, updated_at
    FROM users
    WHERE lower(email) = lower(?)
  `),
  getUserById: database.prepare(`
    SELECT id, name, email, phone, created_at, updated_at
    FROM users
    WHERE id = ?
  `),
  insertUser: database.prepare(`
    INSERT INTO users (id, name, email, phone, password_hash, password_salt, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  insertBusinessSettings: database.prepare(`
    INSERT INTO business_settings (user_id, data, updated_at)
    VALUES (?, ?, ?)
  `),
  upsertBusinessSettings: database.prepare(`
    INSERT INTO business_settings (user_id, data, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `),
  getBusinessSettings: database.prepare(`
    SELECT data
    FROM business_settings
    WHERE user_id = ?
  `),
  insertCounters: database.prepare(`
    INSERT INTO counters (user_id, quotation_next, invoice_next, updated_at)
    VALUES (?, 1, 1, ?)
  `),
  getCounters: database.prepare(`
    SELECT quotation_next, invoice_next
    FROM counters
    WHERE user_id = ?
  `),
  updateCounter: database.prepare(`
    UPDATE counters
    SET quotation_next = ?,
        invoice_next = ?,
        updated_at = ?
    WHERE user_id = ?
  `),
  listClients: database.prepare(`
    SELECT id, name, company, address, phone, email, last_used_at
    FROM clients
    WHERE user_id = ?
    ORDER BY datetime(last_used_at) DESC
  `),
  listCatalog: database.prepare(`
    SELECT id, name, description, unit_price, discount, tax, updated_at
    FROM catalog_items
    WHERE user_id = ?
    ORDER BY datetime(updated_at) DESC
  `),
  listDocuments: database.prepare(`
    SELECT *
    FROM documents
    WHERE user_id = ?
    ORDER BY datetime(updated_at) DESC
  `),
  getDocument: database.prepare(`
    SELECT *
    FROM documents
    WHERE id = ? AND user_id = ?
  `),
  insertDocument: database.prepare(`
    INSERT INTO documents (
      id, user_id, type, number, client_key, status, currency, issue_date, valid_until, due_date,
      business_json, client_json, items_json, notes, terms, payment_method, amount_paid,
      source_quotation_id, history_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateDocument: database.prepare(`
    UPDATE documents
    SET number = ?,
        client_key = ?,
        status = ?,
        currency = ?,
        issue_date = ?,
        valid_until = ?,
        due_date = ?,
        business_json = ?,
        client_json = ?,
        items_json = ?,
        notes = ?,
        terms = ?,
        payment_method = ?,
        amount_paid = ?,
        source_quotation_id = ?,
        history_json = ?,
        updated_at = ?
    WHERE id = ? AND user_id = ?
  `),
  findDocumentByNumber: database.prepare(`
    SELECT *
    FROM documents
    WHERE user_id = ?
      AND type = ?
      AND lower(number) = lower(?)
      AND client_key = ?
      AND (? IS NULL OR id != ?)
    LIMIT 1
  `),
  listDocumentNumbersForClient: database.prepare(`
    SELECT number
    FROM documents
    WHERE user_id = ?
      AND type = ?
      AND client_key = ?
  `),
  deleteDocument: database.prepare(`
    DELETE FROM documents
    WHERE id = ? AND user_id = ?
  `),
  findClientMatch: database.prepare(`
    SELECT id
    FROM clients
    WHERE user_id = ?
      AND (
        (? != '' AND email != '' AND lower(email) = lower(?))
        OR lower(name || '|' || company) = lower(?)
      )
    LIMIT 1
  `),
  insertClient: database.prepare(`
    INSERT INTO clients (
      id, user_id, name, company, address, phone, email, last_used_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateClient: database.prepare(`
    UPDATE clients
    SET name = ?,
        company = ?,
        address = ?,
        phone = ?,
        email = ?,
        last_used_at = ?,
        updated_at = ?
    WHERE id = ? AND user_id = ?
  `),
  findCatalogMatch: database.prepare(`
    SELECT id
    FROM catalog_items
    WHERE user_id = ?
      AND lower(name) = lower(?)
    LIMIT 1
  `),
  insertCatalogItem: database.prepare(`
    INSERT INTO catalog_items (
      id, user_id, name, description, unit_price, discount, tax, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateCatalogItem: database.prepare(`
    UPDATE catalog_items
    SET description = ?,
        unit_price = ?,
        discount = ?,
        tax = ?,
        updated_at = ?
    WHERE id = ? AND user_id = ?
  `),
};

function json(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  });
  response.end(JSON.stringify(payload));
}

function error(response, status, message) {
  json(response, status, { error: message });
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function buildToken(userId) {
  const payload = {
    userId,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", AUTH_TOKEN_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function readToken(request) {
  const header = request.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

function verifyToken(token) {
  if (!token) {
    return null;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expected = createHmac("sha256", AUTH_TOKEN_SECRET).update(payload).digest("base64url");
  if (expected !== signature) {
    return null;
  }

  const decoded = safeJsonParse(Buffer.from(payload, "base64url").toString("utf8"), null);
  if (!decoded?.userId || !decoded?.exp || decoded.exp < Date.now()) {
    return null;
  }

  return decoded;
}

function requireUser(request, response) {
  const session = verifyToken(readToken(request));
  if (!session) {
    error(response, 401, "Authentication required.");
    return null;
  }

  const user = statements.getUserById.get(session.userId);
  if (!user) {
    error(response, 401, "Session is no longer valid.");
    return null;
  }

  return user;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePassword(value) {
  return typeof value === "string" ? value : "";
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  if (!password || !salt || !expectedHash) {
    return false;
  }

  const { hash } = hashPassword(password, salt);
  const actual = Buffer.from(hash, "hex");
  const expected = Buffer.from(expectedHash, "hex");

  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}

function nowIso() {
  return new Date().toISOString();
}

function todayIso() {
  return dateToLocalIso(new Date());
}

function addDaysIso(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateToLocalIso(date);
}

function dateToLocalIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDocumentNumber(type, nextValue) {
  const prefix = type === "quotation" ? "QT" : "INV";
  return `${prefix}-${new Date().getFullYear()}-${String(nextValue).padStart(4, "0")}`;
}

function extractTrailingNumber(value) {
  const match = normalizeText(value).match(/-(\d+)$/);
  return match ? Number(match[1]) : 0;
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

function documentClientIdentityKey(client = {}) {
  const email = normalizeText(client.email).toLowerCase();
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

function documentNumberMatch(userId, type, number, client = {}, ignoredDocumentId = null) {
  return statements.findDocumentByNumber.get(
    userId,
    type,
    normalizeText(number),
    documentClientIdentityKey(client),
    ignoredDocumentId,
    ignoredDocumentId,
  );
}

function advanceCounterFromNumber(userId, type, number, timestamp) {
  const counters = statements.getCounters.get(userId) || { quotation_next: 1, invoice_next: 1 };
  const next = extractTrailingNumber(number) + 1;
  if (next <= 1) {
    return;
  }

  const quotationNext =
    type === "quotation" ? Math.max(Number(counters.quotation_next || 1), next) : counters.quotation_next;
  const invoiceNext =
    type === "invoice" ? Math.max(Number(counters.invoice_next || 1), next) : counters.invoice_next;
  statements.updateCounter.run(quotationNext, invoiceNext, timestamp, userId);
}

function reserveDocumentNumber(userId, type, timestamp, client = {}) {
  const counters = statements.getCounters.get(userId) || { quotation_next: 1, invoice_next: 1 };
  const clientKey = documentClientIdentityKey(client);
  let nextValue = statements.listDocumentNumbersForClient
    .all(userId, type, clientKey)
    .reduce((highest, document) => Math.max(highest, extractTrailingNumber(document.number) + 1), 1);
  let number = buildDocumentNumber(type, nextValue);

  while (documentNumberMatch(userId, type, number, client)) {
    nextValue += 1;
    number = buildDocumentNumber(type, nextValue);
  }

  if (type === "quotation") {
    statements.updateCounter.run(Math.max(counters.quotation_next, nextValue + 1), counters.invoice_next, timestamp, userId);
  } else {
    statements.updateCounter.run(counters.quotation_next, Math.max(counters.invoice_next, nextValue + 1), timestamp, userId);
  }

  return number;
}

function defaultStatusForType(type) {
  return type === "quotation" ? "draft" : "unpaid";
}

function createHistoryEntry(action, detail) {
  return {
    id: `history-${randomUUID()}`,
    action,
    detail,
    timestamp: nowIso(),
  };
}

function createEmptyItem(defaults = {}) {
  return {
    id: `item-${randomUUID()}`,
    name: "",
    description: "",
    quantity: 1,
    unitPrice: 0,
    discount: defaults.discount ?? 0,
    tax: defaults.tax ?? 0,
  };
}

function createDocumentDraft(type, number, business) {
  return {
    id: `${type}-${randomUUID()}`,
    type,
    number,
    status: defaultStatusForType(type),
    currency: "TZS",
    issueDate: todayIso(),
    validUntil: type === "quotation" ? addDaysIso(14) : undefined,
    dueDate: type === "invoice" ? addDaysIso(14) : undefined,
    business,
    client: { name: "", company: "", address: "", phone: "", email: "" },
    items: [
      createEmptyItem({
        discount: business.showDiscount ? business.defaultDiscountRate : 0,
        tax: business.showTax ? business.defaultTaxRate : 0,
      }),
    ],
    notes: business.defaultNotes || "",
    terms: business.defaultTerms || "",
    paymentMethod: undefined,
    amountPaid: 0,
    history: [createHistoryEntry("Draft created", `Started ${type} ${number}`)],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function normalizeBusinessProfile(payload = {}) {
  return {
    ...DEFAULT_BUSINESS_PROFILE,
    ...payload,
    name: normalizeText(payload.name),
    address: normalizeText(payload.address),
    phone: normalizeText(payload.phone),
    email: normalizeText(payload.email),
    website: normalizeText(payload.website),
    logoDataUrl: normalizeText(payload.logoDataUrl),
    signatureDataUrl: normalizeText(payload.signatureDataUrl),
    stampLabel: normalizeText(payload.stampLabel),
    bankDetails: normalizeText(payload.bankDetails),
    accentColor: normalizeText(payload.accentColor) || DEFAULT_BUSINESS_PROFILE.accentColor,
    defaultNotes: normalizeText(payload.defaultNotes),
    defaultTerms: normalizeText(payload.defaultTerms),
    showTax: Boolean(payload.showTax),
    showDiscount: Boolean(payload.showDiscount),
    defaultTaxRate: Number.isFinite(Number(payload.defaultTaxRate))
      ? Number(payload.defaultTaxRate)
      : DEFAULT_BUSINESS_PROFILE.defaultTaxRate,
    defaultDiscountRate: Number.isFinite(Number(payload.defaultDiscountRate))
      ? Number(payload.defaultDiscountRate)
      : DEFAULT_BUSINESS_PROFILE.defaultDiscountRate,
    showClientDetails: payload.showClientDetails ?? DEFAULT_BUSINESS_PROFILE.showClientDetails,
    showNotes: payload.showNotes ?? DEFAULT_BUSINESS_PROFILE.showNotes,
    showTerms: payload.showTerms ?? DEFAULT_BUSINESS_PROFILE.showTerms,
  };
}

function parseDocumentRow(row) {
  return {
    id: row.id,
    type: row.type,
    number: row.number,
    status: row.status,
    currency: row.currency,
    issueDate: row.issue_date,
    validUntil: row.valid_until || undefined,
    dueDate: row.due_date || undefined,
    business: safeJsonParse(row.business_json, DEFAULT_BUSINESS_PROFILE),
    client: safeJsonParse(row.client_json, {
      name: "",
      company: "",
      address: "",
      phone: "",
      email: "",
    }),
    items: safeJsonParse(row.items_json, []),
    notes: row.notes,
    terms: row.terms,
    paymentMethod: row.payment_method || undefined,
    amountPaid: Number(row.amount_paid || 0),
    sourceQuotationId: row.source_quotation_id || undefined,
    history: safeJsonParse(row.history_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseClientRow(row) {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    address: row.address,
    phone: row.phone,
    email: row.email,
    lastUsedAt: row.last_used_at,
  };
}

function parseCatalogRow(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    unitPrice: Number(row.unit_price || 0),
    discount: Number(row.discount || 0),
    tax: Number(row.tax || 0),
    updatedAt: row.updated_at,
  };
}

function publicUserFromRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
  };
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (bodyError) {
        reject(bodyError);
      }
    });
    request.on("error", reject);
  });
}

function getBootstrapData(userId) {
  const businessRow = statements.getBusinessSettings.get(userId);
  const counters = statements.getCounters.get(userId) || { quotation_next: 1, invoice_next: 1 };
  return {
    businessProfile: normalizeBusinessProfile(
      safeJsonParse(businessRow?.data ?? "{}", DEFAULT_BUSINESS_PROFILE),
    ),
    clients: statements.listClients.all(userId).map(parseClientRow),
    catalog: statements.listCatalog.all(userId).map(parseCatalogRow),
    documents: statements.listDocuments.all(userId).map(parseDocumentRow),
    nextNumbers: {
      quotation: Number(counters.quotation_next || 1),
      invoice: Number(counters.invoice_next || 1),
    },
  };
}

function syncClient(userId, client) {
  if (!normalizeText(client?.name) && !normalizeText(client?.company)) {
    return;
  }

  const timestamp = nowIso();
  const normalized = {
    name: normalizeText(client.name),
    company: normalizeText(client.company),
    address: normalizeText(client.address),
    phone: normalizeText(client.phone),
    email: normalizeText(client.email),
  };

  const existing = statements.findClientMatch.get(
    userId,
    normalized.email,
    normalized.email,
    `${normalized.name}|${normalized.company}`,
  );

  if (existing?.id) {
    statements.updateClient.run(
      normalized.name,
      normalized.company,
      normalized.address,
      normalized.phone,
      normalized.email,
      timestamp,
      timestamp,
      existing.id,
      userId,
    );
    return;
  }

  statements.insertClient.run(
    `client-${randomUUID()}`,
    userId,
    normalized.name,
    normalized.company,
    normalized.address,
    normalized.phone,
    normalized.email,
    timestamp,
    timestamp,
    timestamp,
  );
}

function syncCatalog(userId, items) {
  const timestamp = nowIso();
  for (const item of items ?? []) {
    const name = normalizeText(item?.name);
    if (!name) {
      continue;
    }

    const existing = statements.findCatalogMatch.get(userId, name);
    if (existing?.id) {
      statements.updateCatalogItem.run(
        normalizeText(item.description),
        Number(item.unitPrice || 0),
        Number(item.discount || 0),
        Number(item.tax || 0),
        timestamp,
        existing.id,
        userId,
      );
      continue;
    }

    statements.insertCatalogItem.run(
      `catalog-${randomUUID()}`,
      userId,
      name,
      normalizeText(item.description),
      Number(item.unitPrice || 0),
      Number(item.discount || 0),
      Number(item.tax || 0),
      timestamp,
      timestamp,
    );
  }
}

function withTransaction(callback) {
  return (...args) => {
    database.exec("BEGIN");
    try {
      const result = callback(...args);
      database.exec("COMMIT");
      return result;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  };
}

const saveDocumentTransaction = withTransaction((userId, payload, existingDocumentId) => {
  const timestamp = nowIso();
  const currentBusiness = getBootstrapData(userId).businessProfile;
  const existing = existingDocumentId ? statements.getDocument.get(existingDocumentId, userId) : null;
  const replaceExistingNumber = Boolean(payload.saveOptions?.replaceExistingNumber);
  const business = normalizeBusinessProfile(payload.business ?? currentBusiness);
  const client = {
    clientId: normalizeText(payload.client?.clientId) || undefined,
    name: normalizeText(payload.client?.name),
    company: normalizeText(payload.client?.company),
    address: normalizeText(payload.client?.address),
    phone: normalizeText(payload.client?.phone),
    email: normalizeText(payload.client?.email),
  };
  const items = Array.isArray(payload.items)
    ? payload.items.map((item) => ({
        id: normalizeText(item.id) || `item-${randomUUID()}`,
        name: normalizeText(item.name),
        description: normalizeText(item.description),
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unitPrice || 0),
        discount: Number(item.discount || 0),
        tax: Number(item.tax || 0),
      }))
    : [];
  const incomingHistory = Array.isArray(payload.history) && payload.history.length > 0
    ? payload.history
    : [createHistoryEntry(existing ? "Updated" : "Saved", `${payload.type} saved`)];

  if (existing) {
    const type = existing.type;
    const finalNumber = normalizeText(payload.number) || existing.number;
    const conflictingDocument = documentNumberMatch(userId, type, finalNumber, client, existing.id);
    if (conflictingDocument && !replaceExistingNumber) {
      const conflictError = new Error(`${finalNumber} is already used by another ${type}.`);
      conflictError.status = 409;
      throw conflictError;
    }

    if (conflictingDocument) {
      statements.deleteDocument.run(conflictingDocument.id, userId);
    }
    advanceCounterFromNumber(userId, type, finalNumber, timestamp);

    const history = [
      ...incomingHistory,
      createHistoryEntry(
        conflictingDocument ? "Replaced" : "Updated",
        conflictingDocument
          ? `${type === "quotation" ? "Quotation" : "Invoice"} replaced existing ${finalNumber} record`
          : `${type === "quotation" ? "Quotation" : "Invoice"} saved in records`,
      ),
    ];

    statements.updateDocument.run(
      finalNumber,
      documentClientIdentityKey(client),
      normalizeText(payload.status) || existing.status,
      normalizeText(payload.currency) || existing.currency,
      normalizeText(payload.issueDate) || existing.issue_date,
      normalizeText(payload.validUntil) || null,
      normalizeText(payload.dueDate) || null,
      JSON.stringify(business),
      JSON.stringify(client),
      JSON.stringify(items),
      normalizeText(payload.notes),
      normalizeText(payload.terms),
      normalizeText(payload.paymentMethod) || null,
      Number(payload.amountPaid || 0),
      normalizeText(payload.sourceQuotationId) || null,
      JSON.stringify(history),
      timestamp,
      existing.id,
      userId,
    );

    syncClient(userId, client);
    syncCatalog(userId, items);
    return parseDocumentRow(statements.getDocument.get(existing.id, userId));
  }

  const type = payload.type === "invoice" ? "invoice" : "quotation";
  const manualNumber = Boolean(payload.saveOptions?.manualNumber);
  let finalNumber = manualNumber ? normalizeText(payload.number) : reserveDocumentNumber(userId, type, timestamp, client);
  let conflictingDocument = null;

  if (manualNumber) {
    if (!finalNumber) {
      const numberError = new Error("Document number cannot be empty.");
      numberError.status = 400;
      throw numberError;
    }

    conflictingDocument = documentNumberMatch(userId, type, finalNumber, client);
    if (conflictingDocument && !replaceExistingNumber) {
      const conflictError = new Error(`${finalNumber} is already used by another ${type}.`);
      conflictError.status = 409;
      throw conflictError;
    }

    if (conflictingDocument) {
      statements.deleteDocument.run(conflictingDocument.id, userId);
    }
    advanceCounterFromNumber(userId, type, finalNumber, timestamp);
  }

  const history = [
    ...incomingHistory,
    createHistoryEntry(
      conflictingDocument ? "Replaced" : "Saved",
      conflictingDocument
        ? `${type === "quotation" ? "Quotation" : "Invoice"} replaced existing ${finalNumber} record`
        : `${type === "quotation" ? "Quotation" : "Invoice"} saved in records`,
    ),
  ];

  const document = {
    id: normalizeText(payload.id) || `${type}-${randomUUID()}`,
    type,
    number: finalNumber,
    status: normalizeText(payload.status) || defaultStatusForType(type),
    currency: normalizeText(payload.currency) || "TZS",
    issueDate: normalizeText(payload.issueDate) || todayIso(),
    validUntil: normalizeText(payload.validUntil) || null,
    dueDate: normalizeText(payload.dueDate) || null,
    business,
    client,
    items,
    notes: normalizeText(payload.notes),
    terms: normalizeText(payload.terms),
    paymentMethod: normalizeText(payload.paymentMethod) || null,
    amountPaid: Number(payload.amountPaid || 0),
    sourceQuotationId: normalizeText(payload.sourceQuotationId) || null,
    history,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  statements.insertDocument.run(
    document.id,
    userId,
    document.type,
    document.number,
    documentClientIdentityKey(document.client),
    document.status,
    document.currency,
    document.issueDate,
    document.validUntil,
    document.dueDate,
    JSON.stringify(document.business),
    JSON.stringify(document.client),
    JSON.stringify(document.items),
    document.notes,
    document.terms,
    document.paymentMethod,
    document.amountPaid,
    document.sourceQuotationId,
    JSON.stringify(document.history),
    document.createdAt,
    document.updatedAt,
  );

  syncClient(userId, client);
  syncCatalog(userId, items);
  return parseDocumentRow(statements.getDocument.get(document.id, userId));
});

const duplicateDocumentTransaction = withTransaction((userId, documentId) => {
  const sourceRow = statements.getDocument.get(documentId, userId);
  if (!sourceRow) {
    return null;
  }

  const source = parseDocumentRow(sourceRow);
  const timestamp = nowIso();
  const duplicate = {
    ...source,
    id: `${source.type}-${randomUUID()}`,
    number: reserveDocumentNumber(userId, source.type, timestamp, source.client),
    items: source.items.map((item) => ({ ...item, id: `item-${randomUUID()}` })),
    amountPaid: 0,
    history: [createHistoryEntry("Duplicated", `Created from ${source.number}`)],
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  statements.insertDocument.run(
    duplicate.id,
    userId,
    duplicate.type,
    duplicate.number,
    documentClientIdentityKey(duplicate.client),
    duplicate.status,
    duplicate.currency,
    duplicate.issueDate,
    duplicate.validUntil || null,
    duplicate.dueDate || null,
    JSON.stringify(duplicate.business),
    JSON.stringify(duplicate.client),
    JSON.stringify(duplicate.items),
    duplicate.notes,
    duplicate.terms,
    duplicate.paymentMethod || null,
    duplicate.amountPaid,
    duplicate.sourceQuotationId || null,
    JSON.stringify(duplicate.history),
    duplicate.createdAt,
    duplicate.updatedAt,
  );

  syncClient(userId, duplicate.client);
  syncCatalog(userId, duplicate.items);
  return duplicate;
});

const convertDocumentTransaction = withTransaction((userId, quotationId) => {
  const quotationRow = statements.getDocument.get(quotationId, userId);
  if (!quotationRow) {
    return null;
  }

  const quotation = parseDocumentRow(quotationRow);
  if (quotation.type !== "quotation") {
    return null;
  }

  const timestamp = nowIso();
  const invoice = createDocumentDraft(
    "invoice",
    reserveDocumentNumber(userId, "invoice", timestamp, quotation.client),
    quotation.business,
  );

  invoice.client = structuredClone(quotation.client);
  invoice.currency = quotation.currency;
  invoice.items = quotation.items.map((item) => ({ ...item, id: `item-${randomUUID()}` }));
  invoice.notes = quotation.notes;
  invoice.terms = quotation.terms;
  invoice.sourceQuotationId = quotation.id;
  invoice.history = [createHistoryEntry("Converted", `Created from quotation ${quotation.number}`)];
  invoice.createdAt = timestamp;
  invoice.updatedAt = timestamp;

  statements.insertDocument.run(
    invoice.id,
    userId,
    invoice.type,
    invoice.number,
    documentClientIdentityKey(invoice.client),
    invoice.status,
    invoice.currency,
    invoice.issueDate,
    invoice.validUntil || null,
    invoice.dueDate || null,
    JSON.stringify(invoice.business),
    JSON.stringify(invoice.client),
    JSON.stringify(invoice.items),
    invoice.notes,
    invoice.terms,
    invoice.paymentMethod || null,
    invoice.amountPaid,
    invoice.sourceQuotationId || null,
    JSON.stringify(invoice.history),
    invoice.createdAt,
    invoice.updatedAt,
  );

  const quotationHistory = [
    ...quotation.history,
    createHistoryEntry("Converted", `Converted to invoice ${invoice.number}`),
  ];

  statements.updateDocument.run(
    quotation.number,
    documentClientIdentityKey(quotation.client),
    quotation.status,
    quotation.currency,
    quotation.issueDate,
    quotation.validUntil || null,
    quotation.dueDate || null,
    JSON.stringify(quotation.business),
    JSON.stringify(quotation.client),
    JSON.stringify(quotation.items),
    quotation.notes,
    quotation.terms,
    quotation.paymentMethod || null,
    quotation.amountPaid,
    quotation.sourceQuotationId || null,
    JSON.stringify(quotationHistory),
    timestamp,
    quotation.id,
    userId,
  );

  syncClient(userId, invoice.client);
  syncCatalog(userId, invoice.items);
  return invoice;
});

const markSharedTransaction = withTransaction((userId, documentId, via) => {
  const row = statements.getDocument.get(documentId, userId);
  if (!row) {
    return null;
  }

  const document = parseDocumentRow(row);
  document.history = [
    ...document.history,
    createHistoryEntry(
      via === "pdf" ? "PDF downloaded" : "WhatsApp prepared",
      via === "pdf"
        ? `Generated PDF for ${document.number}`
        : `Prepared WhatsApp share flow for ${document.number}`,
    ),
  ];
  document.updatedAt = nowIso();

  statements.updateDocument.run(
    document.number,
    documentClientIdentityKey(document.client),
    document.status,
    document.currency,
    document.issueDate,
    document.validUntil || null,
    document.dueDate || null,
    JSON.stringify(document.business),
    JSON.stringify(document.client),
    JSON.stringify(document.items),
    document.notes,
    document.terms,
    document.paymentMethod || null,
    document.amountPaid,
    document.sourceQuotationId || null,
    JSON.stringify(document.history),
    document.updatedAt,
    document.id,
    userId,
  );

  return document;
});

const createUserTransaction = withTransaction((payload) => {
  const timestamp = nowIso();
  const userId = `user-${randomUUID()}`;
  const password = normalizePassword(payload.password);
  const { salt, hash } = hashPassword(password);

  statements.insertUser.run(
    userId,
    normalizeText(payload.name),
    normalizeText(payload.email).toLowerCase(),
    normalizeText(payload.phone),
    hash,
    salt,
    timestamp,
    timestamp,
  );
  statements.insertBusinessSettings.run(
    userId,
    JSON.stringify(
      normalizeBusinessProfile({
        ...DEFAULT_BUSINESS_PROFILE,
        name: normalizeText(payload.name),
        email: normalizeText(payload.email),
        phone: normalizeText(payload.phone),
      }),
    ),
    timestamp,
  );
  statements.insertCounters.run(userId, timestamp);
  return publicUserFromRow(statements.getUserById.get(userId));
});

const server = createServer(async (request, response) => {
  if (!request.url) {
    error(response, 400, "Missing request URL.");
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    });
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);
  const { pathname } = url;

  try {
    if (request.method === "POST" && pathname === "/api/auth/signup") {
      const body = await readBody(request);
      const name = normalizeText(body.name);
      const email = normalizeText(body.email).toLowerCase();
      const phone = normalizeText(body.phone);
      const password = normalizePassword(body.password);

      if (!name || !email || !phone || !password.trim()) {
        error(response, 400, "Name, email, phone, and password are required.");
        return;
      }

      if (password.length < 8) {
        error(response, 400, "Password must be at least 8 characters long.");
        return;
      }

      if (statements.getUserByEmail.get(email)) {
        error(response, 409, "An account with that email already exists.");
        return;
      }

      const user = createUserTransaction({ name, email, phone, password });
      json(response, 201, { token: buildToken(user.id), user });
      return;
    }

    if (request.method === "POST" && pathname === "/api/auth/login") {
      const body = await readBody(request);
      const email = normalizeText(body.email).toLowerCase();
      const password = normalizePassword(body.password);
      const user = statements.getUserByEmail.get(email);

      if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
        error(response, 401, "Email or password is incorrect.");
        return;
      }

      json(response, 200, { token: buildToken(user.id), user: publicUserFromRow(user) });
      return;
    }

    if (request.method === "GET" && pathname === "/api/auth/session") {
      const user = requireUser(request, response);
      if (!user) {
        return;
      }

      json(response, 200, { user });
      return;
    }

    if (request.method === "GET" && pathname === "/api/bootstrap") {
      const user = requireUser(request, response);
      if (!user) {
        return;
      }

      json(response, 200, { user, ...getBootstrapData(user.id) });
      return;
    }

    if (request.method === "PUT" && pathname === "/api/business-settings") {
      const user = requireUser(request, response);
      if (!user) {
        return;
      }

      const body = await readBody(request);
      const businessProfile = normalizeBusinessProfile(body);
      statements.upsertBusinessSettings.run(user.id, JSON.stringify(businessProfile), nowIso());
      json(response, 200, { businessProfile });
      return;
    }

    if (request.method === "POST" && pathname === "/api/documents") {
      const user = requireUser(request, response);
      if (!user) {
        return;
      }

      const body = await readBody(request);
      const document = saveDocumentTransaction(user.id, body, null);
      json(response, 201, { document, nextNumbers: getBootstrapData(user.id).nextNumbers });
      return;
    }

    if (request.method === "PUT" && pathname.startsWith("/api/documents/")) {
      const user = requireUser(request, response);
      if (!user) {
        return;
      }

      const documentId = pathname.split("/").at(-1);
      const body = await readBody(request);
      const existing = statements.getDocument.get(documentId, user.id);
      if (!existing) {
        error(response, 404, "Document not found.");
        return;
      }

      const document = saveDocumentTransaction(user.id, body, documentId);
      json(response, 200, { document });
      return;
    }

    if (request.method === "DELETE" && pathname.startsWith("/api/documents/")) {
      const user = requireUser(request, response);
      if (!user) {
        return;
      }

      const documentId = pathname.split("/").at(-1);
      statements.deleteDocument.run(documentId, user.id);
      response.writeHead(204, { "Access-Control-Allow-Origin": "*" });
      response.end();
      return;
    }

    if (request.method === "POST" && pathname.endsWith("/duplicate")) {
      const user = requireUser(request, response);
      if (!user) {
        return;
      }

      const documentId = pathname.split("/")[3];
      const document = duplicateDocumentTransaction(user.id, documentId);
      if (!document) {
        error(response, 404, "Document not found.");
        return;
      }

      json(response, 201, { document, nextNumbers: getBootstrapData(user.id).nextNumbers });
      return;
    }

    if (request.method === "POST" && pathname.endsWith("/convert")) {
      const user = requireUser(request, response);
      if (!user) {
        return;
      }

      const documentId = pathname.split("/")[3];
      const document = convertDocumentTransaction(user.id, documentId);
      if (!document) {
        error(response, 404, "Quotation not found.");
        return;
      }

      json(response, 201, { document, nextNumbers: getBootstrapData(user.id).nextNumbers });
      return;
    }

    if (request.method === "POST" && pathname.endsWith("/shared")) {
      const user = requireUser(request, response);
      if (!user) {
        return;
      }

      const documentId = pathname.split("/")[3];
      const body = await readBody(request);
      const document = markSharedTransaction(user.id, documentId, body.via);
      if (!document) {
        error(response, 404, "Document not found.");
        return;
      }

      json(response, 200, { document });
      return;
    }

    if (request.method === "GET" && pathname === "/api/health") {
      json(response, 200, { ok: true });
      return;
    }

    error(response, 404, "Not found.");
  } catch (requestError) {
    console.error(requestError);
    const status = Number(requestError.status || 500);
    error(
      response,
      status,
      status >= 500
        ? "Something went wrong on the server."
        : requestError.message || "Could not complete that request.",
    );
  }
});

server.listen(API_PORT, () => {
  console.log(`QuoteFlow API listening on http://localhost:${API_PORT}`);
});


