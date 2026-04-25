import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as jose from 'jose';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/configure-app';
import { MockHcmService } from '../src/hcm/services/mock-hcm.service';

const API_KEY = 'jwt-e2e-service-key';
const JWT_ISSUER = 'https://time-off-test-issuer';
const JWT_SECRET = 'unit-test-hs256-secret-min-32-chars!!';

async function mintAccessToken(subject, roles = []) {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return new jose.SignJWT({ roles })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(subject)
    .setIssuer(JWT_ISSUER)
    .setExpirationTime('2h')
    .sign(secret);
}

describe('JWT + API key (e2e)', () => {
  let app;
  let mockHcm;

  beforeAll(() => {
    process.env.API_KEY = API_KEY;
    process.env.JWT_ISSUER = JWT_ISSUER;
    process.env.JWT_SECRET = JWT_SECRET;
  });

  afterAll(() => {
    delete process.env.API_KEY;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_SECRET;
  });

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureHttpApp(app);
    await app.init();
    mockHcm = app.get(MockHcmService);
    mockHcm.resetForTests();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects create when employeeId does not match JWT subject', async () => {
    const token = await mintAccessToken('emp_real', ['employee']);
    const systemToken = await mintAccessToken('svc_sync', ['system']);
    await request(app.getHttpServer())
      .post('/mock-hcm/balances')
      .set('X-Api-Key', API_KEY)
      .set('Authorization', `Bearer ${systemToken}`)
      .send({ employeeId: 'emp_other', locationId: 'loc_pk', availableDays: 10 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/time-off-requests')
      .set('X-Api-Key', API_KEY)
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId: 'emp_other',
        locationId: 'loc_pk',
        startDate: '2026-05-01',
        endDate: '2026-05-02',
        requestedDays: 1,
      })
      .expect(403);
  });

  it('rejects list without employeeId or managerId when JWT is on', async () => {
    const token = await mintAccessToken('emp_real', ['employee']);
    await request(app.getHttpServer())
      .get('/time-off-requests')
      .set('X-Api-Key', API_KEY)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('allows create when employeeId matches JWT subject', async () => {
    const token = await mintAccessToken('emp_real', ['employee']);
    const systemToken = await mintAccessToken('svc_sync', ['system']);
    await request(app.getHttpServer())
      .post('/mock-hcm/balances')
      .set('X-Api-Key', API_KEY)
      .set('Authorization', `Bearer ${systemToken}`)
      .send({ employeeId: 'emp_real', locationId: 'loc_pk', availableDays: 10 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set('X-Api-Key', API_KEY)
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId: 'emp_real',
        locationId: 'loc_pk',
        startDate: '2026-05-01',
        endDate: '2026-05-02',
        requestedDays: 1,
      })
      .expect(201);

    expect(res.body.status).toBe('PENDING');
  });
});
