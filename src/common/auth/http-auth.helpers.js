/**
 * @param {import('@nestjs/config').ConfigService} config
 */
function trimConfig(config, key) {
  const v = config.get(key);
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

/**
 * JWT access control is active when issuer is set and a verifier is configured.
 * @param {import('@nestjs/config').ConfigService} config
 */
function jwtAuthEnabled(config) {
  const issuer = trimConfig(config, 'JWT_ISSUER');
  if (!issuer) return false;
  const secret = trimConfig(config, 'JWT_SECRET');
  const jwks = trimConfig(config, 'JWT_JWKS_URI');
  return Boolean(secret || jwks);
}

/**
 * @param {string | undefined} authorization
 * @returns {string | null}
 */
function extractBearer(authorization) {
  if (!authorization || typeof authorization !== 'string') {
    return null;
  }
  const m = authorization.match(/^\s*Bearer\s+(\S+)\s*$/i);
  return m ? m[1] : null;
}

/**
 * @param {import('@nestjs/config').ConfigService} config
 * @returns {string}
 */
function subjectClaim(config) {
  return trimConfig(config, 'JWT_SUB_CLAIM') || 'sub';
}

/**
 * @param {object} payload
 * @param {import('@nestjs/config').ConfigService} config
 */
function subjectFromPayload(payload, config) {
  const claim = subjectClaim(config);
  const v = payload?.[claim];
  return typeof v === 'string' && v.length ? v : null;
}

/**
 * @param {import('@nestjs/config').ConfigService} config
 * @returns {string}
 */
function rolesClaim(config) {
  return trimConfig(config, 'JWT_ROLES_CLAIM') || 'roles';
}

/**
 * @param {object} payload
 * @param {import('@nestjs/config').ConfigService} config
 * @returns {string[]}
 */
function rolesFromPayload(payload, config) {
  const claim = rolesClaim(config);
  const raw = payload?.[claim];
  if (Array.isArray(raw)) {
    return raw
      .map((v) => String(v || '').trim().toLowerCase())
      .filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[,\s]+/)
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

export {
  extractBearer,
  jwtAuthEnabled,
  rolesClaim,
  rolesFromPayload,
  subjectClaim,
  subjectFromPayload,
  trimConfig,
};
