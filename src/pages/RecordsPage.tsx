import { FileText, Receipt, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { RecordsTable } from "../components/records/RecordsTable";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { buildRecordIndex, searchRecords } from "../lib/recordSearch";
import { Button } from "../components/ui/Button";
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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const deferredQuery = useDeferredValue(query);
  const [sharingDocumentId, setSharingDocumentId] = useState<string | null>(null);

  const index = useMemo(() => buildRecordIndex(documents), [documents]);
  const filteredDocuments = useMemo(() => searchRecords(index, {
    query: deferredQuery, type: typeFilter, status: statusFilter, from: dateFrom, to: dateTo, sort,
  }), [index, deferredQuery, typeFilter, statusFilter, dateFrom, dateTo, sort]);
  const pageCount = Math.max(1, Math.ceil(filteredDocuments.length / 50));
  const currentPage = Math.min(page, pageCount);
  const visibleDocuments = filteredDocuments.slice((currentPage - 1) * 50, currentPage * 50);
  const filteredQuotations = visibleDocuments.filter((document) => document.type === "quotation");
  const filteredInvoices = visibleDocuments.filter((document) => document.type === "invoice");

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
        <label className="relative md:col-span-2 xl:col-span-4">
          <span className="form-label">Search records</span>
          <Search className="pointer-events-none absolute left-4 top-[3.35rem] text-slate-400" size={18} />
          <input
            className="form-input pl-11 pr-20"
            onChange={(event) => { setQuery(event.target.value); setPage(1); }}
            placeholder="Search client, product, invoice number, quotation number..."
            value={query}
          />
          {query && <button type="button" className="absolute right-3 bottom-3 text-sm font-semibold" onClick={() => { setQuery(""); setPage(1); }} aria-label="Clear search">Clear</button>}
        </label>
        <div>
          <label className="form-label" htmlFor="record-type">Document type</label>
          <select id="record-type" className="form-input" onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }} value={typeFilter}>
            <option value="all">All Documents</option>
            <option value="quotation">Quotation</option>
            <option value="invoice">Invoice</option>
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="record-status">Status</label>
          <select id="record-status" className="form-input" onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} value={statusFilter}>
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
        <label>
          <span className="form-label">From date</span>
          <input className="form-input" onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} type="date" value={dateFrom} max={dateTo || undefined} />
        </label>
        <label>
          <span className="form-label">To date</span>
          <input className="form-input" onChange={(event) => { setDateTo(event.target.value); setPage(1); }} type="date" value={dateTo} min={dateFrom || undefined} />
        </label>
        <label>
          <span className="form-label">Sort by</span>
          <select className="form-input" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="highest">Highest amount</option>
            <option value="lowest">Lowest amount</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status">{filteredDocuments.length} matching records | Page {currentPage} of {pageCount}</p>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</Button>
          <Button variant="secondary" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button>
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
                    <p className="panel-subtitle">{filteredQuotations.length} quotation records on this page</p>
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
                    <p className="panel-subtitle">{filteredInvoices.length} invoice records on this page</p>
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
          title="No matching records found"
        />
      )}
    </div>
  );
}
