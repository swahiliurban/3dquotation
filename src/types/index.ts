export type ThemeMode = "light" | "dark";

export type DocumentType = "quotation" | "invoice";

export type DocumentStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "expired"
  | "paid"
  | "unpaid"
  | "partial"
  | "overdue";

export type PaymentMethod =
  | "Bank Transfer"
  | "Cash"
  | "Mobile Money"
  | "Card"
  | "Cheque"
  | "Other";

export interface WorkspaceUser {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export interface BankAccount {
  id: string;
  label: string;
  details: string;
}

export interface BusinessProfile {
  name: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  logoDataUrl?: string;
  signatureDataUrl?: string;
  stampLabel?: string;
  bankDetails?: string;
  bankAccounts: BankAccount[];
  accentColor?: string;
  showTax: boolean;
  showDiscount: boolean;
  defaultTaxRate: number;
  defaultDiscountRate: number;
  showClientDetails: boolean;
  showNotes: boolean;
  showTerms: boolean;
  defaultNotes: string;
  defaultTerms: string;
}

export interface ContactProfile {
  clientId?: string;
  name: string;
  company: string;
  address: string;
  phone: string;
  email: string;
}

export interface ClientProfile extends ContactProfile {
  id: string;
  lastUsedAt: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  description: string;
  unitPrice: number;
  discount: number;
  tax: number;
  updatedAt: string;
}

export interface DocumentItem {
  id: string;
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  importConfidence?: number;
  importNeedsReview?: boolean;
  importSource?: "pdf-text" | "pdf-ocr" | "image-ocr";
}

export interface DocumentHistoryEntry {
  id: string;
  action: string;
  detail: string;
  timestamp: string;
}

export interface QuoteFlowDocument {
  id: string;
  type: DocumentType;
  number: string;
  status: DocumentStatus;
  currency: string;
  issueDate: string;
  validUntil?: string;
  dueDate?: string;
  business: BusinessProfile;
  client: ContactProfile;
  items: DocumentItem[];
  notes: string;
  terms: string;
  paymentMethod?: PaymentMethod;
  amountPaid?: number;
  sourceQuotationId?: string;
  history: DocumentHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface DocumentTotals {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  amountPaid: number;
  balanceDue: number;
}

export interface DashboardStats {
  totalQuotations: number;
  totalInvoices: number;
  paidInvoices: number;
  pendingInvoices: number;
  totalRevenue: number;
}

export interface NextNumbers {
  quotation: number;
  invoice: number;
}

export interface BusinessIdentity {
  email: string;
  phone: string;
  key: string;
}

export interface SaveDocumentOptions {
  manualNumber?: boolean;
  replaceExistingNumber?: boolean;
}

export interface BootstrapPayload {
  user: WorkspaceUser;
  businessProfile: BusinessProfile;
  clients: ClientProfile[];
  catalog: CatalogItem[];
  documents: QuoteFlowDocument[];
  nextNumbers: NextNumbers;
}

export interface QuoteFlowState {
  theme: ThemeMode;
  user: WorkspaceUser | null;
  isInitializing: boolean;
  isSyncingIdentity: boolean;
  businessIdentity: BusinessIdentity | null;
  businessProfile: BusinessProfile;
  clients: ClientProfile[];
  catalog: CatalogItem[];
  documents: QuoteFlowDocument[];
  nextNumbers: NextNumbers;
  initializeApp: () => Promise<void>;
  setTheme: (theme: ThemeMode) => void;
  connectBusinessIdentity: (payload: {
    email: string;
    phone: string;
    seedProfile?: BusinessProfile;
  }) => Promise<{ workspaceExists: boolean }>;
  disconnectBusinessIdentity: () => Promise<void>;
  signup: (payload: {
    name: string;
    email: string;
    phone: string;
    password: string;
  }) => Promise<void>;
  login: (payload: { email: string; password: string }) => Promise<void>;
  updateBusinessProfile: (profile: BusinessProfile) => Promise<void>;
  saveDocument: (
    document: QuoteFlowDocument,
    isNew: boolean,
    options?: SaveDocumentOptions,
  ) => Promise<QuoteFlowDocument>;
  deleteDocument: (documentId: string) => Promise<void>;
  duplicateDocument: (documentId: string) => Promise<QuoteFlowDocument | undefined>;
  convertQuotationToInvoice: (quotationId: string) => Promise<QuoteFlowDocument | undefined>;
  markDocumentShared: (documentId: string, via: "pdf" | "whatsapp") => Promise<void>;
}
