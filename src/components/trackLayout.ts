// Shared layout constants so TrackRail's track headers and ArrangementView's
// track lanes line up pixel-for-pixel. The two are independent scroll
// containers rendering the same `tracks` array in the same order — any
// drift between their row heights, or the space reserved above row 0,
// reads as a visual misalignment bug (TrackRail has no toolbar/ruler of its
// own, so it must reserve the same header height ArrangementView spends on
// one, or its rows sit higher than the clips they belong to).
export const TRACK_ROW_HEIGHT = 64;
export const ARRANGEMENT_TOOLBAR_HEIGHT = 36;
export const ARRANGEMENT_RULER_HEIGHT = 24; // must match Ruler's h-6 (1.5rem)
export const ARRANGEMENT_HEADER_HEIGHT = ARRANGEMENT_TOOLBAR_HEIGHT + ARRANGEMENT_RULER_HEIGHT;
