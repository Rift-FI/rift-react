import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RiftConfig, RiftEvent, RiftMode, RiftUser } from "./types";
import { silentLogout, silentRefresh } from "./silentRefresh";

const DEFAULT_WIDGET_URL = "https://widget.riftfi.xyz";

// v2 session-mode policy: the access token lives in memory only. We
// persist a small "identity hint" (user id, address, btcAddress) so the
// UI can render an authenticated state on hard reload, but the actual
// access JWT is re-issued via the refresh cookie. Refresh tokens live
// in an httpOnly cookie scoped to the widget origin — totally invisible
// to this code, which is the whole point.
const IDENTITY_STORAGE_KEY = "rift:identity";

interface PersistedIdentity {
  user: string;
  address: string;
  btcAddress?: string;
}

// Refresh proactively this many seconds before the access token expires.
// Keeps API calls from racing the actual expiry.
const REFRESH_LEEWAY_SECONDS = 60;

interface RiftContextValue {
  apiKey: string;
  widgetUrl: string;
  user: RiftUser | null;
  isOpen: boolean;
  isReady: boolean;
  error: string | null;
  open: (opts?: { mode?: RiftMode }) => void;
  close: () => void;
  signOut: () => Promise<void>;
  /**
   * Returns a valid access token, refreshing silently if the current
   * one is missing or about to expire. Rejects if the user is signed
   * out or the refresh fails (in which case state is cleared and the
   * caller should prompt re-auth).
   */
  getAccessToken: () => Promise<string>;
  _iframeSrc: string;
  _iframeHeight: number;
  _onIframeLoad: () => void;
}

const RiftContext = createContext<RiftContextValue | null>(null);

export function useRiftContext(): RiftContextValue {
  const ctx = useContext(RiftContext);
  if (!ctx) {
    throw new Error(
      "[@rift/react] useRift() / <RiftAuth> must be used inside <RiftProvider>"
    );
  }
  return ctx;
}

interface RiftProviderProps extends RiftConfig {
  children: ReactNode;
  // Auto-open the modal on mount. Most apps will leave this false and call
  // open() in response to a user clicking "Sign in".
  autoOpen?: boolean;
  // Restore the persisted identity (just the user id / address — never
  // the access token) on mount, then silently refresh to mint a token.
  // Default: true.
  persist?: boolean;
}

function loadIdentity(): PersistedIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(IDENTITY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedIdentity) : null;
  } catch {
    return null;
  }
}

function saveIdentity(id: PersistedIdentity | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(id));
    else localStorage.removeItem(IDENTITY_STORAGE_KEY);
  } catch {
    /* private mode / quota — non-fatal */
  }
}

