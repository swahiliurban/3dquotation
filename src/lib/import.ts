import { format, isValid, parse } from "date-fns";
import { CURRENCY_OPTIONS, PAYMENT_METHODS } from "./constants";
import { getBankAccounts } from "./documents";
import { createId } from "./utils";
import type {
  ContactProfile,
  DocumentItem,
  DocumentType,
  PaymentMethod,
  QuoteFlowDocument,
} from "../types";

interface ImportedDocumentResult {
  patch: Partial<QuoteFlowDocument>;
  extractedText: string;
  summary: string[];
  itemCount: number;
  reviewCount: number;
  source: ImportSource;
  warnings: string[];
}

type ImportSource = "pdf-text" | "pdf-ocr" | "image-ocr";

interface ExtractedItem {
  str?: string;
  transform?: number[];
  width?: number;
}

type ItemLayout = "unknown" | "item-table" | "description-price" | "service-amount";

interface ParsedItemDraft {
  item: DocumentItem;
  confidence: number;
  needsReview: boolean;
}

const DATE_FORMATS = [
  "dd-MM-yyyy",
  "dd/MM/yyyy",
  "dd.MM.yyyy",
  "yyyy-MM-dd",
  "yyyy/MM/dd",
  "dd MMM yyyy",
  "d MMM yyyy",
  "dd MMMM yyyy",
  "d MMMM yyyy",
];

const SECTION_STOP_PATTERNS = [
  /^(?:to|bill to|client)\b/i,
  /^item\b/i,
  /^subtotal\b/i,
  /^discount\b/i,
  /^tax\b/i,
  /^grand total\b/i,
  /^amount paid\b/i,
  /^balance due\b/i,
  /^notes?\b/i,
  /^terms?\b/i,
  /^bank(?:ing)? details?\b/i,
];

function cleanLine(line: string) {
  return line.replace(/\s+/g, " ").trim();
}

function parseMoney(value?: string) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDateValue(value?: string) {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  for (const pattern of DATE_FORMATS) {
    const parsed = parse(normalized, pattern, new Date());
    if (isValid(parsed)) {
      return format(parsed, "yyyy-MM-dd");
    }
  }

  return undefined;
}

function extractDateFromLine(line: string, labels: string[]) {
  const regex = new RegExp(`(?:${labels.join("|")})\\s*[:#-]?\\s*([A-Za-z0-9./\\- ]+)`, "i");
  const match = line.match(regex);
  return parseDateValue(match?.[1]);
}

function extractDateFromLines(lines: string[], labels: string[]) {
  for (const line of lines) {
    const found = extractDateFromLine(line, labels);
    if (found) {
      return found;
    }
  }

  return undefined;
}

function extractSection(lines: string[], startPattern: RegExp, stopPatterns: RegExp[]) {
  const startIndex = lines.findIndex((line) => startPattern.test(line));
  if (startIndex === -1) {
    return "";
  }

  const firstLine = lines[startIndex].replace(startPattern, "").replace(/^[:\s-]+/, "").trim();
  const collected = firstLine ? [firstLine] : [];

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (stopPatterns.some((pattern) => pattern.test(line))) {
      break;
    }

    collected.push(line);
  }

  return collected.join("\n").trim();
}

function extractEmail(text: string) {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
}

function extractPhone(text: string) {
  return text.match(/(?:\+\d[\d\s-]{7,}\d|\b0\d[\d\s-]{7,}\d\b)/)?.[0]?.trim();
}

