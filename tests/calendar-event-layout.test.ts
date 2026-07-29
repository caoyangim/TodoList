import { describe, expect, it } from "vitest";

import {
  assignDateRangeRows,
  assignTimedRangeLanes,
} from "../src/features/calendar/calendar-event-layout";

describe("calendar event layout", () => {
  it("puts overlapping date ranges on separate rows, including ranges clipped by the view", () => {
    const rows = assignDateRangeRows([
      { id: "before", start: "2026-06-25", end: "2026-07-03" },
      { id: "inside", start: "2026-07-02", end: "2026-07-04" },
      { id: "after", start: "2026-07-04", end: "2026-08-10" },
    ], "2026-07-01", "2026-07-31");

    expect(rows.get("before")).toBe(0);
    expect(rows.get("inside")).toBe(1);
    expect(rows.get("after")).toBe(0);
  });

  it("reuses a row when date ranges do not share a day", () => {
    const rows = assignDateRangeRows([
      { id: "first", start: "2026-07-01", end: "2026-07-02" },
      { id: "second", start: "2026-07-03", end: "2026-07-04" },
    ], "2026-07-01", "2026-07-31");

    expect(rows.get("first")).toBe(rows.get("second"));
  });

  it("puts overlapping timed events in separate lanes and resets after the overlap group", () => {
    const layouts = assignTimedRangeLanes([
      { id: "first", start: 9 * 60, end: 11 * 60 },
      { id: "overlap", start: 10 * 60, end: 12 * 60 },
      { id: "later", start: 13 * 60, end: 14 * 60 },
    ]);

    expect(layouts.get("first")).toEqual({ lane: 0, laneCount: 2 });
    expect(layouts.get("overlap")).toEqual({ lane: 1, laneCount: 2 });
    expect(layouts.get("later")).toEqual({ lane: 0, laneCount: 1 });
  });
});
