export interface DateRangeItem {
  id: string;
  start: string;
  end: string;
}

export interface TimedRangeItem {
  id: string;
  start: number;
  end: number;
}

/** Assign non-overlapping rows after clipping each date range to the visible range. */
export function assignDateRangeRows(
  items: DateRangeItem[],
  visibleStart: string,
  visibleEnd: string,
): Map<string, number> {
  const visibleItems = items
    .filter((item) => item.start <= visibleEnd && item.end >= visibleStart)
    .map((item) => ({
      ...item,
      clippedStart: item.start < visibleStart ? visibleStart : item.start,
      clippedEnd: item.end > visibleEnd ? visibleEnd : item.end,
    }))
    .sort((a, b) =>
      a.clippedStart.localeCompare(b.clippedStart)
      || b.clippedEnd.localeCompare(a.clippedEnd)
      || a.id.localeCompare(b.id),
    );

  const rowMap = new Map<string, number>();
  const rowEnds: string[] = [];

  for (const item of visibleItems) {
    let row = 0;
    while (row < rowEnds.length && rowEnds[row] >= item.clippedStart) row++;
    rowMap.set(item.id, row);
    rowEnds[row] = item.clippedEnd;
  }

  return rowMap;
}

export interface TimedRangeLayout {
  lane: number;
  laneCount: number;
}

/** Assign side-by-side lanes to time ranges in each connected overlap group. */
export function assignTimedRangeLanes(items: TimedRangeItem[]): Map<string, TimedRangeLayout> {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
  const result = new Map<string, TimedRangeLayout>();

  let cluster: Array<TimedRangeItem & { lane: number }> = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];

  const finishCluster = () => {
    if (cluster.length === 0) return;
    const laneCount = Math.max(...cluster.map((item) => item.lane)) + 1;
    for (const item of cluster) result.set(item.id, { lane: item.lane, laneCount });
    cluster = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    if (cluster.length > 0 && item.start >= clusterEnd) finishCluster();

    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] > item.start) lane++;
    laneEnds[lane] = item.end;
    cluster.push({ ...item, lane });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  finishCluster();

  return result;
}
