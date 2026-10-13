import { describe, expect, it, vi } from "vitest";
import { installPreloadErrorRecovery } from "@/net/installPreloadErrorRecovery";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

function setup({ readStorage }: { readStorage?: () => Storage } = {}) {
  const target = new EventTarget();
  const reload = vi.fn<() => void>();
  let clock = 1_000_000;
  const storage = memoryStorage();
  installPreloadErrorRecovery({ target, readStorage: readStorage ?? (() => storage), reload, now: () => clock });
  const fail = () => {
    const event = new Event("vite:preloadError", { cancelable: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };
  return { reload, fail, advance: (ms: number) => (clock += ms) };
}

describe("installPreloadErrorRecovery", () => {
  it("reloads once instead of showing the error when a chunk or stylesheet fails to load", () => {
    const { reload, fail } = setup();

    expect(fail()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("lets a repeated failure surface instead of reloading in a loop", () => {
    const { reload, fail, advance } = setup();
    fail();
    advance(5_000);

    expect(fail()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads again after the cooldown", () => {
    const { reload, fail, advance } = setup();
    fail();
    advance(60_000);

    expect(fail()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("does not reload when session storage is unavailable", () => {
    const { reload, fail } = setup({
      readStorage: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    });

    expect(fail()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
