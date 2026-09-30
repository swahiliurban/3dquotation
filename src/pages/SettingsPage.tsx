import { CheckCircle2, Cloud, Download, ImagePlus, LogOut, Plus, Save, Trash2 } from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import {
  createEmptyBankAccount,
  normalizeBusinessProfile,
} from "../lib/documents";
import { hasUsableBusinessIdentity, normalizeIdentityFields, sameBusinessIdentity } from "../lib/api/sharedStore";
import { downloadBlob, fileToDataUrl } from "../lib/utils";
import { useQuoteFlowStore } from "../store/useQuoteFlowStore";
import type { BusinessProfile } from "../types";

export function SettingsPage() {
  const user = useQuoteFlowStore((state) => state.user);
  const businessIdentity = useQuoteFlowStore((state) => state.businessIdentity);
  const isSyncingIdentity = useQuoteFlowStore((state) => state.isSyncingIdentity);
  const businessProfile = useQuoteFlowStore((state) => state.businessProfile);
  const documents = useQuoteFlowStore((state) => state.documents);
  const clients = useQuoteFlowStore((state) => state.clients);
  const catalog = useQuoteFlowStore((state) => state.catalog);
  const nextNumbers = useQuoteFlowStore((state) => state.nextNumbers);
  const connectBusinessIdentity = useQuoteFlowStore((state) => state.connectBusinessIdentity);
  const disconnectBusinessIdentity = useQuoteFlowStore((state) => state.disconnectBusinessIdentity);
  const updateBusinessProfile = useQuoteFlowStore((state) => state.updateBusinessProfile);
  const { control, register, getValues, handleSubmit, reset, setValue, watch } = useForm<BusinessProfile>({
    defaultValues: normalizeBusinessProfile(businessProfile),
  });
  const { fields: bankAccountFields, append: appendBankAccount, remove: removeBankAccount } =
    useFieldArray({
      control,
      name: "bankAccounts",
  });

  useEffect(() => {
    reset(normalizeBusinessProfile(businessProfile));
  }, [businessProfile, reset]);

  const values = watch();
  const watchedEmail = watch("email");
  const watchedPhone = watch("phone");
  const lastIdentityLookupRef = useRef("");
  const [identityMessage, setIdentityMessage] = useState("");

  useEffect(() => {
    const normalized = normalizeIdentityFields(watchedEmail || "", watchedPhone || "");
    const lookupKey = `${normalized.email}|${normalized.phone}`;

    if (!hasUsableBusinessIdentity(normalized.email, normalized.phone)) {
      setIdentityMessage("");
      return;
    }

    if (
      sameBusinessIdentity(businessIdentity, normalized)
    ) {
      lastIdentityLookupRef.current = lookupKey;
      setIdentityMessage("Shared workspace connected.");
      return;
    }

    if (lastIdentityLookupRef.current === lookupKey) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      lastIdentityLookupRef.current = lookupKey;
      void (async () => {
        try {
          const result = await connectBusinessIdentity({
            email: normalized.email,
            phone: normalized.phone,
            seedProfile: normalizeBusinessProfile({
              ...getValues(),
              email: normalized.email,
              phone: watchedPhone,
            }),
          });
          const message = result.workspaceExists
            ? "Saved business workspace loaded."
            : "Shared business workspace created.";
          setIdentityMessage(message);
          toast.success(message);
        } catch (error) {
          lastIdentityLookupRef.current = "";
          setIdentityMessage("Shared workspace is unavailable right now.");
          console.warn("QuoteFlow could not connect the business identity.", error);
        }
      })();
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [businessIdentity, connectBusinessIdentity, getValues, watchedEmail, watchedPhone]);

  async function handleSwitchBusiness() {
    await disconnectBusinessIdentity();
    setValue("email", "", { shouldDirty: true });
    setValue("phone", "", { shouldDirty: true });
    lastIdentityLookupRef.current = "";
    setIdentityMessage("Shared workspace disconnected. Enter another business email and phone to switch.");
    toast.success("Shared workspace disconnected.");
  }

  async function handleImageUpload(
    event: ChangeEvent<HTMLInputElement>,
    field: "logoDataUrl" | "signatureDataUrl",
  ) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const dataUrl = await fileToDataUrl(file);
    setValue(field, dataUrl, { shouldDirty: true });
  }

  function exportBackup() {
    const state = useQuoteFlowStore.getState();
    const blob = new Blob(
      [
        JSON.stringify(
          {
            user: state.user,
            businessProfile: state.businessProfile,
            clients: state.clients,
            catalog: state.catalog,
            documents: state.documents,
            nextNumbers: state.nextNumbers,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );

    downloadBlob(blob, "quoteflow-backup.json");
    toast.success("Workspace backup downloaded.");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Manage your saved business profile and document defaults."
        description="Everything reusable now lives here: business identity, logo and signature assets, bank accounts, tax defaults, notes, terms, and what appears on exported documents."
        actions={
          <Button className="w-full sm:w-auto" icon={<Download size={16} />} variant="secondary" onClick={exportBackup}>
            Export backup
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="space-y-5">
          <div>
            <h2 className="panel-title">Business settings</h2>
            <p className="panel-subtitle">
              Enter the same business email and phone on any device to restore saved work.
            </p>
          </div>

          <form
            className="space-y-5"
            onSubmit={handleSubmit(async (data) => {
              try {
                await updateBusinessProfile(normalizeBusinessProfile(data));
                toast.success("Business settings updated.");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not save settings.");
              }
            })}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="form-label">Business name</label>
                <input className="form-input" {...register("name")} />
              </div>
              <div className="md:col-span-2">
                <label className="form-label">Business address</label>
                <textarea className="form-input min-h-28" {...register("address")} />
              </div>
              <div>
                <label className="form-label">Business phone</label>
                <input className="form-input" {...register("phone")} />
              </div>
              <div>
                <label className="form-label">Business email</label>
                <input className="form-input" type="email" {...register("email")} />
              </div>
              {(identityMessage || isSyncingIdentity) && (
                <div className="md:col-span-2">
                  <div className="flex items-center gap-2 rounded-[18px] border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-800 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-100">
                    {isSyncingIdentity ? <Cloud size={16} /> : <CheckCircle2 size={16} />}
                    {isSyncingIdentity ? "Checking shared workspace..." : identityMessage}
                  </div>
                </div>
              )}
              <div>
                <label className="form-label">Website</label>
                <input className="form-input" {...register("website")} />
              </div>
              <div>
                <label className="form-label">Accent color</label>
                <input className="form-input" type="color" {...register("accentColor")} />
              </div>
              <div>
                <label className="form-label">Stamp label</label>
                <input className="form-input" {...register("stampLabel")} />
              </div>
              <div className="space-y-4 md:col-span-2">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <label className="form-label">Bank accounts</label>
                    <p className="text-sm text-slate-500 dark:text-slate-300">
                      Add each bank or mobile-money account separately so the preview and PDF can
                      show a clear divider between them.
                    </p>
                  </div>
                  <Button
                    className="w-full sm:w-auto"
                    icon={<Plus size={16} />}
                    onClick={() => appendBankAccount(createEmptyBankAccount(bankAccountFields.length))}
                    type="button"
                    variant="secondary"
                  >
                    Add bank account
                  </Button>
                </div>

                {bankAccountFields.length > 0 ? (
                  <div className="grid gap-4">
                    {bankAccountFields.map((field, index) => (
                      <div
                        key={field.id}
                        className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                            Account {index + 1}
                          </p>
                          <Button
                            className="!min-h-11 !rounded-2xl !px-3.5 !py-2.5 md:!min-h-10"
                            onClick={() => removeBankAccount(index)}
                            type="button"
                            variant="danger"
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                        <div className="mt-4 grid gap-4">
                          <div>
                            <label className="form-label">Label</label>
                            <input
                              className="form-input"
                              placeholder="Example: Main bank account or Mobile money"
                              {...register(`bankAccounts.${index}.label`)}
                            />
                          </div>
                          <div>
                            <label className="form-label">Account details</label>
                            <textarea
                              className="form-input min-h-28"
                              placeholder={"Account number\nBank name\nAccount name\nBranch or extra note"}
                              {...register(`bankAccounts.${index}.details`)}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/80 p-4 text-sm leading-6 text-slate-500 dark:border-white/15 dark:bg-white/5 dark:text-slate-300">
                    No bank account added yet. Add one only if you want banking details to appear
                    on the document output.
                  </div>
                )}
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5 md:col-span-2">
                <p className="form-label">Default tax and discount behavior</p>
                <p className="mb-4 text-sm text-slate-500 dark:text-slate-300">
                  These control what appears on new documents without cluttering the creation form.
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex items-center gap-3 text-[15px] font-semibold leading-6 text-slate-700 dark:text-slate-200 md:text-sm">
                    <input className="h-5 w-5 shrink-0 rounded border-slate-300" type="checkbox" {...register("showDiscount")} />
                    Show discount fields
                  </label>
                  <label className="flex items-center gap-3 text-[15px] font-semibold leading-6 text-slate-700 dark:text-slate-200 md:text-sm">
                    <input className="h-5 w-5 shrink-0 rounded border-slate-300" type="checkbox" {...register("showTax")} />
                    Show tax fields
                  </label>
                  {values.showDiscount ? (
                    <div>
                      <label className="form-label">Default discount %</label>
                      <input
                        className="form-input"
                        step="0.01"
                        type="number"
                        {...register("defaultDiscountRate", { valueAsNumber: true })}
                      />
                    </div>
                  ) : null}
                  {values.showTax ? (
                    <div>
                      <label className="form-label">Default tax %</label>
                      <input
                        className="form-input"
                        step="0.01"
                        type="number"
                        {...register("defaultTaxRate", { valueAsNumber: true })}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5 md:col-span-2">
                <p className="form-label">Document display rules</p>
                <p className="mb-4 text-sm text-slate-500 dark:text-slate-300">
                  Control which saved business sections appear in the final output.
                </p>
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="flex items-center gap-3 text-[15px] font-semibold leading-6 text-slate-700 dark:text-slate-200 md:text-sm">
                    <input className="h-5 w-5 shrink-0 rounded border-slate-300" type="checkbox" {...register("showClientDetails")} />
                    Show client details
                  </label>
                  <label className="flex items-center gap-3 text-[15px] font-semibold leading-6 text-slate-700 dark:text-slate-200 md:text-sm">
                    <input className="h-5 w-5 shrink-0 rounded border-slate-300" type="checkbox" {...register("showNotes")} />
                    Show notes
                  </label>
                  <label className="flex items-center gap-3 text-[15px] font-semibold leading-6 text-slate-700 dark:text-slate-200 md:text-sm">
                    <input className="h-5 w-5 shrink-0 rounded border-slate-300" type="checkbox" {...register("showTerms")} />
                    Show terms
                  </label>
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="form-label">Default notes</label>
                <textarea className="form-input min-h-24" {...register("defaultNotes")} />
              </div>
              <div className="md:col-span-2">
                <label className="form-label">Default terms</label>
                <textarea className="form-input min-h-24" {...register("defaultTerms")} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 md:col-span-2">
                <label className="action-link cursor-pointer justify-center">
                  <ImagePlus size={16} />
                  Logo
                  <input
                    className="hidden"
                    type="file"
                    accept="image/*"
                    onChange={(event) => void handleImageUpload(event, "logoDataUrl")}
                  />
                </label>
                <label className="action-link cursor-pointer justify-center">
                  <ImagePlus size={16} />
                  Signature
                  <input
                    className="hidden"
                    type="file"
                    accept="image/*"
                    onChange={(event) => void handleImageUpload(event, "signatureDataUrl")}
                  />
                </label>
              </div>
            </div>

            <Button className="w-full sm:w-auto" icon={<Save size={16} />} type="submit">
              Save settings
            </Button>
          </form>
        </Card>

        <div className="space-y-6">
          <Card className="space-y-4">
            <div>
              <h2 className="panel-title">Workspace</h2>
              <p className="panel-subtitle">These are the details currently linked to this workspace.</p>
            </div>
            <div className="rounded-[24px] bg-slate-50 p-4 dark:bg-white/5">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Name
              </p>
              <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">
                {user?.name || "Local workspace"}
              </p>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                {businessIdentity?.email || user?.email?.trim() || "No shared identity connected"}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {businessIdentity?.phone || user?.phone?.trim() || "Saved only in this browser"}
              </p>
            </div>
            {businessIdentity ? (
              <Button icon={<LogOut size={16} />} onClick={() => void handleSwitchBusiness()} variant="secondary">
                Switch business
              </Button>
            ) : null}
          </Card>

          <Card className="space-y-4">
            <div>
              <h2 className="panel-title">Saved workspace</h2>
              <p className="panel-subtitle">
                {businessIdentity
                  ? "Everything below is saved to the shared business workspace."
                  : "Everything below is saved inside this browser on this device."}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-[24px] bg-slate-50 p-4 dark:bg-white/5">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  Documents
                </p>
                <p className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">
                  {documents.length}
                </p>
              </div>
              <div className="rounded-[24px] bg-slate-50 p-4 dark:bg-white/5">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  Clients
                </p>
                <p className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">
                  {clients.length}
                </p>
              </div>
              <div className="rounded-[24px] bg-slate-50 p-4 dark:bg-white/5">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  Saved items
                </p>
                <p className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">
                  {catalog.length}
                </p>
              </div>
              <div className="rounded-[24px] bg-slate-50 p-4 dark:bg-white/5">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  Next quotation
                </p>
                <p className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">
                  {nextNumbers.quotation}
                </p>
              </div>
              <div className="rounded-[24px] bg-slate-50 p-4 dark:bg-white/5">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  Next invoice
                </p>
                <p className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">
                  {nextNumbers.invoice}
                </p>
              </div>
            </div>
          </Card>

          <Card className="space-y-4">
            <div>
              <h2 className="panel-title">Preview snapshot</h2>
              <p className="panel-subtitle">This is what new documents will inherit automatically.</p>
            </div>
            <div className="rounded-[28px] border border-brand-100 bg-brand-50 p-5 dark:border-brand-500/20 dark:bg-brand-500/10">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[22px] bg-white text-lg font-extrabold text-brand-700 dark:bg-slate-950/60 dark:text-brand-100">
                  {values.logoDataUrl ? (
                    <img alt="Logo preview" className="h-full w-full object-cover" src={values.logoDataUrl} />
                  ) : (
                    "QF"
                  )}
                </div>
                <div>
                  <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white">
                    {values.name || "Business name"}
                  </h3>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {values.address}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {[values.phone, values.email].filter(Boolean).join(" | ") || "No contact details"}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