function extractWebsite(text: string) {
  return text.match(/\b(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?\b/i)?.[0];
}

function detectCurrency(text: string) {
  const found = CURRENCY_OPTIONS.find((option) => {
    return new RegExp(`\\b${option.code}\\b`, "i").test(text);
  });

  return found?.code;
}

function extractDocumentNumber(lines: string[]) {
  for (const line of lines.slice(0, 18)) {
    const match = line.match(/\b(?:INV|QT|QTN)[- ]?\d{4}[- ]?\d+\b/i);
    if (match) {
      return match[0].replace(/\s+/g, "-").toUpperCase();
    }
  }

  return undefined;
}

function extractBusinessPatch(lines: string[]) {
  const toIndex = lines.findIndex((line) => /^(?:to|bill to|client)\b/i.test(line));
  const scope = lines.slice(0, toIndex === -1 ? 10 : toIndex).filter((line) => {
    return !/(?:invoice|quotation|qt-|inv-)/i.test(line);
  });

  let name = "";
  const addressLines: string[] = [];
  let phone = "";
  let email = "";
  let website = "";

  for (const line of scope) {
    if (!email) {
      const foundEmail = extractEmail(line);
      if (foundEmail) {
        email = foundEmail;
        continue;
      }
    }

    if (!phone) {
      const foundPhone = extractPhone(line);
      if (foundPhone) {
        phone = foundPhone;
        continue;
      }
    }

    if (!website) {
      const foundWebsite = extractWebsite(line);
      if (foundWebsite) {
        website = foundWebsite;
        continue;
      }
    }

    if (!name && line.length > 4) {
      name = line;
      continue;
    }

    addressLines.push(line);
  }

  return {
    name: name || undefined,
    address: addressLines.join("\n") || undefined,
    phone: phone || undefined,
    email: email || undefined,
    website: website || undefined,
  };
}

function extractClientPatch(lines: string[]) {
  const startIndex = lines.findIndex((line) => /^(?:to|bill to|client)\b/i.test(line));
  if (startIndex === -1) {
    return {};
  }

  const firstLine = lines[startIndex].replace(/^(?:to|bill to|client)\b[:\s-]*/i, "").trim();
  const collected = firstLine ? [firstLine] : [];
  for (let index = startIndex + 1; index < lines.length && collected.length < 5; index += 1) {
    const line = lines[index];
    if (
      /^(?:item|description|qty|subtotal|discount|tax|grand total|amount paid|balance due|notes?|terms?|bank(?:ing)? details?)\b/i.test(
        line,
      )
    ) {
      break;
    }

    collected.push(line);
  }

  let name = "";
  let company = "";
  let phone = "";
  let email = "";
  const addressLines: string[] = [];

  collected.forEach((line, index) => {
    const foundEmail = extractEmail(line);
    if (foundEmail) {
      email = foundEmail;
      return;
    }

    const foundPhone = extractPhone(line);
    if (foundPhone) {
      phone = foundPhone;
      return;
    }

    if (/^attn[:\s-]/i.test(line)) {
      name = line.replace(/^attn[:\s-]*/i, "").trim();
      return;
    }

    if (!company && index === 0) {
      company = line;
      return;
    }

    if (!name && !company) {
      company = line;
      return;
    }

    addressLines.push(line);
  });

  return {
    name: name || undefined,
    company: company || undefined,
    address: addressLines.join("\n") || undefined,
    phone: phone || undefined,
    email: email || undefined,
  };
}

function isStopLine(line: string) {
  return (
    /^(?:subtotal|discount|tax|grand total|amount paid|balance due|notes?|terms?|bank(?:ing)? details?)\b/i.test(
      line,
    ) ||
    /^invoice(?: number)?\b/i.test(line) ||
    /^quotation\b/i.test(line) ||
    /^bill to\b/i.test(line)
  );
}

function isTableHeaderLine(line: string) {
  const normalized = line.toLowerCase();
  const hasItem = /\b(?:item|service|product)\b/.test(normalized);
  const hasDescription = /\bdescription\b/.test(normalized);
  const hasQuantity = /\b(?:qty|quantity)\b/.test(normalized);
  const hasRate = /\b(?:rate|unit price|price)\b/.test(normalized);
  const hasAmount = /\b(?:amount|total)\b/.test(normalized);

  if (hasItem && hasRate) {
    return true;
  }

  if (hasDescription && hasRate && !/^(?:subtotal|discount|tax|grand total)\b/i.test(normalized)) {
    return true;
  }

  if (hasQuantity && hasRate && hasAmount) {
    return true;
  }

  if (hasItem && hasQuantity && (hasRate || hasAmount)) {
    return true;
  }

  return false;
}

function splitRowCells(line: string) {
  return line
    .replace(/[•·]/g, " ")
    .replace(/\s*\|\s*/g, "|")
    .replace(/\t+/g, "|")
    .replace(/\s{3,}/g, "|")
    .split("|")
    .map((part) => cleanLine(part))
    .filter(Boolean);
}

function looksLikeNumericText(value: string) {
  const trimmed = value.trim();
  if (!trimmed || !/[0-9]/.test(trimmed)) {
    return false;
  }

  if (/^\d+(?:\.\d+)?(?:\s*(?:pcs?|qty|units?|x))?$/i.test(trimmed)) {
    return true;
  }

  if (/^[A-Z]{3}\s*\d[\d,]*(?:\.\d+)?$/i.test(trimmed) || /^\d[\d,]*(?:\.\d+)?\s*[A-Z]{3}$/i.test(trimmed)) {
    return true;
  }

  if (/^[\d,]+(?:\.\d+)?$/.test(trimmed)) {
    return true;
  }

  return false;
}

function parseNumericCell(value: string) {
  if (!looksLikeNumericText(value)) {
    return undefined;
  }

  const parsed = parseMoney(value);
  return parsed === undefined || Number.isNaN(parsed) ? undefined : parsed;
}

function inferLayoutFromHeader(line: string): ItemLayout {
  const normalized = line.toLowerCase();
  const hasItem = /\b(?:item|service|product)\b/.test(normalized);
  const hasDescription = /\bdescription\b/.test(normalized);
  const hasQuantity = /\b(?:qty|quantity)\b/.test(normalized);
  const hasRate = /\b(?:rate|unit price|price)\b/.test(normalized);
  const hasAmount = /\b(?:amount|total)\b/.test(normalized);

  if (hasItem && hasDescription && hasQuantity && hasRate && hasAmount) {
    return "item-table";
  }

  if (hasDescription && hasRate && !hasQuantity) {
    return "description-price";
  }

  if (hasItem && hasAmount && !hasQuantity && !hasRate) {
    return "service-amount";
  }

  if (hasItem && hasQuantity && hasRate) {
    return "item-table";
  }

  return "unknown";
}

function scoreItemCandidate(line: string) {
  if (!line || isStopLine(line) || isTableHeaderLine(line)) {
    return 0;
  }

  const numericCells = splitRowCells(line).filter((cell) => parseNumericCell(cell) !== undefined);
  const hasText = /[A-Za-z]/.test(line);
  const hasSeparator = /[|\t]/.test(line) || /\s{2,}/.test(line);

  let score = 0;
  if (hasText) {
    score += 1;
  }
  if (numericCells.length > 0) {
    score += Math.min(3, numericCells.length);
  }
  if (hasSeparator) {
    score += 1;
  }
  if (/[A-Za-z].*\d|\d.*[A-Za-z]/.test(line)) {
    score += 1;
  }
  if (line.length > 12 && line.length < 220) {
    score += 1;
  }

  return score;
}

function deriveRowConfidence(options: {
  source: ImportSource;
  layout: ItemLayout;
  numericCount: number;
  usedFallback: boolean;
  inferredQuantity: boolean;
  inferredUnitPrice: boolean;
  hasDescription: boolean;
}) {
  let confidence = 0.5;

  if (options.layout === "item-table") {
    confidence += 0.22;
  } else if (options.layout === "description-price" || options.layout === "service-amount") {
    confidence += 0.18;
  }

  confidence += Math.min(0.12, options.numericCount * 0.03);

  if (options.hasDescription) {
    confidence += 0.05;
  }

  if (options.source !== "pdf-text") {
    confidence -= 0.05;
  }

  if (options.usedFallback) {
    confidence -= 0.1;
  }

  if (options.inferredQuantity) {
    confidence -= 0.05;
  }

  if (options.inferredUnitPrice) {
    confidence -= 0.05;
  }

  return Math.max(0.2, Math.min(0.98, confidence));
}

function parseItemRow(line: string, layout: ItemLayout, source: ImportSource): ParsedItemDraft | undefined {
  const normalized = cleanLine(line.replace(/[–—]/g, "-"));
  if (!normalized || isStopLine(normalized) || isTableHeaderLine(normalized)) {
    return undefined;
  }

  const cells = splitRowCells(normalized);
  const usedFallback = cells.length <= 1;
  const candidates = usedFallback ? normalized.split(/\s+/).map(cleanLine).filter(Boolean) : cells;
  const numericCandidates = candidates
    .map((cell) => ({ cell, value: parseNumericCell(cell) }))
    .filter((entry): entry is { cell: string; value: number } => entry.value !== undefined);

  if (numericCandidates.length === 0) {
    return undefined;
  }

  let trailingIndex = candidates.length - 1;
  const trailingValues: number[] = [];
  while (trailingIndex >= 0) {
    const parsed = parseNumericCell(candidates[trailingIndex]);
    if (parsed === undefined) {
      break;
    }
    trailingValues.unshift(parsed);
    trailingIndex -= 1;
  }

  const leadingCells = candidates.slice(0, trailingIndex + 1);
  if (leadingCells.length === 0) {
    return undefined;
  }

  const name = leadingCells[0]?.trim() || normalized;
  const description = leadingCells.slice(1).join(" ").trim();

  let quantity = 1;
  let unitPrice: number | undefined;
  let inferredQuantity = false;
  let inferredUnitPrice = false;

  if (layout === "description-price" || layout === "service-amount") {
    unitPrice = trailingValues[trailingValues.length - 1];
  } else if (trailingValues.length >= 3) {
    quantity = trailingValues[trailingValues.length - 3];
    unitPrice = trailingValues[trailingValues.length - 2];
  } else if (trailingValues.length === 2) {
    quantity = trailingValues[0];
    unitPrice = trailingValues[1] / Math.max(trailingValues[0], 1);
    inferredQuantity = true;
    inferredUnitPrice = true;
  } else {
    unitPrice = trailingValues[trailingValues.length - 1];
    if (layout === "unknown") {
      inferredQuantity = true;
    }
  }

  if (unitPrice === undefined || Number.isNaN(unitPrice)) {
    return undefined;
  }

  if (trailingValues.length === 1 && layout === "unknown") {
    inferredQuantity = true;
  }

  const confidence = deriveRowConfidence({
    source,
    layout,
    numericCount: numericCandidates.length,
    usedFallback,
    inferredQuantity,
    inferredUnitPrice,
    hasDescription: Boolean(description),
  });

  return {
    item: {
      id: createId("item"),
      name,
      description,
      quantity,
      unitPrice,
      discount: 0,
      tax: 0,
      importConfidence: confidence,
      importNeedsReview: confidence < 0.78 || inferredQuantity || inferredUnitPrice,
      importSource: source,
    },
    confidence,
    needsReview: confidence < 0.78 || inferredQuantity || inferredUnitPrice,
  };
}

function extractItems(lines: string[], source: ImportSource) {
  const headers: Array<{ index: number; layout: ItemLayout }> = [];
  lines.forEach((line, index) => {
    if (isTableHeaderLine(line)) {
      headers.push({ index, layout: inferLayoutFromHeader(line) });
    }
  });

  const items: ParsedItemDraft[] = [];
  const parseFollowingLines = (startIndex: number, layout: ItemLayout) => {
    let misses = 0;
    for (let index = startIndex + 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (isStopLine(line)) {
        break;
      }

      const parsed = parseItemRow(line, layout, source);
      if (parsed) {
        items.push(parsed);
        misses = 0;
        continue;
      }

      if (line.trim()) {
        misses += 1;
      }

      if (items.length > 0 && misses >= 2) {
        break;
      }
    }
  };

  headers.forEach(({ index, layout }) => parseFollowingLines(index, layout));

  if (items.length === 0) {
    const blocks: Array<Array<{ line: string; index: number; score: number }>> = [];
    let currentBlock: Array<{ line: string; index: number; score: number }> = [];

    lines.forEach((line, index) => {
      const score = scoreItemCandidate(line);
      if (score >= 2) {
        currentBlock.push({ line, index, score });
        return;
      }

      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
        currentBlock = [];
      }
    });

    if (currentBlock.length > 0) {
      blocks.push(currentBlock);
    }

    blocks
      .filter((block) => block.length >= 2 || block.some((entry) => entry.score >= 4))
      .forEach((block) => {
        block.forEach((entry) => {
          const parsed = parseItemRow(entry.line, "unknown", source);
          if (parsed) {
            items.push(parsed);
          }
        });
      });
  }

  return items.map((entry) => entry.item);
}

