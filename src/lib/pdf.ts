import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  calculateDocumentTotalsForDocument,
  calculateLineTotals,
  formatCurrency,
  getBankAccounts,
  getDocumentPricingOptions,
  isDiscountLineItem,
} from "./documents";
import { DOCUMENT_TYPE_LABELS } from "./constants";
import { formatDateLabel } from "./utils";
import type { QuoteFlowDocument } from "../types";

const PDF_LAYOUT_WIDTH_PX = 794;
const PDF_PAGE_HEIGHT_PX = 1123;
const PDF_PAGE_TOP_MARGIN_PX = 48;
const PDF_PAGE_BOTTOM_MARGIN_PX = 48;
const PDF_LOGO_MAX_WIDTH_PX = 214;
const PDF_LOGO_MAX_HEIGHT_PX = 77;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function lineBreaks(value?: string) {
  return escapeHtml(value?.trim() || "").replaceAll("\n", "<br />");
}

function renderBankDetailLines(value: string) {
  return value
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const escaped = escapeHtml(line.trimEnd());
      return `<div class="bank-detail-line" data-bank-detail-line>${escaped.trim() ? escaped : "&nbsp;"}</div>`;
    })
    .join("");
}

function hasText(value?: string) {
  return Boolean(value?.trim());
}

function isOptionalValue(value?: string) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return !["official stamp area", "stamp area", "bank transfer"].includes(normalized);
}

