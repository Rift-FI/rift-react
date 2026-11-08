import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { RiftApprove, type RiftApproveProps } from "./RiftApprove";
import type { RiftApprovalResult } from "./types";

/** Outcome of `requestApproval`. `dismissed` = closed before finishing. */
export type RiftApprovalOutcome =
  | RiftApprovalResult
  | { approvalId: string; status: "dismissed" };

type ApprovalInput = string | { approvalId: string };

interface UseRiftApprovalReturn {
  /**
   * Open the approval widget for an approval id (or a whole
   * `202 APPROVAL_REQUIRED` body) and resolve when it's done. Resolves
   * with `status: "dismissed"` if the user closes it first. Calling it
   * again while one is open dismisses the previous one.
   */
  requestApproval: (input: ApprovalInput) => Promise<RiftApprovalOutcome>;
  /** Render this somewhere inside <RiftProvider>. `null` when idle. */
  approvalElement: ReactNode;
  /** The approval currently shown, if any. */
  approvalId: string | null;
  /** Close the widget; the pending promise resolves as dismissed. */
  dismiss: () => void;
}

/**
 * Promise-style wrapper around <RiftApprove>:
 *
 *   const { requestApproval, approvalElement } = useRiftApproval();
 *   const res = await fetch("/my/send", …);           // your server → Rift
 *   if (res.status === 202) {
 *     const outcome = await requestApproval(await res.json());
 *     if (outcome.status === "approved") showTx(outcome.result?.transactionHash);
 *   }
 *   return <>{approvalElement}</>;
 */
export function useRiftApproval(
  props: Omit<RiftApproveProps, "approvalId" | "onResult" | "onClose"> = {}
): UseRiftApprovalReturn {
  const [current, setCurrent] = useState<string | null>(null);
  const resolver = useRef<((o: RiftApprovalOutcome) => void) | null>(null);
  // Outcome reported by the widget; delivered when the user closes it.
  const outcome = useRef<RiftApprovalResult | null>(null);

  const settle = useCallback((o: RiftApprovalOutcome) => {
    const resolve = resolver.current;
    resolver.current = null;
    outcome.current = null;
    setCurrent(null);
    resolve?.(o);
  }, []);

  const requestApproval = useCallback(
    (input: ApprovalInput) => {
      const id = typeof input === "string" ? input : input.approvalId;
      if (resolver.current && current) {
        settle({ approvalId: current, status: "dismissed" });
      }
      return new Promise<RiftApprovalOutcome>((resolve) => {
        resolver.current = resolve;
        outcome.current = null;
        setCurrent(id);
      });
    },
    [current, settle]
  );

  const dismiss = useCallback(() => {
    if (!current) return;
    settle(outcome.current ?? { approvalId: current, status: "dismissed" });
  }, [current, settle]);

  // Never leave a caller awaiting forever if the host unmounts.
  useEffect(
    () => () => {
      resolver.current?.({ approvalId: "", status: "dismissed" });
      resolver.current = null;
    },
    []
  );

  const approvalElement = current ? (
    <RiftApprove
      key={current}
      {...props}
      approvalId={current}
      onResult={(r) => {
        // Resolve straight away so the caller can react; the widget stays
        // up showing the outcome until the user closes it.
        outcome.current = r;
        const resolve = resolver.current;
        resolver.current = null;
        resolve?.(r);
      }}
      onClose={() => {
        const r = outcome.current;
        outcome.current = null;
        setCurrent(null);
        resolver.current?.(r ?? { approvalId: current, status: "dismissed" });
        resolver.current = null;
      }}
    />
  ) : null;

  return { requestApproval, approvalElement, approvalId: current, dismiss };
}
