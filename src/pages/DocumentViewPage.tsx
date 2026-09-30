import {
  ArrowRightLeft,
  Copy,
  Download,
  MessageCircle,
  Pencil,
  Printer,
} from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { DocumentPreview } from "../components/documents/DocumentPreview";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import {
  calculateDocumentTotalsForDocument,
  formatCurrency,
  getDocumentPricingOptions,
} from "../lib/documents";
import { formatDateLabel } from "../lib/utils";
import { generateDocumentPdf } from "../lib/pdf";
import { shareDocumentViaWhatsApp, shareResultMessage } from "../lib/share";
import { downloadBlob } from "../lib/utils";
import { useQuoteFlowStore } from "../store/useQuoteFlowStore";

export function DocumentViewPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const autoDownloadStarted = useRef(false);
  const [isSharing, setIsSharing] = useState(false);
  const navigate = useNavigate();
  const documents = useQuoteFlowStore((state) => state.documents);
  const duplicateDocument = useQuoteFlowStore((state) => state.duplicateDocument);
  const convertQuotationToInvoice = useQuoteFlowStore((state) => state.convertQuotationToInvoice);
  const markDocumentShared = useQuoteFlowStore((state) => state.markDocumentShared);
  const document = documents.find((entry) => entry.id === id);

  useEffect(() => {
    if (!document || searchParams.get("download") !== "pdf" || autoDownloadStarted.current) {
      return;
    }

    autoDownloadStarted.current = true;
    void (async () => {
      try {
        const blob = await generateDocumentPdf(document);
        downloadBlob(blob, `${document.number}.pdf`);
        await markDocumentShared(document.id, "pdf");
        toast.success("Saved PDF downloaded.");
      } catch {
        toast.error("Could not download that PDF.");
      } finally {
        setSearchParams({}, { replace: true });
      }
    })();
  }, [document, markDocumentShared, searchParams, setSearchParams]);

  if (!document) {
    return (
      <EmptyState
        action={
          <Link className="action-link" to="/records">
            Back to records
          </Link>
        }
        description="This document could not be found in your saved workspace data."
        title="Document not found"
      />
    );
  }

  const currentDocument = document;
  const totals = calculateDocumentTotalsForDocument(currentDocument);
  const pricingOptions = getDocumentPricingOptions(currentDocument);
  const showDiscountSummary = pricingOptions.includeDiscount || totals.discountTotal > 0;

  async function handleDownload() {
    const blob = await generateDocumentPdf(currentDocument);
    downloadBlob(blob, `${currentDocument.number}.pdf`);
    await markDocumentShared(currentDocument.id, "pdf");
    toast.success("PDF downloaded.");
  }

  async function handleShare() {
    if (isSharing) {
      return;
    }

    setIsSharing(true);
    try {
      const result = await shareDocumentViaWhatsApp(currentDocument);
      if (result.mode !== "cancelled") {
        await markDocumentShared(currentDocument.id, "whatsapp");
      }
      toast.success(shareResultMessage(result));
    } catch {
      toast.error("Could not start the WhatsApp share flow.");
    } finally {
      setIsSharing(false);
    }
  }

  async function handleDuplicate() {
    const duplicate = await duplicateDocument(currentDocument.id);
    if (!duplicate) {
      toast.error("Could not duplicate that document.");
      return;
    }

    navigate(`/records/${duplicate.id}/edit`);
  }

  async function handleConvert() {
    const invoice = await convertQuotationToInvoice(currentDocument.id);
    if (!invoice) {
      toast.error("Could not convert that quotation.");
      return;
    }

    navigate(`/records/${invoice.id}`);
  }

  const desktopActions = (
    <div className="hidden md:flex md:flex-wrap md:justify-end md:gap-3">
      <Link className="action-link" to={`/records/${currentDocument.id}/edit`}>
        <Pencil size={16} />
        Edit
      </Link>
      <Button icon={<Copy size={16} />} onClick={() => void handleDuplicate()} variant="secondary">
        Duplicate
      </Button>
      {currentDocument.type === "quotation" ? (
        <Button icon={<ArrowRightLeft size={16} />} onClick={() => void handleConvert()} variant="secondary">
          Convert
        </Button>
      ) : null}
      <Button icon={<Download size={16} />} onClick={() => void handleDownload()} variant="secondary">
        PDF
      </Button>
      <Button disabled={isSharing} icon={<MessageCircle size={16} />} onClick={() => void handleShare()} variant="secondary">
        {isSharing ? "Preparing..." : "WhatsApp"}
      </Button>
      <Button icon={<Printer size={16} />} onClick={() => window.print()} variant="secondary">
        Print
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Document detail"
        title={`${currentDocument.number} overview`}
        description="Review the live preview, see when it was created and last changed, and export or share the final PDF from here."
        actions={desktopActions}
      />

      <Card className="space-y-3 md:hidden">
        <Button icon={<Pencil size={16} />} stretch onClick={() => navigate(`/records/${currentDocument.id}/edit`)}>
          Edit document
        </Button>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Button icon={<Download size={16} />} stretch onClick={() => void handleDownload()} variant="secondary">
            Download PDF
          </Button>
          <Button disabled={isSharing} icon={<MessageCircle size={16} />} stretch onClick={() => void handleShare()} variant="secondary">
            {isSharing ? "Preparing..." : "Share"}
          </Button>
          <Button icon={<Copy size={16} />} stretch onClick={() => void handleDuplicate()} variant="secondary">
            Duplicate
          </Button>
          {currentDocument.type === "quotation" ? (
            <Button icon={<ArrowRightLeft size={16} />} stretch onClick={() => void handleConvert()} variant="secondary">
              Convert
            </Button>
          ) : (
            <Button icon={<Printer size={16} />} stretch onClick={() => window.print()} variant="secondary">
              Print
            </Button>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:gap-6 xl:grid-cols-[minmax(0,1.12fr)_360px]">
        <DocumentPreview document={currentDocument} />

        <div className="space-y-6">
          <Card className="space-y-4">
            <div>
              <h2 className="panel-title">Totals</h2>
              <p className="panel-subtitle">A quick financial summary for this document.</p>
            </div>
            <div className="space-y-3 text-sm text-slate-600 dark:text-slate-200">
              <div className="flex items-center justify-between">
                <span>Issue date</span>
                <span>{formatDateLabel(currentDocument.issueDate)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Created</span>
                <span>{new Date(currentDocument.createdAt).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Last modified</span>
                <span>{new Date(currentDocument.updatedAt).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Subtotal</span>
                <span>{formatCurrency(totals.subtotal, currentDocument.currency)}</span>
              </div>
              {showDiscountSummary ? (
                <div className="flex items-center justify-between">
                  <span>Discount</span>
                  <span>{formatCurrency(-totals.discountTotal, currentDocument.currency)}</span>
                </div>
              ) : null}
              {pricingOptions.includeTax ? (
                <div className="flex items-center justify-between">
                  <span>Tax total</span>
                  <span>{formatCurrency(totals.taxTotal, currentDocument.currency)}</span>
                </div>
              ) : null}
              {currentDocument.type === "invoice" ? (
                <>
                  <div className="flex items-center justify-between">
                    <span>Amount paid</span>
                    <span>{formatCurrency(totals.amountPaid, currentDocument.currency)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Balance due</span>
                    <span>{formatCurrency(totals.balanceDue, currentDocument.currency)}</span>
                  </div>
                </>
              ) : null}
              <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-lg font-extrabold text-slate-900 dark:border-white/10 dark:text-white">
                <span>Grand total</span>
                <span>{formatCurrency(totals.grandTotal, currentDocument.currency)}</span>
              </div>
            </div>
          </Card>

          <Card className="space-y-4">
            <div>
              <h2 className="panel-title">History</h2>
              <p className="panel-subtitle">Every major action stays attached to the record.</p>
            </div>
            <div className="space-y-3">
              {currentDocument.history
                .slice()
                .reverse()
                .map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-[22px] border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"
                  >
                    <p className="font-semibold text-slate-900 dark:text-white">{entry.action}</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">{entry.detail}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                      {new Date(entry.timestamp).toLocaleString()}
                    </p>
                  </div>
                ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
