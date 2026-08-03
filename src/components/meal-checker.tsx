"use client";

import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type CheckInResult = {
  id: string;
  guestName: string;
  mealType: "lunch" | "dinner";
  locationName: string;
  completedAt: string;
};

type VisibleResult =
  { kind: "success"; data: CheckInResult } | { kind: "error"; message: string };

export function MealChecker({
  checkerName,
  authBypassed = false,
}: {
  checkerName: string;
  authBypassed?: boolean;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const processingRef = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [cameraState, setCameraState] = useState<
    "idle" | "starting" | "active" | "unavailable"
  >("idle");
  const [cameraMessage, setCameraMessage] = useState(
    "Starting the rear camera…",
  );
  const [manualCode, setManualCode] = useState("");
  const [result, setResult] = useState<VisibleResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [ending, setEnding] = useState(false);

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    if (videoRef.current?.srcObject instanceof MediaStream) {
      for (const track of videoRef.current.srcObject.getTracks()) track.stop();
      videoRef.current.srcObject = null;
    }
    setCameraState("idle");
  }, []);

  const checkCode = useCallback(
    async (code: string) => {
      const activeSessionId = sessionIdRef.current;
      if (!activeSessionId || processingRef.current) return;
      processingRef.current = true;
      setProcessing(true);
      stopCamera();
      setResult(null);

      try {
        const response = await fetch("/api/meal-checking/check-ins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: activeSessionId, code }),
        });
        const body = (await response.json()) as CheckInResult & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(
            body.error ?? "We couldn’t validate that door code. Try again.",
          );
        }
        setResult({ kind: "success", data: body });
      } catch (error) {
        setResult({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "We couldn’t validate that door code. Try again.",
        });
      } finally {
        processingRef.current = false;
        setProcessing(false);
        requestAnimationFrame(() => resultRef.current?.focus());
      }
    },
    [stopCamera],
  );

  const startCamera = useCallback(async () => {
    if (!sessionIdRef.current || !videoRef.current || processingRef.current)
      return;
    stopCamera();
    setResult(null);
    setCameraState("starting");
    setCameraMessage("Allow camera access, then point the camera at the pass.");

    try {
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
          },
        },
        videoRef.current,
        (scanResult, _error, controls) => {
          if (scanResult && !processingRef.current) {
            controls.stop();
            controlsRef.current = null;
            void checkCode(scanResult.getText());
          }
        },
      );
      controlsRef.current = controls;
      setCameraState("active");
      setCameraMessage("Point the camera at the barcode on the guest’s pass.");
    } catch {
      setCameraState("unavailable");
      setCameraMessage(
        "The camera could not start. Enable camera access or enter the door code below.",
      );
    }
  }, [checkCode, stopCamera]);

  useEffect(() => {
    let cancelled = false;

    async function startSession() {
      try {
        const response = await fetch("/api/meal-checking/sessions", {
          method: "POST",
        });
        const body = (await response.json()) as {
          id?: string;
          error?: string;
        };
        if (!response.ok || !body.id) {
          throw new Error(
            body.error ?? "The meal-checking session could not be started.",
          );
        }
        if (!cancelled) {
          sessionIdRef.current = body.id;
          setSessionId(body.id);
          void startCamera();
        }
      } catch (error) {
        if (!cancelled) {
          setSessionError(
            error instanceof Error
              ? error.message
              : "The meal-checking session could not be started.",
          );
        }
      }
    }

    void startSession();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  async function endSession() {
    if (!sessionId || ending) return;
    setEnding(true);
    stopCamera();
    try {
      const response = await fetch(
        `/api/meal-checking/sessions/${encodeURIComponent(sessionId)}/end`,
        { method: "POST" },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "The session could not be ended.");
      }
      router.push("/");
      router.refresh();
    } catch (error) {
      setSessionError(
        error instanceof Error
          ? error.message
          : "The session could not be ended.",
      );
      setEnding(false);
    }
  }

  function submitManualCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void checkCode(manualCode);
  }

  function scanNext() {
    setManualCode("");
    setResult(null);
    void startCamera();
  }

  if (sessionError) {
    return (
      <main className="meal-checking-page">
        <section className="checker-state-card" role="alert">
          <p className="eyebrow">Session unavailable</p>
          <h1>Meal checking couldn’t start.</h1>
          <p className="muted">{sessionError}</p>
          <button
            className="button button-secondary"
            onClick={() => router.push("/")}
            type="button"
          >
            Return home
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="meal-checking-page">
      <a className="skip-link" href="#checker-content">
        Skip to scanner
      </a>
      <div className="checker-shell" id="checker-content">
        <header className="checker-header">
          <div>
            <p className="eyebrow">Meal checker</p>
            <h1>Scan a guest pass</h1>
            <p className="checker-signed-in">Signed in as {checkerName}</p>
            {authBypassed ? (
              <p className="checker-signed-in" role="status">
                Development preview · authentication bypassed
              </p>
            ) : null}
          </div>
          <span className="checker-status">
            <span aria-hidden="true" />
            {sessionId ? "Checking" : "Starting"}
          </span>
        </header>

        <section className="scanner-panel" aria-labelledby="scanner-heading">
          <h2 className="sr-only" id="scanner-heading">
            Barcode scanner
          </h2>
          <div className="camera-frame">
            <video
              aria-label="Live camera preview for scanning a door pass"
              autoPlay
              muted
              playsInline
              ref={videoRef}
            />
            <span
              className="camera-corner camera-corner-tl"
              aria-hidden="true"
            />
            <span
              className="camera-corner camera-corner-tr"
              aria-hidden="true"
            />
            <span
              className="camera-corner camera-corner-bl"
              aria-hidden="true"
            />
            <span
              className="camera-corner camera-corner-br"
              aria-hidden="true"
            />
            {cameraState !== "active" ? (
              <p className="camera-overlay">{cameraMessage}</p>
            ) : null}
          </div>
          <p className="camera-instructions" role="status">
            {cameraMessage}
          </p>
          {cameraState === "unavailable" ? (
            <button
              className="button button-secondary button-block"
              onClick={() => void startCamera()}
              type="button"
            >
              Enable camera
            </button>
          ) : null}
        </section>

        <p className="checker-live sr-only" aria-live="assertive" aria-atomic>
          {result?.kind === "success"
            ? `${result.data.guestName} checked in for ${result.data.mealType}.`
            : result?.kind === "error"
              ? result.message
              : ""}
        </p>

        {result ? (
          <div
            className={`checker-result checker-result-${result.kind}`}
            ref={resultRef}
            role={result.kind === "error" ? "alert" : "status"}
            tabIndex={-1}
          >
            <div className="checker-result-icon" aria-hidden="true">
              {result.kind === "success" ? "✓" : "!"}
            </div>
            <div>
              <p className="checker-result-label">
                {result.kind === "success"
                  ? "Verified and checked in"
                  : "Pass not accepted"}
              </p>
              {result.kind === "success" ? (
                <>
                  <h2>{result.data.guestName}</h2>
                  <p>
                    {capitalize(result.data.mealType)} at{" "}
                    {result.data.locationName}
                  </p>
                </>
              ) : (
                <>
                  <h2>We couldn’t check in this guest.</h2>
                  <p>{result.message}</p>
                </>
              )}
            </div>
            <button
              className="button button-secondary button-block"
              onClick={scanNext}
              type="button"
            >
              {result.kind === "success"
                ? "Scan next guest"
                : "Try another code"}
            </button>
          </div>
        ) : null}

        <div className="manual-divider">
          <span>or enter the door code</span>
        </div>
        <form className="manual-code-form" onSubmit={submitManualCode}>
          <label htmlFor="door-code">Door code from the guest’s pass</label>
          <input
            autoCapitalize="characters"
            autoComplete="off"
            id="door-code"
            inputMode="text"
            maxLength={19}
            onChange={(event) => setManualCode(event.target.value)}
            placeholder="ME-XXXX-XXXX-XXXX"
            spellCheck={false}
            type="text"
            value={manualCode}
          />
          <button
            className="button button-primary button-block"
            disabled={!sessionId || processing}
            type="submit"
          >
            Check this code
          </button>
        </form>

        <button
          className="checker-end-button"
          disabled={!sessionId || ending}
          onClick={() => void endSession()}
          type="button"
        >
          {ending ? "Ending session…" : "End checking session"}
        </button>
      </div>
    </main>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