function withAlpha(hex: string, alpha: string) {
  return /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${alpha}` : hex;
}

function renderDocumentHtml(document: QuoteFlowDocument) {
  const pricingOptions = getDocumentPricingOptions(document);
  const totals = calculateDocumentTotalsForDocument(document);
  const columnCount = 5 + (pricingOptions.includeDiscount ? 1 : 0) + (pricingOptions.includeTax ? 1 : 0);
  const showDiscountSummary = pricingOptions.includeDiscount || totals.discountTotal > 0;
  const label = DOCUMENT_TYPE_LABELS[document.type];
  const accent = document.business.accentColor || "#DD8201";
  const businessLines = [
    document.business.address,
    document.business.phone,
    document.business.email,
    document.business.website,
  ].filter(hasText);
  const clientLines = [
    document.client.name ? `Attn: ${document.client.name}` : "",
    document.client.address,
    document.client.phone,
    document.client.email,
  ].filter(hasText);
  const showClientDetails = Boolean(document.business.showClientDetails) && clientLines.length > 0;
  const showNotes = Boolean(document.business.showNotes) && hasText(document.notes);
  const showTerms = Boolean(document.business.showTerms) && hasText(document.terms);
  const bankAccounts = getBankAccounts(document.business);
  const showBankDetails = bankAccounts.length > 0;
  const showSignature = Boolean(document.business.signatureDataUrl);
  const showStamp = isOptionalValue(document.business.stampLabel);
  const hasLogo = Boolean(document.business.logoDataUrl);
  const headerDate = formatDateLabel(document.issueDate || document.createdAt);

  return `
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Manrope, "Segoe UI", sans-serif;
        color: #20323f;
        background: #f8fbf7;
      }
      .sheet {
        width: ${PDF_LAYOUT_WIDTH_PX}px;
        min-height: ${PDF_PAGE_HEIGHT_PX}px;
        padding: ${PDF_PAGE_TOP_MARGIN_PX}px 46px;
        background: white;
        position: relative;
      }
      .sheet::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          radial-gradient(circle at top right, ${withAlpha(accent, "14")}, transparent 26%),
          linear-gradient(180deg, ${withAlpha(accent, "0a")}, transparent 28%);
        pointer-events: none;
      }
      .sheet > * { position: relative; z-index: 1; }
      .topbar {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        align-items: flex-start;
      }
      .brand {
        max-width: 430px;
      }
      .logo-slot {
        display: flex;
        align-items: center;
        max-width: 430px;
      }
      .logo-slot--image {
        align-items: flex-start;
        justify-content: flex-start;
        width: ${PDF_LOGO_MAX_WIDTH_PX}px;
        max-width: ${PDF_LOGO_MAX_WIDTH_PX}px;
        max-height: ${PDF_LOGO_MAX_HEIGHT_PX}px;
        overflow: hidden;
      }
      .doc-meta {
        min-width: 240px;
        text-align: right;
      }
      .brand-logo {
        width: 64px;
        height: 64px;
        border-radius: 20px;
        overflow: hidden;
        background: ${withAlpha(accent, "14")};
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: 26px;
        color: ${accent};
      }
      .brand-logo img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .logo-slot img {
        display: block;
        width: auto;
        height: auto;
        max-width: ${PDF_LOGO_MAX_WIDTH_PX}px;
        max-height: ${PDF_LOGO_MAX_HEIGHT_PX}px;
        object-fit: contain;
        object-position: left top;
      }
      .eyebrow {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.22em;
        color: ${accent};
        margin-bottom: 8px;
      }
      h1 {
        margin: 0;
        font-size: 28px;
        color: #274053;
        line-height: 0.95;
      }
      .brand-name {
        margin-bottom: 14px;
        font-size: 48px;
      }
      .muted {
        color: #5b6f7e;
        line-height: 1.55;
        white-space: pre-line;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        padding: 8px 14px;
        border-radius: 999px;
        background: ${withAlpha(accent, "14")};
        color: ${accent};
        font-weight: 700;
        font-size: 12px;
        text-transform: uppercase;
      }
      .doc-date {
        margin-top: 12px;
        font-size: 14px;
        font-weight: 700;
        color: #5b6f7e;
      }
      .doc-date span {
        color: #20323f;
      }
      .divider {
        height: 6px;
        border-radius: 999px;
        margin: 28px 0 24px;
        background: linear-gradient(90deg, ${accent}, ${withAlpha(accent, "22")});
      }
      .grid {
        display: grid;
        grid-template-columns: 1.3fr 1fr;
        gap: 20px;
      }
      .meta {
        background: #f5f9f7;
        border: 1px solid ${withAlpha(accent, "22")};
        border-radius: 20px;
        padding: 20px;
      }
      .meta-item { margin-bottom: 14px; }
      .meta-item:last-child { margin-bottom: 0; }
      .meta-label {
        display: block;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        color: #69806f;
        margin-bottom: 6px;
      }
      .meta-value {
        font-size: 16px;
        font-weight: 700;
        color: #20323f;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 24px;
        overflow: hidden;
        border-radius: 20px;
      }
      thead th {
        background: ${accent};
        color: white;
        padding: 14px 12px;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }
      tbody td {
        padding: 14px 12px;
        border-bottom: 1px solid #e6eeea;
        vertical-align: top;
        font-size: 13px;
      }
      tbody tr {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      tbody tr:nth-child(even) td {
        background: #fbfdfb;
      }
      .description-cell {
        overflow-wrap: anywhere;
        word-break: normal;
      }
      .summary-row td {
        background: #f7faf8;
      }
      .summary-label {
        text-align: right;
        font-weight: 700;
        color: #436052;
      }
      .summary-value {
        text-align: right;
        font-weight: 700;
        color: #20323f;
      }
      .grand-row td {
        background: ${withAlpha(accent, "12")};
        color: ${accent};
        font-weight: 800;
        font-size: 15px;
      }
      .summary-row,
      .grand-row,
      .notes-grid,
      .notes-card,
      .signature {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .numeric {
        text-align: right;
        white-space: nowrap;
      }
      .notes-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 18px;
        margin-top: 26px;
      }
      .notes-card {
        padding: 18px;
        border-radius: 18px;
        border: 1px solid ${withAlpha(accent, "22")};
        background: #fcfefd;
      }
      .notes-card h3 {
        margin: 0 0 10px;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: #577468;
      }
      .bank-details {
        margin-top: 24px;
      }
      .bank-details h3,
      .bank-continuation-heading {
        margin: 0 0 8px;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: #577468;
      }
      .bank-continuation-heading {
        margin-top: 0;
      }
      .bank-account {
        padding: 4px 0;
        break-inside: avoid;
      }
      .bank-account + .bank-account {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 0.5px solid ${withAlpha(accent, "66")};
      }
      .bank-account-label {
        margin-bottom: 4px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: ${accent};
      }
      .bank-account-continuation-label {
        margin: 2px 0 4px;
      }
      .bank-account-text {
        color: #5b6f7e;
        line-height: 1.55;
        white-space: normal;
      }
      .bank-detail-line {
        min-height: 1.55em;
        overflow-wrap: anywhere;
      }
      .pdf-page-break-spacer {
        display: block;
        width: 100%;
        margin: 0;
        padding: 0;
        border: 0;
      }
      .pdf-table-break-spacer td {
        height: var(--pdf-table-spacer-height, 0);
        padding: 0 !important;
        border: 0 !important;
        background: white !important;
        line-height: 0;
      }
      .pdf-table-repeat-header th {
        background: ${accent};
        color: white;
        padding: 14px 12px;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }
      .signature {
        margin-top: 28px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
      }
      .signature-box {
        min-height: 98px;
        border: 1px dashed ${withAlpha(accent, "55")};
        border-radius: 18px;
        padding: 14px;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
      }
      .signature-box img {
        max-height: 58px;
        max-width: 180px;
        object-fit: contain;
      }
    </style>
      <div class="sheet">
        <div class="topbar">
          <div class="brand">
          <div class="logo-slot ${hasLogo ? "logo-slot--image" : "logo-slot--fallback"}">
            ${
              hasLogo
                ? `<img src="${document.business.logoDataUrl}" alt="Logo" />`
                : `<div style="display:flex;align-items:center;gap:16px;">
                    <div class="brand-logo">${escapeHtml(
                      (document.business.name || "QF")
                        .split(" ")
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part) => part[0]?.toUpperCase() || "")
                        .join(""),
                    )}</div>
                    <h1 class="brand-name">${escapeHtml(document.business.name || "Your business")}</h1>
                  </div>`
            }
          </div>
          <div class="muted">${businessLines.map((line) => lineBreaks(line)).join("<br />")}</div>
        </div>
        <div class="doc-meta">
          <div class="pill" style="background:${withAlpha(accent, "14")};color:${accent};">${label}</div>
          <div style="margin-top:14px;font-size:22px;font-weight:800;line-height:1;white-space:nowrap;color:#274053;">${escapeHtml(
            document.number,
          )}</div>
          <div class="doc-date">Date: <span>${escapeHtml(headerDate)}</span></div>
        </div>
      </div>

      <div class="divider" style="background:linear-gradient(90deg, ${accent}, ${withAlpha(accent, "22")});"></div>

      <div class="grid" style="grid-template-columns:1fr;">
        <div>
          <div class="eyebrow" style="color:${accent};">To</div>
          <div style="font-size:28px;font-weight:800;color:#21363f;">
            ${escapeHtml(document.client.company || document.client.name || "Client")}
          </div>
          ${
            showClientDetails
              ? `<div class="muted">${clientLines.map((line) => lineBreaks(line)).join("<br />")}</div>`
              : ""
          }
        </div>
      </div>

      <table data-document-table>
        <thead>
          <tr>
            <th style="text-align:left;">Item</th>
            <th style="text-align:left;">Description</th>
            <th class="numeric">Qty</th>
            <th class="numeric">Price</th>
            ${pricingOptions.includeDiscount ? '<th class="numeric">Discount</th>' : ""}
            ${pricingOptions.includeTax ? '<th class="numeric">Tax</th>' : ""}
            <th class="numeric">Line total</th>
          </tr>
        </thead>
        <tbody>
          ${document.items
            .map((item) => {
              const line = calculateLineTotals(item, pricingOptions);
              const isDiscountItem = isDiscountLineItem(item);
              return `
                <tr data-item-row>
                  <td><strong>${escapeHtml(item.name || "Item")}</strong></td>
                  <td class="description-cell">${escapeHtml(item.description || "-")}</td>
                  <td class="numeric">${item.quantity}</td>
                  <td class="numeric">${formatCurrency(item.unitPrice, document.currency)}</td>
                  ${pricingOptions.includeDiscount ? `<td class="numeric">${isDiscountItem ? "-" : `${item.discount}%`}</td>` : ""}
                  ${pricingOptions.includeTax ? `<td class="numeric">${isDiscountItem ? "-" : `${item.tax}%`}</td>` : ""}
                  <td class="numeric"><strong>${formatCurrency(
                    line.lineTotal,
                    document.currency,
                  )}</strong></td>
                </tr>
              `;
            })
            .join("")}
          <tr class="summary-row" data-summary-row>
            <td class="summary-label" colspan="${columnCount - 1}">Subtotal</td>
            <td class="summary-value">${formatCurrency(totals.subtotal, document.currency)}</td>
          </tr>
          ${
            showDiscountSummary
              ? `<tr class="summary-row" data-summary-row>
            <td class="summary-label" colspan="${columnCount - 1}">Discount</td>
            <td class="summary-value">${formatCurrency(-totals.discountTotal, document.currency)}</td>
          </tr>`
              : ""
          }
          ${
            pricingOptions.includeTax
              ? `<tr class="summary-row" data-summary-row>
            <td class="summary-label" colspan="${columnCount - 1}">Tax total</td>
            <td class="summary-value">${formatCurrency(totals.taxTotal, document.currency)}</td>
          </tr>`
              : ""
          }
          <tr class="grand-row" data-summary-row>
            <td class="summary-label" colspan="${columnCount - 1}" style="color:${accent};">Grand total</td>
            <td class="summary-value" style="color:${accent};">${formatCurrency(totals.grandTotal, document.currency)}</td>
          </tr>
        </tbody>
      </table>

      ${
        showNotes || showTerms
          ? `
      <div class="notes-grid" data-keep-block>
        ${
          showNotes
            ? `<div class="notes-card">
          <h3>Notes</h3>
          <div class="muted">${lineBreaks(document.notes)}</div>
        </div>`
            : ""
        }
        ${
          showTerms
            ? `<div class="notes-card">
          <h3>Terms and Conditions</h3>
          <div class="muted">${lineBreaks(document.terms)}</div>
        </div>`
            : ""
        }
      </div>
      `
          : ""
      }

      ${
        showBankDetails
          ? `<div class="bank-details" data-bank-details>
        <h3 data-bank-heading>Banking Details</h3>
        ${bankAccounts
          .map((account) => {
            return `<div class="bank-account" data-bank-account data-bank-account-label="${escapeHtml(
              account.label,
            )}">
          ${
            hasText(account.label)
              ? `<div class="bank-account-label">${escapeHtml(account.label)}</div>`
              : ""
          }
          <div class="bank-account-text">${renderBankDetailLines(account.details)}</div>
        </div>`;
          })
          .join("")}
      </div>`
          : ""
      }

      ${
        showSignature || showStamp
          ? `<div class="signature" data-keep-block>
        ${
          showSignature
            ? `<div class="signature-box">
          <img src="${document.business.signatureDataUrl}" alt="Signature" />
          <strong>Authorized signature</strong>
        </div>`
            : ""
        }
        ${
          showStamp
            ? `<div class="signature-box">
          <div style="font-size:22px;font-weight:800;color:${accent};">${escapeHtml(
            document.business.stampLabel || "",
          )}</div>
        </div>`
            : ""
        }
      </div>`
          : ""
      }

    </div>
  `;
}

function getRelativeTop(element: HTMLElement, root: HTMLElement) {
  return element.getBoundingClientRect().top - root.getBoundingClientRect().top;
}

function getPageOffset(element: HTMLElement, root: HTMLElement) {
  const offset = getRelativeTop(element, root) % PDF_PAGE_HEIGHT_PX;
  return offset < 0 ? offset + PDF_PAGE_HEIGHT_PX : offset;
}

function getElementHeight(element: HTMLElement) {
  return element.getBoundingClientRect().height;
}

function wouldOverflowPage(element: HTMLElement, root: HTMLElement, height = getElementHeight(element)) {
  const offset = getPageOffset(element, root);

  if (offset <= PDF_PAGE_TOP_MARGIN_PX + 1) {
    return false;
  }

  return offset + height > PDF_PAGE_HEIGHT_PX - PDF_PAGE_BOTTOM_MARGIN_PX + 1;
}

function getPageBreakSpacerHeight(element: HTMLElement, root: HTMLElement) {
  const offset = getPageOffset(element, root);
  return offset <= PDF_PAGE_TOP_MARGIN_PX
    ? Math.max(PDF_PAGE_TOP_MARGIN_PX - offset, 0)
    : PDF_PAGE_HEIGHT_PX - offset + PDF_PAGE_TOP_MARGIN_PX;
}

function insertPageBreakBefore(
  element: HTMLElement,
  root: HTMLElement,
  options: {
    continuationHeading?: boolean;
    accountLabel?: string;
  } = {},
) {
  const parent = element.parentElement;
  if (!parent) {
    return;
  }

  const spacerHeight = getPageBreakSpacerHeight(element, root);

  if (spacerHeight > 1) {
    const spacer = document.createElement("div");
    spacer.className = "pdf-page-break-spacer";
    spacer.style.height = `${spacerHeight}px`;
    parent.insertBefore(spacer, element);
  }

  if (options.continuationHeading) {
    const heading = document.createElement("div");
    heading.className = "bank-continuation-heading";
    heading.textContent = "Banking Details (continued)";
    parent.insertBefore(heading, element);
  }

  if (options.accountLabel) {
    const label = document.createElement("div");
    label.className = "bank-account-label bank-account-continuation-label";
    label.textContent = `${options.accountLabel} (continued)`;
    parent.insertBefore(label, element);
  }
}

function sumElementHeights(elements: HTMLElement[]) {
  return elements.reduce((total, element) => total + getElementHeight(element), 0);
}

function createRepeatedTableHeader(table: HTMLTableElement) {
  const headerCells = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
  if (headerCells.length === 0) {
    return undefined;
  }

  const header = document.createElement("tr");
  header.className = "pdf-table-repeat-header";

  headerCells.forEach((cell) => {
    const repeatedCell = document.createElement("th");
    repeatedCell.className = cell.className;
    repeatedCell.textContent = cell.textContent || "";
    const style = cell.getAttribute("style");
    if (style) {
      repeatedCell.setAttribute("style", style);
    }
    header.appendChild(repeatedCell);
  });

  return header;
}

function insertTablePageBreakBefore(
  row: HTMLTableRowElement,
  root: HTMLElement,
  options: {
    repeatHeader?: boolean;
  } = {},
) {
  const parent = row.parentElement;
  const table = row.closest("table");
  if (!parent || !(table instanceof HTMLTableElement)) {
    return;
  }

  const columnCount = table.querySelectorAll("thead th").length || row.cells.length || 1;
  const spacerHeight = getPageBreakSpacerHeight(row, root);

  if (spacerHeight > 1) {
    const spacerRow = document.createElement("tr");
    spacerRow.className = "pdf-table-break-spacer";
    spacerRow.style.setProperty("--pdf-table-spacer-height", `${spacerHeight}px`);

    const spacerCell = document.createElement("td");
    spacerCell.colSpan = columnCount;
    spacerCell.innerHTML = "&nbsp;";
    spacerRow.appendChild(spacerCell);
    parent.insertBefore(spacerRow, row);
  }

  if (options.repeatHeader) {
    const repeatedHeader = createRepeatedTableHeader(table);
    if (repeatedHeader) {
      parent.insertBefore(repeatedHeader, row);
    }
  }
}

function paginateDocumentTable(root: HTMLElement) {
  const table = root.querySelector<HTMLTableElement>("[data-document-table]");
  if (!table) {
    return;
  }

  const itemRows = Array.from(table.querySelectorAll<HTMLTableRowElement>("[data-item-row]"));
  const summaryRows = Array.from(table.querySelectorAll<HTMLTableRowElement>("[data-summary-row]"));
  const firstItemRow = itemRows[0];
  const tableHead = table.querySelector<HTMLElement>("thead");
  const pageUsableHeight =
    PDF_PAGE_HEIGHT_PX - PDF_PAGE_TOP_MARGIN_PX - PDF_PAGE_BOTTOM_MARGIN_PX;

  if (firstItemRow) {
    const tableStartHeight =
      getElementHeight(tableHead || firstItemRow) + Math.min(getElementHeight(firstItemRow), 96);
    if (wouldOverflowPage(table, root, tableStartHeight)) {
      insertPageBreakBefore(table, root);
    }
  }

  itemRows.forEach((row, index) => {
    const rowHeight = getElementHeight(row);
    if (rowHeight >= pageUsableHeight) {
      return;
    }

    if (wouldOverflowPage(row, root, rowHeight)) {
      insertTablePageBreakBefore(row, root, { repeatHeader: index > 0 });
    }
  });

  const firstSummaryRow = summaryRows[0];
  if (!firstSummaryRow) {
    return;
  }

  const summaryHeight = sumElementHeights(summaryRows);
  if (summaryHeight < pageUsableHeight && wouldOverflowPage(firstSummaryRow, root, summaryHeight)) {
    insertTablePageBreakBefore(firstSummaryRow, root);
  }
}

function paginateKeepBlocks(root: HTMLElement) {
  const pageUsableHeight =
    PDF_PAGE_HEIGHT_PX - PDF_PAGE_TOP_MARGIN_PX - PDF_PAGE_BOTTOM_MARGIN_PX;
  const blocks = Array.from(root.querySelectorAll<HTMLElement>("[data-keep-block]"));

  blocks.forEach((block) => {
    const blockHeight = getElementHeight(block);
    if (blockHeight >= pageUsableHeight) {
      return;
    }

    if (wouldOverflowPage(block, root, blockHeight)) {
      insertPageBreakBefore(block, root);
    }
  });
}

function paginateBankAccountLines(account: HTMLElement, root: HTMLElement) {
  const lines = Array.from(account.querySelectorAll<HTMLElement>("[data-bank-detail-line]"));
  const accountLabel = account.dataset.bankAccountLabel?.trim();
  const pageUsableHeight =
    PDF_PAGE_HEIGHT_PX - PDF_PAGE_TOP_MARGIN_PX - PDF_PAGE_BOTTOM_MARGIN_PX;

  lines.forEach((line) => {
    const lineHeight = getElementHeight(line);

    if (lineHeight >= pageUsableHeight) {
      return;
    }

    if (wouldOverflowPage(line, root, lineHeight)) {
      insertPageBreakBefore(line, root, {
        continuationHeading: true,
        accountLabel,
      });
    }
  });
}

function paginateBankDetails(root: HTMLElement) {
  const bankDetails = root.querySelector<HTMLElement>("[data-bank-details]");
  if (!bankDetails) {
    return;
  }

  const heading = bankDetails.querySelector<HTMLElement>("[data-bank-heading]");
  const accounts = Array.from(bankDetails.querySelectorAll<HTMLElement>("[data-bank-account]"));
  if (accounts.length === 0) {
    return;
  }

  const headingHeight = heading ? getElementHeight(heading) + 8 : 0;
  const firstAccountStartHeight = Math.min(getElementHeight(accounts[0]), 96);

  if (wouldOverflowPage(bankDetails, root, headingHeight + firstAccountStartHeight)) {
    insertPageBreakBefore(bankDetails, root);
  }

  const pageUsableHeight =
    PDF_PAGE_HEIGHT_PX - PDF_PAGE_TOP_MARGIN_PX - PDF_PAGE_BOTTOM_MARGIN_PX;

  accounts.forEach((account, index) => {
    const accountHeight = getElementHeight(account);
    const readableStartHeight = Math.min(accountHeight, 96);

    if (wouldOverflowPage(account, root, readableStartHeight)) {
      insertPageBreakBefore(account, root, {
        continuationHeading: index > 0,
      });
    } else if (accountHeight <= pageUsableHeight && wouldOverflowPage(account, root, accountHeight)) {
      insertPageBreakBefore(account, root, {
        continuationHeading: index > 0,
      });
    }

    paginateBankAccountLines(account, root);
  });
}

async function captureMarkup(markup: string) {
  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-10000px";
  wrapper.style.top = "0";
  wrapper.style.width = `${PDF_LAYOUT_WIDTH_PX}px`;
  wrapper.innerHTML = markup;
  document.body.appendChild(wrapper);

  try {
    await document.fonts?.ready;

    const images = Array.from(wrapper.querySelectorAll("img"));
    await Promise.all(
      images.map((image) => {
        if (image.complete) {
          return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
          image.onload = () => resolve();
          image.onerror = () => resolve();
        });
      }),
    );

    const target = wrapper.querySelector(".sheet");
    if (!(target instanceof HTMLElement)) {
      throw new Error("Could not prepare the PDF layout.");
    }

    paginateDocumentTable(target);
    paginateKeepBlocks(target);
    paginateBankDetails(target);
    paginateKeepBlocks(target);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const canvas = await html2canvas(target, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: target.scrollWidth,
      windowHeight: target.scrollHeight,
    });

    return canvas;
  } finally {
    document.body.removeChild(wrapper);
  }
}

export async function generateDocumentPdf(documentData: QuoteFlowDocument) {
  const canvas = await captureMarkup(renderDocumentHtml(documentData));
  const pdf = new jsPDF("p", "pt", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imageWidth = pageWidth;
  const imageHeight = (canvas.height * imageWidth) / canvas.width;
  const image = canvas.toDataURL("image/png");

  let heightLeft = imageHeight;
  let position = 0;

  pdf.addImage(image, "PNG", 0, position, imageWidth, imageHeight, undefined, "FAST");
  heightLeft -= pageHeight;

  while (heightLeft > 2) {
    position = heightLeft - imageHeight;
    pdf.addPage();
    pdf.addImage(image, "PNG", 0, position, imageWidth, imageHeight, undefined, "FAST");
    heightLeft -= pageHeight;
  }

  return pdf.output("blob");
}
