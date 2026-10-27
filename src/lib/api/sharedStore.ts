import type {
  BootstrapPayload,
  BusinessProfile,
  NextNumbers,
  QuoteFlowDocument,
} from "../../types";
import { unpackWorkspace } from "../../../shared/workspace-transfer.js";

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
  let payload: { error?: string };
  try { payload = await response.json(); }
  catch {
    throw Object.assign(new Error("The workspace response was incomplete. Please retry; your records have not been replaced."), {
      retryable: response.ok || response.status >= 500,
    });
  }
  if (!response.ok) {
    const error = new Error(payload.error || (response.status === 413
      ? "This request is too large. Reduce uploaded image sizes and try again."
      : `Workspace request failed (HTTP ${response.status}). Your changes remain in the editor; please try again.`));
    Object.assign(error, { status: response.status, retryable: [500, 502, 503, 504].includes(response.status) });
    throw error;
  }

  return unpackWorkspace(payload) as T;
}

async function apiRequest<T>(
  path: string,
  options: {
    body?: unknown;
    identity?: Pick<BusinessIdentity, "email" | "phone"> | null;
    method?: "GET" | "POST" | "PUT" | "DELETE";
    retryRead?: boolean;
  } = {},
) {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");

  if (options.identity) {
    const identity = normalizeIdentityFields(options.identity.email, options.identity.phone);
    headers.set("X-QuoteFlow-Business-Email", identity.email);
    headers.set("X-QuoteFlow-Business-Phone", identity.phone);
  }

  const controller = new AbortController();
  // Recovery downloads the entire workspace, including embedded document images.
  const recoveringWorkspace = path === "/api/bootstrap" || path === "/api/business-identity";
  if (recoveringWorkspace) headers.set("X-QuoteFlow-Transport", "assets-v1");
  const timeout = window.setTimeout(() => controller.abort(), recoveringWorkspace ? 660_000 : 60_000);
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(path, {
          method: options.method || "GET",
          headers,
          signal: controller.signal,
          cache: "no-store",
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
        });
        if (response.status === 204) return undefined as T;
        return await parseApiResponse<T>(response);
      } catch (error) {
        const transient = error instanceof TypeError || (error as { retryable?: boolean })?.retryable;
        if (!options.retryRead || !transient || controller.signal.aborted || attempt >= 2) throw error;
        // Only read-only recovery can be repeated. Never repeat account creation,
        // document saves, conversion, sharing, or deletion after an uncertain result.
        await new Promise(resolve => window.setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  } catch (error) {
    if (controller.signal.aborted) {
      if (recoveringWorkspace) {
        throw new Error("Loading the saved workspace timed out. Please retry on a stable connection; no empty workspace was substituted.");
      }
      throw new Error("The workspace request timed out. Your changes remain here. Check Records before retrying Save.");
    }
    if (error instanceof TypeError) throw new Error("Could not reach shared storage. Check your network connection and retry.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function getRemoteBootstrap(identity: BusinessIdentity) {
  const payload = await apiRequest<BootstrapPayload>("/api/bootstrap", { identity, retryRead: true });
  validateBootstrap(payload);
  return payload;
}

function validateBootstrap(payload: BootstrapPayload) {
  if (!payload?.businessProfile || !payload.nextNumbers || !Array.isArray(payload.documents) ||
      !Array.isArray(payload.clients) || !Array.isArray(payload.catalog)) {
    throw new Error("The saved workspace response is incomplete. Please retry recovery.");
  }
}

export async function claimRemoteBusinessIdentity(payload: {
  email: string;
  phone: string;
  seed: BootstrapPayload;
  createIfMissing?: boolean;
}) {
  const response = await apiRequest<BusinessIdentityBootstrap>("/api/business-identity", {
    body: payload.createIfMissing ? payload : { email: payload.email, phone: payload.phone },
    method: "POST",
    retryRead: !payload.createIfMissing,
  });
  validateBootstrap(response);
  if (!response.businessIdentity?.email || !response.businessIdentity?.phone || !response.businessIdentity?.key) {
    throw new Error("The workspace identity response is incomplete. Please retry recovery.");
  }
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
