import { useEffect, useState } from 'react';
import { getTransientState } from '../state/transient';

// Same rAF-poll-a-primitive convention as useIsRecording — sessionPlayer.ts
// mutates transient.ts's sessionActiveClipByTrack map in place (see its own
// comment on why), so polling the whole object would never see a changed
// reference; polling one trackId's string|undefined value works because
// primitives compare by value and React bails when it hasn't changed.
export function useSessionActiveClip(trackId: string): string | undefined {
  const [clipId, setClipId] = useState<string | undefined>(undefined);

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setClipId(getTransientState().sessionActiveClipByTrack[trackId]);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [trackId]);

  return clipId;
}
