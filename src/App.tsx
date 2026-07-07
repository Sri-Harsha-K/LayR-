import { TransportBar } from './components/TransportBar';
import { TrackRail } from './components/TrackRail';
import { ArrangementView } from './components/arrangement/ArrangementView';
import { BottomDock } from './components/BottomDock';
import { PowerOnOverlay } from './components/PowerOnOverlay';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

function App() {
  useKeyboardShortcuts();

  return (
    <div className="flex h-screen flex-col overflow-hidden font-ui">
      <TransportBar />
      <div className="flex min-h-0 flex-1">
        <TrackRail />
        <ArrangementView />
      </div>
      <BottomDock />
      <PowerOnOverlay />
    </div>
  );
}

export default App;
