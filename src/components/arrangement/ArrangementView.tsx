import { useProjectStore } from '../../state/projectStore';

export function ArrangementView() {
  const tracks = useProjectStore((s) => s.project.tracks);
  const addTrack = useProjectStore((s) => s.addTrack);

  if (tracks.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-ink-faint">
        <p>Nothing here yet.</p>
        <button
          type="button"
          onClick={() => addTrack('drum')}
          className="rounded-md border border-track-1 px-4 py-2 text-sm text-track-1 transition-colors hover:bg-track-1/10"
        >
          Add a drum track
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      {tracks.map((t) => (
        <div key={t.id} className="h-16 border-b border-hairline" />
      ))}
    </div>
  );
}
