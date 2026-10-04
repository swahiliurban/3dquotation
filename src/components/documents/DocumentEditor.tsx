import {
  Download,
  MessageCircle,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  CURRENCY_OPTIONS,
  DOCUMENT_TYPE_LABELS,
  INVOICE_STATUSES,
  PAYMENT_METHODS,
  QUOTATION_STATUSES,
  STATUS_LABELS,
} from "../../lib/constants";
import {
  calculateDocumentTotalsForDocument,
  createEmptyItem,
  documentNumberMatches,
  formatCurrency,
  nextDocumentNumberForClient,
} from "../../lib/documents";
import { generateDocumentPdf } from "../../lib/pdf";
import { shareDocumentViaWhatsApp, shareResultMessage } from "../../lib/share";
import { downloadBlob, formatDateLabel, safeNumber, todayIso } from "../../lib/utils";
import { useQuoteFlowStore } from "../../store/useQuoteFlowStore";
import type {
  CatalogItem,
  ClientProfile,
  DocumentItem,
  DocumentStatus,
  QuoteFlowDocument,
} from "../../types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { PageHeader } from "../ui/PageHeader";
import { DocumentPreview } from "./DocumentPreview";

type SaveMode = "save" | "download" | "share";

const DUPLICATE_NUMBER_CONFIRMATION =
  "This INV/QT number already exists for this same client/company. Do you want to replace/update that existing record?";

interface DocumentEditorProps {
  businessProfile: QuoteFlowDocument["business"];
  catalogOptions: CatalogItem[];
  clientOptions: ClientProfile[];
  initialDocument: QuoteFlowDocument;
  isNew: boolean;
  onSave: (
    document: QuoteFlowDocument,
    isNew: boolean,
    mode: SaveMode,
    options?: { manualNumber?: boolean; replaceExistingNumber?: boolean },
  ) => Promise<QuoteFlowDocument>;
  quotationOptions: QuoteFlowDocument[];
  savedDocuments: QuoteFlowDocument[];
}

function updateItem(
  items: DocumentItem[],
  itemId: string,
  patch: Partial<DocumentItem>,
) {
  return items.map((item) => (item.id === itemId ? { ...item, ...patch } : item));
}

function numberInputValue(value: number | undefined) {
  return Number.isFinite(Number(value)) ? String(value) : "0";
}

function normalizeLookup(value: string) {
  return value.trim().toLowerCase();
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function isDuplicateNumberError(error: unknown) {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: number }).status)
      : 0;

  return (
    status === 409 ||
    (error instanceof Error && /already (?:used|exists)/i.test(error.message))
  );
}

