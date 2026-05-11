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

| Prop | Type | Default | Description |
|---|---|---|---|
| `onSuccess` | `(user) => void` | — | Fires when sign-in completes. |
| `onError` | `(message) => void` | — | Fires on auth failure. |
| `onClose` | `() => void` | — | Fires when the modal closes. |
| `maxHeight` | `number \| string` | unset | Cap the modal height. Pass `600` (px) or `"70vh"`. iframe scrolls internally if content exceeds this. |
| `maxWidth` | `number \| string` | `480` | Cap the modal width. Any CSS length. |
| `radius` | `number \| string` | `18` | Modal corner radius. |
| `backdrop` | `{ color?: string; blur?: number }` | `{ color: "rgba(15,15,20,0.55)", blur: 6 }` | Backdrop fill and CSS `backdrop-filter` blur in px. Set `blur: 0` to disable. |
| `backdropStyle` | `CSSProperties` | — | Escape hatch for anything `backdrop` doesn't cover (custom transitions, z-index, etc.). |
| `iframeStyle` | `CSSProperties` | — | Escape hatch for the iframe (borders, custom shadows, filters). |

Mount this once near the root. It renders nothing until `useRift().open()` is called.

```tsx
<RiftAuth
  maxHeight={600}
  radius={22}
  backdrop={{ color: "rgba(255,255,255,0.5)", blur: 10 }}
/>
```

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

## Auth methods

Google, Apple, email OTP, and phone OTP all surface automatically in the widget — zero setup. You don't register anything with Google or Apple; Rift handles all that under the hood. Drop `<RiftProvider>` + `<RiftAuth />` and the modal renders every available method.

## Theming the modal

The modal's chrome — backdrop colour, blur, modal width, height cap, corner radius — is controllable from the host via props on `<RiftAuth>`. The widget's content area is iframed and brand-locked to Rift's visual identity (this is intentional — it's a trust signal so users know they're signing into Rift, not a phishing page that just looks like it). But the **frame around the iframe** is yours to style.

### Why this exists

On large viewports the modal renders quite tall (~750px+ for the full email/phone/Google flow). Hosts with compact layouts or non-dark designs needed a way to:

- Cap the height so the modal doesn't dwarf the page.
- Swap the dark scrim for a light backdrop that matches their brand.
- Soften the blur (or disable it entirely on low-end devices).
- Round the modal more or less to match the rest of their UI.

Before 0.2.0, none of this was reachable — the styles were inline and the iframe ignored host CSS. Now they're typed props.

### The props

```tsx
<RiftAuth
  // Numeric (px) or any CSS length. Iframe scrolls internally
  // if widget content exceeds this. Default: no cap.
  maxHeight={600}        // or "70vh"

  // Default 480 (px). Any CSS length works.
  maxWidth={520}

  // Default 18. Match the rest of your UI's roundness.
  radius={22}

  // Defaults: dark scrim with 6px blur.
  backdrop={{
    color: "rgba(255,255,255,0.5)",
    blur: 10,            // 0 disables backdrop-filter entirely
  }}

  // Escape hatches — spread last over the typed props above:
  backdropStyle={{ animation: "myFadeIn 220ms ease" }}
  iframeStyle={{ boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
/>
```

### How `maxHeight` actually works

The widget posts its desired height to the SDK via `postMessage` (`rift:resize` events) whenever its content reflows — toggling between email and phone, showing an error, etc. Without `maxHeight`, the SDK sets the iframe to that reported height verbatim. With `maxHeight`, the SDK clamps:

- **Numeric `maxHeight`**: iframe `height` is `min(widget.reported, maxHeight)` — never grows past your cap.
- **String `maxHeight`** (e.g. `"70vh"`): iframe `height` stays at the widget's reported value but with `max-height` set in CSS so the browser does the clamp. Same effective behavior.

Either way, if the widget's content exceeds the cap, the iframe's native scrollbar takes over — no clipping, no layout breakage.

### Anything not exposed as a typed prop

Use `backdropStyle` and `iframeStyle`. They're spread **after** the typed props, so they override anything that conflicts. Useful for:

- Custom enter/exit animations (the default is a 180ms opacity fade)
- A z-index lower than the default `2147483646` if you're nesting under another high-z portal
- Borders, rings, gradient shadows on the modal that the `radius` prop alone can't express
- `transition` overrides on the iframe height — the default is `200ms ease`

These escape hatches keep the surface tight (no need to add a prop for every possible CSS knob) while letting any unusual host design ship without forking the SDK.

### Backwards compatibility

Every new prop is optional with the previous default. Apps on 0.1.x can upgrade to 0.2.0 with no code change and get the same modal they had before.

## Self-hosting the widget

The default widget URL is `https://widget.riftfi.xyz`. If you need to self-host (compliance, white-labelling), deploy the [widget](https://github.com/Rift-FI/rift/tree/master/widget) source and pass the URL to the provider:

```tsx
<RiftProvider apiKey="sk_..." widgetUrl="https://widget.yourdomain.com">
```

## Full docs

Integration walkthrough, OpenAPI spec, transaction signing flows: **https://service.riftfi.xyz/docs**

- Live API explorer: https://developers.riftfi.xyz
- OpenAPI spec: https://github.com/Rift-FI/Rift-Sdk-Wrapper/blob/main/docs.json
- Source: https://github.com/Rift-FI/rift-react

## License

MIT