function extractPaymentMethod(text: string) {
  const found = PAYMENT_METHODS.find((method) => {
    return new RegExp(method.replace(/\s+/g, "\\s+"), "i").test(text);
  });

  return found as PaymentMethod | undefined;
}

function extractMoneyAfterLabel(lines: string[], labels: string[]) {
  const regex = new RegExp(`(?:${labels.join("|")})\\s*[:#-]?\\s*(?:[A-Z]{3}\\s*)?([\\d,]+(?:\\.\\d{1,2})?)`, "i");
  for (const line of lines) {
    const match = line.match(regex);
    const value = parseMoney(match?.[1]);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function buildSummary(
  patch: Partial<QuoteFlowDocument>,
  itemCount: number,
  reviewCount: number,
  source: ImportSource,
  warnings: string[],
) {
  const summary: string[] = [];
  if (patch.number) {
    summary.push("document number");
  }
  if (patch.issueDate || patch.dueDate || patch.validUntil) {
    summary.push("dates");
  }
  if (patch.client?.company || patch.client?.name) {
    summary.push("client details");
  }
  if (patch.business?.name) {
    summary.push("business details");
  }
  if (itemCount > 0) {
    summary.push(`${itemCount} line item${itemCount === 1 ? "" : "s"}`);
  }
  if (reviewCount > 0) {
    summary.push(`${reviewCount} row${reviewCount === 1 ? "" : "s"} need review`);
  }
  if (patch.notes) {
    summary.push("notes");
  }
  if (patch.terms) {
    summary.push("terms");
  }
  if (patch.business?.bankDetails || patch.business?.bankAccounts?.length) {
    summary.push("bank details");
  }
  if (source !== "pdf-text") {
    summary.push(source === "pdf-ocr" ? "OCR fallback" : "image OCR");
  }
  summary.push(...warnings);

  return Array.from(new Set(summary));
}

async function extractTextFromPdfWithLayout(file: File) {
  const [{ GlobalWorkerOptions, getDocument }, { default: pdfWorker }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  GlobalWorkerOptions.workerSrc = pdfWorker;
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data }).promise;
  const pageLines: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const items = (textContent.items as ExtractedItem[])
      .filter((item) => item.str && item.transform)
      .map((item) => ({
        str: item.str?.trim() || "",
        x: item.transform?.[4] || 0,
        y: item.transform?.[5] || 0,
      }))
      .filter((item) => item.str);

    const rows = new Map<number, Array<{ str: string; x: number }>>();
    items.forEach((item) => {
      const key = Math.round(item.y / 3) * 3;
      const existing = rows.get(key) ?? [];
      existing.push({ str: item.str, x: item.x });
      rows.set(key, existing);
    });

    Array.from(rows.entries())
      .sort((left, right) => right[0] - left[0])
      .forEach(([, rowItems]) => {
        const sortedRowItems = rowItems.sort((left, right) => left.x - right.x);
        let line = "";
        sortedRowItems.forEach((item, index) => {
          if (index === 0) {
            line = item.str;
            return;
          }

          const previous = sortedRowItems[index - 1];
          const gap = item.x - (previous.x + Math.max(previous.str.length * 3, 10));
          const separator = gap > 36 ? " | " : gap > 16 ? "  " : " ";
          line += separator + item.str;
        });

        line = line.replace(/\s+/g, " ").trim();

        if (line) {
          pageLines.push(line);
        }
      });
  }

  return {
    text: pageLines.join("\n"),
    source: "pdf-text" as ImportSource,
  };
}

