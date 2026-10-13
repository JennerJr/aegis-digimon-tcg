import { describe, expect, it, vi } from "vitest";
import type { ClientErrorReport } from "@aegis/shared/clientErrors/ClientErrorReport";
import { ClientErrorKind } from "@aegis/shared/clientErrors/ClientErrorKind";
import { MAX_CLIENT_ERROR_MESSAGE, MAX_CLIENT_ERROR_STACK } from "@aegis/shared/clientErrors/clientErrorLimits";
import { createClientErrorReporter } from "@/clientErrors/createClientErrorReporter";
import { installClientErrorListeners } from "@/clientErrors/installClientErrorListeners";
import { sendClientErrorReport } from "@/clientErrors/sendClientErrorReport";

const page = { origin: "https://aegis-digi.online", route: "/game", userAgent: "TestBrowser/1.0" };

function createHarness({ enabled = true, maxReports }: { enabled?: boolean; maxReports?: number } = {}) {
  const sent: ClientErrorReport[] = [];
  const reporter = createClientErrorReporter({
    enabled,
    release: "abc123",
    readPage: () => page,
    send: (report) => sent.push(report),
    now: () => new Date("2026-10-13T12:00:00.000Z"),
    maxReports,
  });
  return { sent, reporter };
}

function errorAt(message: string, line: number): Error {
  const error = new Error(message);
  error.stack = `Error: ${message}\n    at f (https://aegis-digi.online/assets/GameScreen-a.js:${line}:5)`;
  return error;
}

describe("client error reporter", () => {
  it("sends one report with the release, route, and browser", () => {
    const { sent, reporter } = createHarness();
    reporter.capture({ kind: ClientErrorKind.ERROR.value, error: errorAt("boom", 3) });
    expect(sent).toEqual([
      {
        kind: "error",
        message: "Error: boom",
        stack: "Error: boom\n    at f (https://aegis-digi.online/assets/GameScreen-a.js:3:5)",
        signature: "Error: boom @ /assets/GameScreen-a.js:3:5",
        release: "abc123",
        route: "/game",
        userAgent: "TestBrowser/1.0",
        occurredAt: "2026-10-13T12:00:00.000Z",
      },
    ]);
  });

  it("drops repeats of the same signature in one session", () => {
    const { sent, reporter } = createHarness();
    reporter.capture({ kind: ClientErrorKind.ERROR.value, error: errorAt("boom 1", 3) });
    reporter.capture({ kind: ClientErrorKind.ERROR.value, error: errorAt("boom 2", 3) });
    reporter.capture({ kind: ClientErrorKind.ERROR.value, error: errorAt("boom 3", 4) });
    expect(sent.map((report) => report.signature)).toEqual([
      "Error: boom <n> @ /assets/GameScreen-a.js:3:5",
      "Error: boom <n> @ /assets/GameScreen-a.js:4:5",
    ]);
  });

  it("stops after the session cap", () => {
    const { sent, reporter } = createHarness({ maxReports: 3 });
    for (let line = 1; line <= 10; line += 1) {
      reporter.capture({ kind: ClientErrorKind.ERROR.value, error: errorAt("boom", line) });
    }
    expect(sent).toHaveLength(3);
  });

  it("sends nothing while disabled", () => {
    const { sent, reporter } = createHarness({ enabled: false });
    reporter.capture({ kind: ClientErrorKind.ERROR.value, error: errorAt("boom", 1) });
    expect(sent).toEqual([]);
  });

  it("truncates oversized messages and stacks", () => {
    const { sent, reporter } = createHarness();
    const error = new Error("m".repeat(5000));
    error.stack = "s".repeat(50_000);
    reporter.capture({ kind: ClientErrorKind.ERROR.value, error });
    expect(sent[0]?.message).toHaveLength(MAX_CLIENT_ERROR_MESSAGE);
    expect(sent[0]?.stack).toHaveLength(MAX_CLIENT_ERROR_STACK);
  });

  it("adds the current room and match", () => {
    const { sent, reporter } = createHarness();
    reporter.setMatchContext(() => ({ roomId: "room-1", matchId: "match-1" }));
    reporter.capture({ kind: ClientErrorKind.RENDER.value, error: errorAt("boom", 1), componentStack: "\n  at Board" });
    expect(sent[0]).toMatchObject({ kind: "render", roomId: "room-1", matchId: "match-1" });
    expect(sent[0]?.stack).toContain("Component stack:\n  at Board");
  });

  it("describes rejection values that are not errors", () => {
    const { sent, reporter } = createHarness();
    reporter.capture({ kind: ClientErrorKind.UNHANDLED_REJECTION.value, error: { code: 4212 } });
    expect(sent[0]).toMatchObject({ message: '{"code":4212}', stack: "" });
  });

  it("never throws when sending or reading context fails", () => {
    const reporter = createClientErrorReporter({
      enabled: true,
      release: "abc123",
      readPage: () => page,
      send: () => {
        throw new Error("network");
      },
    });
    reporter.setMatchContext(() => {
      throw new Error("state");
    });
    expect(() => reporter.capture({ kind: ClientErrorKind.ERROR.value, error: errorAt("boom", 1) })).not.toThrow();
  });
});

