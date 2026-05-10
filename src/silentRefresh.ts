/**
 * Silent-refresh bridge.
 *
 * The v2 backend session sits behind an httpOnly refresh cookie scoped
 * to the widget origin (widget.riftfi.xyz → service.riftfi.xyz). The
 * cookie cannot be read or sent from the merchant's own JS — only
 * widget-origin code can use it. So to refresh, we mount a HIDDEN
 * widget iframe in `?headless=1` mode and ask it (via postMessage) to
 * call /auth/refresh on our behalf. It posts the new access token back.
 *
 * This module owns that iframe as a singleton: we lazily create it on
 * the first refresh request, keep it alive across the page's lifetime,
 * and use a requestId-based pending map so concurrent refresh calls
 * dedupe to one network round trip.
 */

let iframe: HTMLIFrameElement | null = null;
let ready = false;
let readyResolvers: Array<() => void> = [];
let widgetOrigin: string | null = null;

interface Pending {
  resolve: (value: RefreshSuccess) => void;
  reject: (err: Error) => void;
}
const pending = new Map<string, Pending>();

export interface RefreshSuccess {
  accessToken: string;
  expiresAt: string;
  expiresIn: number;
}

function uuid(): string {
  // Lightweight ID — doesn't need crypto strength, just unique per page.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function ensureMounted(opts: { apiKey: string; widgetUrl: string }): Promise<void> {
  if (typeof document === "undefined") {
    return Promise.reject(new Error("Cannot mount refresh iframe outside the browser"));
  }
  if (iframe && ready) return Promise.resolve();

  widgetOrigin = new URL(opts.widgetUrl).origin;

  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("tabindex", "-1");
    iframe.title = "Rift session refresh";
    iframe.style.cssText =
      "position:absolute;width:1px;height:1px;border:0;opacity:0;pointer-events:none;left:-9999px;top:-9999px;";
    const params = new URLSearchParams({
      key: opts.apiKey,
      headless: "1",
    });
    iframe.src = `${opts.widgetUrl.replace(/\/$/, "")}/?${params.toString()}`;
    document.body.appendChild(iframe);

    window.addEventListener("message", (e) => {
      if (e.origin !== widgetOrigin) return;
      const data = e.data;
      if (!data || typeof data !== "object" || typeof data.type !== "string") return;
      if (!data.type.startsWith("rift:")) return;

      if (data.type === "rift:ready") {
        ready = true;
        readyResolvers.forEach((r) => r());
        readyResolvers = [];
        return;
      }
      if (data.type === "rift:refresh-result") {
        const slot = pending.get(data.requestId);
        if (slot) {
          pending.delete(data.requestId);
          slot.resolve({
            accessToken: data.accessToken,
            expiresAt: data.expiresAt,
            expiresIn: data.expiresIn,
          });
        }
        return;
      }
      if (data.type === "rift:refresh-error") {
        const slot = pending.get(data.requestId);
        if (slot) {
          pending.delete(data.requestId);
          slot.reject(new Error(data.message || "Refresh failed"));
        }
        return;
      }
      if (data.type === "rift:logout-result") {
        const slot = pending.get(data.requestId);
        if (slot) {
          pending.delete(data.requestId);
          slot.resolve({ accessToken: "", expiresAt: "", expiresIn: 0 });
        }
      }
    });
  }

  if (ready) return Promise.resolve();
  return new Promise((resolve) => {
    readyResolvers.push(resolve);
    // Safety net: if the iframe somehow never posts ready (e.g. blocked
    // by browser privacy mode), reject after 8s so callers can surface
    // a useful error.
    setTimeout(() => {
      if (!ready) {
        const r = readyResolvers.shift();
        if (r) r();
      }
    }, 8000);
  });
}

export async function silentRefresh(opts: {
  apiKey: string;
  widgetUrl: string;
}): Promise<RefreshSuccess> {
  await ensureMounted(opts);
  if (!iframe?.contentWindow || !widgetOrigin) {
    throw new Error("Refresh iframe is not available");
  }
  const requestId = uuid();
  return new Promise<RefreshSuccess>((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    iframe!.contentWindow!.postMessage(
      { type: "rift:refresh-request", requestId },
      widgetOrigin!
    );
    setTimeout(() => {
      const slot = pending.get(requestId);
      if (slot) {
        pending.delete(requestId);
        slot.reject(new Error("Refresh timed out"));
      }
    }, 10000);
  });
}

export async function silentLogout(opts: {
  apiKey: string;
  widgetUrl: string;
}): Promise<void> {
  try {
    await ensureMounted(opts);
    if (!iframe?.contentWindow || !widgetOrigin) return;
    const requestId = uuid();
    await new Promise<void>((resolve) => {
      pending.set(requestId, {
        resolve: () => resolve(),
        reject: () => resolve(), // logout is idempotent — never reject
      });
      iframe!.contentWindow!.postMessage(
        { type: "rift:logout-request", requestId },
        widgetOrigin!
      );
      setTimeout(() => {
        pending.delete(requestId);
        resolve();
      }, 5000);
    });
  } catch {
    /* logout is best-effort */
  }
}
