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
  // Passkey-wallet state at sign-in (not persisted across reloads).
  walletStatus?: RiftWalletStatus;
  // Set when the user completed passkey setup during this sign-in.
  passkeySetup?: RiftPasskeySetup;
}

/** Same object as GET /v1/wallet/status. */
export interface RiftWalletStatus {
  mode: "none" | "legacy" | "passkey";
  walletAddress: string | null;
  previousAddress?: string | null;
  passkeyCount: number;
  chains: Array<{
    chainId: number;
    deployed: boolean;
    ownerMode: "legacy_eoa" | "passkey" | "undeployed";
  }>;
  needsPasskeySetup: boolean;
}

export interface RiftPasskeySetup {
  status: "active" | "migrated" | "migrating" | "new_wallet" | "pending_signature";
  walletAddress?: string;
  // Set for "new_wallet": the old, unrecoverable address.
  previousAddress?: string;
}

export type RiftApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "failed";

/** Terminal outcome reported by the widget's approve mode. */
export interface RiftApprovalResult {
  approvalId: string;
  status: RiftApprovalStatus;
  result?: { transactionHash?: string; userOpHash?: string };
}

export interface RiftConfig {
  // The project's API key from the Rift dashboard. Required.
  apiKey: string;
  // Which Rift environment to talk to. Picks the default widget URL
  // (which in turn determines the backend the widget calls).
  //
  //   "production" (default) → https://widget.riftfi.xyz
  //                             → backend https://service.riftfi.xyz
  //
  //   "sandbox"               → https://widget.sandbox.riftfi.com
  //                             → backend https://sandbox.riftfi.com
  //
  // Both use passkey-owned wallets: the widget sets up a passkey after
  // login when the wallet needs one.
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
      walletStatus?: RiftWalletStatus;
      passkeySetup?: RiftPasskeySetup;
    }
  | { type: "rift:signin-error"; message: string }
  | ({ type: "rift:approval-result" } & RiftApprovalResult)
  | { type: "rift:approval-error"; approvalId: string; message: string }
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