describe("client error listeners", () => {
  it("captures uncaught errors and unhandled rejections once per target", () => {
    const target = new EventTarget();
    const capture = vi.fn();
    installClientErrorListeners({ target, reporter: { capture } });
    installClientErrorListeners({ target, reporter: { capture } });
    const failure = new Error("boom");
    target.dispatchEvent(Object.assign(new Event("error"), { error: failure }));
    target.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: "lost" }));
    expect(capture.mock.calls).toEqual([
      [{ kind: "error", error: failure }],
      [{ kind: "unhandledRejection", error: "lost" }],
    ]);
  });

  it("builds a frame from the event location when the browser hides the error", () => {
    const target = new EventTarget();
    const capture = vi.fn();
    installClientErrorListeners({ target, reporter: { capture } });
    target.dispatchEvent(
      Object.assign(new Event("error"), {
        error: null,
        message: "Script error.",
        filename: "https://aegis-digi.online/assets/a.js",
        lineno: 1,
        colno: 2,
      }),
    );
    const [[captured]] = capture.mock.calls as [[{ error: Error }]];
    expect(captured.error.stack).toBe("Script error.\n    at https://aegis-digi.online/assets/a.js:1:2");
  });
});

describe("client error delivery", () => {
  const report = {
    kind: "error",
    message: "m",
    stack: "",
    signature: "m @ no-app-frame",
    release: "abc123",
    route: "/",
    userAgent: "u",
    occurredAt: "2026-10-13T12:00:00.000Z",
  } satisfies ClientErrorReport;

  it("uses a beacon when the browser accepts it", () => {
    const sendBeacon = vi.fn(() => true);
    const fetcher = vi.fn();
    sendClientErrorReport({
      url: "/bug-reports/client-errors",
      report,
      beacon: { sendBeacon },
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(sendBeacon).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("falls back to a keepalive request when the beacon is refused", () => {
    const fetcher = vi.fn(() => Promise.reject(new Error("offline")));
    sendClientErrorReport({
      url: "/bug-reports/client-errors",
      report,
      beacon: { sendBeacon: () => false },
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/bug-reports/client-errors",
      expect.objectContaining({ method: "POST", keepalive: true, body: JSON.stringify(report) }),
    );
  });
  it("ignores cross-origin script errors that carry no stack", () => {
    const { sent, reporter } = createHarness();
    const target = new EventTarget();
    installClientErrorListeners({ target, reporter });
    target.dispatchEvent(Object.assign(new Event("error"), { message: "Script error.", filename: "" }));
    expect(sent).toEqual([]);
  });

  it("ignores errors raised only inside browser extensions", () => {
    const { sent, reporter } = createHarness();
    const error = new TypeError("Cannot read properties of undefined (reading 'M_ID')");
    error.stack = [
      "TypeError: Cannot read properties of undefined (reading 'M_ID')",
      "    at Y (chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon/executors/200.js:1:761)",
      "    at E (chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon/executors/200.js:1:1442)",
    ].join("\n");
    reporter.capture({ kind: ClientErrorKind.UNHANDLED_REJECTION.value, error });
    expect(sent).toEqual([]);
  });

  it("still reports an app error that passes through an extension frame", () => {
    const { sent, reporter } = createHarness();
    const error = new Error("boom");
    error.stack = [
      "Error: boom",
      "    at wrap (chrome-extension://abc/content.js:1:10)",
      "    at f (https://aegis-digi.online/assets/GameScreen-a.js:3:5)",
    ].join("\n");
    reporter.capture({ kind: ClientErrorKind.ERROR.value, error });
    expect(sent.map((report) => report.signature)).toEqual(["Error: boom @ /assets/GameScreen-a.js:3:5"]);
  });
});
