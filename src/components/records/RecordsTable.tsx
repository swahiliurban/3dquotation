import {
  ArrowRightLeft,
  Copy,
  Download,
  Eye,
  MessageCircle,
  Pencil,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { DOCUMENT_TYPE_LABELS } from "../../lib/constants";
import { calculateDocumentTotalsForDocument, formatCurrency } from "../../lib/documents";
import { formatDateLabel } from "../../lib/utils";
import type { QuoteFlowDocument } from "../../types";
import { StatusBadge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

interface RecordsTableProps {
  documents: QuoteFlowDocument[];
  onConvert: (documentId: string) => void;
  onDelete: (documentId: string) => void;
  onDownload: (documentId: string) => void;
  onDuplicate: (documentId: string) => void;
  onShare: (documentId: string) => void;
  sharingDocumentId?: string | null;
}

function documentTypeLabel(document: QuoteFlowDocument) {
  return document.type === "quotation" ? "Quote" : DOCUMENT_TYPE_LABELS[document.type];
}

export function RecordsTable({
  documents,
  onConvert,
  onDelete,
  onDownload,
  onDuplicate,
  onShare,
  sharingDocumentId,
}: RecordsTableProps) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-bold uppercase tracking-[0.14em] text-slate-500 dark:bg-white/5 dark:text-slate-400">
            <tr>
              <th className="px-5 py-4">Type</th>
              <th className="px-5 py-4">Client</th>
              <th className="px-5 py-4">Number</th>
              <th className="px-5 py-4">Date created</th>
              <th className="px-5 py-4">Total</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-white/10">
            {documents.map((document) => {
              const totals = calculateDocumentTotalsForDocument(document);
              return (
                <tr key={document.id} className="bg-white/70 dark:bg-slate-900/40">
                  <td className="px-5 py-4 font-semibold text-slate-700 dark:text-slate-200">
                    {documentTypeLabel(document)}
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {document.client.company || document.client.name || "No client"}
                    </p>
                    {document.client.company && document.client.name ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">{document.client.name}</p>
                    ) : null}
                  </td>
                  <td className="px-5 py-4 font-semibold text-slate-900 dark:text-white">
                    {document.number}
                  </td>
                  <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                    {formatDateLabel(document.issueDate)}
                  </td>
                  <td className="px-5 py-4 font-bold text-slate-900 dark:text-white">
                    {formatCurrency(totals.grandTotal, document.currency)}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={document.status} />
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <Link className="action-link !min-h-10 !rounded-2xl !px-3 !py-2" title="Preview" to={`/records/${document.id}`}>
                        <Eye size={16} />
                      </Link>
                      <Link className="action-link !min-h-10 !rounded-2xl !px-3 !py-2" title="Edit" to={`/records/${document.id}/edit`}>
                        <Pencil size={16} />
                      </Link>
                      <Button className="!min-h-10 !rounded-2xl !px-3 !py-2" onClick={() => onDownload(document.id)} title="Download PDF" variant="secondary">
                        <Download size={16} />
                      </Button>
                      <Button
                        className="!min-h-10 !rounded-2xl !px-3 !py-2"
                        disabled={Boolean(sharingDocumentId)}
                        onClick={() => onShare(document.id)}
                        title={sharingDocumentId === document.id ? "Preparing WhatsApp share" : "Share on WhatsApp"}
                        variant="secondary"
                      >
                        <MessageCircle size={16} />
                      </Button>
                      <Button className="!min-h-10 !rounded-2xl !px-3 !py-2" onClick={() => onDuplicate(document.id)} title="Duplicate" variant="secondary">
                        <Copy size={16} />
                      </Button>
                      {document.type === "quotation" ? (
                        <Button className="!min-h-10 !rounded-2xl !px-3 !py-2" onClick={() => onConvert(document.id)} title="Convert to invoice" variant="secondary">
                          <ArrowRightLeft size={16} />
                        </Button>
                      ) : null}
                      <Button className="!min-h-10 !rounded-2xl !px-3 !py-2" onClick={() => onDelete(document.id)} title="Delete" variant="danger">
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 p-4 lg:hidden">
        {documents.map((document) => {
          const totals = calculateDocumentTotalsForDocument(document);
          return (
            <div
              className="rounded-[22px] border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5"
              key={document.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                    {documentTypeLabel(document)}
                  </p>
                  <h3 className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white">
                    {document.number}
                  </h3>
                </div>
                <StatusBadge status={document.status} />
              </div>
              <div className="mt-4 grid gap-2 text-sm text-slate-600 dark:text-slate-300">
                <p>
                  <span className="font-semibold text-slate-800 dark:text-white">Client:</span>{" "}
                  {document.client.company || document.client.name || "No client"}
                </p>
                <p>
                  <span className="font-semibold text-slate-800 dark:text-white">Date:</span>{" "}
                  {formatDateLabel(document.issueDate)}
                </p>
                <p>
                  <span className="font-semibold text-slate-800 dark:text-white">Total:</span>{" "}
                  {formatCurrency(totals.grandTotal, document.currency)}
                </p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link className="action-link" to={`/records/${document.id}`}>
                  <Eye size={16} />
                  Preview
                </Link>
                <Link className="action-link" to={`/records/${document.id}/edit`}>
                  <Pencil size={16} />
                  Edit
                </Link>
                <Button icon={<Download size={16} />} onClick={() => onDownload(document.id)} variant="secondary">
                  PDF
                </Button>
                <Button
                  disabled={Boolean(sharingDocumentId)}
                  icon={<MessageCircle size={16} />}
                  onClick={() => onShare(document.id)}
                  variant="secondary"
                >
                  {sharingDocumentId === document.id ? "Preparing..." : "WhatsApp"}
                </Button>
                <Button icon={<Copy size={16} />} onClick={() => onDuplicate(document.id)} variant="secondary">
                  Duplicate
                </Button>
                <Button icon={<Trash2 size={16} />} onClick={() => onDelete(document.id)} variant="danger">
                  Delete
                </Button>
              </div>
              {document.type === "quotation" ? (
                <Button className="mt-2" icon={<ArrowRightLeft size={16} />} onClick={() => onConvert(document.id)} stretch variant="secondary">
                  Convert to invoice
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
