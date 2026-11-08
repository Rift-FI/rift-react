import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRiftContext } from "./RiftProvider";
import { detectHostTheme } from "./theme";
import type { RiftApprovalResult, RiftEvent } from "./types";

export interface RiftApproveProps {
  /** The `approvalId` from a `202 APPROVAL_REQUIRED` response. */
  approvalId: string;
  /**
   * Fires once with the terminal outcome: approved (with the
   * transaction hash), rejected, expired or failed. The widget keeps
   * showing the outcome until the user closes it (`onClose`).
   */
  onResult?: (result: RiftApprovalResult) => void;
  /**
   * Non-terminal problems (passkey prompt cancelled, network error,
   * signature rejected). The user can retry inside the widget.
   */
  onError?: (message: string) => void;
  /** The user closed the widget (Close button or backdrop click). */
  onClose?: () => void;
  /**
   * Render the iframe in place instead of as a modal overlay. Handy for
   * a dedicated "/approve/:id" page. Default `false`.
   */
  inline?: boolean;
  maxHeight?: number | string;
  maxWidth?: number | string;
  radius?: number | string;
  backdrop?: { color?: string; blur?: number };
  backdropStyle?: CSSProperties;
  iframeStyle?: CSSProperties;
}

const DEFAULT_BACKDROP_COLOR = "rgba(15,15,20,0.55)";
const DEFAULT_BACKDROP_BLUR = 6;
const DEFAULT_MAX_WIDTH = 480;
const DEFAULT_RADIUS = 18;

/**
 * Lets the user approve (with their passkey) or reject an approval
 * request. Rift wallets are owned only by the user's passkeys, so any
 * fund move your server or agent starts without a passkey proof comes
 * back as `202 { status: "APPROVAL_REQUIRED", approvalId }`. Mount this
 * with that id; unmount it when you're done.
 *
 * Renders the hosted widget in approve mode. The widget reuses the
 * user's Rift session (or asks them to sign in), shows what is being
 * approved, and signs it on the user's device.
 */
export function RiftApprove({
  approvalId,
  onResult,
  onError,
  onClose,
  inline = false,
  maxHeight,
  maxWidth = DEFAULT_MAX_WIDTH,
  radius = DEFAULT_RADIUS,
  backdrop,
  backdropStyle,
  iframeStyle,
}: RiftApproveProps) {
  const { apiKey, widgetUrl, _registerFrame } = useRiftContext();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [height, setHeight] = useState(540);

  const widgetOrigin = useMemo(() => {
    try {
      return new URL(widgetUrl).origin;
    } catch {
      return widgetUrl;
    }
  }, [widgetUrl]);

  const src = useMemo(() => {
    const params = new URLSearchParams({
      key: apiKey,
      mode: "approve",
      approvalId,
      origin: typeof window !== "undefined" ? window.location.origin : "",
    });
    const theme = detectHostTheme();
    if (theme) params.set("theme", theme);
    return `${widgetUrl.replace(/\/$/, "")}/?${params.toString()}`;
  }, [apiKey, approvalId, widgetUrl]);

  // Latest callbacks without re-subscribing the listener.
  const handlers = useRef({ onResult, onError, onClose });
  handlers.current = { onResult, onError, onClose };

  // Keep the provider's sign-in listener away from this frame's events.
  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    return _registerFrame(win);
  }, [_registerFrame, src]);

  useEffect(() => {
    setIsReady(false);
    // Report each approval's outcome once, even if the widget repeats it.
    let reported = false;
    const listener = (e: MessageEvent) => {
      if (e.origin !== widgetOrigin) return;
      // Only OUR iframe: RiftAuth / the refresh iframe share the origin.
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
      const data = e.data as RiftEvent | undefined;
      if (!data || typeof data !== "object" || typeof data.type !== "string") return;

      switch (data.type) {
        case "rift:ready":
          setIsReady(true);
          break;
        case "rift:resize":
          setHeight(Math.max(360, Math.min(820, data.height + 8)));
          break;
        case "rift:approval-result":
          if (data.approvalId !== approvalId || reported) return;
          reported = true;
          handlers.current.onResult?.({
            approvalId: data.approvalId,
            status: data.status,
            ...(data.result ? { result: data.result } : {}),
          });
          break;
        case "rift:approval-error":
          if (data.approvalId !== approvalId) return;
          handlers.current.onError?.(data.message);
          break;
        case "rift:close":
          handlers.current.onClose?.();
          break;
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [widgetOrigin, approvalId]);

  let iframeHeight: number | string = height;
  let iframeMaxHeight: number | string | undefined;
  if (typeof maxHeight === "number") iframeHeight = Math.min(height, maxHeight);
  else if (typeof maxHeight === "string") iframeMaxHeight = maxHeight;

  const iframe = (
    <iframe
      ref={iframeRef}
      src={src}
      title="Rift approval"
      // The widget signs with navigator.credentials.get and may need to
      // set up a passkey first (credentials.create) if the user has none.
      allow="publickey-credentials-create; publickey-credentials-get; identity-credentials-get"
      style={{
        border: 0,
        background: "transparent",
        colorScheme: "light",
        width: "100%",
        maxWidth,
        height: iframeHeight,
        maxHeight: iframeMaxHeight,
        borderRadius: radius,
        boxShadow: inline ? undefined : "0 24px 60px -12px rgba(0,0,0,0.35)",
        transition: "height 200ms ease",
        opacity: isReady ? 1 : 0,
        ...iframeStyle,
      }}
    />
  );

  if (inline) return iframe;

  const backdropColor = backdrop?.color ?? DEFAULT_BACKDROP_COLOR;
  const backdropBlur = backdrop?.blur ?? DEFAULT_BACKDROP_BLUR;
  const blurCss = backdropBlur > 0 ? `blur(${backdropBlur}px)` : undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Approve request"
      onClick={(e) => {
        if (e.target === e.currentTarget) handlers.current.onClose?.();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483646,
        background: backdropColor,
        backdropFilter: blurCss,
        WebkitBackdropFilter: blurCss,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        ...backdropStyle,
      }}
    >
      {iframe}
    </div>
  );
}
