import { Suspense, lazy, useEffect, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AppShell } from "./components/layout/AppShell";
import { useQuoteFlowStore } from "./store/useQuoteFlowStore";

const DashboardPage = lazy(async () => {
  const module = await import("./pages/DashboardPage");
  return { default: module.DashboardPage };
});

const DocumentEditorPage = lazy(async () => {
  const module = await import("./pages/DocumentEditorPage");
  return { default: module.DocumentEditorPage };
});

const DocumentViewPage = lazy(async () => {
  const module = await import("./pages/DocumentViewPage");
  return { default: module.DocumentViewPage };
});

const RecordsPage = lazy(async () => {
  const module = await import("./pages/RecordsPage");
  return { default: module.RecordsPage };
});

const SettingsPage = lazy(async () => {
  const module = await import("./pages/SettingsPage");
  return { default: module.SettingsPage };
});

const AuthPage = lazy(async () => {
  const module = await import("./pages/AuthPage");
  return { default: module.AuthPage };
});

function ThemeSync() {
  const theme = useQuoteFlowStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;

    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    themeColorMeta?.setAttribute("content", theme === "dark" ? "#020617" : "#0f7a49");

    const statusBarMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    statusBarMeta?.setAttribute("content", theme === "dark" ? "black-translucent" : "default");
  }, [theme]);

  return null;
}

function ThemedToaster() {
  const theme = useQuoteFlowStore((state) => state.theme);
  return <Toaster position="top-right" richColors theme={theme === "dark" ? "dark" : "light"} />;
}

function RouteFallback() {
  return (
    <div className="glass-card rounded-[28px] p-6">
      <div className="h-4 w-32 animate-pulse rounded-full bg-slate-200 dark:bg-white/10" />
      <div className="mt-4 h-4 w-2/3 animate-pulse rounded-full bg-slate-200 dark:bg-white/10" />
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="h-40 animate-pulse rounded-[24px] bg-slate-200 dark:bg-white/10" />
        <div className="h-40 animate-pulse rounded-[24px] bg-slate-200 dark:bg-white/10" />
      </div>
    </div>
  );
}

function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sand-50 px-4 dark:bg-slate-950">
      <div className="glass-card max-w-md rounded-[32px] p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-600 dark:text-brand-200">
          QuoteFlow
        </p>
        <h1 className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">
          Loading your workspace
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          Loading your workspace, business settings, saved clients, items, and documents.
        </p>
      </div>
    </div>
  );
}

function withSuspense(element: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

export default function App() {
  const initializeApp = useQuoteFlowStore((state) => state.initializeApp);
  const isInitializing = useQuoteFlowStore((state) => state.isInitializing);

  useEffect(() => {
    void initializeApp();
  }, [initializeApp]);

  if (isInitializing) {
    return (
      <>
        <ThemeSync />
        <FullPageLoader />
        <ThemedToaster />
      </>
    );
  }

  return (
    <BrowserRouter>
      <ThemeSync />
      <Routes>
        <Route path="/auth" element={withSuspense(<AuthPage />)} />
        <Route element={<AppShell />}>
          <Route index element={withSuspense(<DashboardPage />)} />
          <Route path="/quotations/new" element={withSuspense(<DocumentEditorPage type="quotation" />)} />
          <Route path="/invoices/new" element={withSuspense(<DocumentEditorPage type="invoice" />)} />
          <Route path="/records" element={withSuspense(<RecordsPage />)} />
          <Route path="/records/:id" element={withSuspense(<DocumentViewPage />)} />
          <Route path="/records/:id/edit" element={withSuspense(<DocumentEditorPage />)} />
          <Route path="/settings" element={withSuspense(<SettingsPage />)} />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Route>
      </Routes>
      <ThemedToaster />
    </BrowserRouter>
  );
}
