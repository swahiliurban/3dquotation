import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const STORE_NAME = "quoteflow-business-workspaces";
const LOCAL_STORE_DIR = resolve(process.cwd(), "server", "data", "business-workspaces");

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
  bankAccounts: [],
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

let blobStorePromise;

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

function normalizePhoneForKey(value) {
  return normalizePhone(value).replace(/^\+/, "");
}

function legacyNormalizePhoneForKey(value) {
  return normalizeText(value).replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "").replace(/^\+/, "");
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function createId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeJsonParse(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function createBusinessKeyFromPhoneKey(email, phoneKey) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizeText(phoneKey).replace(/^\+/, "");
  if (!normalizedEmail || !normalizedPhone) {
    return "";
  }

  return createHash("sha256")
    .update(`${normalizedEmail}|${normalizedPhone}`)
    .digest("hex");
}

function createBusinessKey(email, phone) {
  return createBusinessKeyFromPhoneKey(email, normalizePhoneForKey(phone));
}

function phoneKeyVariants(phone) {
  const variants = new Set();
  const canonical = normalizePhone(phone);
  const canonicalKey = normalizePhoneForKey(canonical);
  const legacyKey = legacyNormalizePhoneForKey(phone);

  if (canonicalKey) {
    variants.add(canonicalKey);
  }

  if (legacyKey) {
    variants.add(legacyKey);
  }

  if (/^\+255[67]\d{8}$/.test(canonical)) {
    const national = canonical.slice(4);
    variants.add(`255${national}`);
    variants.add(`0${national}`);
    variants.add(national);
  }

  return Array.from(variants);
}

function businessKeyCandidates(identity) {
  const keys = new Set([identity.key]);

  for (const phoneKey of phoneKeyVariants(identity.phone)) {
    const key = createBusinessKeyFromPhoneKey(identity.email, phoneKey);
    if (key) {
      keys.add(key);
    }
  }

  return Array.from(keys).filter(Boolean);
}

function getIdentityFromRequest(request) {
  const email = request.headers.get("x-quoteflow-business-email") || "";
  const phone = request.headers.get("x-quoteflow-business-phone") || "";
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);
  const key = createBusinessKey(normalizedEmail, normalizedPhone);

  if (!normalizedEmail || !normalizedPhone || !key) {
    return null;
  }

  return {
    email: normalizedEmail,
    phone: normalizedPhone,
    key,
  };
}

function identityFromPayload(payload = {}) {
  const email = normalizeEmail(payload.email);
  const phone = normalizePhone(payload.phone);
  const key = createBusinessKey(email, phone);

  if (!email || !phone || !key) {
    return null;
  }

  return { email, phone, key };
}

function workspaceUser(identity, profile = DEFAULT_BUSINESS_PROFILE) {
  return {
    id: `business-${identity.key.slice(0, 16)}`,
    name: normalizeText(profile.name) || "Business workspace",
    email: identity.email,
    phone: identity.phone,
  };
}

function normalizeBankAccount(account = {}, index = 0) {
  return {
    id: normalizeText(account.id) || createId(`bank-${index + 1}`),
    label: normalizeText(account.label),
    details: normalizeText(account.details),
  };
}

function splitLegacyBankDetails(value = "") {
  const raw = normalizeText(value);
  if (!raw) {
    return [];
  }

  const groups = raw
    .split(/\n\s*\n+/)
    .map((group) => group.trim())
    .filter(Boolean);

  if (groups.length > 1) {
    return groups;
  }

  return [raw];
}

function composeBankDetails(bankAccounts) {
  return bankAccounts
    .map((account) => {
      const details = normalizeText(account.details);
      if (!details) {
        return "";
      }

      const label = normalizeText(account.label);
      return label ? `${label}\n${details}` : details;
    })
    .filter(Boolean)
    .join("\n\n");
}

