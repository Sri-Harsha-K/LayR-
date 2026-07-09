import { useEffect, useState } from 'react';
import { getTransientState } from '../state/transient';

// isRecording has no start/stop event to subscribe to (unlike transport
// play/pause) — polled every rAF frame instead, same as every other
// engine-driven flag in this app. React bails out of re-rendering when the
// value hasn't actually changed, so this doesn't cost a re-render per frame
// in practice despite looking like a 60fps setState.
export function useIsRecording(): boolean {
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setIsRecording(getTransientState().isRecording);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return isRecording;
}