export function RiftProvider({
  apiKey,
  widgetUrl,
  children,
  autoOpen = false,
  persist = true,
}: RiftProviderProps) {
  const resolvedWidgetUrl = widgetUrl || DEFAULT_WIDGET_URL;
  const widgetOrigin = useMemo(() => {
    try {
      return new URL(resolvedWidgetUrl).origin;
    } catch {
      return resolvedWidgetUrl;
    }
  }, [resolvedWidgetUrl]);

  const [user, setUser] = useState<RiftUser | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<RiftMode>("signin");
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iframeHeight, setIframeHeight] = useState(540);
  const [openToken, setOpenToken] = useState(0);

  // Hot ref to the current user — getAccessToken() reads from this so
  // it never closes over a stale React state snapshot.
  const userRef = useRef<RiftUser | null>(null);
  userRef.current = user;

  // Dedupe in-flight refreshes: if multiple API calls hit
  // getAccessToken() simultaneously and the token is stale, we only
  // want one network call.
  const refreshInFlight = useRef<Promise<string> | null>(null);

  const setAndPersist = useCallback(
    (next: RiftUser | null) => {
      setUser(next);
      if (persist) {
        saveIdentity(
          next
            ? {
                user: next.user,
                address: next.address,
                btcAddress: next.btcAddress,
              }
            : null
        );
      }
    },
    [persist]
  );

  // On mount, if we have a persisted identity, try a silent refresh to
  // rehydrate the access token. If it fails, drop the identity — the
  // user will be prompted to sign in again on first action.
  useEffect(() => {
    if (!persist) return;
    const identity = loadIdentity();
    if (!identity) return;
    let alive = true;
    (async () => {
      try {
        const result = await silentRefresh({
          apiKey,
          widgetUrl: resolvedWidgetUrl,
        });
        if (!alive) return;
        setAndPersist({
          user: identity.user,
          address: identity.address,
          btcAddress: identity.btcAddress,
          accessToken: result.accessToken,
          expiresAt: result.expiresAt,
        });
      } catch {
        if (!alive) return;
        // Refresh failed — likely cookie expired or revoked. Clear the
        // identity hint so the UI shows the signed-out state.
        setAndPersist(null);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = useCallback((opts?: { mode?: RiftMode }) => {
    setMode(opts?.mode || "signin");
    setError(null);
    setIsReady(false);
    setOpenToken((t) => t + 1);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setIsReady(false);
  }, []);

  const signOut = useCallback(async () => {
    await silentLogout({ apiKey, widgetUrl: resolvedWidgetUrl });
    setAndPersist(null);
  }, [apiKey, resolvedWidgetUrl, setAndPersist]);

  const getAccessToken = useCallback(async (): Promise<string> => {
    const current = userRef.current;
    if (!current) throw new Error("Not signed in");

    const expiresAt = current.expiresAt
      ? new Date(current.expiresAt).getTime()
      : null;
    const now = Date.now();
    const needsRefresh =
      !expiresAt || expiresAt - now < REFRESH_LEEWAY_SECONDS * 1000;

    if (!needsRefresh && current.accessToken) {
      return current.accessToken;
    }

    if (refreshInFlight.current) {
      return refreshInFlight.current;
    }

    refreshInFlight.current = (async () => {
      try {
        const result = await silentRefresh({
          apiKey,
          widgetUrl: resolvedWidgetUrl,
        });
        const latest = userRef.current;
        if (!latest) throw new Error("Signed out during refresh");
        const next: RiftUser = {
          ...latest,
          accessToken: result.accessToken,
          expiresAt: result.expiresAt,
        };
        setAndPersist(next);
        return result.accessToken;
      } catch (err: any) {
        // Refresh failed — wipe state so the host UI can prompt re-auth.
        setAndPersist(null);
        throw err instanceof Error ? err : new Error(String(err));
      } finally {
        refreshInFlight.current = null;
      }
    })();
    return refreshInFlight.current;
  }, [apiKey, resolvedWidgetUrl, setAndPersist]);

  // Listen for messages from the VISIBLE login iframe (not the silent
  // refresh one — that one's events are handled inside silentRefresh.ts).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: MessageEvent) => {
      if (e.origin !== widgetOrigin) return;
      const data = e.data as RiftEvent | undefined;
      if (!data || typeof data !== "object" || typeof data.type !== "string") return;
      if (!data.type.startsWith("rift:")) return;

      switch (data.type) {
        case "rift:ready":
          // Only treat as "modal ready" while it's open — the silent
          // refresh iframe also emits ready, but we don't care here.
          if (isOpen) setIsReady(true);
          break;
        case "rift:close":
          close();
          break;
        case "rift:resize":
          setIframeHeight(Math.max(360, Math.min(820, data.height + 8)));
          break;
        case "rift:signin-success": {
          const next: RiftUser = {
            user: data.user,
            address: data.address,
            btcAddress: data.btcAddress,
            accessToken: data.accessToken,
            expiresAt: data.expiresAt,
          };
          setAndPersist(next);
          setIsOpen(false);
          break;
        }
        case "rift:signin-error":
          setError(data.message);
          break;
        // refresh / logout result events belong to silentRefresh.ts —
        // ignore them here.
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [widgetOrigin, close, setAndPersist, isOpen]);

  // Lock host page scroll while the modal is open.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (isOpen) {
      const prev = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
      return () => {
        document.documentElement.style.overflow = prev;
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (autoOpen && !user) open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const iframeSrc = useMemo(() => {
    const params = new URLSearchParams({
      key: apiKey,
      mode,
      origin: typeof window !== "undefined" ? window.location.origin : "",
      t: String(openToken),
    });

    // Best-effort: match the host page's theme so the modal blends in
    // instead of flashing white over a dark site. Checks data-theme,
    // the `dark` class convention, then system preference.
    if (typeof document !== "undefined") {
      const html = document.documentElement;
      const attr = html.getAttribute("data-theme");
      let theme: string | null = null;
      if (attr === "dark" || attr === "light") theme = attr;
      else if (
        html.classList.contains("dark") ||
        document.body?.classList.contains("dark")
      )
        theme = "dark";
      else if (
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      )
        theme = "dark";
      if (theme) params.set("theme", theme);
    }

    return `${resolvedWidgetUrl.replace(/\/$/, "")}/?${params.toString()}`;
  }, [apiKey, mode, openToken, resolvedWidgetUrl]);

  const onIframeLoad = useCallback(() => {
    /* readiness is signalled via postMessage, not the load event */
  }, []);

  const value = useMemo<RiftContextValue>(
    () => ({
      apiKey,
      widgetUrl: resolvedWidgetUrl,
      user,
      isOpen,
      isReady,
      error,
      open,
      close,
      signOut,
      getAccessToken,
      _iframeSrc: iframeSrc,
      _iframeHeight: iframeHeight,
      _onIframeLoad: onIframeLoad,
    }),
    [
      apiKey,
      resolvedWidgetUrl,
      user,
      isOpen,
      isReady,
      error,
      open,
      close,
      signOut,
      getAccessToken,
      iframeSrc,
      iframeHeight,
      onIframeLoad,
    ]
  );

  return <RiftContext.Provider value={value}>{children}</RiftContext.Provider>;
}
