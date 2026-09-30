import { DOCUMENT_TYPE_LABELS } from "./constants";
import { createWhatsappLink, downloadBlob, formatDateLabel } from "./utils";
import { calculateDocumentTotalsForDocument, formatCurrency } from "./documents";
import { generateDocumentPdf } from "./pdf";
import type { QuoteFlowDocument } from "../types";

function getDocumentShareUrl(document: QuoteFlowDocument) {
  if (typeof window === "undefined") {
    return "";
  }

  return `${window.location.origin}/records/${document.id}?download=pdf`;
}

export function buildShareMessage(document: QuoteFlowDocument, shareUrl?: string) {
  const label = DOCUMENT_TYPE_LABELS[document.type];
  const clientName =
    document.client.company || document.client.name || "Client";
  const businessName = document.business.name || "QuoteFlow";
  const totals = calculateDocumentTotalsForDocument(document);
  const amount = formatCurrency(totals.grandTotal, document.currency);
  const linkLine = shareUrl ? `\n\nPDF link: ${shareUrl}` : "";

  return `Hello,\n\nPlease find ${label} ${document.number} from ${businessName}.\n\nClient: ${clientName}\nGrand Total: ${amount}\nDate: ${formatDateLabel(document.issueDate)}${linkLine}\n\nThank you.`;
}

function safeFilenamePart(value: string) {
  return value
    .trim()
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function documentPdfFilename(document: QuoteFlowDocument) {
  const clientName = document.client.company || document.client.name || "CLIENT";
  const parts = [document.number, clientName]
    .map(safeFilenamePart)
    .filter(Boolean);

  return `${parts.join("-") || "quoteflow-document"}.pdf`;
}

function openWhatsappMessage(message: string) {
  const link = createWhatsappLink(message);
  const opened = window.open(link, "_blank", "noopener,noreferrer");

  if (opened) {
    return true;
  }

  const anchor = document.createElement("a");
  anchor.href = link;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  return true;
}

export function shareResultMessage(result: Awaited<ReturnType<typeof shareDocumentViaWhatsApp>>) {
  if (result.mode === "web-share") {
    return "Share sheet opened. Choose WhatsApp to send the PDF.";
  }

  if (result.mode === "cancelled") {
    return "Share cancelled. The document is still saved.";
  }

  if (result.whatsappOpened) {
    return "PDF downloaded. WhatsApp opened with the prepared message; attach the downloaded PDF if needed.";
  }

  return "PDF downloaded. WhatsApp could not open automatically, so attach the PDF manually.";
}

export async function shareDocumentViaWhatsApp(document: QuoteFlowDocument) {
  const shareUrl = getDocumentShareUrl(document);
  const message = buildShareMessage(document);
  const pdfBlob = await generateDocumentPdf(document);
  const filename = documentPdfFilename(document);
  const pdfFile = new File([pdfBlob], filename, { type: "application/pdf" });
  const navigatorWithShare = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
  };

  if (
    typeof navigatorWithShare.share === "function" &&
    navigatorWithShare.canShare?.({ files: [pdfFile] })
  ) {
    try {
      await navigatorWithShare.share({
        title: `${DOCUMENT_TYPE_LABELS[document.type]} ${document.number}`,
        text: message,
        files: [pdfFile],
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return {
          mode: "cancelled" as const,
          message,
        };
      }

      throw error;
    }

    return {
      mode: "web-share" as const,
      message,
      filename,
    };
  }

  const fallbackMessage = buildShareMessage(document, shareUrl);
  downloadBlob(pdfBlob, filename);
  const whatsappOpened = openWhatsappMessage(fallbackMessage);

  return {
    mode: "download-whatsapp-link" as const,
    message: fallbackMessage,
    shareUrl,
    filename,
    whatsappOpened,
  };
}
