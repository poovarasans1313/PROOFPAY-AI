"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type PayPalButtonOptions = {
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => void | Promise<void>;
  onCancel: () => void;
  onError: (error: unknown) => void;
  style: {
    layout: "vertical";
  };
};

type PayPalButtonsInstance = {
  render: (container: HTMLElement) => Promise<void>;
  close?: () => Promise<void>;
};

declare global {
  interface Window {
    paypal?: {
      Buttons: (options: PayPalButtonOptions) => PayPalButtonsInstance;
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error("The server returned an unreadable response.");
  }
}

function getErrorMessage(value: unknown, fallback: string): string {
  if (
    isRecord(value) &&
    typeof value.error === "string" &&
    value.error.length <= 200
  ) {
    return value.error;
  }

  return fallback;
}

export default function PayPalSandboxDemo({
  clientId,
}: {
  clientId: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const requestNonceRef = useRef<string | null>(null);
  const tokenByOrderIdRef = useRef(new Map<string, string>());
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptError, setScriptError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const createOrder = useCallback(async (): Promise<string> => {
    setError(null);
    setMessage("Creating a fixed USD 1.00 Sandbox order...");

    if (!requestNonceRef.current) {
      requestNonceRef.current = crypto.randomUUID();
    }

    let response: Response;

    try {
      response = await fetch("/api/paypal-demo/orders", {
        method: "POST",
        headers: {
          "x-paypal-demo-nonce": requestNonceRef.current,
        },
      });
    } catch {
      throw new Error("Unable to reach the Sandbox order service.");
    }

    const payload = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(
        getErrorMessage(payload, "Unable to create a Sandbox order.")
      );
    }

    if (
      !isRecord(payload) ||
      typeof payload.orderId !== "string" ||
      typeof payload.token !== "string" ||
      payload.token.length > 2048
    ) {
      throw new Error("The server returned an invalid Sandbox order.");
    }

    tokenByOrderIdRef.current.set(payload.orderId, payload.token);
    requestNonceRef.current = null;
    setMessage("Order created. Approve it with a PayPal Sandbox buyer account.");

    return payload.orderId;
  }, []);

  const captureOrder = useCallback(async (orderId: string): Promise<void> => {
    const token = tokenByOrderIdRef.current.get(orderId);

    if (!token) {
      setError("The temporary verification token is unavailable. Restart the demo.");
      return;
    }

    setIsCapturing(true);
    setError(null);
    setMessage("Verifying the approved order and capturing it in Sandbox...");

    try {
      const response = await fetch(
        `/api/paypal-demo/orders/${encodeURIComponent(orderId)}/capture`,
        {
          method: "POST",
          headers: {
            "x-paypal-demo-token": token,
          },
        }
      );
      const payload = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(
          getErrorMessage(payload, "Unable to verify the Sandbox capture.")
        );
      }

      if (
        !isRecord(payload) ||
        payload.success !== true ||
        payload.status !== "COMPLETED" ||
        payload.orderId !== orderId ||
        typeof payload.captureId !== "string" ||
        typeof payload.alreadyCaptured !== "boolean"
      ) {
        throw new Error("The server returned an invalid capture confirmation.");
      }

      setCaptureId(payload.captureId);
      setPendingOrderId(null);
      tokenByOrderIdRef.current.delete(orderId);
      setMessage(
        payload.alreadyCaptured
          ? "PayPal confirmed this Sandbox order was already captured."
          : "PayPal confirmed the USD 1.00 Sandbox capture."
      );
    } catch (captureError) {
      setError(
        captureError instanceof Error
          ? captureError.message
          : "Unable to verify the Sandbox capture."
      );
      setMessage(null);
    } finally {
      setIsCapturing(false);
    }
  }, []);

  useEffect(() => {
    const paypal = window.paypal;
    const container = containerRef.current;

    if (!scriptReady || !paypal || !container) {
      return;
    }

    let active = true;
    const buttons = paypal.Buttons({
      style: { layout: "vertical" },
      createOrder: async () => {
        try {
          return await createOrder();
        } catch (createError) {
          setError(
            createError instanceof Error
              ? createError.message
              : "Unable to create a Sandbox order."
          );
          setMessage(null);
          throw createError;
        }
      },
      onApprove: async ({ orderID }) => {
        setPendingOrderId(orderID);
        await captureOrder(orderID);
      },
      onCancel: () => {
        setMessage("Sandbox approval was cancelled. No capture was made.");
      },
      onError: () => {
        setError("PayPal could not complete the Sandbox checkout flow.");
        setMessage(null);
      },
    });

    void buttons.render(container).catch(() => {
      if (active) {
        setError("PayPal Sandbox buttons could not be loaded.");
        setMessage(null);
      }
    });

    return () => {
      active = false;
      void buttons.close?.().catch(() => {
        console.error("Unable to close the PayPal Sandbox button instance.");
      });
    };
  }, [captureOrder, createOrder, scriptReady]);

  if (!clientId) {
    return (
      <p role="alert" className="text-sm text-amber-300">
        Sandbox checkout is not configured. Set the public PayPal Sandbox
        client ID in the server environment.
      </p>
    );
  }

  const scriptUrl = new URL("https://www.paypal.com/sdk/js");
  scriptUrl.searchParams.set("client-id", clientId);
  scriptUrl.searchParams.set("currency", "USD");
  scriptUrl.searchParams.set("intent", "capture");
  scriptUrl.searchParams.set("components", "buttons");

  return (
    <div className="space-y-5">
      <Script
        src={scriptUrl.toString()}
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onError={() => setScriptError(true)}
      />

      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">
        <p className="text-sm font-medium text-cyan-200">
          Sandbox demonstration amount
        </p>
        <p className="mt-1 text-2xl font-semibold text-white">USD 1.00</p>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          This fixed amount is set and verified by the server. It is not a
          purchase request or a real-money payment.
        </p>
      </div>

      {scriptError && (
        <p role="alert" className="text-sm text-red-300">
          The PayPal Sandbox SDK could not be loaded. Check your connection and
          client ID configuration.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200"
        >
          {error}
        </p>
      )}

      {message && (
        <p role="status" className="text-sm text-slate-300">
          {message}
        </p>
      )}

      <div ref={containerRef} aria-label="PayPal Sandbox checkout" />

      {pendingOrderId && (
        <button
          type="button"
          onClick={() => void captureOrder(pendingOrderId)}
          disabled={isCapturing}
          className="rounded-xl border border-cyan-400/30 px-4 py-2 text-sm text-cyan-200 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCapturing ? "Verifying capture..." : "Retry capture verification"}
        </button>
      )}

      {captureId && (
        <p className="break-all text-xs text-slate-400">
          Verified Sandbox capture reference: {captureId}
        </p>
      )}

      <p className="border-t border-white/10 pt-4 text-xs leading-5 text-slate-500">
        The approval token is held only in this page&apos;s memory and expires
        shortly. PROOFPAY stores no order or capture record. This demo does not
        affect existing purchase, risk, or approval data.
      </p>
    </div>
  );
}
