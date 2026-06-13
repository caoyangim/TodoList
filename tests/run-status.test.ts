import { describe, expect, it } from "vitest";
import { calculateRunStatus } from "@/shared/run-status";

describe("calculateRunStatus", () => {
  it("returns NOT_STARTED without timestamps", () => {
    expect(calculateRunStatus(null, null)).toBe("NOT_STARTED");
  });

  it("returns IN_PROGRESS after starting", () => {
    expect(calculateRunStatus("2026-06-13T00:00:00.000Z", null)).toBe("IN_PROGRESS");
  });

  it("returns COMPLETED when completed", () => {
    expect(
      calculateRunStatus("2026-06-13T00:00:00.000Z", "2026-06-13T01:00:00.000Z"),
    ).toBe("COMPLETED");
  });
});
