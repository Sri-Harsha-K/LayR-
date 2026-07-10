import { useUiStore } from '../state/uiStore';

export function ConfirmDialog() {
  const confirmRequest = useUiStore((s) => s.confirmRequest);
  const cancelConfirm = useUiStore((s) => s.cancelConfirm);

  if (!confirmRequest) return null;

  const handleConfirm = () => {
    confirmRequest.onConfirm();
    cancelConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-0/80" onClick={cancelConfirm}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-80 flex-col gap-4 rounded-lg border border-hairline bg-surface-1 p-5"
      >
        <p className="text-sm text-ink">{confirmRequest.message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={cancelConfirm}
            className="rounded-md border border-hairline px-3 py-1.5 text-sm text-ink-dim hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-md bg-record px-3 py-1.5 text-sm font-medium text-surface-0"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
