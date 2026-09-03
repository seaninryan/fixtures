import { describe, it, expect } from "vitest";
import { clubNow, CLUB_TZ } from "../src/lib/clock.js";

// Ireland is UTC+1 (IST) from late March to late October, and UTC+0 (GMT) otherwise.
describe("clubNow", () => {
  it("names the club's timezone", () => {
    expect(CLUB_TZ).toBe("Europe/Dublin");
  });

  it("returns the date and time as strings", () => {
    const now = clubNow(new Date("2026-09-03T10:10:00Z"));
    expect(now).toEqual({ date: "2026-09-03", time: "11:10" });
  });

  // The latent bug this fixes: the site derived `today` from the UTC date, so between
  // Irish midnight and 01:00 in summer the whole site was a day behind.
  it("is already tomorrow in Dublin at 23:30 UTC in summer", () => {
    expect(clubNow(new Date("2026-09-03T23:30:00Z")))
      .toEqual({ date: "2026-09-04", time: "00:30" });
  });

  it("agrees with UTC in winter, when Ireland is on GMT", () => {
    expect(clubNow(new Date("2026-01-15T23:30:00Z")))
      .toEqual({ date: "2026-01-15", time: "23:30" });
  });

  // 25 October 2026 is the Irish DST end: 02:00 IST becomes 01:00 GMT.
  it("handles both sides of the autumn DST boundary", () => {
    expect(clubNow(new Date("2026-10-25T00:30:00Z")).time).toBe("01:30"); // still IST
    expect(clubNow(new Date("2026-10-25T02:30:00Z")).time).toBe("02:30"); // now GMT
  });

  // A "24:00" here would sort above every kick-off and break the pending comparison.
  it("writes midnight as 00:00, never 24:00", () => {
    expect(clubNow(new Date("2026-09-03T23:00:00Z")).time).toBe("00:00");
  });

  it("zero-pads every field, so the strings compare correctly", () => {
    const { date, time } = clubNow(new Date("2026-01-05T09:07:00Z"));
    expect(date).toBe("2026-01-05");
    expect(time).toBe("09:07");
  });

  // Pure: the instant is an argument, so nothing reads a hidden clock.
  it("returns the same answer for the same instant", () => {
    const instant = new Date("2026-09-03T10:10:00Z");
    expect(clubNow(instant)).toEqual(clubNow(instant));
  });
});
