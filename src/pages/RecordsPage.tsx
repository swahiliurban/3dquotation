import { FileText, Receipt, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { RecordsTable } from "../components/records/RecordsTable";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { generateDocumentPdf } from "../lib/pdf";
import { shareDocumentViaWhatsApp, shareResultMessage } from "../lib/share";
import { downloadBlob } from "../lib/utils";
import { useQuoteFlowStore } from "../store/useQuoteFlowStore";

export function RecordsPage() {
  const navigate = useNavigate();
  const documents = useQuoteFlowStore((state) => state.documents);
  const duplicateDocument = useQuoteFlowStore((state) => state.duplicateDocument);
  const deleteDocument = useQuoteFlowStore((state) => state.deleteDocument);
  const convertQuotationToInvoice = useQuoteFlowStore((state) => state.convertQuotationToInvoice);
  const markDocumentShared = useQuoteFlowStore((state) => state.markDocumentShared);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [sharingDocumentId, setSharingDocumentId] = useState<string | null>(null);

  const filteredDocuments = useMemo(() => {
    return documents.filter((document) => {
      const matchesQuery = [document.number, document.client.name, document.client.company]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesType = typeFilter === "all" || document.type === typeFilter;
      const matchesStatus = statusFilter === "all" || document.status === statusFilter;
      const matchesDate = !dateFilter || document.issueDate === dateFilter;
      return matchesQuery && matchesType && matchesStatus && matchesDate;
    });
  }, [dateFilter, documents, query, statusFilter, typeFilter]);
  const filteredQuotations = filteredDocuments.filter((document) => document.type === "quotation");
  const filteredInvoices = filteredDocuments.filter((document) => document.type === "invoice");

  async function handleDownload(documentId: string) {
    const document = documents.find((item) => item.id === documentId);
    if (!document) {
      return;
    }

    const blob = await generateDocumentPdf(document);
    downloadBlob(blob, `${document.number}.pdf`);
    await markDocumentShared(document.id, "pdf");
    toast.success("PDF downloaded.");
  }

  async function handleShare(documentId: string) {
    if (sharingDocumentId) {
      return;
    }

    const document = documents.find((item) => item.id === documentId);
    if (!document) {
      return;
    }

    setSharingDocumentId(documentId);
    try {
      const result = await shareDocumentViaWhatsApp(document);
      if (result.mode !== "cancelled") {
        await markDocumentShared(document.id, "whatsapp");
      }
      toast.success(shareResultMessage(result));
    } catch (error) {
      toast.error("Could not start the WhatsApp share flow.");
    } finally {
      setSharingDocumentId(null);
    }
  }

  async function handleDuplicate(documentId: string) {
    const duplicate = await duplicateDocument(documentId);
    if (!duplicate) {
      toast.error("Could not duplicate that record.");
      return;
    }

    toast.success(`${duplicate.number} created from the existing document.`);
    navigate(`/records/${duplicate.id}/edit`);
  }

  async function handleDelete(documentId: string) {
    const document = documents.find((item) => item.id === documentId);
    if (!document) {
      return;
    }

    if (!window.confirm(`Delete ${document.number}? This action cannot be undone.`)) {
      return;
    }

    await deleteDocument(documentId);
    toast.success(`${document.number} deleted.`);
  }

  async function handleConvert(documentId: string) {
    const invoice = await convertQuotationToInvoice(documentId);
    if (!invoice) {
      toast.error("Could not convert that quotation.");
      return;
    }

    toast.success(`${invoice.number} created from the quotation.`);
    navigate(`/records/${invoice.id}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Records"
        title="Search, filter, and act on every quotation and invoice."
        description="Manage your full document history from one responsive list. Open a record, edit it, duplicate it, export a PDF, or start a WhatsApp share flow instantly."
      />

      <div className="glass-card grid gap-3 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-4">
        <label className="relative">
          <span className="form-label">Search client or number</span>
          <Search className="pointer-events-none absolute left-4 top-[3.35rem] text-slate-400" size={18} />
          <input
            className="form-input pl-11"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search records"
            value={query}
          />
        </label>
        <div>
          <label className="form-label">Document type</label>
          <select className="form-input" onChange={(event) => setTypeFilter(event.target.value)} value={typeFilter}>
            <option value="all">All types</option>
            <option value="quotation">Quotation</option>
            <option value="invoice">Invoice</option>
          </select>
        </div>
        <div>
          <label className="form-label">Status</label>
          <select className="form-input" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="accepted">Accepted</option>
            <option value="expired">Expired</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
        <div>
          <label className="form-label">Date</label>
          <input className="form-input" onChange={(event) => setDateFilter(event.target.value)} type="date" value={dateFilter} />
        </div>
      </div>

      {filteredDocuments.length > 0 ? (
        <div className="space-y-6">
          {(typeFilter === "all" || typeFilter === "quotation") && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-[18px] bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-100">
                    <FileText size={18} />
                  </span>
                  <div>
                    <h2 className="panel-title">Saved Quotations</h2>
                    <p className="panel-subtitle">{filteredQuotations.length} quotation records</p>
                  </div>
                </div>
              </div>
              {filteredQuotations.length > 0 ? (
                <RecordsTable
                  documents={filteredQuotations}
                  onConvert={(documentId) => void handleConvert(documentId)}
                  onDelete={(documentId) => void handleDelete(documentId)}
                  onDownload={(documentId) => void handleDownload(documentId)}
                  onDuplicate={(documentId) => void handleDuplicate(documentId)}
                  onShare={(documentId) => void handleShare(documentId)}
                  sharingDocumentId={sharingDocumentId}
                />
              ) : (
                <EmptyState
                  description="No saved quotations match the current filters."
                  title="No matching quotations"
                />
              )}
            </section>
          )}

          {(typeFilter === "all" || typeFilter === "invoice") && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-[18px] bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-100">
                    <Receipt size={18} />
                  </span>
                  <div>
                    <h2 className="panel-title">Saved Invoices</h2>
                    <p className="panel-subtitle">{filteredInvoices.length} invoice records</p>
                  </div>
                </div>
              </div>
              {filteredInvoices.length > 0 ? (
                <RecordsTable
                  documents={filteredInvoices}
                  onConvert={(documentId) => void handleConvert(documentId)}
                  onDelete={(documentId) => void handleDelete(documentId)}
                  onDownload={(documentId) => void handleDownload(documentId)}
                  onDuplicate={(documentId) => void handleDuplicate(documentId)}
                  onShare={(documentId) => void handleShare(documentId)}
                  sharingDocumentId={sharingDocumentId}
                />
              ) : (
                <EmptyState
                  description="No saved invoices match the current filters."
                  title="No matching invoices"
                />
              )}
            </section>
          )}
        </div>
      ) : (
        <EmptyState
          description="No records match the current filters. Try adjusting the search, date, or status, or create a fresh quotation."
          title="No matching records"
        />
      )}
    </div>
  );
}
