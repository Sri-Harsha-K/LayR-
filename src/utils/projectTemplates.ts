// Starter-project seed data for the Start screen's "Start from a template"
// option. Deliberately built by calling the same store actions a user
// clicking through the UI would (addTrack/addDefaultPatternClip/
// addDefaultMidiClip) rather than hand-constructing raw Project objects —
// that guarantees a template track looks exactly like one a user just
// created (default kit, default synth preset, auto color) with no risk of
// drifting from those factories over time.
import { createEmptyProject, useProjectStore } from '../state/projectStore';

export type ProjectTemplate = 'beat' | 'podcast' | 'band';

const TEMPLATE_NAMES: Record<ProjectTemplate, string> = {
  beat: 'Beat',
  podcast: 'Podcast',
  band: 'Band Session',
};

export function applyProjectTemplate(template: ProjectTemplate): void {
  const store = useProjectStore.getState();
  store.loadProject(createEmptyProject(TEMPLATE_NAMES[template]));

  switch (template) {
    case 'beat': {
      const trackId = store.addTrack('drum');
      store.addDefaultPatternClip(trackId);
      break;
    }
    case 'podcast': {
      store.addTrack('audio', 'Vocal');
      break;
    }
    case 'band': {
      const drumId = store.addTrack('drum');
      store.addDefaultPatternClip(drumId);
      const bassId = store.addTrack('synth', 'Bass');
      store.addDefaultMidiClip(bassId);
      const keysId = store.addTrack('synth', 'Keys');
      store.addDefaultMidiClip(keysId);
      store.addTrack('audio', 'Vocal');
      break;
    }
  }
}
