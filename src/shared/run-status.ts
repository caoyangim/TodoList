import { RunStatus } from "./types/models";

export function calculateRunStatus(
  startedAt: Date | string | null,
  completedAt: Date | string | null,
): RunStatus {
  if (completedAt) return "COMPLETED";
  if (startedAt) return "IN_PROGRESS";
  return "NOT_STARTED";
}
