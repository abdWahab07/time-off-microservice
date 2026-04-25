import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import {
  CancelActorGuard,
  TimeOffByIdReadGuard,
  TimeOffListQueryGuard,
} from './time-off-access.guards';

/** @param {Record<string, unknown>} req */
function httpCtx(req) {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  };
}

/** @param {Record<string, string | undefined>} env */
function configFromEnv(env) {
  return {
    get: (key) => env[key],
  };
}

describe('TimeOffListQueryGuard', () => {
  const jwtOff = configFromEnv({});
  const jwtOn = configFromEnv({
    JWT_ISSUER: 'https://issuer',
    JWT_SECRET: 'secret-min-32-chars-for-tests!!!!',
  });

  it('returns true when JWT auth is disabled', () => {
    const guard = new TimeOffListQueryGuard(jwtOff);
    expect(
      guard.canActivate(httpCtx({ query: {}, jwtPayload: {} })),
    ).toBe(true);
  });

  it('returns true for admin role', () => {
    const guard = new TimeOffListQueryGuard(jwtOn);
    expect(
      guard.canActivate(
        httpCtx({
          query: {},
          jwtPayload: { sub: 'u1', roles: ['admin'] },
        }),
      ),
    ).toBe(true);
  });

  it('returns true for system role', () => {
    const guard = new TimeOffListQueryGuard(jwtOn);
    expect(
      guard.canActivate(
        httpCtx({
          query: {},
          jwtPayload: { sub: 'svc', roles: ['system'] },
        }),
      ),
    ).toBe(true);
  });

  it('throws when subject is missing', () => {
    const guard = new TimeOffListQueryGuard(jwtOn);
    expect(() =>
      guard.canActivate(
        httpCtx({ query: { employeeId: 'e1' }, jwtPayload: { roles: [] } }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('throws when neither employeeId nor managerId is provided', () => {
    const guard = new TimeOffListQueryGuard(jwtOn);
    expect(() =>
      guard.canActivate(
        httpCtx({ query: {}, jwtPayload: { sub: 'u1', roles: ['employee'] } }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('throws when employeeId does not match subject', () => {
    const guard = new TimeOffListQueryGuard(jwtOn);
    expect(() =>
      guard.canActivate(
        httpCtx({
          query: { employeeId: 'other' },
          jwtPayload: { sub: 'u1', roles: ['employee'] },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('throws when managerId does not match subject', () => {
    const guard = new TimeOffListQueryGuard(jwtOn);
    expect(() =>
      guard.canActivate(
        httpCtx({
          query: { managerId: 'other' },
          jwtPayload: { sub: 'mgr1', roles: ['manager'] },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('returns true when employeeId matches subject', () => {
    const guard = new TimeOffListQueryGuard(jwtOn);
    expect(
      guard.canActivate(
        httpCtx({
          query: { employeeId: 'emp_a' },
          jwtPayload: { sub: 'emp_a', roles: ['employee'] },
        }),
      ),
    ).toBe(true);
  });

  it('returns true when managerId matches subject', () => {
    const guard = new TimeOffListQueryGuard(jwtOn);
    expect(
      guard.canActivate(
        httpCtx({
          query: { managerId: 'mgr_x' },
          jwtPayload: { sub: 'mgr_x', roles: ['manager'] },
        }),
      ),
    ).toBe(true);
  });

  it('accepts roles as comma-separated string for bypass', () => {
    const guard = new TimeOffListQueryGuard(jwtOn);
    expect(
      guard.canActivate(
        httpCtx({
          query: {},
          jwtPayload: { sub: 'a', roles: 'Admin, analyst' },
        }),
      ),
    ).toBe(true);
  });
});

describe('TimeOffByIdReadGuard', () => {
  const jwtOff = configFromEnv({});
  const jwtOn = configFromEnv({
    JWT_ISSUER: 'https://issuer',
    JWT_SECRET: 'secret-min-32-chars-for-tests!!!!',
  });

  it('returns true when JWT is disabled', () => {
    const repo = { findById: jest.fn() };
    const guard = new TimeOffByIdReadGuard(jwtOff, repo);
    expect(guard.canActivate(httpCtx({ params: { id: 'r1' } }))).toBe(true);
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it('returns true for admin without loading row', () => {
    const repo = { findById: jest.fn() };
    const guard = new TimeOffByIdReadGuard(jwtOn, repo);
    expect(
      guard.canActivate(
        httpCtx({
          params: { id: 'r1' },
          jwtPayload: { sub: 'x', roles: ['admin'] },
        }),
      ),
    ).toBe(true);
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it('throws when subject missing', () => {
    const guard = new TimeOffByIdReadGuard(jwtOn, { findById: jest.fn() });
    expect(() =>
      guard.canActivate(
        httpCtx({
          params: { id: 'r1' },
          jwtPayload: { roles: ['employee'] },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('returns false when id is not a string', () => {
    const guard = new TimeOffByIdReadGuard(jwtOn, { findById: jest.fn() });
    expect(
      guard.canActivate(
        httpCtx({
          params: { id: 123 },
          jwtPayload: { sub: 'e1', roles: ['employee'] },
        }),
      ),
    ).toBe(false);
  });

  it('returns true when request row is missing (controller returns 404)', () => {
    const repo = { findById: jest.fn().mockReturnValue(null) };
    const guard = new TimeOffByIdReadGuard(jwtOn, repo);
    expect(
      guard.canActivate(
        httpCtx({
          params: { id: 'missing' },
          jwtPayload: { sub: 'e1', roles: ['employee'] },
        }),
      ),
    ).toBe(true);
  });

  it('returns true when subject is the employee on the row', () => {
    const repo = {
      findById: jest.fn().mockReturnValue({
        id: 'r1',
        employeeId: 'e1',
        managerId: null,
      }),
    };
    const guard = new TimeOffByIdReadGuard(jwtOn, repo);
    expect(
      guard.canActivate(
        httpCtx({
          params: { id: 'r1' },
          jwtPayload: { sub: 'e1', roles: ['employee'] },
        }),
      ),
    ).toBe(true);
  });

  it('returns true when subject is the assigned manager', () => {
    const repo = {
      findById: jest.fn().mockReturnValue({
        id: 'r1',
        employeeId: 'e1',
        managerId: 'm1',
      }),
    };
    const guard = new TimeOffByIdReadGuard(jwtOn, repo);
    expect(
      guard.canActivate(
        httpCtx({
          params: { id: 'r1' },
          jwtPayload: { sub: 'm1', roles: ['manager'] },
        }),
      ),
    ).toBe(true);
  });

  it('throws when subject is neither employee nor manager', () => {
    const repo = {
      findById: jest.fn().mockReturnValue({
        id: 'r1',
        employeeId: 'e1',
        managerId: 'm1',
      }),
    };
    const guard = new TimeOffByIdReadGuard(jwtOn, repo);
    expect(() =>
      guard.canActivate(
        httpCtx({
          params: { id: 'r1' },
          jwtPayload: { sub: 'stranger', roles: ['employee'] },
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});

describe('CancelActorGuard', () => {
  const jwtOff = configFromEnv({});
  const jwtOn = configFromEnv({
    JWT_ISSUER: 'https://issuer',
    JWT_SECRET: 'secret-min-32-chars-for-tests!!!!',
  });

  it('returns true when JWT is disabled', () => {
    const repo = { findById: jest.fn() };
    const guard = new CancelActorGuard(jwtOff, repo);
    expect(
      guard.canActivate(
        httpCtx({ params: { id: 'r1' }, body: { cancelledBy: 'any' } }),
      ),
    ).toBe(true);
  });

  it('returns true for system role', () => {
    const repo = { findById: jest.fn() };
    const guard = new CancelActorGuard(jwtOn, repo);
    expect(
      guard.canActivate(
        httpCtx({
          params: { id: 'r1' },
          body: { cancelledBy: 'x' },
          jwtPayload: { sub: 'x', roles: ['system'] },
        }),
      ),
    ).toBe(true);
  });

  it('throws when cancelledBy does not match subject', () => {
    const guard = new CancelActorGuard(jwtOn, { findById: jest.fn() });
    expect(() =>
      guard.canActivate(
        httpCtx({
          params: { id: 'r1' },
          body: { cancelledBy: 'other' },
          jwtPayload: { sub: 'e1', roles: ['employee'] },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('throws when cancelledBy is not a string', () => {
    const guard = new CancelActorGuard(jwtOn, { findById: jest.fn() });
    expect(() =>
      guard.canActivate(
        httpCtx({
          params: { id: 'r1' },
          body: { cancelledBy: 99 },
          jwtPayload: { sub: 'e1', roles: ['employee'] },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('returns false when id is not a string', () => {
    const guard = new CancelActorGuard(jwtOn, { findById: jest.fn() });
    expect(
      guard.canActivate(
        httpCtx({
          params: { id: null },
          body: { cancelledBy: 'e1' },
          jwtPayload: { sub: 'e1', roles: ['employee'] },
        }),
      ),
    ).toBe(false);
  });

  it('returns true when row missing', () => {
    const repo = { findById: jest.fn().mockReturnValue(null) };
    const guard = new CancelActorGuard(jwtOn, repo);
    expect(
      guard.canActivate(
        httpCtx({
          params: { id: 'r1' },
          body: { cancelledBy: 'e1' },
          jwtPayload: { sub: 'e1', roles: ['employee'] },
        }),
      ),
    ).toBe(true);
  });

  it('returns true when cancelledBy is employee on row', () => {
    const repo = {
      findById: jest.fn().mockReturnValue({
        employeeId: 'e1',
        managerId: null,
      }),
    };
    const guard = new CancelActorGuard(jwtOn, repo);
    expect(
      guard.canActivate(
        httpCtx({
          params: { id: 'r1' },
          body: { cancelledBy: 'e1' },
          jwtPayload: { sub: 'e1', roles: ['employee'] },
        }),
      ),
    ).toBe(true);
  });

  it('returns true when cancelledBy is manager on row', () => {
    const repo = {
      findById: jest.fn().mockReturnValue({
        employeeId: 'e1',
        managerId: 'm1',
      }),
    };
    const guard = new CancelActorGuard(jwtOn, repo);
    expect(
      guard.canActivate(
        httpCtx({
          params: { id: 'r1' },
          body: { cancelledBy: 'm1' },
          jwtPayload: { sub: 'm1', roles: ['manager'] },
        }),
      ),
    ).toBe(true);
  });

  it('throws when subject matches cancelledBy but is not employee or manager', () => {
    const repo = {
      findById: jest.fn().mockReturnValue({
        employeeId: 'e1',
        managerId: 'm1',
      }),
    };
    const guard = new CancelActorGuard(jwtOn, repo);
    expect(() =>
      guard.canActivate(
        httpCtx({
          params: { id: 'r1' },
          body: { cancelledBy: 'intruder' },
          jwtPayload: { sub: 'intruder', roles: ['employee'] },
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
