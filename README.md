# @rift-finance/react

React bindings for the Rift sign-in widget. Drop in `<RiftProvider>`, render `<RiftAuth>`, and read auth state with `useRift()`. Same hosted modal as the vanilla embed, native React DX.

```bash
npm install @rift-finance/react
```

## Quick start

```tsx
// App.tsx
import { RiftProvider, RiftAuth } from "@rift-finance/react";

export default function App() {
  return (
    <RiftProvider apiKey={import.meta.env.VITE_RIFT_API_KEY}>
      <RiftAuth onSuccess={(user) => console.log("signed in:", user)} />
      <YourApp />
    </RiftProvider>
  );
}
```

Anywhere inside the provider:

```tsx
import { useRift } from "@rift-finance/react";

export function Nav() {
  const { user, isAuthenticated, open, signOut } = useRift();

  return isAuthenticated ? (
    <button onClick={signOut}>Sign out ({user!.address.slice(-4)})</button>
  ) : (
    <button onClick={() => open({ mode: "signup" })}>Get started</button>
  );
}
```

That's it. Users get a Rift wallet provisioned on first sign-in (Google, email, or phone), and you get an access token to call Rift's API on their behalf.

## Making authenticated calls

Use `getAccessToken()` rather than reading `user.accessToken` directly — it transparently refreshes via a hidden iframe if the current token is near expiry.

```tsx
const { getAccessToken } = useRift();

async function send() {
  const token = await getAccessToken();
  await fetch("https://developers.riftfi.xyz/transactions/send", {
    method: "POST",
    headers: {
      "X-API-Key": import.meta.env.VITE_RIFT_API_KEY,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: "0xRecipient...",
      value: "10",
      token: "USDC",
      chain: "polygon",
    }),
  });
}
```

## API

### `<RiftProvider>`

| Prop | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | _required_ | Your project's API key (`sk_…`) from the Rift dashboard. |
| `widgetUrl` | `string` | `https://widget.riftfi.xyz` | Override only when self-hosting the widget. |
| `autoOpen` | `boolean` | `false` | Open the modal on mount if the user isn't signed in. |
| `persist` | `boolean` | `true` | Remember the user across page reloads. |

### `<RiftAuth />`

| Prop | Type | Description |
|---|---|---|
| `onSuccess` | `(user) => void` | Fires when sign-in completes. |
| `onError` | `(message) => void` | Fires on auth failure. |
| `onClose` | `() => void` | Fires when the modal closes. |

Mount this once near the root. It renders nothing until `useRift().open()` is called.

### `useRift()`

| Field | Type | Description |
|---|---|---|
| `user` | `RiftUser \| null` | The signed-in user, or null. |
| `isAuthenticated` | `boolean` | Convenience flag. |
| `isOpen` | `boolean` | Whether the modal is currently visible. |
| `open(opts?)` | `(opts?: { mode?: "signin" \| "signup" }) => void` | Open the modal. |
| `close()` | `() => void` | Close the modal. |
| `signOut()` | `() => Promise<void>` | Revokes the server-side session + clears local state. |
| `getAccessToken()` | `() => Promise<string>` | Returns a valid JWT, refreshing if near expiry. |
| `error` | `string \| null` | Last sign-in error from the modal. |

### `RiftUser` shape

```ts
interface RiftUser {
  user: string;          // Rift user id (uuid)
  address: string;       // EVM smart account
  btcAddress?: string;   // Bitcoin wallet
  accessToken: string;   // JWT for API calls
  expiresAt?: string;    // ISO timestamp
}
```

## Configuring Google sign-in

1. Create an OAuth 2.0 Client ID in Google Cloud Console for your domain.
2. Paste it into your project's **Auth** tab in the Rift dashboard.
3. The widget refetches its config on next load — the Google button shows up automatically.

## Self-hosting the widget

The default widget URL is `https://widget.riftfi.xyz`. If you need to self-host (compliance, white-labelling), deploy the [widget](https://github.com/Rift-FI/rift/tree/master/widget) source and pass the URL to the provider:

```tsx
<RiftProvider apiKey="sk_..." widgetUrl="https://widget.yourdomain.com">
```

## Full docs

Integration walkthrough, OpenAPI spec, transaction signing flows: **https://service.riftfi.xyz/docs**

- Live API explorer: https://developers.riftfi.xyz
- OpenAPI spec: https://developers.riftfi.xyz/docs.json
- Source: https://github.com/Rift-FI/rift-react

## License

MIT
