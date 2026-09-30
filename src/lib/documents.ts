import { addDaysIso, createId, safeNumber, todayIso } from "./utils";
import { INVOICE_STATUSES, QUOTATION_STATUSES } from "./constants";
import type {
  BankAccount,
  BusinessProfile,
  ContactProfile,
  DashboardStats,
  DocumentHistoryEntry,
  DocumentItem,
  DocumentStatus,
  DocumentTotals,
  DocumentType,
  QuoteFlowDocument,
} from "../types";

export const DEFAULT_BUSINESS_PROFILE: BusinessProfile = {
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

function hasText(value?: string) {
  return Boolean(value?.trim());
}

function normalizeBankAccount(account: Partial<BankAccount>, index: number): BankAccount {
  return {
    id: account.id?.trim() || createId(`bank-${index + 1}`),
    label: account.label?.trim() || "",
    details: account.details?.trim() || "",
  };
}

export function splitLegacyBankDetails(value?: string) {
  const raw = value?.trim();
  if (!raw) {
    return [];
  }

  const paragraphGroups = raw
    .split(/\n\s*\n+/)
    .map((group) => group.trim())
    .filter(Boolean);

  if (paragraphGroups.length > 1) {
    return paragraphGroups;
  }

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 3) {
    return [lines.join("\n")];
  }

  const accounts: string[] = [];
  let current: string[] = [];

  lines.forEach((line) => {
    const looksLikeAccountStart = /^[+\d][\d\s-]{5,}$/.test(line);
    if (looksLikeAccountStart && current.length >= 2) {
      accounts.push(current.join("\n"));
      current = [line];
      return;
    }

    current.push(line);
  });

  if (current.length > 0) {
    accounts.push(current.join("\n"));
  }

  return accounts.filter(Boolean);
}

export function getBankAccounts(
  profile?: Partial<Pick<BusinessProfile, "bankAccounts" | "bankDetails">> | null,
) {
  const structuredAccounts = (profile?.bankAccounts ?? [])
    .map((account, index) => normalizeBankAccount(account, index))
    .filter((account) => hasText(account.label) || hasText(account.details));

  if (structuredAccounts.length > 0) {
    return structuredAccounts;
  }

  return splitLegacyBankDetails(profile?.bankDetails).map((details, index) => {
    return normalizeBankAccount(
      {
        id: `legacy-bank-${index + 1}`,
        details,
      },
      index,
    );
  });
}

export function composeBankDetails(bankAccounts: BankAccount[]) {
  return bankAccounts
    .map((account) => {
      const details = account.details.trim();
      if (!details) {
        return "";
      }

      return account.label.trim()
        ? `${account.label.trim()}\n${details}`
        : details;
    })
    .filter(Boolean)
    .join("\n\n");
}

export function createEmptyBankAccount(index = 0): BankAccount {
  return {
    id: createId(`bank-${index + 1}`),
    label: "",
    details: "",
  };
}

export function normalizeBusinessProfile(profile: Partial<BusinessProfile> | undefined) {
  const bankAccounts = getBankAccounts(profile);

  return {
    ...DEFAULT_BUSINESS_PROFILE,
    ...profile,
    bankAccounts,
    bankDetails: composeBankDetails(bankAccounts),
  } satisfies BusinessProfile;
}

export function createEmptyItem(
  defaults?: Partial<Pick<DocumentItem, "discount" | "tax">>,
): DocumentItem {
  return {
    id: createId("item"),
    name: "",
    description: "",
    quantity: 1,
    unitPrice: 0,
    discount: defaults?.discount ?? 0,
    tax: defaults?.tax ?? 0,
  };
}

export function isDiscountLineItem(item: Pick<DocumentItem, "name">) {
  return item.name.trim().toLowerCase() === "discount";
}

export function calculateLineTotals(
  item: DocumentItem,
  options?: {
    includeDiscount?: boolean;
    includeTax?: boolean;
  },
) {
  const quantity = safeNumber(item.quantity);
  const unitPrice = safeNumber(item.unitPrice);
  const base = quantity * unitPrice;

  if (isDiscountLineItem(item)) {
    const discountAmount = Math.abs(base);

    return {
      base: 0,
      discountAmount,
      taxAmount: 0,
      lineTotal: -discountAmount,
    };
  }

  const discountRate =
    options?.includeDiscount === false ? 0 : safeNumber(item.discount) / 100;
  const taxRate = options?.includeTax === false ? 0 : safeNumber(item.tax) / 100;
  const discountAmount = base * discountRate;
  const taxable = base - discountAmount;
  const taxAmount = taxable * taxRate;
  const lineTotal = taxable + taxAmount;

  return {
    base,
    discountAmount,
    taxAmount,
    lineTotal,
  };
}

export function calculateDocumentTotals(
  items: DocumentItem[],
  amountPaid = 0,
  options?: {
    includeDiscount?: boolean;
    includeTax?: boolean;
  },
): DocumentTotals {
  const totals = items.reduce(
    (accumulator, item) => {
      const line = calculateLineTotals(item, options);
      accumulator.subtotal += line.base;
      accumulator.discountTotal += line.discountAmount;
      accumulator.taxTotal += line.taxAmount;
      accumulator.grandTotal += line.lineTotal;
      return accumulator;
    },
    {
      subtotal: 0,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 0,
      amountPaid: safeNumber(amountPaid),
      balanceDue: 0,
    },
  );

  totals.balanceDue = Math.max(totals.grandTotal - totals.amountPaid, 0);
  return totals;
}

