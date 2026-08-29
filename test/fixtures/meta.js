// Facts about the committed golden captures. Update ONLY when re-capturing the HTML.
export const FIXTURE_COUNT = 49;
export const TEAM_COUNT = 19;
export const CLUB_ID = "2960";

// A SECOND capture, taken on a day when results had been published. club2960.html
// predates results capture and contains none, and it is deliberately not replaced:
// the window and announce tests anchor on 2026-08-25 against its fixture dates, and a
// newer capture's fixtures start too late for "This weekend" to select anything.
export const RESULTS_FIXTURE_COUNT = 44;
export const RESULT_COUNT = 2;
