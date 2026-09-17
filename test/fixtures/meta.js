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

// Facts about the committed FAI Connect captures, taken 2026-09-17 from the live
// Analyticom COMET API. Update ONLY when re-capturing — and rebuild fai-capture.json
// in the same commit, since it is derived from the other five.
export const FAI_CLUB_ID = 10671;
export const FAI_TEAM_COUNT = 25;          // includes stale/legacy squads
export const FAI_ACTIVE_TEAM_COUNT = 2;    // 61270 Juniors, 87946 Reserves
export const FAI_JUNIORS_TEAM_ID = 61270;
export const FAI_RESERVES_TEAM_ID = 87946;
export const FAI_JUNIORS_FUTURE_COUNT = 5;
export const FAI_JUNIORS_PAST_COUNT = 9;   // reaches back to 2024-09-22
export const FAI_RESERVES_FUTURE_COUNT = 3;

// Of the 9 past matches, only these 2 fall on or after 2026-08-01.
export const FAI_JUNIORS_PAST_IN_SEASON = 2;
