// Shared HTML5 drag-and-drop payload type for dragging a Library sample onto
// an audio track in ArrangementView. Kept out of either component file since
// both LibraryPanel (drag source) and ArrangementView (drop target) need it.
export const SAMPLE_DRAG_MIME = 'application/x-daw-sample';

export interface SampleDragPayload {
  ref: string;
  durationSeconds: number;
  name: string;
}
