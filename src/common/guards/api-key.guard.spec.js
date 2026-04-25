import { UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

function mockContext(headers) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: headers || {} }),
    }),
  };
}

/** Avoid returning the same value for JWT_* keys (would enable jwtAuthEnabled). */
function apiKeyOnlyConfig(apiKey) {
  return {
    get: (k) => (k === 'API_KEY' ? apiKey : undefined),
  };
}

describe('ApiKeyGuard', () => {
  it('allows all requests when API_KEY is unset', () => {
    const guard = new ApiKeyGuard({ get: () => undefined });
    expect(guard.canActivate(mockContext({}))).toBe(true);
  });

  it('allows all requests when API_KEY is blank', () => {
    const guard = new ApiKeyGuard(apiKeyOnlyConfig('   '));
    expect(guard.canActivate(mockContext({}))).toBe(true);
  });

  it('rejects when API_KEY is set but no credential', () => {
    const guard = new ApiKeyGuard(apiKeyOnlyConfig('secret'));
    expect(() => guard.canActivate(mockContext({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('accepts Authorization Bearer', () => {
    const guard = new ApiKeyGuard(apiKeyOnlyConfig('secret'));
    expect(
      guard.canActivate(
        mockContext({ authorization: 'Bearer secret' }),
      ),
    ).toBe(true);
  });

  it('accepts X-Api-Key', () => {
    const guard = new ApiKeyGuard(apiKeyOnlyConfig('secret'));
    expect(guard.canActivate(mockContext({ 'x-api-key': 'secret' }))).toBe(
      true,
    );
  });

  it('rejects wrong bearer token', () => {
    const guard = new ApiKeyGuard(apiKeyOnlyConfig('secret'));
    expect(() =>
      guard.canActivate(
        mockContext({ authorization: 'Bearer wrong' }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('when JWT auth enabled, rejects Bearer API key without X-Api-Key', () => {
    const guard = new ApiKeyGuard({
      get: (k) =>
        ({
          API_KEY: 'secret',
          JWT_ISSUER: 'https://iss',
          JWT_SECRET: 'jwtsecret',
        }[k]),
    });
    expect(() =>
      guard.canActivate(
        mockContext({ authorization: 'Bearer secret' }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('when JWT auth enabled, accepts X-Api-Key', () => {
    const guard = new ApiKeyGuard({
      get: (k) =>
        ({
          API_KEY: 'secret',
          JWT_ISSUER: 'https://iss',
          JWT_SECRET: 'jwtsecret',
        }[k]),
    });
    expect(
      guard.canActivate(mockContext({ 'x-api-key': 'secret' })),
    ).toBe(true);
  });
});
