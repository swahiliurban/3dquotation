import React from "react";
import ReactDOM from "react-dom/client";
import { toast } from "sonner";
import { registerSW } from "virtual:pwa-register";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import App from "./App";
import "./index.css";

const APP_BUILD_VERSION = "2026-07-29-client-numbering-date-mobile-v1";
const BUILD_VERSION_STORAGE_KEY = "quoteflow-build-version";
const SW_UPDATE_TOAST_ID = "quoteflow-sw-update";
let isApplyingServiceWorkerUpdate = false;
let hasReloadedForServiceWorker = false;

async function cleanupStalePwaState() {
  try {
    const storedVersion = window.localStorage.getItem(BUILD_VERSION_STORAGE_KEY);
    if (storedVersion === APP_BUILD_VERSION) {
      return;
    }

    window.localStorage.setItem(BUILD_VERSION_STORAGE_KEY, APP_BUILD_VERSION);

    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith("quoteflow-") || cacheName.startsWith("workbox-"))
          .map((cacheName) => caches.delete(cacheName)),
      );
    }

    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch (error) {
    console.warn("QuoteFlow could not clear stale PWA state.", error);
  }
}

async function bootstrap() {
  await cleanupStalePwaState();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hasReloadedForServiceWorker) {
        return;
      }

      hasReloadedForServiceWorker = true;
      toast.dismiss(SW_UPDATE_TOAST_ID);
      window.location.reload();
    });
  }

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      if (isApplyingServiceWorkerUpdate) {
        return;
      }

      isApplyingServiceWorkerUpdate = true;
      toast.loading("Refreshing QuoteFlow with the latest mobile-ready build...", {
        id: SW_UPDATE_TOAST_ID,
      });
      void updateSW(true);
    },
    onOfflineReady() {
      toast.success("QuoteFlow is ready for offline use.");
    },
    onRegisterError(error) {
      isApplyingServiceWorkerUpdate = false;
      console.error("QuoteFlow service worker registration failed.", error);
      toast.error("QuoteFlow could not enable offline support on this device.");
    },
  });

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