function normalizeBusinessProfile(profile = {}) {
  const structuredAccounts = Array.isArray(profile.bankAccounts)
    ? profile.bankAccounts
        .map((account, index) => normalizeBankAccount(account, index))
        .filter((account) => account.label || account.details)
    : [];
  const bankAccounts =
    structuredAccounts.length > 0
      ? structuredAccounts
      : splitLegacyBankDetails(profile.bankDetails).map((details, index) =>
          normalizeBankAccount({ details }, index),
        );

  return {
    ...DEFAULT_BUSINESS_PROFILE,
    ...profile,
    name: normalizeText(profile.name),
    address: normalizeText(profile.address),
    phone: normalizeText(profile.phone),
    email: normalizeEmail(profile.email),
    website: normalizeText(profile.website),
    logoDataUrl: normalizeText(profile.logoDataUrl),
    signatureDataUrl: normalizeText(profile.signatureDataUrl),
    stampLabel: normalizeText(profile.stampLabel),
    bankAccounts,
    bankDetails: composeBankDetails(bankAccounts),
    accentColor: normalizeText(profile.accentColor) || DEFAULT_BUSINESS_PROFILE.accentColor,
    showTax: Boolean(profile.showTax),
    showDiscount: Boolean(profile.showDiscount),
    defaultTaxRate: safeNumber(profile.defaultTaxRate, DEFAULT_BUSINESS_PROFILE.defaultTaxRate),
    defaultDiscountRate: safeNumber(
      profile.defaultDiscountRate,
      DEFAULT_BUSINESS_PROFILE.defaultDiscountRate,
    ),
    showClientDetails: profile.showClientDetails ?? DEFAULT_BUSINESS_PROFILE.showClientDetails,
    showNotes: profile.showNotes ?? DEFAULT_BUSINESS_PROFILE.showNotes,
    showTerms: profile.showTerms ?? DEFAULT_BUSINESS_PROFILE.showTerms,
    defaultNotes: normalizeText(profile.defaultNotes),
    defaultTerms: normalizeText(profile.defaultTerms),
  };
}

function buildDocumentNumber(type, nextValue) {
  const prefix = type === "quotation" ? "QT" : "INV";
  return `${prefix}-${new Date().getFullYear()}-${String(nextValue).padStart(4, "0")}`;
}

function defaultStatusForType(type) {
  return type === "quotation" ? "draft" : "unpaid";
}

function createHistoryEntry(action, detail) {
  return {
    id: createId("history"),
    action,
    detail,
    timestamp: nowIso(),
  };
}

