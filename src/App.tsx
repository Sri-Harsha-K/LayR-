import { TransportBar } from './components/TransportBar';
import { TrackRail } from './components/TrackRail';
import { ArrangementView } from './components/arrangement/ArrangementView';
import { SessionView } from './components/session/SessionView';
import { BottomDock } from './components/BottomDock';
import { PowerOnOverlay } from './components/PowerOnOverlay';
import { CaptureView } from './components/capture/CaptureView';
import { ExportDialog } from './components/ExportDialog';
import { Toast } from './components/Toast';
import { ResizeHandle } from './components/ResizeHandle';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAudioEngine } from './hooks/useAudioEngine';
import { useProjectPersistence } from './hooks/useProjectPersistence';
import { useIsRecording } from './hooks/useIsRecording';
import { useUiStore } from './state/uiStore';

function App() {
  useAudioEngine();
  useKeyboardShortcuts();
  useProjectPersistence();
  const isRecording = useIsRecording();
  const mainView = useUiStore((s) => s.mainView);
  const resizeTrackRail = useUiStore((s) => s.resizeTrackRail);
  const resizeBottomDock = useUiStore((s) => s.resizeBottomDock);

  return (
    <div className="flex h-screen flex-col overflow-hidden font-ui">
      <TransportBar />
      <div className="relative flex min-h-0 flex-1">
        <TrackRail />
        <ResizeHandle axis="x" label="Resize track rail" onResize={resizeTrackRail} />
        {mainView === 'timeline' ? <ArrangementView /> : <SessionView />}
        {isRecording && <CaptureView />}
      </div>
      <ResizeHandle axis="y" label="Resize bottom panel" onResize={resizeBottomDock} />
      <BottomDock />
      <PowerOnOverlay />
      <ExportDialog />
      <Toast />
    </div>
  );
}

export default App;
