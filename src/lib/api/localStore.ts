import {
  buildDocumentNumber,
  createDocumentDraft,
  createHistoryEntry,
  documentClientIdentityKey,
  defaultStatusForType,
  normalizeBusinessProfile,
} from "../documents";
import { createId, todayIso } from "../utils";
import type {
  BootstrapPayload,
  BusinessProfile,
  CatalogItem,
  ClientProfile,
  ContactProfile,
  DocumentItem,
  NextNumbers,
  QuoteFlowDocument,
  SaveDocumentOptions,
  WorkspaceUser,
} from "../../types";

const LOCAL_DATA_KEY = "quoteflow-local-workspace-v2";
const LEGACY_ZUSTAND_KEY = "quoteflow-storage";

interface LocalWorkspaceData {
  user: WorkspaceUser;
  businessProfile: BusinessProfile;
  clients: ClientProfile[];
  catalog: CatalogItem[];
  documents: QuoteFlowDocument[];
  nextNumbers: NextNumbers;
}

const LOCAL_USER: WorkspaceUser = {
  id: "local-workspace",
  name: "Local workspace",
  email: "",
  phone: "",
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso() {
  return new Date().toISOString();
}

function emptyWorkspace(): LocalWorkspaceData {
  return {
    user: LOCAL_USER,
    businessProfile: normalizeBusinessProfile(undefined),
    clients: [],
    catalog: [],
    documents: [],
    nextNumbers: {
      quotation: 1,
      invoice: 1,
    },
  };
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeItem(item: Partial<DocumentItem> | undefined): DocumentItem {
  return {
    id: item?.id?.trim() || createId("item"),
    name: item?.name?.trim() || "",
    description: item?.description?.trim() || "",
    quantity: Number.isFinite(Number(item?.quantity)) ? Number(item?.quantity) : 0,
    unitPrice: Number.isFinite(Number(item?.unitPrice)) ? Number(item?.unitPrice) : 0,
    discount: Number.isFinite(Number(item?.discount)) ? Number(item?.discount) : 0,
    tax: Number.isFinite(Number(item?.tax)) ? Number(item?.tax) : 0,
    importConfidence: item?.importConfidence,
    importNeedsReview: item?.importNeedsReview,
    importSource: item?.importSource,
  };
}

function normalizeClient(client: Partial<ContactProfile> | undefined): ContactProfile {
  return {
    clientId: client?.clientId?.trim() || undefined,
    name: client?.name?.trim() || "",
    company: client?.company?.trim() || "",
    address: client?.address?.trim() || "",
    phone: client?.phone?.trim() || "",
    email: client?.email?.trim() || "",
  };
}

function normalizeDocument(document: QuoteFlowDocument): QuoteFlowDocument {
  const type = document.type === "invoice" ? "invoice" : "quotation";
  const timestamp = nowIso();

  return {
    ...document,
    id: document.id?.trim() || createId(type),
    type,
    number: document.number?.trim() || buildDocumentNumber(type, 1),
    status: document.status || defaultStatusForType(type),
    currency: document.currency?.trim() || "TZS",
    issueDate: document.issueDate || todayIso(),
    validUntil: document.validUntil || undefined,
    dueDate: document.dueDate || undefined,
    business: normalizeBusinessProfile(document.business),
    client: normalizeClient(document.client),
    items: document.items?.length ? document.items.map(normalizeItem) : [normalizeItem(undefined)],
    notes: document.notes || "",
    terms: document.terms || "",
    paymentMethod: document.paymentMethod || undefined,
    amountPaid: Number.isFinite(Number(document.amountPaid)) ? Number(document.amountPaid) : 0,
    sourceQuotationId: document.sourceQuotationId || undefined,
    history: document.history?.length
      ? document.history
      : [createHistoryEntry("Saved", `${type} saved`)],
    createdAt: document.createdAt || timestamp,
    updatedAt: document.updatedAt || timestamp,
  };
}

function normalizeSavedClient(client: Partial<ClientProfile> | undefined): ClientProfile {
  return {
    id: client?.id?.trim() || createId("client"),
    ...normalizeClient(client),
    lastUsedAt: client?.lastUsedAt || nowIso(),
  };
}

function normalizeCatalogItem(item: Partial<CatalogItem> | undefined): CatalogItem {
  return {
    id: item?.id?.trim() || createId("catalog"),
    name: item?.name?.trim() || "",
    description: item?.description?.trim() || "",
    unitPrice: Number.isFinite(Number(item?.unitPrice)) ? Number(item?.unitPrice) : 0,
    discount: Number.isFinite(Number(item?.discount)) ? Number(item?.discount) : 0,
    tax: Number.isFinite(Number(item?.tax)) ? Number(item?.tax) : 0,
    updatedAt: item?.updatedAt || nowIso(),
  };
}

function migrateLegacyWorkspace(): Partial<LocalWorkspaceData> {
  const legacy = safeJsonParse<{ state?: Partial<LocalWorkspaceData> }>(
    canUseStorage() ? window.localStorage.getItem(LEGACY_ZUSTAND_KEY) : null,
    {},
  );

  if (!legacy.state) {
    return {};
  }

  return {
    user: legacy.state.user,
    businessProfile: legacy.state.businessProfile,
    clients: legacy.state.clients,
    catalog: legacy.state.catalog,
    documents: legacy.state.documents,
    nextNumbers: legacy.state.nextNumbers,
  };
}

function loadWorkspace(): LocalWorkspaceData {
  const base = emptyWorkspace();
  if (!canUseStorage()) {
    return base;
  }

  const saved = safeJsonParse<Partial<LocalWorkspaceData>>(
    window.localStorage.getItem(LOCAL_DATA_KEY),
    migrateLegacyWorkspace(),
  );

  const documents = Array.isArray(saved.documents)
    ? saved.documents.map((document) => normalizeDocument(document)).sort(sortByUpdatedDesc)
    : [];
  const clients = Array.isArray(saved.clients)
    ? saved.clients.map((client) => normalizeSavedClient(client)).sort(sortClientsByRecent)
    : [];
  const catalog = Array.isArray(saved.catalog)
    ? saved.catalog.map((item) => normalizeCatalogItem(item)).sort(sortCatalogByRecent)
    : [];

  return {
    user: saved.user || base.user,
    businessProfile: normalizeBusinessProfile(saved.businessProfile),
    clients,
    catalog,
    documents,
    nextNumbers: normalizeNextNumbers(saved.nextNumbers, documents),
  };
}

function saveWorkspace(data: LocalWorkspaceData) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(data));
}