export function DocumentEditor({
  businessProfile,
  catalogOptions,
  clientOptions,
  initialDocument,
  isNew,
  onSave,
  savedDocuments,
}: DocumentEditorProps) {
  const markDocumentShared = useQuoteFlowStore((state) => state.markDocumentShared);
  const [document, setDocument] = useState(initialDocument);
  const [documentIsNew, setDocumentIsNew] = useState(isNew);
  const [numberWasEdited, setNumberWasEdited] = useState(false);
  const [busyMode, setBusyMode] = useState<SaveMode | null>(null);
  const [datePromptMode, setDatePromptMode] = useState<SaveMode | null>(null);
  const totals = useMemo(() => calculateDocumentTotalsForDocument(document), [document]);
  const statuses = document.type === "quotation" ? QUOTATION_STATUSES : INVOICE_STATUSES;

  const clientNames = useMemo(
    () =>
      uniqueValues(
        clientOptions.flatMap((client) => [
          client.name,
          client.company,
          client.email,
          client.phone,
        ]),
      ),
    [clientOptions],
  );
  const catalogNames = useMemo(
    () => uniqueValues(catalogOptions.map((item) => item.name)),
    [catalogOptions],
  );

  function findSavedClient(value: string) {
    const lookup = normalizeLookup(value);
    if (!lookup) {
      return undefined;
    }

    return clientOptions.find((client) =>
      [client.name, client.company, client.email, client.phone]
        .filter(Boolean)
        .some((field) => normalizeLookup(field) === lookup),
    );
  }

  function findSavedCatalogItem(value: string) {
    const lookup = normalizeLookup(value);
    if (!lookup) {
      return undefined;
    }

    return catalogOptions.find((item) => normalizeLookup(item.name) === lookup);
  }

  function documentNumberConflicts(candidate: QuoteFlowDocument) {
    if (!normalizeLookup(candidate.number)) {
      return false;
    }

    return savedDocuments.some(
      (savedDocument) =>
        savedDocument.id !== candidate.id &&
        documentNumberMatches(savedDocument, candidate),
    );
  }

  function patchDocument(patch: Partial<QuoteFlowDocument>) {
    setDocument((current) => ({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    }));
  }

  function patchClient(patch: Partial<QuoteFlowDocument["client"]>) {
    patchDocument({ client: { ...document.client, ...patch } });
  }

  function maybeRefreshNumberForClient(client: QuoteFlowDocument["client"]) {
    if (!documentIsNew || numberWasEdited) {
      return document.number;
    }

    return nextDocumentNumberForClient(savedDocuments, document.type, client, document.id);
  }

  function applyClientInput(field: keyof QuoteFlowDocument["client"], value: string) {
    const savedClient = findSavedClient(value);
    if (savedClient) {
      const nextClient = {
        clientId: savedClient.id,
        name: savedClient.name,
        company: savedClient.company,
        address: savedClient.address,
        phone: savedClient.phone,
        email: savedClient.email,
      };

      patchDocument({
        client: nextClient,
        number: maybeRefreshNumberForClient(nextClient),
      });
      return;
    }

    const nextClient = { ...document.client, clientId: undefined, [field]: value };
    patchDocument({
      client: nextClient,
      number: maybeRefreshNumberForClient(nextClient),
    });
  }

  function patchBusinessFromCurrentProfile() {
    patchDocument({ business: businessProfile });
    toast.success("Business settings applied to this document.");
  }

  function addItem() {
    const defaults = {
      discount: document.business.showDiscount ? document.business.defaultDiscountRate : 0,
      tax: document.business.showTax ? document.business.defaultTaxRate : 0,
    };
    patchDocument({ items: [...document.items, createEmptyItem(defaults)] });
  }

  function removeItem(itemId: string) {
    if (document.items.length === 1) {
      toast.error("Keep at least one line item.");
      return;
    }

    patchDocument({ items: document.items.filter((item) => item.id !== itemId) });
  }

  function shouldConfirmDateBeforeSave(mode: SaveMode) {
    return (
      mode === "save" &&
      !documentIsNew &&
      Boolean(document.issueDate) &&
      document.issueDate !== todayIso()
    );
  }

  async function saveCurrent(mode: SaveMode, documentToSave = document) {
    let replaceExistingNumber = false;
    if (numberWasEdited && documentNumberConflicts(documentToSave)) {
      replaceExistingNumber = window.confirm(DUPLICATE_NUMBER_CONFIRMATION);
      if (!replaceExistingNumber) {
        return undefined;
      }
    }

    setBusyMode(mode);
    try {
      const saveOptions = {
        manualNumber: numberWasEdited,
        replaceExistingNumber,
      };
      let saved: QuoteFlowDocument;
      try {
        saved = await onSave(documentToSave, documentIsNew, mode, saveOptions);
      } catch (error) {
        if (!isDuplicateNumberError(error)) {
          throw error;
        }

        const confirmed = window.confirm(DUPLICATE_NUMBER_CONFIRMATION);
        if (!confirmed) {
          return undefined;
        }

        saved = await onSave(documentToSave, documentIsNew, mode, {
          ...saveOptions,
          replaceExistingNumber: true,
        });
      }

      setDocument(saved);
      setDocumentIsNew(false);
      setNumberWasEdited(false);
      return saved;
    } finally {
      setBusyMode(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (shouldConfirmDateBeforeSave("save")) {
      setDatePromptMode("save");
      return;
    }

    try {
      await saveCurrent("save");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this document.");
    }
  }

  async function handleDownload() {
    let saved: QuoteFlowDocument | undefined;
    try {
      try {
        saved = await saveCurrent("download");
        if (!saved) return; // Respect a cancelled duplicate-number prompt.
      } catch (error) {
        toast.warning("Online save failed. Downloading an unsaved copy; keep this page open and retry Save.");
      }
      setBusyMode("download");
      const exportDocument = saved || document;
      const blob = await generateDocumentPdf(exportDocument);
      downloadBlob(blob, `${exportDocument.number}${saved ? "" : "-UNSAVED"}.pdf`);
      if (saved) {
        toast.success("Saved record and downloaded PDF.");
        // Recording download history is optional and cannot undo the download.
        void markDocumentShared(saved.id, "pdf").catch(() => {
          toast.warning("PDF downloaded, but download history could not sync.");
        });
      } else {
        toast.warning("Unsaved PDF downloaded. This copy is not confirmed in shared records.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download PDF.");
    } finally {
      setBusyMode(null);
    }
  }

  async function handleShare() {
    try {
      const saved = await saveCurrent("share");
      if (!saved) {
        return;
      }
      const result = await shareDocumentViaWhatsApp(saved);
      if (result.mode !== "cancelled") {
        await markDocumentShared(saved.id, "whatsapp");
      }
      toast.success(`Saved record. ${shareResultMessage(result)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start WhatsApp sharing.");
    }
  }

  return (
    <form aria-busy={Boolean(busyMode)} className="document-editor-form space-y-6" onSubmit={(event) => void handleSubmit(event)}>
      <PageHeader
        eyebrow={DOCUMENT_TYPE_LABELS[document.type]}
        title={`${documentIsNew ? "Create" : "Edit"} ${document.number}`}
        description="Save stores the record in shared records. PDF first attempts to save; if saving fails, it exports a clearly named unsaved copy."
        actions={
          <>
            <Button
              className="w-full sm:w-auto"
              disabled={Boolean(busyMode) || Boolean(datePromptMode)}
              icon={<Save size={16} />}
              type="submit"
            >
              {busyMode === "save" ? "Saving..." : "Save"}
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={Boolean(busyMode) || Boolean(datePromptMode)}
              icon={<Download size={16} />}
              onClick={() => void handleDownload()}
              variant="secondary"
            >
              {busyMode === "download" ? "Preparing..." : "Download PDF"}
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={Boolean(busyMode) || Boolean(datePromptMode)}
              icon={<MessageCircle size={16} />}
              onClick={() => void handleShare()}
              variant="secondary"
            >
              {busyMode === "share" ? "Preparing..." : "Share on WhatsApp"}
            </Button>
          </>
        }
      />

      <div className="document-editor-grid grid min-w-0 gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
        <div className="min-w-0 space-y-6">
          <Card className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="panel-title">Document details</h2>
                <p className="panel-subtitle">Set the number, dates, status, currency, and payment tracking.</p>
              </div>
              <Button onClick={patchBusinessFromCurrentProfile} type="button" variant="secondary">
                Apply settings
              </Button>
            </div>

            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <div>
                <label className="form-label">Document number</label>
                <input
                  className="form-input"
                  inputMode="text"
                  onChange={(event) => {
                    setNumberWasEdited(true);
                    patchDocument({ number: event.target.value });
                  }}
                  value={document.number}
                />
              </div>
              <div>
                <label className="form-label">Status</label>
                <select
                  className="form-input"
                  onChange={(event) => patchDocument({ status: event.target.value as DocumentStatus })}
                  value={document.status}
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Currency</label>
                <select
                  className="form-input"
                  onChange={(event) => patchDocument({ currency: event.target.value })}
                  value={document.currency}
                >
                  {CURRENCY_OPTIONS.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Issue date</label>
                <input
                  className="form-input"
                  onChange={(event) => patchDocument({ issueDate: event.target.value })}
                  type="date"
                  value={document.issueDate}
                />
              </div>
              {document.type === "quotation" ? (
                <div>
                  <label className="form-label">Valid until</label>
                  <input
                    className="form-input"
                    onChange={(event) => patchDocument({ validUntil: event.target.value })}
                    type="date"
                    value={document.validUntil || ""}
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="form-label">Due date</label>
                    <input
                      className="form-input"
                      onChange={(event) => patchDocument({ dueDate: event.target.value })}
                      type="date"
                      value={document.dueDate || ""}
                    />
                  </div>
                  <div>
                    <label className="form-label">Payment method</label>
                    <select
                      className="form-input"
                      onChange={(event) =>
                        patchDocument({
                          paymentMethod: event.target.value
                            ? (event.target.value as QuoteFlowDocument["paymentMethod"])
                            : undefined,
                        })
                      }
                      value={document.paymentMethod || ""}
                    >
                      <option value="">Not selected</option>
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {method}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Amount paid</label>
                    <input
                      className="form-input"
                      min="0"
                      onChange={(event) => patchDocument({ amountPaid: safeNumber(event.target.value) })}
                      step="0.01"
                      type="number"
                      value={numberInputValue(document.amountPaid)}
                    />
                  </div>
                </>
              )}
            </div>
          </Card>

          <Card className="space-y-5">
            <div>
              <h2 className="panel-title">Client</h2>
              <p className="panel-subtitle">These client details are saved with the document and reused in records.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="form-label">Client name</label>
                <input
                  className="form-input"
                  autoComplete="name"
                  list="client-name-options"
                  onChange={(event) => applyClientInput("name", event.target.value)}
                  value={document.client.name}
                />
                <datalist id="client-name-options">
                  {clientNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="form-label">Company</label>
                <input
                  className="form-input"
                  autoComplete="organization"
                  list="client-name-options"
                  onChange={(event) => applyClientInput("company", event.target.value)}
                  value={document.client.company}
                />
              </div>
              <div className="md:col-span-2">
                <label className="form-label">Address</label>
                <textarea
                  className="form-input min-h-24"
                  onChange={(event) => patchClient({ address: event.target.value })}
                  value={document.client.address}
                />
              </div>
              <div>
                <label className="form-label">Phone</label>
                <input
                  className="form-input"
                  autoComplete="tel"
                  inputMode="tel"
                  onChange={(event) => applyClientInput("phone", event.target.value)}
                  value={document.client.phone}
                />
              </div>
              <div>
                <label className="form-label">Email</label>
                <input
                  className="form-input"
                  autoComplete="email"
                  onChange={(event) => applyClientInput("email", event.target.value)}
                  type="email"
                  value={document.client.email}
                />
              </div>
            </div>
          </Card>

          <Card className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="panel-title">Items</h2>
                <p className="panel-subtitle">Each line is saved with quantities, pricing, tax, and discount values.</p>
              </div>
              <Button icon={<Plus size={16} />} onClick={addItem} type="button" variant="secondary">
                Add item
              </Button>
            </div>

            <div className="grid gap-4">
              {document.items.map((item, index) => (
                <div
                  className="min-w-0 rounded-[22px] border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"
                  key={item.id}
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <p className="text-sm font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                      Item {index + 1}
                    </p>
                    <Button
                      className="!min-h-10 !rounded-2xl !px-3 !py-2"
                      onClick={() => removeItem(item.id)}
                      type="button"
                      variant="danger"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                  <div className="grid min-w-0 gap-4 md:grid-cols-6">
                    <div className="md:col-span-3">
                      <label className="form-label">Name</label>
                      <input
                        className="form-input"
                        list="catalog-name-options"
                        onChange={(event) => {
                          const catalogItem = findSavedCatalogItem(event.target.value);
                          patchDocument({
                            items: updateItem(document.items, item.id, {
                              name: event.target.value,
                              description: catalogItem?.description ?? item.description,
                              unitPrice: catalogItem?.unitPrice ?? item.unitPrice,
                              discount: catalogItem?.discount ?? item.discount,
                              tax: catalogItem?.tax ?? item.tax,
                            }),
                          });
                        }}
                        value={item.name}
                      />
                      <datalist id="catalog-name-options">
                        {catalogNames.map((name) => (
                          <option key={name} value={name} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className="form-label">Qty</label>
                      <input
                        className="form-input"
                        inputMode="decimal"
                        min="0"
                        onChange={(event) =>
                          patchDocument({
                            items: updateItem(document.items, item.id, {
                              quantity: safeNumber(event.target.value),
                            }),
                          })
                        }
                        step="0.01"
                        type="number"
                        value={numberInputValue(item.quantity)}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="form-label">Unit price</label>
                      <input
                        className="form-input"
                        inputMode="decimal"
                        min="0"
                        onChange={(event) =>
                          patchDocument({
                            items: updateItem(document.items, item.id, {
                              unitPrice: safeNumber(event.target.value),
                            }),
                          })
                        }
                        step="0.01"
                        type="number"
                        value={numberInputValue(item.unitPrice)}
                      />
                    </div>
                    <div className="md:col-span-6">
                      <label className="form-label">Description</label>
                      <textarea
                        className="form-input min-h-20"
                        onChange={(event) =>
                          patchDocument({
                            items: updateItem(document.items, item.id, {
                              description: event.target.value,
                            }),
                          })
                        }
                        value={item.description}
                      />
                    </div>
                    {document.business.showDiscount ? (
                      <div>
                        <label className="form-label">Discount %</label>
                        <input
                          className="form-input"
                          inputMode="decimal"
                          min="0"
                          onChange={(event) =>
                            patchDocument({
                              items: updateItem(document.items, item.id, {
                                discount: safeNumber(event.target.value),
                              }),
                            })
                          }
                          step="0.01"
                          type="number"
                          value={numberInputValue(item.discount)}
                        />
                      </div>
                    ) : null}
                    {document.business.showTax ? (
                      <div>
                        <label className="form-label">Tax %</label>
                        <input
                          className="form-input"
                          inputMode="decimal"
                          min="0"
                          onChange={(event) =>
                            patchDocument({
                              items: updateItem(document.items, item.id, {
                                tax: safeNumber(event.target.value),
                              }),
                            })
                          }
                          step="0.01"
                          type="number"
                          value={numberInputValue(item.tax)}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-5">
            <div>
              <h2 className="panel-title">Notes and terms</h2>
              <p className="panel-subtitle">These fields appear on the saved preview and exported PDF.</p>
            </div>
            <div className="grid gap-4">
              <div>
                <label className="form-label">Notes</label>
                <textarea
                  className="form-input min-h-24"
                  onChange={(event) => patchDocument({ notes: event.target.value })}
                  value={document.notes}
                />
              </div>
              <div>
                <label className="form-label">Terms</label>
                <textarea
                  className="form-input min-h-24"
                  onChange={(event) => patchDocument({ terms: event.target.value })}
                  value={document.terms}
                />
              </div>
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-4 xl:sticky xl:top-36 xl:self-start">
          <Card className="space-y-3">
            <div className="flex justify-between gap-4 text-sm text-slate-600 dark:text-slate-300">
              <span>Total amount</span>
              <span className="font-extrabold text-slate-950 dark:text-white">
                {formatCurrency(totals.grandTotal, document.currency)}
              </span>
            </div>
            {document.type === "invoice" ? (
              <div className="flex justify-between gap-4 text-sm text-slate-600 dark:text-slate-300">
                <span>Balance due</span>
                <span className="font-extrabold text-slate-950 dark:text-white">
                  {formatCurrency(totals.balanceDue, document.currency)}
                </span>
              </div>
            ) : null}
          </Card>
          <DocumentPreview document={document} />
        </div>
      </div>

      <div className="document-mobile-actions no-print sticky bottom-0 z-20 -mx-4 border-t border-slate-200 bg-sand-50/95 px-4 py-3 shadow-[0_-18px_40px_rgba(15,23,42,0.10)] backdrop-blur dark:border-white/10 dark:bg-slate-950/95 sm:hidden">
        <div className="grid gap-2">
          <Button
            disabled={Boolean(busyMode) || Boolean(datePromptMode)}
            icon={<Save size={16} />}
            type="submit"
          >
            {busyMode === "save" ? "Saving..." : "Save"}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              disabled={Boolean(busyMode) || Boolean(datePromptMode)}
              icon={<Download size={16} />}
              onClick={() => void handleDownload()}
              variant="secondary"
            >
              PDF
            </Button>
            <Button
              disabled={Boolean(busyMode) || Boolean(datePromptMode)}
              icon={<MessageCircle size={16} />}
              onClick={() => void handleShare()}
              variant="secondary"
            >
              WhatsApp
            </Button>
          </div>
        </div>
      </div>

      {datePromptMode ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 px-3 py-4 backdrop-blur-sm sm:items-center">
          <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-[24px] border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-slate-900">
            <h2 className="text-lg font-extrabold text-slate-950 dark:text-white">
              Update {DOCUMENT_TYPE_LABELS[document.type].toLowerCase()} date?
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              This {DOCUMENT_TYPE_LABELS[document.type].toLowerCase()} was originally dated{" "}
              <strong>{formatDateLabel(document.issueDate)}</strong>. Do you want to keep the original date
              or update it to <strong>{formatDateLabel(todayIso())}</strong>?
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <Button
                onClick={() => {
                  const mode = datePromptMode;
                  setDatePromptMode(null);
                  void saveCurrent(mode);
                }}
                type="button"
                variant="secondary"
              >
                Keep Original Date
              </Button>
              <Button
                onClick={() => {
                  const mode = datePromptMode;
                  setDatePromptMode(null);
                  const updatedDocument = {
                    ...document,
                    issueDate: todayIso(),
                    updatedAt: new Date().toISOString(),
                  };
                  setDocument(updatedDocument);
                  void saveCurrent(mode, updatedDocument);
                }}
                type="button"
              >
                Update to Today&apos;s Date
              </Button>
              <Button onClick={() => setDatePromptMode(null)} type="button" variant="ghost">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
