const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDate(value, fieldName) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) {
    throw new Error(`${fieldName} must be YYYY-MM-DD`);
  }
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${fieldName} is not a valid date`);
  }
}

export function assertDateOrder(startDate, endDate) {
  const s = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const e = new Date(`${endDate}T00:00:00.000Z`).getTime();
  if (e < s) {
    throw new Error('endDate must be on or after startDate');
  }
}

/**
 * Ranges overlap if not (endA < startB || endB < startA) for inclusive ranges.
 */
export function dateRangesOverlap(aStart, aEnd, bStart, bEnd) {
  const as = new Date(`${aStart}T00:00:00.000Z`).getTime();
  const ae = new Date(`${aEnd}T00:00:00.000Z`).getTime();
  const bs = new Date(`${bStart}T00:00:00.000Z`).getTime();
  const be = new Date(`${bEnd}T00:00:00.000Z`).getTime();
  return !(ae < bs || be < as);
}
