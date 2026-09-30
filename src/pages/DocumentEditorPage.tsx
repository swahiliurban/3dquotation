import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { DocumentEditor } from "../components/documents/DocumentEditor";
import { EmptyState } from "../components/ui/EmptyState";
import {
  buildDocumentNumber,
  createDocumentDraft,
  createHistoryEntry,
  nextDocumentNumberForClient,
} from "../lib/documents";
import { useQuoteFlowStore } from "../store/useQuoteFlowStore";
import type { DocumentType, QuoteFlowDocument } from "../types";

function buildInvoiceFromQuotation(
  quotation: QuoteFlowDocument,
  documents: QuoteFlowDocument[],
) {
  const invoice = createDocumentDraft(
    "invoice",
    nextDocumentNumberForClient(documents, "invoice", quotation.client),
    quotation.business,
  );

  return {
    ...invoice,
    client: quotation.client,
    currency: quotation.currency,
    items: quotation.items.map((item) => ({ ...item })),
    notes: quotation.notes,
    terms: quotation.terms,
    sourceQuotationId: quotation.id,
    history: [createHistoryEntry("Draft loaded", `Imported from ${quotation.number}`)],
  };
}

export function DocumentEditorPage({ type }: { type?: DocumentType }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const documents = useQuoteFlowStore((state) => state.documents);
  const clients = useQuoteFlowStore((state) => state.clients);
  const catalog = useQuoteFlowStore((state) => state.catalog);
  const businessProfile = useQuoteFlowStore((state) => state.businessProfile);
  const nextNumbers = useQuoteFlowStore((state) => state.nextNumbers);
  const saveDocument = useQuoteFlowStore((state) => state.saveDocument);
  const existing = id ? documents.find((document) => document.id === id) : undefined;
  const editorType = existing?.type ?? type;
  const quotationOptions = documents.filter((document) => document.type === "quotation");

  if (!editorType) {
    return (
      <EmptyState
        action={
          <Link className="action-link" to="/">
            Go to dashboard
          </Link>
        }
        description="This editor needs a document type. Start from the dashboard or records list."
        title="No document type provided"
      />
    );
  }

  if (id && !existing) {
    return (
      <EmptyState
        action={
          <Link className="action-link" to="/records">
            View records
          </Link>
        }
        description="The document you tried to edit is no longer available in your workspace."
        title="Document not found"
      />
    );
  }

  const quotationId = searchParams.get("from");
  const quotationForImport = quotationId
    ? quotationOptions.find((document) => document.id === quotationId)
    : undefined;

  const initialDocument =
    existing ??
    (editorType === "invoice" && quotationForImport
        ? buildInvoiceFromQuotation(quotationForImport, documents)
        : createDocumentDraft(
          editorType,
          buildDocumentNumber(editorType, nextNumbers[editorType]),
          businessProfile,
        ));

  return (
    <DocumentEditor
      businessProfile={businessProfile}
      catalogOptions={catalog}
      clientOptions={clients}
      initialDocument={initialDocument}
      isNew={!existing}
      onSave={async (document, isNew, mode, options) => {
        const saved = await saveDocument(document, isNew, options);
        if (mode === "save") {
          toast.success(`${saved.number} ${isNew ? "saved" : "updated"} successfully.`);
          navigate(`/records/${saved.id}`);
        }
        return saved;
      }}
      quotationOptions={quotationOptions}
      savedDocuments={documents}
    />
  );
}
