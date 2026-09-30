import { DOCUMENT_TYPE_LABELS } from "../../lib/constants";
import {
  calculateDocumentTotalsForDocument,
  calculateLineTotals,
  formatCurrency,
  getBankAccounts,
  getDocumentPricingOptions,
  isDiscountLineItem,
} from "../../lib/documents";
import { formatDateLabel } from "../../lib/utils";
import type { QuoteFlowDocument } from "../../types";

export function DocumentPreview({ document }: { document: QuoteFlowDocument }) {
  const totals = calculateDocumentTotalsForDocument(document);
  const pricing = getDocumentPricingOptions(document);
  const bankAccounts = getBankAccounts(document.business);
  const clientName = document.client.company || document.client.name || "Client";
  const showDiscountSummary = pricing.includeDiscount || totals.discountTotal > 0;

  return (
    <article className="print-area document-sheet mx-auto w-full max-w-[210mm] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-card dark:border-white/10 dark:bg-white dark:text-slate-950">
      <div
        className="px-5 py-6 text-white sm:px-8"
        style={{ backgroundColor: document.business.accentColor || "#0f7a49" }}
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            {document.business.logoDataUrl ? (
              <img
                alt="Business logo"
                className="h-16 w-16 rounded-[18px] bg-white object-contain p-2"
                src={document.business.logoDataUrl}
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-[18px] bg-white/15 text-lg font-extrabold">
                {(document.business.name || "QF").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="text-2xl font-extrabold">{document.business.name || "Your business"}</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-white/85">
                {document.business.address}
              </p>
              <p className="text-sm text-white/85">
                {[document.business.phone, document.business.email, document.business.website]
                  .filter(Boolean)
                  .join(" | ")}
              </p>
            </div>
          </div>
          <div className="rounded-[20px] bg-white/14 p-4 text-left sm:text-right">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-white/75">
              {DOCUMENT_TYPE_LABELS[document.type]}
            </p>
            <p className="mt-2 text-2xl font-extrabold">{document.number}</p>
          </div>
        </div>
      </div>

      <div className="space-y-6 p-5 sm:p-8">
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Client</p>
            <h3 className="mt-2 text-xl font-extrabold text-slate-950">{clientName}</h3>
            {document.business.showClientDetails ? (
              <div className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
                {[document.client.name && document.client.company ? document.client.name : "", document.client.address, document.client.phone, document.client.email]
                  .filter(Boolean)
                  .join("\n")}
              </div>
            ) : null}
          </div>
          <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2 md:text-right">
            <div>
              <p className="font-semibold text-slate-500">Issue date</p>
              <p className="font-bold text-slate-950">{formatDateLabel(document.issueDate)}</p>
            </div>
            {document.type === "quotation" ? (
              <div>
                <p className="font-semibold text-slate-500">Valid until</p>
                <p className="font-bold text-slate-950">{formatDateLabel(document.validUntil)}</p>
              </div>
            ) : (
              <div>
                <p className="font-semibold text-slate-500">Due date</p>
                <p className="font-bold text-slate-950">{formatDateLabel(document.dueDate)}</p>
              </div>
            )}
          </div>
        </div>

        <div className="document-table-wrap overflow-x-auto rounded-[22px] border border-slate-200">
          <table className="document-table min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Price</th>
                {pricing.includeDiscount ? <th className="px-4 py-3 text-right">Disc</th> : null}
                {pricing.includeTax ? <th className="px-4 py-3 text-right">Tax</th> : null}
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {document.items.map((item) => {
                const line = calculateLineTotals(item, pricing);
                const isDiscountItem = isDiscountLineItem(item);
                return (
                  <tr className="document-table-row" key={item.id}>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-950">{item.name || "Item"}</p>
                      {item.description ? (
                        <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-500">
                          {item.description}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right">{item.quantity}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(item.unitPrice, document.currency)}</td>
                    {pricing.includeDiscount ? (
                      <td className="px-4 py-3 text-right">{isDiscountItem ? "-" : `${item.discount}%`}</td>
                    ) : null}
                    {pricing.includeTax ? (
                      <td className="px-4 py-3 text-right">{isDiscountItem ? "-" : `${item.tax}%`}</td>
                    ) : null}
                    <td className={`px-4 py-3 text-right font-bold ${line.lineTotal < 0 ? "text-rose-700" : "text-slate-950"}`}>
                      {formatCurrency(line.lineTotal, document.currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="document-summary-grid grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            {document.business.showNotes && document.notes ? (
              <section className="document-keep-block">
                <h3 className="text-sm font-extrabold uppercase tracking-[0.14em] text-slate-500">Notes</h3>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{document.notes}</p>
              </section>
            ) : null}
            {document.business.showTerms && document.terms ? (
              <section className="document-keep-block">
                <h3 className="text-sm font-extrabold uppercase tracking-[0.14em] text-slate-500">Terms</h3>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{document.terms}</p>
              </section>
            ) : null}
            {bankAccounts.length > 0 ? (
              <section className="document-keep-block">
                <h3 className="text-sm font-extrabold uppercase tracking-[0.14em] text-slate-500">Payment details</h3>
                <div className="mt-2 grid gap-2">
                  {bankAccounts.map((account) => (
                    <div className="document-keep-block rounded-[18px] bg-slate-50 p-3" key={account.id}>
                      {account.label ? <p className="font-bold text-slate-950">{account.label}</p> : null}
                      <p className="whitespace-pre-line text-sm leading-6 text-slate-600">{account.details}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <div className="document-keep-block rounded-[22px] bg-slate-50 p-4">
            <div className="space-y-3 text-sm text-slate-600">
              <div className="flex justify-between gap-4">
                <span>Subtotal</span>
                <span>{formatCurrency(totals.subtotal, document.currency)}</span>
              </div>
              {showDiscountSummary ? (
                <div className="flex justify-between gap-4">
                  <span>Discount</span>
                  <span>{formatCurrency(-totals.discountTotal, document.currency)}</span>
                </div>
              ) : null}
              {pricing.includeTax ? (
                <div className="flex justify-between gap-4">
                  <span>Tax</span>
                  <span>{formatCurrency(totals.taxTotal, document.currency)}</span>
                </div>
              ) : null}
              <div className="flex justify-between gap-4 border-t border-slate-200 pt-3 text-lg font-extrabold text-slate-950">
                <span>Total</span>
                <span>{formatCurrency(totals.grandTotal, document.currency)}</span>
              </div>
              {document.type === "invoice" ? (
                <>
                  <div className="flex justify-between gap-4">
                    <span>Amount paid</span>
                    <span>{formatCurrency(totals.amountPaid, document.currency)}</span>
                  </div>
                  <div className="flex justify-between gap-4 font-bold text-slate-950">
                    <span>Balance due</span>
                    <span>{formatCurrency(totals.balanceDue, document.currency)}</span>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {(document.business.signatureDataUrl || document.business.stampLabel) ? (
          <div className="document-keep-block flex flex-wrap items-end justify-between gap-4 pt-4">
            {document.business.signatureDataUrl ? (
              <div>
                <img alt="Signature" className="h-20 max-w-56 object-contain" src={document.business.signatureDataUrl} />
                <div className="mt-2 h-px w-56 bg-slate-300" />
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Authorized signature
                </p>
              </div>
            ) : null}
            {document.business.stampLabel ? (
              <div className="rounded-full border-2 border-dashed border-slate-300 px-6 py-4 text-center text-sm font-extrabold uppercase tracking-[0.18em] text-slate-500">
                {document.business.stampLabel}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
