import { useUiStore, type BottomPanelTab } from '../state/uiStore';
import { StepSequencer } from './stepsequencer/StepSequencer';
import { PianoRoll } from './pianoroll/PianoRoll';
import { Mixer } from './mixer/Mixer';
import { SoundPanel } from './sound/SoundPanel';
import { LibraryPanel } from './library/LibraryPanel';

const TABS: { id: BottomPanelTab; label: string; key: string }[] = [
  { id: 'stepsequencer', label: 'Step Sequencer', key: '1' },
  { id: 'pianoroll', label: 'Piano Roll', key: '2' },
  { id: 'mixer', label: 'Mixer', key: '3' },
  { id: 'sound', label: 'Sound', key: '4' },
  { id: 'library', label: 'Library', key: '5' },
];

export function BottomDock() {
  const activeTab = useUiStore((s) => s.bottomPanelTab);
  const setTab = useUiStore((s) => s.setBottomPanelTab);
  const bottomDockHeight = useUiStore((s) => s.bottomDockHeight);

  return (
    <section className="flex shrink-0 flex-col border-t border-hairline bg-surface-1" style={{ height: bottomDockHeight }}>
      <div className="flex items-center gap-1 border-b border-hairline px-2 pt-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setTab(tab.id)}
            aria-pressed={activeTab === tab.id}
            className={[
              'label-mono rounded-t-md px-3 py-2 transition-colors',
              activeTab === tab.id
                ? 'bg-surface-2 text-accent border border-hairline border-b-surface-2'
                : 'text-ink-dim hover:text-ink',
            ].join(' ')}
          >
            {tab.label}
            <span className="ml-1.5 text-ink-faint">{tab.key}</span>
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-3">
        {activeTab === 'stepsequencer' && <StepSequencer />}
        {activeTab === 'pianoroll' && <PianoRoll />}
        {activeTab === 'mixer' && <Mixer />}
        {activeTab === 'sound' && <SoundPanel />}
        {activeTab === 'library' && <LibraryPanel />}
      </div>
    </section>
  );
}
