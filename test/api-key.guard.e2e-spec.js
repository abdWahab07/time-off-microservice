import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/configure-app';

const API_KEY = 'e2e-api-key-integration';

describe('API key guard (e2e)', () => {
  let app;

  beforeAll(() => {
    process.env.API_KEY = API_KEY;
  });

  afterAll(() => {
    delete process.env.API_KEY;
  });

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureHttpApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health requires API key when API_KEY is set', async () => {
    await request(app.getHttpServer()).get('/health').expect(401);
    await request(app.getHttpServer())
      .get('/health')
      .set('X-Api-Key', API_KEY)
      .expect(200);
  });

  it('returns 401 for POST /mock-hcm/balances without key', async () => {
    await request(app.getHttpServer())
      .post('/mock-hcm/balances')
      .send({ employeeId: 'e', locationId: 'l', availableDays: 1 })
      .expect(401)
      .expect((res) => {
        expect(res.body.error.code).toBe('UNAUTHORIZED');
      });
  });

  it('allows POST /mock-hcm/balances with Authorization Bearer', async () => {
    await request(app.getHttpServer())
      .post('/mock-hcm/balances')
      .set('Authorization', `Bearer ${API_KEY}`)
      .send({ employeeId: 'e1', locationId: 'l1', availableDays: 5 })
      .expect(201);
  });

  it('allows batch sync with X-Api-Key', async () => {
    await request(app.getHttpServer())
      .post('/sync/hcm/balances')
      .set('X-Api-Key', API_KEY)
      .send({
        snapshotAt: '2026-04-24T12:00:00.000Z',
        balances: [
          { employeeId: 'sync_e', locationId: 'sync_l', availableDays: 3 },
        ],
      })
      .expect(201);
  });

  it('returns 401 for POST /time-off-requests without key when API_KEY set', async () => {
    await request(app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 'x',
        locationId: 'y',
        startDate: '2026-07-01',
        endDate: '2026-07-02',
        requestedDays: 1,
      })
      .expect(401);
  });
});