function createEmptyItem(defaults = {}) {
  return {
    id: createId("item"),
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
    id: createId(type),
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

function normalizeClient(client = {}) {
  return {
    clientId: normalizeText(client.clientId) || undefined,
    name: normalizeText(client.name),
    company: normalizeText(client.company),
    address: normalizeText(client.address),
    phone: normalizeText(client.phone),
    email: normalizeEmail(client.email),
  };
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

function normalizeItem(item = {}) {
  return {
    id: normalizeText(item.id) || createId("item"),
    name: normalizeText(item.name),
    description: normalizeText(item.description),
    quantity: safeNumber(item.quantity, 0),
    unitPrice: safeNumber(item.unitPrice, 0),
    discount: safeNumber(item.discount, 0),
    tax: safeNumber(item.tax, 0),
    importConfidence: item.importConfidence,
    importNeedsReview: item.importNeedsReview,
    importSource: item.importSource,
  };
}

function normalizeDocument(document = {}) {
  const type = document.type === "invoice" ? "invoice" : "quotation";
  const timestamp = nowIso();

  return {
    id: normalizeText(document.id) || createId(type),
    type,
    number: normalizeText(document.number) || buildDocumentNumber(type, 1),
    status: normalizeText(document.status) || defaultStatusForType(type),
    currency: normalizeText(document.currency) || "TZS",
    issueDate: normalizeText(document.issueDate) || todayIso(),
    validUntil: normalizeText(document.validUntil) || undefined,
    dueDate: normalizeText(document.dueDate) || undefined,
    business: normalizeBusinessProfile(document.business),
    client: normalizeClient(document.client),
    items:
      Array.isArray(document.items) && document.items.length > 0
        ? document.items.map(normalizeItem)
        : [normalizeItem()],
    notes: normalizeText(document.notes),
    terms: normalizeText(document.terms),
    paymentMethod: normalizeText(document.paymentMethod) || undefined,
    amountPaid: safeNumber(document.amountPaid, 0),
    sourceQuotationId: normalizeText(document.sourceQuotationId) || undefined,
    history:
      Array.isArray(document.history) && document.history.length > 0
        ? document.history
        : [createHistoryEntry("Saved", `${type} saved`)],
    createdAt: normalizeText(document.createdAt) || timestamp,
    updatedAt: normalizeText(document.updatedAt) || timestamp,
  };
}

function sortByUpdatedDesc(left, right) {
  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
}

function extractTrailingNumber(value) {
  const match = normalizeText(value).match(/-(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function normalizeNextNumbers(saved = {}, documents = []) {
  const highest = documents.reduce(
    (accumulator, document) => {
      const next = extractTrailingNumber(document.number) + 1;
      if (document.type === "quotation") {
        accumulator.quotation = Math.max(accumulator.quotation, next);
      } else {
        accumulator.invoice = Math.max(accumulator.invoice, next);
      }
      return accumulator;
    },
    { quotation: 1, invoice: 1 },
  );

  return {
    quotation: Math.max(safeNumber(saved.quotation, 1), highest.quotation),
    invoice: Math.max(safeNumber(saved.invoice, 1), highest.invoice),
  };
}

function emptyWorkspace(identity) {
  const businessProfile = normalizeBusinessProfile({
    email: identity.email,
    phone: identity.phone,
  });

  return {
    version: 3,
    identity,
    user: workspaceUser(identity, businessProfile),
    businessProfile,
    clients: [],
    catalog: [],
    documents: [],
    nextNumbers: {
      quotation: 1,
      invoice: 1,
    },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function normalizeWorkspace(workspace, identity) {
  const base = emptyWorkspace(identity);
  const businessProfile = normalizeBusinessProfile({
    ...workspace?.businessProfile,
    email: workspace?.businessProfile?.email || identity.email,
    phone: workspace?.businessProfile?.phone || identity.phone,
  });
  const documents = Array.isArray(workspace?.documents)
    ? workspace.documents.map(normalizeDocument).sort(sortByUpdatedDesc)
    : [];

  return {
    ...base,
    ...workspace,
    version: 3,
    identity,
    user: workspaceUser(identity, businessProfile),
    businessProfile,
    clients: Array.isArray(workspace?.clients) ? workspace.clients.map(normalizeSavedClient) : [],
    catalog: Array.isArray(workspace?.catalog) ? workspace.catalog.map(normalizeCatalogItem) : [],
    documents,
    nextNumbers: normalizeNextNumbers(workspace?.nextNumbers, documents),
    createdAt: normalizeText(workspace?.createdAt) || base.createdAt,
    updatedAt: normalizeText(workspace?.updatedAt) || base.updatedAt,
  };
}

function normalizeSavedClient(client = {}) {
  return {
    id: normalizeText(client.id) || createId("client"),
    ...normalizeClient(client),
    lastUsedAt: normalizeText(client.lastUsedAt) || nowIso(),
  };
}

function normalizeCatalogItem(item = {}) {
  return {
    id: normalizeText(item.id) || createId("catalog"),
    name: normalizeText(item.name),
    description: normalizeText(item.description),
    unitPrice: safeNumber(item.unitPrice, 0),
    discount: safeNumber(item.discount, 0),
    tax: safeNumber(item.tax, 0),
    updatedAt: normalizeText(item.updatedAt) || nowIso(),
  };
}

function publicWorkspace(workspace) {
  const normalized = normalizeWorkspace(workspace, workspace.identity);
  return {
    user: normalized.user,
    businessProfile: normalized.businessProfile,
    clients: normalized.clients,
    catalog: normalized.catalog,
    documents: normalized.documents,
    nextNumbers: normalized.nextNumbers,
  };
}

function findDocumentNumberMatch(workspace, type, number, ignoredDocumentId, client) {
  const normalizedNumber = normalizeText(number).toLowerCase();
  const clientKey = documentClientIdentityKey(client);
  return workspace.documents.find(
    (document) =>
      document.id !== ignoredDocumentId &&
      document.type === type &&
      document.number.toLowerCase() === normalizedNumber &&
      documentClientIdentityKey(document.client) === clientKey,
  );
}

function documentNumberExists(workspace, type, number, ignoredDocumentId, client) {
  return Boolean(findDocumentNumberMatch(workspace, type, number, ignoredDocumentId, client));
}

function reserveNextNumber(workspace, type, client) {
  const clientKey = documentClientIdentityKey(client);
  let nextValue = workspace.documents.reduce((highest, document) => {
    if (document.type !== type || documentClientIdentityKey(document.client) !== clientKey) {
      return highest;
    }

    return Math.max(highest, extractTrailingNumber(document.number) + 1);
  }, 1);
  let number = buildDocumentNumber(type, nextValue);

  while (documentNumberExists(workspace, type, number, undefined, client)) {
    nextValue += 1;
    number = buildDocumentNumber(type, nextValue);
  }

  workspace.nextNumbers[type] = nextValue + 1;
  return number;
}

function advanceCounterFromNumber(workspace, type, number) {
  const next = extractTrailingNumber(number) + 1;
  if (next > 1) {
    workspace.nextNumbers[type] = Math.max(workspace.nextNumbers[type], next);
  }
}

function syncClient(workspace, client) {
  const normalized = normalizeSavedClient(client);
  if (!normalized.name && !normalized.company) {
    return;
  }

  normalized.lastUsedAt = nowIso();
  const matchKey = `${normalized.email}|${normalized.name.toLowerCase()}|${normalized.company.toLowerCase()}`;
  const existingIndex = workspace.clients.findIndex((entry) => {
    const entryKey = `${entry.email}|${entry.name.toLowerCase()}|${entry.company.toLowerCase()}`;
    const emailsMatch = Boolean(entry.email && normalized.email) && entry.email === normalized.email;
    return emailsMatch || entryKey === matchKey;
  });

  if (existingIndex >= 0) {
    workspace.clients.splice(existingIndex, 1, {
      ...normalized,
      id: normalized.clientId || workspace.clients[existingIndex].id,
    });
  } else {
    workspace.clients.unshift(normalized);
  }

  workspace.clients.sort((left, right) => {
    return new Date(right.lastUsedAt).getTime() - new Date(left.lastUsedAt).getTime();
  });
}

function syncCatalog(workspace, items = []) {
  for (const item of items) {
    const normalized = normalizeCatalogItem(item);
    if (!normalized.name) {
      continue;
    }

    normalized.updatedAt = nowIso();
    const existingIndex = workspace.catalog.findIndex(
      (entry) => entry.name.toLowerCase() === normalized.name.toLowerCase(),
    );

    if (existingIndex >= 0) {
      workspace.catalog.splice(existingIndex, 1, {
        ...normalized,
        id: workspace.catalog[existingIndex].id,
      });
    } else {
      workspace.catalog.unshift(normalized);
    }
  }

  workspace.catalog.sort((left, right) => {
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function appendHistory(document, action, detail) {
  return {
    ...document,
    history: [...document.history, createHistoryEntry(action, detail)],
  };
}

function upsertDocument(workspace, document, options = {}) {
  const removeDocumentIds = new Set(options.removeDocumentIds || []);
  if (removeDocumentIds.size > 0) {
    workspace.documents = workspace.documents.filter(
      (entry) => entry.id === document.id || !removeDocumentIds.has(entry.id),
    );
  }

  const existingIndex = workspace.documents.findIndex((entry) => entry.id === document.id);
  if (existingIndex >= 0) {
    workspace.documents.splice(existingIndex, 1, document);
  } else {
    workspace.documents.unshift(document);
  }

  workspace.documents.sort(sortByUpdatedDesc);
  workspace.nextNumbers = normalizeNextNumbers(workspace.nextNumbers, workspace.documents);
  syncClient(workspace, document.client);
  syncCatalog(workspace, document.items);
}

function mergeSeedWorkspace(workspace, seed = {}, existed) {
  if (!seed || typeof seed !== "object") {
    return workspace;
  }

  if (!existed) {
    workspace.businessProfile = normalizeBusinessProfile({
      ...seed.businessProfile,
      email: workspace.identity.email,
      phone: seed.businessProfile?.phone || workspace.identity.phone,
    });
    workspace.user = workspaceUser(workspace.identity, workspace.businessProfile);
  }

  if (Array.isArray(seed.clients)) {
    for (const client of seed.clients) {
      syncClient(workspace, client);
    }
  }

  if (Array.isArray(seed.catalog)) {
    syncCatalog(workspace, seed.catalog);
  }

  if (Array.isArray(seed.documents)) {
    for (const source of seed.documents) {
      const document = normalizeDocument(source);
      const existing = workspace.documents.find((entry) => entry.id === document.id);
      if (existing && new Date(existing.updatedAt).getTime() >= new Date(document.updatedAt).getTime()) {
        continue;
      }

      if (documentNumberExists(workspace, document.type, document.number, document.id, document.client)) {
        const oldNumber = document.number;
        document.number = reserveNextNumber(workspace, document.type, document.client);
        document.history = [
          ...document.history,
          createHistoryEntry("Renumbered", `${oldNumber} changed to ${document.number} during sync`),
        ];
      } else {
        advanceCounterFromNumber(workspace, document.type, document.number);
      }

      upsertDocument(workspace, document);
    }
  }

  workspace.nextNumbers = normalizeNextNumbers(
    {
      quotation: Math.max(
        safeNumber(workspace.nextNumbers?.quotation, 1),
        safeNumber(seed.nextNumbers?.quotation, 1),
      ),
      invoice: Math.max(
        safeNumber(workspace.nextNumbers?.invoice, 1),
        safeNumber(seed.nextNumbers?.invoice, 1),
      ),
    },
    workspace.documents,
  );
  workspace.updatedAt = nowIso();
  return workspace;
}

async function getBlobStore() {
  if (!blobStorePromise) {
    blobStorePromise = (async () => {
      try {
        const { getStore } = await import("@netlify/blobs");
        const store = getStore({ name: STORE_NAME, consistency: "strong" });
        await store.list({ prefix: "__quoteflow-healthcheck__" });
        return store;
      } catch {
        return null;
      }
    })();
  }

  return blobStorePromise;
}

function workspaceKeyFromBusinessKey(key) {
  return `business/${key}.json`;
}

function workspaceKey(identity) {
  return workspaceKeyFromBusinessKey(identity.key);
}

function localWorkspacePathFromBusinessKey(key) {
  return resolve(LOCAL_STORE_DIR, `${key}.json`);
}

function localWorkspacePath(identity) {
  return localWorkspacePathFromBusinessKey(identity.key);
}

async function loadWorkspace(identity) {
  const candidateKeys = businessKeyCandidates(identity);
  const store = await getBlobStore();
  if (store) {
    for (const key of candidateKeys) {
      const workspace = await store.get(workspaceKeyFromBusinessKey(key), { type: "json" });
      if (workspace) {
        return normalizeWorkspace(workspace, identity);
      }
    }

    return null;
  }

  for (const key of candidateKeys) {
    try {
      const contents = await readFile(localWorkspacePathFromBusinessKey(key), "utf8");
      return normalizeWorkspace(safeJsonParse(contents, null), identity);
    } catch {
      // Continue through legacy phone-key candidates before treating the workspace as missing.
    }
  }

  return null;
}

async function saveWorkspace(workspace) {
  const normalized = normalizeWorkspace(
    {
      ...workspace,
      updatedAt: nowIso(),
    },
    workspace.identity,
  );
  const store = await getBlobStore();

  if (store) {
    await store.setJSON(workspaceKey(normalized.identity), normalized);
    return normalized;
  }

  const filePath = localWorkspacePath(normalized.identity);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

async function readJson(request) {
  if (request.method === "GET" || request.method === "HEAD") {
    return {};
  }

  const text = await request.text();
  return safeJsonParse(text, {});
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "Content-Type, X-QuoteFlow-Business-Email, X-QuoteFlow-Business-Phone",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    },
  });
}

function noContent() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "Content-Type, X-QuoteFlow-Business-Email, X-QuoteFlow-Business-Phone",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    },
  });
}

function apiError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function getRequiredWorkspace(request) {
  const identity = getIdentityFromRequest(request);
  if (!identity) {
    throw apiError(401, "Enter a business email and phone number to use shared records.");
  }

  const workspace = await loadWorkspace(identity);
  if (!workspace) {
    throw apiError(404, "Business workspace was not found.");
  }

  return workspace;
}

async function claimBusinessIdentity(request) {
  const body = await readJson(request);
  const identity = identityFromPayload(body);
  if (!identity) {
    throw apiError(400, "Business email and phone number are required.");
  }

  const existing = await loadWorkspace(identity);
  const workspace = existing || mergeSeedWorkspace(emptyWorkspace(identity), body.seed, false);

  const saved = await saveWorkspace(workspace);
  return json(200, {
    ...publicWorkspace(saved),
    businessIdentity: identity,
    workspaceExists: Boolean(existing),
  });
}

async function bootstrapBusinessWorkspace(request) {
  const workspace = await getRequiredWorkspace(request);
  return json(200, publicWorkspace(workspace));
}

async function updateBusinessSettings(request) {
  const workspace = await getRequiredWorkspace(request);
  const body = await readJson(request);
  workspace.businessProfile = normalizeBusinessProfile({
    ...body,
    email: body.email || workspace.identity.email,
    phone: body.phone || workspace.identity.phone,
  });
  workspace.user = workspaceUser(workspace.identity, workspace.businessProfile);

  const saved = await saveWorkspace(workspace);
  return json(200, { businessProfile: saved.businessProfile });
}

async function createDocument(request) {
  const workspace = await getRequiredWorkspace(request);
  const body = await readJson(request);
  const type = body.type === "invoice" ? "invoice" : "quotation";
  const manualNumber = Boolean(body.saveOptions?.manualNumber);
  const replaceExistingNumber = Boolean(body.saveOptions?.replaceExistingNumber);
  const timestamp = nowIso();
  let number = normalizeText(body.number);
  let conflictingDocument;

  if (manualNumber) {
    if (!number) {
      throw apiError(400, "Document number cannot be empty.");
    }

    conflictingDocument = findDocumentNumberMatch(workspace, type, number, undefined, body.client);
    if (conflictingDocument && !replaceExistingNumber) {
      throw apiError(409, `${number} is already used by another ${type}.`);
    }
    advanceCounterFromNumber(workspace, type, number);
  } else {
    number = reserveNextNumber(workspace, type, body.client);
  }

  const historyAction = conflictingDocument ? "Replaced" : "Saved";
  const historyDetail = conflictingDocument
    ? `${type === "quotation" ? "Quotation" : "Invoice"} replaced existing ${number} record`
    : `${type === "quotation" ? "Quotation" : "Invoice"} saved in records`;
  const document = normalizeDocument({
    ...body,
    id: normalizeText(body.id) || createId(type),
    type,
    number,
    business: body.business || workspace.businessProfile,
    createdAt: conflictingDocument?.createdAt || timestamp,
    updatedAt: timestamp,
    history: [
      ...(Array.isArray(body.history) ? body.history : []),
      createHistoryEntry(historyAction, historyDetail),
    ],
  });

  upsertDocument(workspace, document, {
    removeDocumentIds: conflictingDocument ? [conflictingDocument.id] : [],
  });
  const saved = await saveWorkspace(workspace);
  return json(201, {
    document: saved.documents.find((entry) => entry.id === document.id),
    nextNumbers: saved.nextNumbers,
  });
}

async function updateDocument(request, documentId) {
  const workspace = await getRequiredWorkspace(request);
  const body = await readJson(request);
  const existing = workspace.documents.find((document) => document.id === documentId);
  if (!existing) {
    throw apiError(404, "Document not found.");
  }

  const type = existing.type;
  const replaceExistingNumber = Boolean(body.saveOptions?.replaceExistingNumber);
  const number = normalizeText(body.number) || existing.number;
  const conflictingDocument = findDocumentNumberMatch(workspace, type, number, documentId, body.client || existing.client);
  if (conflictingDocument && !replaceExistingNumber) {
    throw apiError(409, `${number} is already used by another ${type}.`);
  }
  advanceCounterFromNumber(workspace, type, number);

  const historyAction = conflictingDocument ? "Replaced" : "Updated";
  const historyDetail = conflictingDocument
    ? `${type === "quotation" ? "Quotation" : "Invoice"} replaced existing ${number} record`
    : `${type === "quotation" ? "Quotation" : "Invoice"} saved in records`;
  const document = normalizeDocument({
    ...existing,
    ...body,
    id: documentId,
    type,
    number,
    business: body.business || existing.business,
    createdAt: existing.createdAt,
    updatedAt: nowIso(),
    history: [
      ...(Array.isArray(body.history) && body.history.length > 0 ? body.history : existing.history),
      createHistoryEntry(historyAction, historyDetail),
    ],
  });

  upsertDocument(workspace, document, {
    removeDocumentIds: conflictingDocument ? [conflictingDocument.id] : [],
  });
  const saved = await saveWorkspace(workspace);
  return json(200, { document: saved.documents.find((entry) => entry.id === document.id) });
}

async function deleteDocument(request, documentId) {
  const workspace = await getRequiredWorkspace(request);
  workspace.documents = workspace.documents.filter((document) => document.id !== documentId);
  workspace.nextNumbers = normalizeNextNumbers(workspace.nextNumbers, workspace.documents);
  await saveWorkspace(workspace);
  return noContent();
}

async function duplicateDocument(request, documentId) {
  const workspace = await getRequiredWorkspace(request);
  const source = workspace.documents.find((document) => document.id === documentId);
  if (!source) {
    throw apiError(404, "Document not found.");
  }

  const timestamp = nowIso();
  const duplicate = normalizeDocument({
    ...clone(source),
    id: createId(source.type),
    number: reserveNextNumber(workspace, source.type, source.client),
    items: source.items.map((item) => ({ ...item, id: createId("item") })),
    amountPaid: 0,
    history: [createHistoryEntry("Duplicated", `Created from ${source.number}`)],
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  upsertDocument(workspace, duplicate);
  const saved = await saveWorkspace(workspace);
  return json(201, {
    document: saved.documents.find((entry) => entry.id === duplicate.id),
    nextNumbers: saved.nextNumbers,
  });
}

async function convertQuotation(request, documentId) {
  const workspace = await getRequiredWorkspace(request);
  const quotation = workspace.documents.find((document) => document.id === documentId);
  if (!quotation || quotation.type !== "quotation") {
    throw apiError(404, "Quotation not found.");
  }

  const invoice = createDocumentDraft(
    "invoice",
    reserveNextNumber(workspace, "invoice", quotation.client),
    quotation.business,
  );
  const timestamp = nowIso();
  const converted = normalizeDocument({
    ...invoice,
    client: clone(quotation.client),
    currency: quotation.currency,
    items: quotation.items.map((item) => ({ ...item, id: createId("item") })),
    notes: quotation.notes,
    terms: quotation.terms,
    sourceQuotationId: quotation.id,
    history: [createHistoryEntry("Converted", `Created from quotation ${quotation.number}`)],
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const quotationIndex = workspace.documents.findIndex((document) => document.id === quotation.id);
  if (quotationIndex >= 0) {
    workspace.documents.splice(
      quotationIndex,
      1,
      normalizeDocument({
        ...appendHistory(quotation, "Converted", `Converted to invoice ${converted.number}`),
        updatedAt: timestamp,
      }),
    );
  }

  upsertDocument(workspace, converted);
  const saved = await saveWorkspace(workspace);
  return json(201, {
    document: saved.documents.find((entry) => entry.id === converted.id),
    nextNumbers: saved.nextNumbers,
  });
}

async function markDocumentShared(request, documentId) {
  const workspace = await getRequiredWorkspace(request);
  const body = await readJson(request);
  const document = workspace.documents.find((entry) => entry.id === documentId);
  if (!document) {
    throw apiError(404, "Document not found.");
  }

  const via = body.via === "whatsapp" ? "whatsapp" : "pdf";
  const updated = normalizeDocument({
    ...appendHistory(
      document,
      via === "pdf" ? "PDF downloaded" : "WhatsApp prepared",
      via === "pdf"
        ? `Generated PDF for ${document.number}`
        : `Prepared WhatsApp share message for ${document.number}`,
    ),
    updatedAt: nowIso(),
  });

  upsertDocument(workspace, updated);
  const saved = await saveWorkspace(workspace);
  return json(200, { document: saved.documents.find((entry) => entry.id === updated.id) });
}

function getDocumentIdFromPath(pathname, suffix = "") {
  const parts = pathname.replace(/\/$/, "").split("/");
  if (suffix) {
    return parts.at(-2);
  }

  return parts.at(-1);
}

export async function handleApiRequest(request) {
  if (request.method === "OPTIONS") {
    return noContent();
  }

  const url = new URL(request.url);
  const { pathname } = url;

  try {
    if (request.method === "GET" && pathname === "/api/health") {
      return json(200, { ok: true });
    }

    if (request.method === "POST" && pathname === "/api/business-identity") {
      return await claimBusinessIdentity(request);
    }

    if (request.method === "GET" && pathname === "/api/bootstrap") {
      return await bootstrapBusinessWorkspace(request);
    }

    if (request.method === "PUT" && pathname === "/api/business-settings") {
      return await updateBusinessSettings(request);
    }

    if (request.method === "POST" && pathname === "/api/documents") {
      return await createDocument(request);
    }

    if (request.method === "POST" && pathname.endsWith("/duplicate")) {
      return await duplicateDocument(request, getDocumentIdFromPath(pathname, "duplicate"));
    }

    if (request.method === "POST" && pathname.endsWith("/convert")) {
      return await convertQuotation(request, getDocumentIdFromPath(pathname, "convert"));
    }

    if (request.method === "POST" && pathname.endsWith("/shared")) {
      return await markDocumentShared(request, getDocumentIdFromPath(pathname, "shared"));
    }

    if (request.method === "PUT" && pathname.startsWith("/api/documents/")) {
      return await updateDocument(request, getDocumentIdFromPath(pathname));
    }

    if (request.method === "DELETE" && pathname.startsWith("/api/documents/")) {
      return await deleteDocument(request, getDocumentIdFromPath(pathname));
    }

    return json(404, { error: "Not found." });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) {
      console.error("[QuoteFlow API]", error);
    }

    return json(status, {
      error: error.message || "Something went wrong on the server.",
    });
  }
}
