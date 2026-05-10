import { useRiftContext } from "./RiftProvider";
import type { RiftMode, RiftUser } from "./types";

interface UseRiftReturn {
  user: RiftUser | null;
  isAuthenticated: boolean;
  isOpen: boolean;
  open: (opts?: { mode?: RiftMode }) => void;
  close: () => void;
  signOut: () => Promise<void>;
  /**
   * Async getter for a valid access token. Use this when calling Rift /
   * your backend — it returns the current token if fresh, or silently
   * refreshes via a hidden iframe if near expiry. Rejects when the user
   * isn't signed in or the refresh fails (in which case auth state is
   * cleared and the host should prompt re-auth).
   */
  getAccessToken: () => Promise<string>;
  error: string | null;
}

/**
 * Read auth state and drive the widget from anywhere inside <RiftProvider>.
 *
 *   const { user, isAuthenticated, open, signOut, getAccessToken } = useRift();
 *   return isAuthenticated
 *     ? <button onClick={signOut}>Sign out</button>
 *     : <button onClick={() => open({ mode: 'signup' })}>Get started</button>;
 *
 *   // When calling your backend with Rift's session JWT:
 *   const token = await getAccessToken();
 *   fetch('/api/my-thing', { headers: { Authorization: `Bearer ${token}` } });
 */
export function useRift(): UseRiftReturn {
  const { user, isOpen, open, close, signOut, getAccessToken, error } =
    useRiftContext();
  return {
    user,
    isAuthenticated: !!user,
    isOpen,
    open,
    close,
    signOut,
    getAccessToken,
    error,
  };
}
