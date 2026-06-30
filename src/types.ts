// Shared types between provider, components, and host-side consumers.

/**
 * The durable identity of an authenticated user. Note: in v2 session mode
 * `accessToken` is short-lived (~1h). Consumers should call
 * `getAccessToken()` from `useRift()` rather than reading `user.accessToken`
 * directly when making API calls — that getter transparently refreshes
 * via a hidden widget iframe before expiry.
 */
export interface RiftUser {
  user: string;
  address: string;
  btcAddress?: string;
  // Short-lived access JWT. May be `null` after a refresh failure; in
  // that case the next API call should call `signOut()` and re-auth.
  accessToken: string;
  // ISO timestamp when the current access token expires. Absent when
  // running against a backend that hasn't been upgraded to session mode.
  expiresAt?: string;
}

export interface RiftConfig {
  // The project's API key from the Rift dashboard. Required.
  apiKey: string;
  // Which Rift environment to talk to. Picks the default widget URL
  // (which in turn determines the backend the widget calls + whether
  // new wallets are minted as v3 / device-bound).
  //
  //   "production" (default) → https://widget.riftfi.xyz
  //                             → backend https://service.riftfi.xyz
  //                             → v1 signups (custodial), legacy behaviour
  //
  //   "sandbox"               → https://widget.sandbox.riftfi.com
  //                             → backend https://sandbox.riftfi.com
  //                             → v3 signups (passkey-bound, non-custodial)
  //
  // Pass `widgetUrl` to override completely (e.g. self-hosting).
  environment?: "production" | "sandbox";
  // Override completely. Wins over `environment` when both are set.
  // Use when self-hosting the widget or pointing at a local dev build.
  widgetUrl?: string;
}

export type RiftEvent =
  | { type: "rift:ready" }
  | { type: "rift:close" }
  | { type: "rift:resize"; height: number }
  | {
      type: "rift:signin-success";
      user: string;
      address: string;
      btcAddress?: string;
      accessToken: string;
      expiresAt?: string;
      expiresIn?: number;
    }
  | { type: "rift:signin-error"; message: string }
  | {
      type: "rift:refresh-result";
      requestId: string;
      accessToken: string;
      expiresAt: string;
      expiresIn: number;
    }
  | { type: "rift:refresh-error"; requestId: string; message: string }
  | { type: "rift:logout-result"; requestId: string };

export type RiftMode = "signin" | "signup";
