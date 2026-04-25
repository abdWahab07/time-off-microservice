/**
 * Standalone deployable mock HCM (same behavior as MockHcmService, same URL shape as Nest /mock-hcm/*).
 *
 * Run from repo root:
 *   npm run mock-hcm:serve
 *
 * Env:
 *   MOCK_HCM_PORT (default 4010)
 *   MOCK_HCM_API_KEY — if set, require matching X-Api-Key on every request
 */
require('reflect-metadata');
require('@swc-node/register');

const http = require('http');
const { URL } = require('url');
const { MockHcmService } = require('../src/hcm/services/mock-hcm.service.js');
const {
  HcmClientException,
  statusForHcmClientException,
} = require('../src/hcm/hcm-error.mapper.js');

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendError(res, err) {
  if (err instanceof HcmClientException) {
    const status = statusForHcmClientException(err);
    sendJson(res, status, {
      error: {
        code: err.code,
        message: err.message,
        details: err.details ?? null,
      },
    });
    return;
  }
  sendJson(res, 500, {
    error: { code: 'UNKNOWN', message: String(err?.message || err), details: null },
  });
}

/**
 * @param {{ apiKey?: string }} [opts]
 */
function createApp(opts = {}) {
  const svc = new MockHcmService();
  const apiKey = (opts.apiKey ?? process.env.MOCK_HCM_API_KEY ?? '').trim();

  return async (req, res) => {
    if (apiKey) {
      const got = String(req.headers['x-api-key'] || '').trim();
      if (got !== apiKey) {
        sendJson(res, 401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid or missing X-Api-Key for mock HCM.',
            details: null,
          },
        });
        return;
      }
    }

    let url;
    try {
      url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    } catch {
      sendJson(res, 400, { error: { code: 'BAD_REQUEST', message: 'Bad URL' } });
      return;
    }

    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      if (req.method === 'GET' && path === '/health') {
        sendJson(res, 200, { status: 'ok', service: 'mock-hcm-server' });
        return;
      }

      const balMatch = path.match(/^\/mock-hcm\/balances\/([^/]+)\/([^/]+)$/);
      if (req.method === 'GET' && balMatch) {
        const out = svc.getBalance(balMatch[1], balMatch[2]);
        sendJson(res, 200, out);
        return;
      }

      if (req.method === 'POST' && path === '/mock-hcm/balances') {
        const body = await readBody(req);
        const out = svc.seedBalance(body);
        sendJson(res, 201, out);
        return;
      }

      if (req.method === 'POST' && path === '/mock-hcm/time-off') {
        const body = await readBody(req);
        const out = svc.fileTimeOff(body);
        sendJson(res, 200, out);
        return;
      }

      const cancelMatch = path.match(/^\/mock-hcm\/time-off\/([^/]+)\/cancel$/);
      if (req.method === 'POST' && cancelMatch) {
        const out = svc.cancelTimeOff(cancelMatch[1]);
        sendJson(res, 200, out);
        return;
      }

      if (req.method === 'POST' && path === '/mock-hcm/failure-mode') {
        const body = await readBody(req);
        const out = svc.setFailureMode(body);
        sendJson(res, 200, out);
        return;
      }

      sendJson(res, 404, {
        error: { code: 'NOT_FOUND', message: `No route ${req.method} ${path}` },
      });
    } catch (e) {
      sendError(res, e);
    }
  };
}

/**
 * @param {{ apiKey?: string; port?: number }} [opts]
 * @returns {Promise<{ port: number; url: string; close: () => Promise<void> }>}
 */
function startMockHcmServer(opts = {}) {
  const handler = createApp({ apiKey: opts.apiKey });
  const server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((e) => sendError(res, e));
  });
  return new Promise((resolve, reject) => {
    const port = opts.port ?? 0;
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      const p = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        port: p,
        url: `http://127.0.0.1:${p}`,
        close: () =>
          new Promise((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
    server.on('error', reject);
  });
}

function main() {
  const port = Number(process.env.MOCK_HCM_PORT || 4010) || 4010;
  const handler = createApp();
  const server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((e) => sendError(res, e));
  });
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        event: 'mock_hcm_server_started',
        port,
        auth: Boolean((process.env.MOCK_HCM_API_KEY || '').trim()),
      }),
    );
  });
}

if (require.main === module) {
  main();
}

module.exports = { createApp, startMockHcmServer };
