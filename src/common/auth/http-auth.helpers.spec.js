import { extractBearer, jwtAuthEnabled } from './http-auth.helpers';

describe('http-auth.helpers', () => {
  it('extractBearer parses bearer token', () => {
    expect(extractBearer('Bearer abc')).toBe('abc');
    expect(extractBearer('bearer abc')).toBe('abc');
    expect(extractBearer('Basic x')).toBe(null);
    expect(extractBearer(undefined)).toBe(null);
  });

  it('jwtAuthEnabled requires issuer and verifier', () => {
    expect(jwtAuthEnabled({ get: () => undefined })).toBe(false);
    expect(
      jwtAuthEnabled({
        get: (k) =>
          ({ JWT_ISSUER: 'https://iss', JWT_SECRET: 's' }[k]),
      }),
    ).toBe(true);
    expect(
      jwtAuthEnabled({
        get: (k) =>
          ({ JWT_ISSUER: 'https://iss', JWT_JWKS_URI: 'https://iss/jwks' }[
            k
          ]),
      }),
    ).toBe(true);
    expect(
      jwtAuthEnabled({
        get: (k) => ({ JWT_ISSUER: 'https://iss' }[k]),
      }),
    ).toBe(false);
  });
});
