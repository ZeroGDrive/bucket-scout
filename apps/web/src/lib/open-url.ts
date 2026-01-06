import { openUrl as tauriOpenUrl } from "@tauri-apps/plugin-opener";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

/**
 * Opens a URL in the default browser.
 * Works in both Tauri desktop app and regular web browser.
 */
export async function openUrl(url: string): Promise<void> {
  // Check if we're running in Tauri
  if (window.__TAURI_INTERNALS__) {
    await tauriOpenUrl(url);
  } else {
    // Fallback for web browser
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
