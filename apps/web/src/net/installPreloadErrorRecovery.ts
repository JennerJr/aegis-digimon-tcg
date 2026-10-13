const LAST_RELOAD_KEY = "aegis:preload-error-reload-at";
const RELOAD_COOLDOWN_MS = 60_000;

type InstallPreloadErrorRecoveryParams = {
  target: EventTarget;
  readStorage: () => Storage;
  reload: () => void;
  now?: () => number;
};

function recordReload(readStorage: () => Storage, at: number): boolean {
  try {
    const storage = readStorage();
    const last = Number(storage.getItem(LAST_RELOAD_KEY));
    if (Number.isFinite(last) && at - last < RELOAD_COOLDOWN_MS) {
      return false;
    }
    storage.setItem(LAST_RELOAD_KEY, String(at));
    return true;
  } catch {
    return false;
  }
}

export function installPreloadErrorRecovery({
  target,
  readStorage,
  reload,
  now = Date.now,
}: InstallPreloadErrorRecoveryParams): void {
  target.addEventListener("vite:preloadError", (event) => {
    if (!recordReload(readStorage, now())) {
      return;
    }
    event.preventDefault();
    reload();
  });
}
