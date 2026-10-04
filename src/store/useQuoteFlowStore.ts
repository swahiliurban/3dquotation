import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  convertLocalQuotation,
  createLocalDocument,
  deleteLocalDocument,
  duplicateLocalDocument,
  getLocalBootstrap,
  loginLocalUser,
  markLocalDocumentShared,
  signupLocalUser,
  updateLocalBusinessSettings,
  updateLocalDocument,
} from "../lib/api/localStore";
import {
  claimRemoteBusinessIdentity,
  clearSavedBusinessIdentity,
  convertRemoteQuotation,
  createRemoteDocument,
  deleteRemoteDocument,
  duplicateRemoteDocument,
  getRemoteBootstrap,
  getSavedBusinessIdentity,
  hasMigratedBusinessIdentity,
  hasUsableBusinessIdentity,
  markBusinessIdentityMigrated,
  markRemoteDocumentShared,
  sameBusinessIdentity,
  updateRemoteBusinessSettings,
  updateRemoteDocument,
} from "../lib/api/sharedStore";
import { DEFAULT_BUSINESS_PROFILE } from "../lib/documents";
import { STORAGE_KEY } from "../lib/constants";
import type {
  BootstrapPayload,
  BusinessProfile,
  QuoteFlowDocument,
  QuoteFlowState,
  SaveDocumentOptions,
} from "../types";

function replaceDocument(
  documents: QuoteFlowDocument[],
  nextDocument: QuoteFlowDocument,
) {
  const existing = documents.some((document) => document.id === nextDocument.id);
  if (!existing) {
    return [nextDocument, ...documents];
  }

  return documents.map((document) =>
    document.id === nextDocument.id ? nextDocument : document,
  );
}

function applyBootstrapState(set: (partial: Partial<QuoteFlowState>) => void, payload: BootstrapPayload) {
  set({
    user: payload.user,
    businessProfile: payload.businessProfile,
    clients: payload.clients,
    catalog: payload.catalog,
    documents: payload.documents,
    nextNumbers: payload.nextNumbers,
  });
}

function resetWorkspaceState(set: (partial: Partial<QuoteFlowState>) => void) {
  set({
    user: null,
    businessProfile: DEFAULT_BUSINESS_PROFILE,
    clients: [],
    catalog: [],
    documents: [],
    nextNumbers: {
      quotation: 1,
      invoice: 1,
    },
    businessIdentity: null,
  });
}

function createSeedPayload(state: QuoteFlowState, seedProfile?: BusinessProfile): BootstrapPayload {
  return {
    user:
      state.user || {
        id: "local-workspace",
        name: "Local workspace",
        email: seedProfile?.email || state.businessProfile.email,
        phone: seedProfile?.phone || state.businessProfile.phone,
      },
    businessProfile: seedProfile || state.businessProfile,
    clients: state.clients,
    catalog: state.catalog,
    documents: state.documents,
    nextNumbers: state.nextNumbers,
  };
}

async function refreshRemoteWorkspace(
  set: (partial: Partial<QuoteFlowState>) => void,
  identity: NonNullable<QuoteFlowState["businessIdentity"]>,
) {
  const payload = await getRemoteBootstrap(identity);
  applyBootstrapState(set, payload);
}