async function ocrPdf(file: File) {
  const [{ GlobalWorkerOptions, getDocument }, { default: pdfWorker }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  GlobalWorkerOptions.workerSrc = pdfWorker;
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data }).promise;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not initialize OCR canvas.");
  }

  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");

  try {
    const lines: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2 });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      context.clearRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;

      const result = await worker.recognize(canvas);
      const pageLines = (result.data.text || "")
        .split(/\r?\n/)
        .map(cleanLine)
        .filter(Boolean);
      lines.push(...pageLines);
    }

    return {
      text: lines.join("\n"),
      source: "pdf-ocr" as ImportSource,
    };
  } finally {
    await worker.terminate();
  }
}

async function extractTextFromImage(file: File) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const result = await worker.recognize(file);
    return {
      text: result.data.text,
      source: "image-ocr" as ImportSource,
    };
  } finally {
    await worker.terminate();
  }
}

function mergeContactPatch<T extends ContactProfile>(
  base: T,
  patch: Partial<ContactProfile>,
) {
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(patch).filter(([, value]) => Boolean(value && String(value).trim())),
    ),
  } as T;
}

function parseImportedText(
  text: string,
  targetType: DocumentType,
  current: QuoteFlowDocument,
  source: ImportSource,
): ImportedDocumentResult {
  const lines = text
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);

  const businessPatch = extractBusinessPatch(lines);
  const clientPatch = extractClientPatch(lines);
  const issueDate = extractDateFromLines(lines, ["date", "issue date"]);
  const dueDate = targetType === "invoice" ? extractDateFromLines(lines, ["due date"]) : undefined;
  const validUntil =
    targetType === "quotation"
      ? extractDateFromLines(lines, ["valid until", "expiry date", "expires"])
      : undefined;
  const extractedNumber = extractDocumentNumber(lines);
  const extractedCurrency = detectCurrency(text);
  const extractedPaymentMethod = extractPaymentMethod(text);
  const extractedAmountPaid = extractMoneyAfterLabel(lines, ["amount paid", "paid amount"]);
  const items = extractItems(lines, source);
  const notes = extractSection(lines, /^notes?\b[:\s-]*/i, SECTION_STOP_PATTERNS);
  const terms = extractSection(lines, /^terms?(?: and conditions?)?\b[:\s-]*/i, SECTION_STOP_PATTERNS);
  const bankDetails = extractSection(
    lines,
    /^bank(?:ing)? details?\b[:\s-]*/i,
    SECTION_STOP_PATTERNS.filter((pattern) => !/^bank/i.test(String(pattern))),
  );
  const hasClientPatch = Object.values(clientPatch).some(Boolean);
  const businessFields = Object.fromEntries(
    Object.entries(businessPatch).filter(([, value]) => Boolean(value)),
  );

  const patch: Partial<QuoteFlowDocument> = { type: targetType };

  if (extractedNumber) {
    patch.number = extractedNumber;
  }

  if (extractedCurrency) {
    patch.currency = extractedCurrency;
  }

  if (issueDate) {
    patch.issueDate = issueDate;
  }

  if (dueDate) {
    patch.dueDate = dueDate;
  }

  if (validUntil) {
    patch.validUntil = validUntil;
  }

  if (extractedPaymentMethod) {
    patch.paymentMethod = extractedPaymentMethod;
  }

  if (extractedAmountPaid !== undefined) {
    patch.amountPaid = extractedAmountPaid;
  }

  if (hasClientPatch) {
    patch.client = mergeContactPatch(current.client, clientPatch);
  }

  if (Object.keys(businessFields).length > 0 || bankDetails || hasClientPatch || notes || terms) {
    const bankAccounts = bankDetails
      ? getBankAccounts({ bankAccounts: [], bankDetails })
      : current.business.bankAccounts;

    patch.business = {
      ...current.business,
      ...businessFields,
      ...(bankDetails ? { bankDetails } : {}),
      ...(bankAccounts.length > 0 ? { bankAccounts } : {}),
      ...(hasClientPatch ? { showClientDetails: true } : {}),
      ...(notes ? { showNotes: true } : {}),
      ...(terms ? { showTerms: true } : {}),
    };
  }

  if (notes) {
    patch.notes = notes;
  }

  if (terms) {
    patch.terms = terms;
  }

  if (items.length > 0) {
    patch.items = items;
  }

  const reviewCount = items.filter((item) => item.importNeedsReview || (item.importConfidence ?? 1) < 0.78).length;
  const warnings: string[] = [];
  if (items.length === 0) {
    warnings.push("No line items were detected.");
  }
  if (source !== "pdf-text") {
    warnings.push(source === "pdf-ocr" ? "Scanned PDF OCR was used." : "Image OCR was used.");
  }

  return {
    patch,
    extractedText: text,
    summary: buildSummary(patch, items.length, reviewCount, source, warnings),
    itemCount: items.length,
    reviewCount,
    source,
    warnings,
  };
}

export async function importDocumentFromFile(
  file: File,
  targetType: DocumentType,
  current: QuoteFlowDocument,
) {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    const structured = await extractTextFromPdfWithLayout(file);
    const structuredResult = parseImportedText(structured.text, targetType, current, structured.source);

    if (structuredResult.itemCount > 0) {
      return structuredResult;
    }

    const ocr = await ocrPdf(file);
    const ocrResult = parseImportedText(ocr.text, targetType, current, ocr.source);
    return {
      ...ocrResult,
      patch: {
        ...structuredResult.patch,
        ...ocrResult.patch,
        client: ocrResult.patch.client ?? structuredResult.patch.client,
        business: ocrResult.patch.business ?? structuredResult.patch.business,
        items: ocrResult.patch.items ?? structuredResult.patch.items,
      },
      summary: Array.from(new Set([...structuredResult.summary, ...ocrResult.summary])),
      itemCount: ocrResult.itemCount,
      reviewCount: ocrResult.reviewCount,
      source: ocrResult.source,
      warnings: [...structuredResult.warnings, ...ocrResult.warnings],
    };
  }

  const extracted = await extractTextFromImage(file);
  return parseImportedText(extracted.text, targetType, current, extracted.source);
}
