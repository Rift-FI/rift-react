import { useEffect, type CSSProperties } from "react";
import { useRiftContext } from "./RiftProvider";
import type { RiftUser } from "./types";

interface BackdropStyle {
  /** Backdrop fill colour. Default `rgba(15,15,20,0.55)` (dark scrim). */
  color?: string;
  /** CSS `backdrop-filter: blur(<px>)`. Default 6, set 0 to disable. */
  blur?: number;
}

interface RiftAuthProps {
  // Optional event hooks so callers don't have to compose useEffect by hand.
  onSuccess?: (user: RiftUser) => void;
  onError?: (message: string) => void;
  onClose?: () => void;

  /**
   * Cap the modal height. Pass a number for px (e.g. `600`) or a CSS
   * string for viewport units (`"70vh"`). The iframe scrolls
   * internally if its content exceeds this. Defaults to no cap; the
   * widget reports its natural height via postMessage.
   */
  maxHeight?: number | string;

  /**
   * Cap the modal width. Defaults to 480 (px). Pass any CSS length.
   */
  maxWidth?: number | string;

  /**
   * Corner radius on the modal. Defaults to 18 (px).
   */
  radius?: number | string;

  /**
   * Backdrop styling. See `BackdropStyle`. Each field falls back to
   * the default if omitted.
   */
  backdrop?: BackdropStyle;

  /**
   * Extra style applied to the backdrop wrapper. Use for things outside
   * the typed `backdrop` knob (custom transitions, z-index, etc.).
   */
  backdropStyle?: CSSProperties;

  /**
   * Extra style applied to the iframe. Useful for borders, custom
   * shadows, or filters that the typed props don't cover.
   */
  iframeStyle?: CSSProperties;
}

const DEFAULT_BACKDROP_COLOR = "rgba(15,15,20,0.55)";
const DEFAULT_BACKDROP_BLUR = 6;
const DEFAULT_MAX_WIDTH = 480;
const DEFAULT_RADIUS = 18;

/**
 * Renders the modal backdrop + iframe whenever the provider's `isOpen` is
 * true. Place this once near the root of your app (typically just inside
 * <RiftProvider>); call `useRift().open()` to show it.
 *
 * All visual knobs are overridable from the host: see `maxHeight`,
 * `maxWidth`, `radius`, `backdrop`, plus escape hatches `backdropStyle`
 * and `iframeStyle` for anything else.
 */
export function RiftAuth({
  onSuccess,
  onError,
  onClose,
  maxHeight,
  maxWidth = DEFAULT_MAX_WIDTH,
  radius = DEFAULT_RADIUS,
  backdrop,
  backdropStyle,
  iframeStyle,
}: RiftAuthProps) {
  const {
    isOpen,
    isReady,
    error,
    close,
    user,
    _iframeSrc,
    _iframeHeight,
    _onIframeLoad,
  } = useRiftContext();

  useEffect(() => {
    if (user && onSuccess) onSuccess(user);
  }, [user, onSuccess]);

  useEffect(() => {
    if (error && onError) onError(error);
  }, [error, onError]);

  useEffect(() => {
    if (!isOpen && onClose) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const backdropColor = backdrop?.color ?? DEFAULT_BACKDROP_COLOR;
  const backdropBlur = backdrop?.blur ?? DEFAULT_BACKDROP_BLUR;
  const blurCss = backdropBlur > 0 ? `blur(${backdropBlur}px)` : undefined;

  // Resolve the iframe's final height. The widget posts its desired
  // height via `rift:resize`; we honor it but clamp to `maxHeight` if
  // the host asked us to. For numeric maxHeight, we min() against the
  // reported height (so a fixed modal doesn't grow past it). For string
  // values like "70vh", we hand the limit to CSS via `maxHeight` and
  // let the browser do the math, but still cap our height attribute by
  // the reported natural height so we don't reserve unused space.
  let iframeHeight: number | string = _iframeHeight;
  let iframeMaxHeight: number | string | undefined;
  if (typeof maxHeight === "number") {
    iframeHeight = Math.min(_iframeHeight, maxHeight);
  } else if (typeof maxHeight === "string") {
    iframeMaxHeight = maxHeight;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sign in"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
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
        animation: "rift-fade 180ms ease-out",
        ...backdropStyle,
      }}
    >
      <style>{`@keyframes rift-fade { from { opacity: 0 } to { opacity: 1 } }`}</style>
      {!isReady && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            color: "rgba(255,255,255,0.75)",
            fontSize: 13,
            fontFamily:
              "Inter, ui-sans-serif, system-ui, sans-serif",
          }}
        >
          Loading sign-in…
        </div>
      )}
      <iframe
        src={_iframeSrc}
        onLoad={_onIframeLoad}
        title="Rift sign-in"
        allow="publickey-credentials-get; identity-credentials-get"
        style={{
          border: 0,
          background: "transparent",
          colorScheme: "light",
          width: "100%",
          maxWidth,
          height: iframeHeight,
          maxHeight: iframeMaxHeight,
          borderRadius: radius,
          boxShadow: "0 24px 60px -12px rgba(0,0,0,0.35)",
          transition: "height 200ms ease",
          opacity: isReady ? 1 : 0,
          ...iframeStyle,
        }}
      />
    </div>
  );
}
