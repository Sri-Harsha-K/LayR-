import { TransportBar } from './components/TransportBar';
import { TrackRail } from './components/TrackRail';
import { ArrangementView } from './components/arrangement/ArrangementView';
import { BottomDock } from './components/BottomDock';
import { PowerOnOverlay } from './components/PowerOnOverlay';
import { CaptureView } from './components/capture/CaptureView';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAudioEngine } from './hooks/useAudioEngine';
import { useProjectPersistence } from './hooks/useProjectPersistence';
import { useIsRecording } from './hooks/useIsRecording';

function App() {
  useAudioEngine();
  useKeyboardShortcuts();
  useProjectPersistence();
  const isRecording = useIsRecording();

  return (
    <div className="flex h-screen flex-col overflow-hidden font-ui">
      <TransportBar />
      <div className="relative flex min-h-0 flex-1">
        <TrackRail />
        <ArrangementView />
        {isRecording && <CaptureView />}
      </div>
      <BottomDock />
      <PowerOnOverlay />
    </div>
  );
}

export default App;
