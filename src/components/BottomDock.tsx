import { useUiStore, type BottomPanelTab } from '../state/uiStore';

const TABS: { id: BottomPanelTab; label: string; key: string }[] = [
  { id: 'stepsequencer', label: 'Step Sequencer', key: '1' },
  { id: 'pianoroll', label: 'Piano Roll', key: '2' },
  { id: 'mixer', label: 'Mixer', key: '3' },
];

export function BottomDock() {
  const activeTab = useUiStore((s) => s.bottomPanelTab);
  const setTab = useUiStore((s) => s.setBottomPanelTab);

  return (
    <section className="flex h-64 shrink-0 flex-col border-t border-hairline bg-surface-1">
      <div className="flex items-center gap-1 border-b border-hairline px-2 pt-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setTab(tab.id)}
            aria-pressed={activeTab === tab.id}
            className={[
              'rounded-t-md px-3 py-1.5 text-sm transition-colors',
              activeTab === tab.id
                ? 'bg-surface-2 text-ink border border-hairline border-b-surface-2'
                : 'text-ink-dim hover:text-ink',
            ].join(' ')}
          >
            {tab.label}
            <span className="ml-1.5 text-ink-faint">{tab.key}</span>
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-4 text-sm text-ink-faint">
        {activeTab === 'stepsequencer' && <EmptyPanelHint text="Select a drum pattern clip to edit its steps." />}
        {activeTab === 'pianoroll' && <EmptyPanelHint text="Select a MIDI clip to edit its notes." />}
        {activeTab === 'mixer' && <EmptyPanelHint text="Add a track to see it in the mixer." />}
      </div>
    </section>
  );
}

function EmptyPanelHint({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center">{text}</div>;
}
