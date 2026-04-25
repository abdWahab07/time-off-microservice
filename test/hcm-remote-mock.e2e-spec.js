import { Test } from '@nestjs/testing';
import request from 'supertest';

const { startMockHcmServer } = require('../mock-hcm-server/server.cjs');

describe('HCM over HTTP (standalone mock server)', () => {
  let mockSrv;
  let app;

  beforeAll(async () => {
    mockSrv = await startMockHcmServer({
      apiKey: 'remote-mock-hcm-key',
      port: 0,
    });
    process.env.HCM_BASE_URL = mockSrv.url;
    process.env.HCM_API_KEY = 'remote-mock-hcm-key';
    jest.resetModules();
    const { AppModule } = await import('../src/app.module');
    const { configureHttpApp } = await import('../src/configure-app');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureHttpApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (mockSrv) await mockSrv.close();
    delete process.env.HCM_BASE_URL;
    delete process.env.HCM_API_KEY;
    jest.resetModules();
  });

  it('creates a time-off request using balances from the remote mock', async () => {
    const seed = await fetch(
      `${mockSrv.url}/mock-hcm/balances`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': 'remote-mock-hcm-key',
        },
        body: JSON.stringify({
          employeeId: 'emp_remote',
          locationId: 'loc_remote',
          availableDays: 10,
        }),
      },
    );
    expect(seed.status).toBe(201);

    const createRes = await request(app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 'emp_remote',
        locationId: 'loc_remote',
        startDate: '2026-05-01',
        endDate: '2026-05-02',
        requestedDays: 2,
        reason: 'Remote HCM',
        idempotencyKey: 'remote-hcm-1',
      })
      .expect(201);

    expect(createRes.body.status).toBe('PENDING');
    expect(createRes.body.reservedDays).toBe(2);
  });
});
