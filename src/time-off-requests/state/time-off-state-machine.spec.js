import { canTransition, RequestStatus } from './time-off-state-machine';

describe('time-off-state-machine', () => {
  it('allows PENDING -> APPROVED', () => {
    expect(canTransition(RequestStatus.PENDING, RequestStatus.APPROVED)).toBe(
      true,
    );
  });

  it('disallows REJECTED -> APPROVED', () => {
    expect(canTransition(RequestStatus.REJECTED, RequestStatus.APPROVED)).toBe(
      false,
    );
  });

  it('allows NEEDS_REVIEW -> REJECTED', () => {
    expect(canTransition(RequestStatus.NEEDS_REVIEW, RequestStatus.REJECTED)).toBe(
      true,
    );
  });
});
