import type { DocumentStatus, DocumentType, PaymentMethod } from "../types";

export const APP_NAME = "QuoteFlow";

export const CURRENCY_OPTIONS = [
  { code: "TZS", label: "TZS - Tanzanian Shilling" },
  { code: "KES", label: "KES - Kenyan Shilling" },
  { code: "UGX", label: "UGX - Ugandan Shilling" },
  { code: "USD", label: "USD - US Dollar" },
  { code: "EUR", label: "EUR - Euro" },
  { code: "GBP", label: "GBP - British Pound" },
  { code: "NGN", label: "NGN - Nigerian Naira" },
  { code: "ZAR", label: "ZAR - South African Rand" },
];

export const QUOTATION_STATUSES: DocumentStatus[] = [
  "draft",
  "sent",
  "accepted",
  "expired",
];

export const INVOICE_STATUSES: DocumentStatus[] = [
  "unpaid",
  "partial",
  "paid",
  "overdue",
];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  quotation: "Quotation",
  invoice: "Invoice",
};

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  expired: "Expired",
  paid: "Paid",
  unpaid: "Unpaid",
  partial: "Partial",
  overdue: "Overdue",
};

export const PAYMENT_METHODS: PaymentMethod[] = [
  "Bank Transfer",
  "Cash",
  "Mobile Money",
  "Card",
  "Cheque",
  "Other",
];

export const DEFAULT_TERMS = "";

export const DEFAULT_NOTES = "";

export const STORAGE_KEY = "quoteflow-storage";
