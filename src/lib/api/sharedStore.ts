import type {
  BootstrapPayload,
  BusinessProfile,
  NextNumbers,
  QuoteFlowDocument,
} from "../../types";

export interface BusinessIdentity {
  email: string;
  phone: string;
  key: string;
}

export interface BusinessIdentityBootstrap extends BootstrapPayload {
  businessIdentity: BusinessIdentity;
  workspaceExists: boolean;
}

export interface SaveDocumentOptions {
  manualNumber?: boolean;
  replaceExistingNumber?: boolean;
}

const IDENTITY_STORAGE_KEY = "quoteflow-active-business-identity-v1";
const IDENTITY_MIGRATION_PREFIX = "quoteflow-business-identity-migrated";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizePhoneNumber(phone: string) {
  const compact = phone.trim().replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
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

function normalizeBusinessIdentity(identity: BusinessIdentity): BusinessIdentity {
  const normalized = normalizeIdentityFields(identity.email, identity.phone);
  return {
    ...identity,
    email: normalized.email,
    phone: normalized.phone,
  };
}

export function normalizeIdentityFields(email: string, phone: string) {
  return {
    email: email.trim().toLowerCase(),
    phone: normalizePhoneNumber(phone),
  };
}

export function hasUsableBusinessIdentity(email?: string, phone?: string) {
  const normalized = normalizeIdentityFields(email || "", phone || "");
  return Boolean(normalized.email && normalized.phone);
}

export function sameBusinessIdentity(
  left: Pick<BusinessIdentity, "email" | "phone"> | null | undefined,
  right: Pick<BusinessIdentity, "email" | "phone"> | null | undefined,
) {
  if (!left || !right) {
    return false;
  }

  const normalizedLeft = normalizeIdentityFields(left.email, left.phone);
  const normalizedRight = normalizeIdentityFields(right.email, right.phone);
  return normalizedLeft.email === normalizedRight.email && normalizedLeft.phone === normalizedRight.phone;
}

export function getSavedBusinessIdentity() {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const saved = window.localStorage.getItem(IDENTITY_STORAGE_KEY);
    return saved ? normalizeBusinessIdentity(JSON.parse(saved) as BusinessIdentity) : null;
  } catch {
    return null;
  }
}

export function saveBusinessIdentity(identity: BusinessIdentity) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(normalizeBusinessIdentity(identity)));
}

export function clearSavedBusinessIdentity() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(IDENTITY_STORAGE_KEY);
}

function migrationStorageKey(identity: Pick<BusinessIdentity, "key">) {
  return `${IDENTITY_MIGRATION_PREFIX}-${identity.key}`;
}

export function hasMigratedBusinessIdentity(identity: BusinessIdentity) {
  if (!canUseStorage()) {
    return false;
  }

  return window.localStorage.getItem(migrationStorageKey(identity)) === "true";
}

export function markBusinessIdentityMigrated(identity: BusinessIdentity) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(migrationStorageKey(identity), "true");
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    const error = new Error(payload.error || "QuoteFlow could not save to the shared workspace.");
    Object.assign(error, { status: response.status });
    throw error;
  }

  return payload as T;
}

async function apiRequest<T>(
  path: string,
  options: {
    body?: unknown;
    identity?: Pick<BusinessIdentity, "email" | "phone"> | null;
    method?: "GET" | "POST" | "PUT" | "DELETE";
  } = {},
) {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");

  if (options.identity) {
    const identity = normalizeIdentityFields(options.identity.email, options.identity.phone);
    headers.set("X-QuoteFlow-Business-Email", identity.email);
    headers.set("X-QuoteFlow-Business-Phone", identity.phone);
  }

  const response = await fetch(path, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 204) {
    return undefined as T;
  }

  return parseApiResponse<T>(response);
}

export async function getRemoteBootstrap(identity: BusinessIdentity) {
  return apiRequest<BootstrapPayload>("/api/bootstrap", { identity });
}

export async function claimRemoteBusinessIdentity(payload: {
  email: string;
  phone: string;
  seed: BootstrapPayload;
}) {
  const response = await apiRequest<BusinessIdentityBootstrap>("/api/business-identity", {
    body: payload,
    method: "POST",
  });
  saveBusinessIdentity(response.businessIdentity);
  return response;
}

export async function updateRemoteBusinessSettings(
  identity: BusinessIdentity,
  profile: BusinessProfile,
) {
  return apiRequest<{ businessProfile: BusinessProfile }>("/api/business-settings", {
    body: profile,
    identity,
    method: "PUT",
  });
}

export async function createRemoteDocument(
  identity: BusinessIdentity,
  document: QuoteFlowDocument,
  options?: SaveDocumentOptions,
) {
  return apiRequest<{ document: QuoteFlowDocument; nextNumbers: NextNumbers }>("/api/documents", {
    body: {
      ...document,
      saveOptions: options || {},
    },
    identity,
    method: "POST",
  });
}

export async function updateRemoteDocument(
  identity: BusinessIdentity,
  documentId: string,
  document: QuoteFlowDocument,
  options?: SaveDocumentOptions,
) {
  return apiRequest<{ document: QuoteFlowDocument; nextNumbers?: NextNumbers }>(
    `/api/documents/${encodeURIComponent(documentId)}`,
    {
      body: {
        ...document,
        saveOptions: options || {},
      },
      identity,
      method: "PUT",
    },
  );
}

export async function deleteRemoteDocument(identity: BusinessIdentity, documentId: string) {
  return apiRequest<void>(`/api/documents/${encodeURIComponent(documentId)}`, {
    identity,
    method: "DELETE",
  });
}

export async function duplicateRemoteDocument(identity: BusinessIdentity, documentId: string) {
  return apiRequest<{ document: QuoteFlowDocument; nextNumbers: NextNumbers }>(
    `/api/documents/${encodeURIComponent(documentId)}/duplicate`,
    {
      identity,
      method: "POST",
    },
  );
}

export async function convertRemoteQuotation(identity: BusinessIdentity, documentId: string) {
  return apiRequest<{ document: QuoteFlowDocument; nextNumbers: NextNumbers }>(
    `/api/documents/${encodeURIComponent(documentId)}/convert`,
    {
      identity,
      method: "POST",
    },
  );
}

export async function markRemoteDocumentShared(
  identity: BusinessIdentity,
  documentId: string,
  via: "pdf" | "whatsapp",
) {
  return apiRequest<{ document: QuoteFlowDocument }>(
    `/api/documents/${encodeURIComponent(documentId)}/shared`,
    {
      body: { via },
      identity,
      method: "POST",
    },
  );
}