export function getDocumentPricingOptions(document: Pick<QuoteFlowDocument, "business">) {
  return {
    includeDiscount: Boolean(document.business.showDiscount),
    includeTax: Boolean(document.business.showTax),
  };
}

export function calculateDocumentTotalsForDocument(document: QuoteFlowDocument) {
  return calculateDocumentTotals(
    document.items,
    document.amountPaid,
    getDocumentPricingOptions(document),
  );
}

export function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function normalizeIdentityText(value?: string) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") || "";
}

function normalizeIdentityPhone(value?: string) {
  const compact = value?.trim().replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "") || "";
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

export function documentClientIdentityKey(client?: Partial<ContactProfile> | null) {
  const email = normalizeIdentityText(client?.email);
  if (email) return `email:${email}`;

  const phone = normalizeIdentityPhone(client?.phone);
  if (phone) return `phone:${phone}`;

  const company = normalizeIdentityText(client?.company);
  if (company) return `company:${company}`;

  const name = normalizeIdentityText(client?.name);
  if (name) return `name:${name}`;

  const clientId = normalizeIdentityText(client?.clientId);
  if (clientId) return `id:${clientId}`;

  return "unassigned";
}

export function sameDocumentClient(
  left?: Partial<ContactProfile> | null,
  right?: Partial<ContactProfile> | null,
) {
  return documentClientIdentityKey(left) === documentClientIdentityKey(right);
}

export function documentNumberMatches(
  left: Pick<QuoteFlowDocument, "type" | "number" | "client">,
  right: Pick<QuoteFlowDocument, "type" | "number" | "client">,
) {
  return (
    left.type === right.type &&
    normalizeIdentityText(left.number) === normalizeIdentityText(right.number) &&
    sameDocumentClient(left.client, right.client)
  );
}

export function nextDocumentNumberForClient(
  documents: QuoteFlowDocument[],
  type: DocumentType,
  client: Partial<ContactProfile>,
  ignoredDocumentId?: string,
) {
  const clientKey = documentClientIdentityKey(client);
  const nextValue = documents.reduce((highest, document) => {
    if (
      document.id === ignoredDocumentId ||
      document.type !== type ||
      documentClientIdentityKey(document.client) !== clientKey
    ) {
      return highest;
    }

    const match = document.number.match(/-(\d+)$/);
    const number = match ? Number(match[1]) : 0;
    return Math.max(highest, number + 1);
  }, 1);

  return buildDocumentNumber(type, nextValue);
}

export function buildDocumentNumber(type: DocumentType, nextValue: number) {
  const prefix = type === "quotation" ? "QT" : "INV";
  return `${prefix}-${new Date().getFullYear()}-${String(nextValue).padStart(4, "0")}`;
}

export function defaultStatusForType(type: DocumentType): DocumentStatus {
  return type === "quotation" ? QUOTATION_STATUSES[0] : INVOICE_STATUSES[0];
}

export function createHistoryEntry(action: string, detail: string): DocumentHistoryEntry {
  return {
    id: createId("history"),
    action,
    detail,
    timestamp: new Date().toISOString(),
  };
}

export function createDocumentDraft(
  type: DocumentType,
  number: string,
  business: BusinessProfile,
): QuoteFlowDocument {
  const normalizedBusiness = normalizeBusinessProfile(business);

  return {
    id: createId(type),
    type,
    number,
    status: defaultStatusForType(type),
    currency: "TZS",
    issueDate: todayIso(),
    validUntil: type === "quotation" ? addDaysIso(14) : undefined,
    dueDate: type === "invoice" ? addDaysIso(14) : undefined,
    business: normalizedBusiness,
    client: {
      name: "",
      company: "",
      address: "",
      phone: "",
      email: "",
    },
    items: [
      createEmptyItem({
        discount: normalizedBusiness.showDiscount ? normalizedBusiness.defaultDiscountRate : 0,
        tax: normalizedBusiness.showTax ? normalizedBusiness.defaultTaxRate : 0,
      }),
    ],
    notes: normalizedBusiness.defaultNotes,
    terms: normalizedBusiness.defaultTerms,
    paymentMethod: undefined,
    amountPaid: 0,
    history: [createHistoryEntry("Draft created", `Started ${type} ${number}`)],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function deriveInvoiceStatus(document: QuoteFlowDocument): DocumentStatus {
  if (document.type === "quotation") {
    return document.status;
  }

  const totals = calculateDocumentTotalsForDocument(document);
  if (totals.balanceDue <= 0) {
    return "paid";
  }

  if (totals.amountPaid > 0) {
    return "partial";
  }

  if (document.dueDate && document.dueDate < todayIso()) {
    return "overdue";
  }

  return document.status === "draft" ? "unpaid" : document.status;
}

export function summarizeDashboard(documents: QuoteFlowDocument[]): DashboardStats {
  const invoices = documents.filter((document) => document.type === "invoice");
  const revenue = invoices.reduce((sum, document) => {
    return sum + calculateDocumentTotalsForDocument(document).amountPaid;
  }, 0);

  return {
    totalQuotations: documents.filter((document) => document.type === "quotation").length,
    totalInvoices: invoices.length,
    paidInvoices: invoices.filter((document) => deriveInvoiceStatus(document) === "paid").length,
    pendingInvoices: invoices.filter((document) => deriveInvoiceStatus(document) !== "paid").length,
    totalRevenue: revenue,
  };
}

export function sortDocumentsByRecent(documents: QuoteFlowDocument[]) {
  return [...documents].sort((left, right) => {
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}
