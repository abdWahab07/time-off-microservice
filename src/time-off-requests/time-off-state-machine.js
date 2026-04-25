export const RequestStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  HCM_REJECTED: 'HCM_REJECTED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
};

const ALLOWED = {
  [RequestStatus.PENDING]: new Set([
    RequestStatus.APPROVED,
    RequestStatus.REJECTED,
    RequestStatus.CANCELLED,
    RequestStatus.HCM_REJECTED,
    RequestStatus.NEEDS_REVIEW,
  ]),
  [RequestStatus.NEEDS_REVIEW]: new Set([
    RequestStatus.APPROVED,
    RequestStatus.REJECTED,
    RequestStatus.CANCELLED,
    RequestStatus.HCM_REJECTED,
  ]),
  [RequestStatus.APPROVED]: new Set([RequestStatus.CANCELLED]),
};

export function canTransition(fromStatus, toStatus) {
  const set = ALLOWED[fromStatus];
  return Boolean(set && set.has(toStatus));
}
