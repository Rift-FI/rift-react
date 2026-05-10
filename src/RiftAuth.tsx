import { useEffect } from "react";
import { useRiftContext } from "./RiftProvider";
import type { RiftUser } from "./types";

interface RiftAuthProps {
  // Optional event hooks so callers don't have to compose useEffect by hand.
  onSuccess?: (user: RiftUser) => void;
  onError?: (message: string) => void;
  onClose?: () => void;
}

/**
 * Renders the modal backdrop + iframe whenever the provider's `isOpen` is
 * true. Place this once near the root of your app (typically just inside
 * <RiftProvider>); call `useRift().open()` to show it.
 */
export function RiftAuth({ onSuccess, onError, onClose }: RiftAuthProps) {
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
        background: "rgba(15,15,20,0.55)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        animation: "rift-fade 180ms ease-out",
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
          maxWidth: 480,
          height: _iframeHeight,
          borderRadius: 18,
          boxShadow: "0 24px 60px -12px rgba(0,0,0,0.35)",
          transition: "height 200ms ease",
          opacity: isReady ? 1 : 0,
        }}
      />
    </div>
  );
}