export const useQuoteFlowStore = create<QuoteFlowState>()(
  persist(
    (set, get) => ({
      theme: "light",
      user: null,
      isInitializing: true,
      isSyncingIdentity: false,
      businessIdentity: null,
      businessProfile: DEFAULT_BUSINESS_PROFILE,
      clients: [],
      catalog: [],
      documents: [],
      nextNumbers: {
        quotation: 1,
        invoice: 1,
      },
      initializeApp: async () => {
        try {
          const localPayload = getLocalBootstrap();
          const savedIdentity = getSavedBusinessIdentity();

          if (savedIdentity) {
            try {
              const payload = hasMigratedBusinessIdentity(savedIdentity)
                ? await getRemoteBootstrap(savedIdentity)
                : await claimRemoteBusinessIdentity({
                    email: savedIdentity.email,
                    phone: savedIdentity.phone,
                    seed: localPayload,
                  });
              applyBootstrapState(set, payload);
              const activeIdentity: NonNullable<QuoteFlowState["businessIdentity"]> =
                "businessIdentity" in payload
                  ? (payload as { businessIdentity: NonNullable<QuoteFlowState["businessIdentity"]> })
                      .businessIdentity
                  : savedIdentity;
              set({ businessIdentity: activeIdentity });
              markBusinessIdentityMigrated(activeIdentity);
              return;
            } catch (error) {
              console.warn("QuoteFlow shared workspace bootstrap failed.", error);
            }
          }

          applyBootstrapState(set, localPayload);
        } catch (error) {
          console.error("QuoteFlow bootstrap failed.", error);
          resetWorkspaceState(set);
        } finally {
          set({ isInitializing: false });
        }
      },
      setTheme: (theme) => {
        set({ theme });
      },
      connectBusinessIdentity: async ({ email, phone, seedProfile }) => {
        const current = get();
        if (!hasUsableBusinessIdentity(email, phone)) {
          throw new Error("Business email and phone number are required.");
        }

        if (
          current.businessIdentity &&
          sameBusinessIdentity(current.businessIdentity, { email, phone })
        ) {
          return { workspaceExists: true };
        }

        set({ isSyncingIdentity: true });
        try {
          const payload = await claimRemoteBusinessIdentity({
            email,
            phone,
            seed: createSeedPayload(current, seedProfile),
          });
          applyBootstrapState(set, payload);
          set({ businessIdentity: payload.businessIdentity });
          markBusinessIdentityMigrated(payload.businessIdentity);
          return { workspaceExists: payload.workspaceExists };
        } finally {
          set({ isSyncingIdentity: false });
        }
      },
      disconnectBusinessIdentity: async () => {
        clearSavedBusinessIdentity();
        const localPayload = getLocalBootstrap();
        applyBootstrapState(set, localPayload);
        set({ businessIdentity: null });
      },
      signup: async (payload) => {
        signupLocalUser(payload);
        applyBootstrapState(set, getLocalBootstrap());
      },
      login: async (_payload) => {
        loginLocalUser();
        applyBootstrapState(set, getLocalBootstrap());
      },
      updateBusinessProfile: async (profile) => {
        const current = get();
        const needsIdentity =
          hasUsableBusinessIdentity(profile.email, profile.phone) &&
          !sameBusinessIdentity(current.businessIdentity, {
            email: profile.email,
            phone: profile.phone,
          });

        if (needsIdentity) {
          await get().connectBusinessIdentity({
            email: profile.email,
            phone: profile.phone,
            seedProfile: profile,
          });
        }

        const identity = get().businessIdentity;
        if (identity) {
          const response = await updateRemoteBusinessSettings(identity, profile);
          set({ businessProfile: response.businessProfile });
          return;
        }

        const response = updateLocalBusinessSettings(profile);
        set({ businessProfile: response.businessProfile });
      },
      saveDocument: async (document, isNew, options?: SaveDocumentOptions) => {
        const identity = get().businessIdentity;
        if (identity) {
          const response = isNew
            ? await createRemoteDocument(identity, document, options)
            : await updateRemoteDocument(identity, document.id, document, options);

          // A successful save must not become a failure because a second,
          // full-workspace download fails. Apply the server-confirmed record.
          set((state) => ({
            documents: replaceDocument(state.documents, response.document),
            nextNumbers: response.nextNumbers || state.nextNumbers,
          }));
          return response.document;
        }

        const response = isNew
          ? createLocalDocument(document, options)
          : updateLocalDocument(document.id, document, options);

        applyBootstrapState(set, getLocalBootstrap());
        return response.document;
      },
      deleteDocument: async (documentId) => {
        const identity = get().businessIdentity;
        if (identity) {
          await deleteRemoteDocument(identity, documentId);
          await refreshRemoteWorkspace(set, identity);
          return;
        }

        deleteLocalDocument(documentId);
        applyBootstrapState(set, getLocalBootstrap());
      },
      duplicateDocument: async (documentId) => {
        const identity = get().businessIdentity;
        if (identity) {
          const response = await duplicateRemoteDocument(identity, documentId);
          await refreshRemoteWorkspace(set, identity);
          return response.document;
        }

        const response = duplicateLocalDocument(documentId);
        applyBootstrapState(set, getLocalBootstrap());
        return response.document;
      },
      convertQuotationToInvoice: async (quotationId) => {
        const identity = get().businessIdentity;
        if (identity) {
          const response = await convertRemoteQuotation(identity, quotationId);
          await refreshRemoteWorkspace(set, identity);
          return response.document;
        }

        const response = convertLocalQuotation(quotationId);
        applyBootstrapState(set, getLocalBootstrap());
        return response.document;
      },
      markDocumentShared: async (documentId, via) => {
        const identity = get().businessIdentity;
        if (identity) {
          const response = await markRemoteDocumentShared(identity, documentId, via);
          set((state) => ({
            documents: replaceDocument(state.documents, response.document),
          }));
          return;
        }

        const response = markLocalDocumentShared(documentId, via);
        set((state) => ({
          documents: replaceDocument(state.documents, response.document),
        }));
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
      }),
    },
  ),
);
