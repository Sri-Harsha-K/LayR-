import { useEffect } from 'react';
import { useUiStore } from '../state/uiStore';

const AUTO_DISMISS_MS = 6000;

/** Surfaces real errors (save/open/export failures, permission denials) that would otherwise fail silently — see platform/browser.ts and engine/projectIO.ts. */
export function Toast() {
  const message = useUiStore((s) => s.toastMessage);
  const setToast = useUiStore((s) => s.setToast);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setToast(null), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [message, setToast]);

  if (!message) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-full max-w-md -translate-x-1/2 px-4">
      <div className="flex items-start gap-2 rounded-md border border-record bg-surface-1 px-3 py-2 text-sm text-ink shadow-lg">
        <span className="mt-0.5 text-record" aria-hidden>
          ⚠
        </span>
        <span className="flex-1">{message}</span>
        <button
          type="button"
          onClick={() => setToast(null)}
          aria-label="Dismiss"
          className="text-ink-faint hover:text-ink"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