function withWorkspace<T>(callback: (data: LocalWorkspaceData) => T) {
  const data = loadWorkspace();
  const result = callback(data);
  saveWorkspace(data);
  return result;
}

function sortByUpdatedDesc(left: QuoteFlowDocument, right: QuoteFlowDocument) {
  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
}

function sortClientsByRecent(left: ClientProfile, right: ClientProfile) {
  return new Date(right.lastUsedAt).getTime() - new Date(left.lastUsedAt).getTime();
}

function sortCatalogByRecent(left: CatalogItem, right: CatalogItem) {
  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
}

function normalizeNextNumbers(
  saved: Partial<NextNumbers> | undefined,
  documents: QuoteFlowDocument[],
): NextNumbers {
  const highest = documents.reduce(
    (accumulator, document) => {
      const match = document.number.match(/-(\d+)$/);
      const number = match ? Number(match[1]) : 0;
      if (document.type === "quotation") {
        accumulator.quotation = Math.max(accumulator.quotation, number + 1);
      } else {
        accumulator.invoice = Math.max(accumulator.invoice, number + 1);
      }
      return accumulator;
    },
    { quotation: 1, invoice: 1 },
  );

  return {
    quotation: Math.max(Number(saved?.quotation || 1), highest.quotation),
    invoice: Math.max(Number(saved?.invoice || 1), highest.invoice),
  };
}

