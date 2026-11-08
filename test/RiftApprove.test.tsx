import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import {
  RiftApprove,
  RiftAuth,
  RiftProvider,
  useRift,
  useRiftApproval,
  type RiftApprovalOutcome,
} from "../src";

const WIDGET = "https://widget.test";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function wrap(ui: React.ReactNode) {
  return render(
    <RiftProvider apiKey="pk_test" widgetUrl={WIDGET} persist={false}>
      {ui}
    </RiftProvider>
  );
}

function approveFrame(): HTMLIFrameElement {
  return screen.getByTitle("Rift approval") as HTMLIFrameElement;
}

// Simulate the widget iframe posting to the parent.
function post(
  data: unknown,
  opts: { origin?: string; source?: Window | null } = {}
) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data,
        origin: opts.origin ?? WIDGET,
        source: opts.source === undefined ? approveFrame().contentWindow : opts.source,
      })
    );
  });
}

describe("<RiftApprove>", () => {
  it("loads the widget in approve mode with passkey permissions", () => {
    wrap(<RiftApprove approvalId="apr_1" />);
    const src = new URL(approveFrame().src);
    expect(src.origin).toBe(WIDGET);
    expect(src.searchParams.get("mode")).toBe("approve");
    expect(src.searchParams.get("approvalId")).toBe("apr_1");
    expect(src.searchParams.get("key")).toBe("pk_test");
    const allow = approveFrame().getAttribute("allow")!;
    expect(allow).toContain("publickey-credentials-get");
    expect(allow).toContain("publickey-credentials-create");
    expect(screen.getByRole("dialog", { name: "Approve request" })).toBeTruthy();
  });

  it("inline renders just the iframe", () => {
    wrap(<RiftApprove approvalId="apr_1" inline />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(approveFrame()).toBeTruthy();
  });

  it("calls onResult once for its approval's terminal result", () => {
    const onResult = vi.fn();
    wrap(<RiftApprove approvalId="apr_1" onResult={onResult} />);
    const msg = {
      type: "rift:approval-result",
      approvalId: "apr_1",
      status: "approved",
      result: { transactionHash: "0xtx", userOpHash: "0xop" },
    };
    post(msg);
    post(msg);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith({
      approvalId: "apr_1",
      status: "approved",
      result: { transactionHash: "0xtx", userOpHash: "0xop" },
    });
  });

  it("ignores other origins, other frames and other approval ids", () => {
    const onResult = vi.fn();
    const onError = vi.fn();
    wrap(<RiftApprove approvalId="apr_1" onResult={onResult} onError={onError} />);
    const msg = { type: "rift:approval-result", approvalId: "apr_1", status: "approved" };
    post(msg, { origin: "https://evil.test" });
    post(msg, { source: window });
    post({ ...msg, approvalId: "apr_2" });
    post({ type: "rift:approval-error", approvalId: "apr_2", message: "x" });
    expect(onResult).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("forwards errors and close", () => {
    const onError = vi.fn();
    const onClose = vi.fn();
    wrap(<RiftApprove approvalId="apr_1" onError={onError} onClose={onClose} />);
    post({ type: "rift:approval-error", approvalId: "apr_1", message: "cancelled" });
    expect(onError).toHaveBeenCalledWith("cancelled");
    post({ type: "rift:close" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("resizes from rift:resize and shows on rift:ready", () => {
    wrap(<RiftApprove approvalId="apr_1" />);
    expect(approveFrame().style.opacity).toBe("0");
    post({ type: "rift:ready" });
    post({ type: "rift:resize", height: 600 });
    expect(approveFrame().style.opacity).toBe("1");
    expect(approveFrame().style.height).toBe("608px");
  });

  it("does not leak its events into the sign-in modal", () => {
    function Harness() {
      const { open, isOpen } = useRift();
      return (
        <>
          <button onClick={() => open()}>open</button>
          <span data-testid="open">{String(isOpen)}</span>
          <RiftAuth />
          <RiftApprove approvalId="apr_1" />
        </>
      );
    }
    wrap(<Harness />);
    act(() => screen.getByText("open").click());
    expect(screen.getByTestId("open").textContent).toBe("true");
    // rift:close from the approve frame must not close the sign-in modal.
    post({ type: "rift:close" });
    expect(screen.getByTestId("open").textContent).toBe("true");
  });
});

describe("useRiftApproval", () => {
  function Harness({ onOutcome }: { onOutcome: (o: RiftApprovalOutcome) => void }) {
    const { requestApproval, approvalElement, approvalId } = useRiftApproval();
    const [, force] = useState(0);
    return (
      <>
        <button
          onClick={() => {
            requestApproval({ approvalId: "apr_9" }).then(onOutcome);
            force((n) => n + 1);
          }}
        >
          go
        </button>
        <span data-testid="current">{approvalId ?? ""}</span>
        {approvalElement}
      </>
    );
  }

  it("resolves with the widget's result", async () => {
    const onOutcome = vi.fn();
    wrap(<Harness onOutcome={onOutcome} />);
    act(() => screen.getByText("go").click());
    expect(new URL(approveFrame().src).searchParams.get("approvalId")).toBe("apr_9");
    post({
      type: "rift:approval-result",
      approvalId: "apr_9",
      status: "rejected",
    });
    await vi.waitFor(() => expect(onOutcome).toHaveBeenCalled());
    expect(onOutcome).toHaveBeenCalledWith({ approvalId: "apr_9", status: "rejected" });
    // Widget stays up showing the outcome until closed.
    expect(screen.getByTestId("current").textContent).toBe("apr_9");
    post({ type: "rift:close" });
    expect(screen.getByTestId("current").textContent).toBe("");
    expect(onOutcome).toHaveBeenCalledTimes(1);
  });

  it("resolves as dismissed when closed first", async () => {
    const onOutcome = vi.fn();
    wrap(<Harness onOutcome={onOutcome} />);
    act(() => screen.getByText("go").click());
    post({ type: "rift:close" });
    await vi.waitFor(() =>
      expect(onOutcome).toHaveBeenCalledWith({ approvalId: "apr_9", status: "dismissed" })
    );
    expect(screen.queryByTitle("Rift approval")).toBeNull();
  });
});

describe("RiftProvider sign-in", () => {
  it("keeps walletStatus / passkeySetup from signin-success", () => {
    let seen: any = null;
    function Probe() {
      const { user, open } = useRift();
      seen = user;
      return (
        <>
          <button onClick={() => open()}>open</button>
          <RiftAuth />
        </>
      );
    }
    wrap(<Probe />);
    act(() => screen.getByText("open").click());
    const authFrame = screen.getByTitle("Rift sign-in") as HTMLIFrameElement;
    post(
      {
        type: "rift:signin-success",
        user: "u1",
        address: "0xabc",
        accessToken: "t",
        walletStatus: { mode: "passkey", walletAddress: "0xabc", passkeyCount: 1, chains: [], needsPasskeySetup: false },
        passkeySetup: { status: "migrated", walletAddress: "0xabc" },
      },
      { source: authFrame.contentWindow }
    );
    expect(seen.address).toBe("0xabc");
    expect(seen.passkeySetup.status).toBe("migrated");
    expect(seen.walletStatus.mode).toBe("passkey");
  });
});
