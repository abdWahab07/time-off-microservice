import { UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

function mockContext(headers) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: headers || {} }),
    }),
  };
}

describe('ApiKeyGuard', () => {
  it('allows all requests when API_KEY is unset', () => {
    const guard = new ApiKeyGuard({ get: () => undefined });
    expect(guard.canActivate(mockContext({}))).toBe(true);
  });

  it('allows all requests when API_KEY is blank', () => {
    const guard = new ApiKeyGuard({ get: () => '   ' });
    expect(guard.canActivate(mockContext({}))).toBe(true);
  });

  it('rejects when API_KEY is set but no credential', () => {
    const guard = new ApiKeyGuard({ get: () => 'secret' });
    expect(() => guard.canActivate(mockContext({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('accepts Authorization Bearer', () => {
    const guard = new ApiKeyGuard({ get: () => 'secret' });
    expect(
      guard.canActivate(
        mockContext({ authorization: 'Bearer secret' }),
      ),
    ).toBe(true);
  });

  it('accepts X-Api-Key', () => {
    const guard = new ApiKeyGuard({ get: () => 'secret' });
    expect(guard.canActivate(mockContext({ 'x-api-key': 'secret' }))).toBe(
      true,
    );
  });

  it('rejects wrong bearer token', () => {
    const guard = new ApiKeyGuard({ get: () => 'secret' });
    expect(() =>
      guard.canActivate(
        mockContext({ authorization: 'Bearer wrong' }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('extractBearer parses token', () => {
    const guard = new ApiKeyGuard({ get: () => '' });
    expect(guard.extractBearer('Bearer abc')).toBe('abc');
    expect(guard.extractBearer('bearer abc')).toBe('abc');
    expect(guard.extractBearer('Basic x')).toBe(null);
    expect(guard.extractBearer(undefined)).toBe(null);
  });
});