function findDocumentNumberMatch(
  data: LocalWorkspaceData,
  type: QuoteFlowDocument["type"],
  number: string,
  ignoredDocumentId?: string,
  client?: Partial<ContactProfile>,
) {
  const normalizedNumber = number.trim().toLowerCase();
  const clientKey = documentClientIdentityKey(client);
  return data.documents.find(
    (document) =>
      document.id !== ignoredDocumentId &&
      document.type === type &&
      document.number.toLowerCase() === normalizedNumber &&
      documentClientIdentityKey(document.client) === clientKey,
  );
}

function documentNumberExists(
  data: LocalWorkspaceData,
  type: QuoteFlowDocument["type"],
  number: string,
  ignoredDocumentId?: string,
  client?: Partial<ContactProfile>,
) {
  return Boolean(findDocumentNumberMatch(data, type, number, ignoredDocumentId, client));
}

function extractTrailingNumber(value: string) {
  const match = value.match(/-(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function advanceCounterFromNumber(
  data: LocalWorkspaceData,
  type: QuoteFlowDocument["type"],
  number: string,
) {
  const next = extractTrailingNumber(number) + 1;
  if (next > 1) {
    data.nextNumbers[type] = Math.max(data.nextNumbers[type], next);
  }
}

function reserveNextNumber(
  data: LocalWorkspaceData,
  type: QuoteFlowDocument["type"],
  client?: Partial<ContactProfile>,
) {
  const clientKey = documentClientIdentityKey(client);
  let nextValue = data.documents.reduce((highest, document) => {
    if (document.type !== type || documentClientIdentityKey(document.client) !== clientKey) {
      return highest;
    }

    return Math.max(highest, extractTrailingNumber(document.number) + 1);
  }, 1);
  let number = buildDocumentNumber(type, nextValue);

  while (documentNumberExists(data, type, number, undefined, client)) {
    nextValue += 1;
    number = buildDocumentNumber(type, nextValue);
  }

  data.nextNumbers[type] = nextValue + 1;
  return number;
}

function syncClient(data: LocalWorkspaceData, client: ContactProfile) {
  if (!client.name.trim() && !client.company.trim()) {
    return;
  }

  const timestamp = nowIso();
  const matchKey = `${client.email.toLowerCase()}|${client.name.toLowerCase()}|${client.company.toLowerCase()}`;
  const existingIndex = data.clients.findIndex((entry) => {
    const entryKey = `${entry.email.toLowerCase()}|${entry.name.toLowerCase()}|${entry.company.toLowerCase()}`;
    const emailsMatch = Boolean(entry.email && client.email) &&
      entry.email.toLowerCase() === client.email.toLowerCase();
    return emailsMatch || entryKey === matchKey;
  });

  const nextClient: ClientProfile = {
    id: client.clientId || (existingIndex >= 0 ? data.clients[existingIndex].id : createId("client")),
    ...client,
    lastUsedAt: timestamp,
  };

  if (existingIndex >= 0) {
    data.clients.splice(existingIndex, 1, nextClient);
  } else {
    data.clients.unshift(nextClient);
  }

  data.clients.sort(sortClientsByRecent);
}

function syncCatalog(data: LocalWorkspaceData, items: DocumentItem[]) {
  const timestamp = nowIso();

  for (const item of items) {
    const name = item.name.trim();
    if (!name) {
      continue;
    }

    const existingIndex = data.catalog.findIndex(
      (entry) => entry.name.toLowerCase() === name.toLowerCase(),
    );
    const nextItem: CatalogItem = {
      id: existingIndex >= 0 ? data.catalog[existingIndex].id : createId("catalog"),
      name,
      description: item.description,
      unitPrice: item.unitPrice,
      discount: item.discount,
      tax: item.tax,
      updatedAt: timestamp,
    };

    if (existingIndex >= 0) {
      data.catalog.splice(existingIndex, 1, nextItem);
    } else {
      data.catalog.unshift(nextItem);
    }
  }

  data.catalog.sort(sortCatalogByRecent);
}

function appendHistory(
  document: QuoteFlowDocument,
  action: string,
  detail: string,
): QuoteFlowDocument {
  return {
    ...document,
    history: [...document.history, createHistoryEntry(action, detail)],
  };
}

function upsertDocument(
  data: LocalWorkspaceData,
  document: QuoteFlowDocument,
  options: { removeDocumentIds?: string[] } = {},
) {
  const removeDocumentIds = new Set(options.removeDocumentIds || []);
  if (removeDocumentIds.size > 0) {
    data.documents = data.documents.filter(
      (entry) => entry.id === document.id || !removeDocumentIds.has(entry.id),
    );
  }

  const existingIndex = data.documents.findIndex((entry) => entry.id === document.id);
  if (existingIndex >= 0) {
    data.documents.splice(existingIndex, 1, document);
  } else {
    data.documents.unshift(document);
  }

  data.documents.sort(sortByUpdatedDesc);
  syncClient(data, document.client);
  syncCatalog(data, document.items);
}

export function getLocalBootstrap(): BootstrapPayload {
  return clone(loadWorkspace());
}

export function updateLocalBusinessSettings(profile: BusinessProfile) {
  return withWorkspace((data) => {
    data.businessProfile = normalizeBusinessProfile(profile);
    return {
      businessProfile: clone(data.businessProfile),
    };
  });
}

export function createLocalDocument(payload: QuoteFlowDocument, options?: SaveDocumentOptions) {
  return withWorkspace((data) => {
    const type = payload.type === "invoice" ? "invoice" : "quotation";
    const timestamp = nowIso();
    const manualNumber = Boolean(options?.manualNumber);
    const replaceExistingNumber = Boolean(options?.replaceExistingNumber);
    const number = manualNumber ? payload.number.trim() : reserveNextNumber(data, type, payload.client);
    let conflictingDocument: QuoteFlowDocument | undefined;

    if (manualNumber) {
      if (!number) {
        throw new Error("Document number cannot be empty.");
      }

      conflictingDocument = findDocumentNumberMatch(data, type, number, undefined, payload.client);
      if (conflictingDocument && !replaceExistingNumber) {
        throw new Error(`${number} is already used by another ${type}.`);
      }

      advanceCounterFromNumber(data, type, number);
    }

    const historyAction = conflictingDocument ? "Replaced" : "Saved";
    const historyDetail = conflictingDocument
      ? `${type === "quotation" ? "Quotation" : "Invoice"} replaced existing ${number} record`
      : `${type === "quotation" ? "Quotation" : "Invoice"} saved in records`;
    const document = normalizeDocument({
      ...payload,
      id: payload.id || createId(type),
      number,
      createdAt: conflictingDocument?.createdAt || timestamp,
      updatedAt: timestamp,
      history: [
        ...payload.history,
        createHistoryEntry(historyAction, historyDetail),
      ],
    });

    upsertDocument(data, document, {
      removeDocumentIds: conflictingDocument ? [conflictingDocument.id] : [],
    });

    return {
      document: clone(document),
      nextNumbers: clone(data.nextNumbers),
    };
  });
}

export function updateLocalDocument(
  documentId: string,
  payload: QuoteFlowDocument,
  options?: SaveDocumentOptions,
) {
  return withWorkspace((data) => {
    const existing = data.documents.find((document) => document.id === documentId);
    const timestamp = nowIso();
    const type = existing?.type || (payload.type === "invoice" ? "invoice" : "quotation");
    const number = payload.number.trim() || existing?.number || buildDocumentNumber(type, 1);
    const replaceExistingNumber = Boolean(options?.replaceExistingNumber);
    const conflictingDocument = findDocumentNumberMatch(data, type, number, documentId, payload.client);

    if (conflictingDocument && !replaceExistingNumber) {
      throw new Error(`${number} is already used by another ${type}.`);
    }

    advanceCounterFromNumber(data, type, number);

    const historyAction = conflictingDocument ? "Replaced" : "Updated";
    const historyDetail = conflictingDocument
      ? `${type === "quotation" ? "Quotation" : "Invoice"} replaced existing ${number} record`
      : `${payload.type === "quotation" ? "Quotation" : "Invoice"} saved in records`;
    const document = normalizeDocument({
      ...payload,
      id: documentId,
      type,
      number,
      createdAt: existing?.createdAt || payload.createdAt || timestamp,
      updatedAt: timestamp,
      history: [
        ...(payload.history?.length ? payload.history : existing?.history || []),
        createHistoryEntry(historyAction, historyDetail),
      ],
    });

    upsertDocument(data, document, {
      removeDocumentIds: conflictingDocument ? [conflictingDocument.id] : [],
    });
    return { document: clone(document) };
  });
}

export function deleteLocalDocument(documentId: string) {
  return withWorkspace((data) => {
    data.documents = data.documents.filter((document) => document.id !== documentId);
  });
}

export function duplicateLocalDocument(documentId: string) {
  return withWorkspace((data) => {
    const source = data.documents.find((document) => document.id === documentId);
    if (!source) {
      return { document: undefined };
    }

    const timestamp = nowIso();
    const type = source.type;
    const duplicate = normalizeDocument({
      ...clone(source),
      id: createId(type),
      number: reserveNextNumber(data, type, source.client),
      items: source.items.map((item) => ({ ...item, id: createId("item") })),
      history: [createHistoryEntry("Duplicated", `Created from ${source.number}`)],
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    upsertDocument(data, duplicate);
    return {
      document: clone(duplicate),
      nextNumbers: clone(data.nextNumbers),
    };
  });
}

export function convertLocalQuotation(documentId: string) {
  return withWorkspace((data) => {
    const quotation = data.documents.find((document) => document.id === documentId);
    if (!quotation || quotation.type !== "quotation") {
      return { document: undefined };
    }

    const invoice = createDocumentDraft(
      "invoice",
      reserveNextNumber(data, "invoice", quotation.client),
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

    const quotationIndex = data.documents.findIndex((document) => document.id === quotation.id);
    if (quotationIndex >= 0) {
      data.documents.splice(
        quotationIndex,
        1,
        appendHistory(quotation, "Converted", `Converted to invoice ${converted.number}`),
      );
    }

    upsertDocument(data, converted);
    return {
      document: clone(converted),
      nextNumbers: clone(data.nextNumbers),
    };
  });
}

export function markLocalDocumentShared(documentId: string, via: "pdf" | "whatsapp") {
  return withWorkspace((data) => {
    const document = data.documents.find((entry) => entry.id === documentId);
    if (!document) {
      throw new Error("Document not found.");
    }

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

    upsertDocument(data, updated);
    return { document: clone(updated) };
  });
}

export function signupLocalUser(payload: {
  name: string;
  email: string;
  phone: string;
}) {
  return withWorkspace((data) => {
    data.user = {
      id: data.user.id || createId("user"),
      name: payload.name.trim() || "Local workspace",
      email: payload.email.trim(),
      phone: payload.phone.trim(),
    };
    data.businessProfile = normalizeBusinessProfile({
      ...data.businessProfile,
      name: data.businessProfile.name || data.user.name,
      email: data.businessProfile.email || data.user.email,
      phone: data.businessProfile.phone || data.user.phone,
    });
    return { user: clone(data.user) };
  });
}

export function loginLocalUser() {
  return { user: clone(loadWorkspace().user) };
}
