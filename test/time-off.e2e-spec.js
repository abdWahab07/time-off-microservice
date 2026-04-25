import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/configure-app';
import { MockHcmService } from '../src/hcm/mock-hcm.service';

describe('Time-Off microservice (e2e)', () => {
  let app;
  let mockHcm;

  beforeEach(async () => {
    delete process.env.API_KEY;
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

  it('GET /health', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
        expect(res.body.service).toBe('time-off-microservice');
      });
  });

  it('creates pending request, reserves balance, approves via HCM', async () => {
    await request(app.getHttpServer())
      .post('/mock-hcm/balances')
      .send({ employeeId: 'emp_123', locationId: 'loc_pk', availableDays: 10 })
      .expect(201);

    const createRes = await request(app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 'emp_123',
        locationId: 'loc_pk',
        startDate: '2026-05-01',
        endDate: '2026-05-02',
        requestedDays: 2,
        reason: 'Family event',
        idempotencyKey: 'key-1',
      })
      .expect(201);

    expect(createRes.body.status).toBe('PENDING');
    expect(createRes.body.reservedDays).toBe(2);

    const bal = await request(app.getHttpServer())
      .get('/balances/emp_123/loc_pk')
      .expect(200);
    expect(bal.body.displayAvailableDays).toBe(8);

    const approveRes = await request(app.getHttpServer())
      .post(`/time-off-requests/${createRes.body.id}/approve`)
      .send({ managerId: 'mgr_1' })
      .expect(201);

    expect(approveRes.body.status).toBe('APPROVED');
    expect(approveRes.body.hcmTransactionId).toMatch(/^hcm_txn_/);

    const hcmBal = await request(app.getHttpServer())
      .get('/mock-hcm/balances/emp_123/loc_pk')
      .expect(200);
    expect(hcmBal.body.availableDays).toBe(8);
  });

  it('returns 409 when balance insufficient on create', async () => {
    await request(app.getHttpServer())
      .post('/mock-hcm/balances')
      .send({ employeeId: 'e1', locationId: 'l1', availableDays: 1 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 'e1',
        locationId: 'l1',
        startDate: '2026-06-01',
        endDate: '2026-06-05',
        requestedDays: 3,
      })
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
      });
  });

  it('returns 503 when HCM is down on create', async () => {
    await request(app.getHttpServer())
      .post('/mock-hcm/failure-mode')
      .send({ enabled: true, mode: 'DOWN' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 'e2',
        locationId: 'l2',
        startDate: '2026-06-01',
        endDate: '2026-06-02',
        requestedDays: 1,
      })
      .expect(503);
  });

  it('idempotent create does not double reserve', async () => {
    await request(app.getHttpServer())
      .post('/mock-hcm/balances')
      .send({ employeeId: 'e3', locationId: 'l3', availableDays: 10 })
      .expect(201);

    const payload = {
      employeeId: 'e3',
      locationId: 'l3',
      startDate: '2026-07-01',
      endDate: '2026-07-02',
      requestedDays: 2,
      idempotencyKey: 'idem-a',
    };
    const first = await request(app.getHttpServer())
      .post('/time-off-requests')
      .send(payload)
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/time-off-requests')
      .send(payload)
      .expect(200);
    expect(second.body.id).toBe(first.body.id);

    const bal = await request(app.getHttpServer())
      .get('/balances/e3/l3')
      .expect(200);
    expect(bal.body.reservedDays).toBe(2);
  });

  it('batch sync marks pending requests NEEDS_REVIEW when reserved exceeds HCM', async () => {
    await request(app.getHttpServer())
      .post('/mock-hcm/balances')
      .send({ employeeId: 'e4', locationId: 'l4', availableDays: 10 })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 'e4',
        locationId: 'l4',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        requestedDays: 6,
      })
      .expect(201);

    const syncRes = await request(app.getHttpServer())
      .post('/sync/hcm/balances')
      .send({
        snapshotAt: '2026-04-24T10:00:00.000Z',
        balances: [{ employeeId: 'e4', locationId: 'l4', availableDays: 4 }],
      })
      .expect(201);

    expect(syncRes.body.requestsMarkedNeedsReview).toBeGreaterThanOrEqual(1);

    const req = await request(app.getHttpServer())
      .get(`/time-off-requests/${created.body.id}`)
      .expect(200);
    expect(req.body.status).toBe('NEEDS_REVIEW');
  });

  it('approve is idempotent on retry', async () => {
    await request(app.getHttpServer())
      .post('/mock-hcm/balances')
      .send({ employeeId: 'e5', locationId: 'l5', availableDays: 5 })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 'e5',
        locationId: 'l5',
        startDate: '2026-09-01',
        endDate: '2026-09-02',
        requestedDays: 2,
      })
      .expect(201);

    const a1 = await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.id}/approve`)
      .send({ managerId: 'mgr' })
      .expect(201);
    const a2 = await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.id}/approve`)
      .send({ managerId: 'mgr' })
      .expect(201);
    expect(a2.body.hcmTransactionId).toBe(a1.body.hcmTransactionId);
  });

  it('reject releases reserved balance', async () => {
    await request(app.getHttpServer())
      .post('/mock-hcm/balances')
      .send({ employeeId: 'e6', locationId: 'l6', availableDays: 5 })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 'e6',
        locationId: 'l6',
        startDate: '2026-10-01',
        endDate: '2026-10-02',
        requestedDays: 2,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.id}/reject`)
      .send({ managerId: 'mgr', reason: 'No coverage' })
      .expect(201);

    const bal = await request(app.getHttpServer())
      .get('/balances/e6/l6')
      .expect(200);
    expect(bal.body.reservedDays).toBe(0);
    expect(bal.body.displayAvailableDays).toBe(5);
  });

  it('GET balance with refresh=true pulls HCM snapshot', async () => {
    await request(app.getHttpServer())
      .post('/mock-hcm/balances')
      .send({ employeeId: 'e7', locationId: 'l7', availableDays: 12 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/balances/e7/l7?refresh=true')
      .expect(200);
    expect(res.body.hcmAvailableDays).toBe(12);
    expect(res.body.isStale).toBe(false);
  });

  it('returns 422 for unknown employee on create', async () => {
    await request(app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 'unknown',
        locationId: 'loc',
        startDate: '2026-06-01',
        endDate: '2026-06-02',
        requestedDays: 1,
      })
      .expect(422);
  });

  it('cancels pending request and releases reservation', async () => {
    await request(app.getHttpServer())
      .post('/mock-hcm/balances')
      .send({ employeeId: 'e8', locationId: 'l8', availableDays: 8 })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 'e8',
        locationId: 'l8',
        startDate: '2026-11-01',
        endDate: '2026-11-03',
        requestedDays: 2,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.id}/cancel`)
      .send({ cancelledBy: 'emp_8', reason: 'Plans changed' })
      .expect(201);

    const bal = await request(app.getHttpServer())
      .get('/balances/e8/l8')
      .expect(200);
    expect(bal.body.reservedDays).toBe(0);
    expect(bal.body.displayAvailableDays).toBe(8);

    const row = await request(app.getHttpServer())
      .get(`/time-off-requests/${created.body.id}`)
      .expect(200);
    expect(row.body.status).toBe('CANCELLED');
  });

  it('cancel while pending is idempotent', async () => {
    await request(app.getHttpServer())
      .post('/mock-hcm/balances')
      .send({ employeeId: 'e9', locationId: 'l9', availableDays: 4 })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 'e9',
        locationId: 'l9',
        startDate: '2026-12-01',
        endDate: '2026-12-02',
        requestedDays: 1,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.id}/cancel`)
      .send({ cancelledBy: 'emp_9' })
      .expect(201);

    const again = await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.id}/cancel`)
      .send({ cancelledBy: 'emp_9' })
      .expect(201);
    expect(again.body.status).toBe('CANCELLED');
  });

  it('cancels approved request and restores HCM balance', async () => {
    await request(app.getHttpServer())
      .post('/mock-hcm/balances')
      .send({ employeeId: 'e10', locationId: 'l10', availableDays: 10 })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 'e10',
        locationId: 'l10',
        startDate: '2027-01-10',
        endDate: '2027-01-12',
        requestedDays: 2,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.id}/approve`)
      .send({ managerId: 'mgr_10' })
      .expect(201);

    let hcm = await request(app.getHttpServer())
      .get('/mock-hcm/balances/e10/l10')
      .expect(200);
    expect(hcm.body.availableDays).toBe(8);

    await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.id}/cancel`)
      .send({ cancelledBy: 'emp_10' })
      .expect(201);

    hcm = await request(app.getHttpServer())
      .get('/mock-hcm/balances/e10/l10')
      .expect(200);
    expect(hcm.body.availableDays).toBe(10);
  });

  it('returns 409 HCM_CANCEL_REJECTED when HCM is down during cancel of approved', async () => {
    await request(app.getHttpServer())
      .post('/mock-hcm/balances')
      .send({ employeeId: 'e11', locationId: 'l11', availableDays: 6 })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 'e11',
        locationId: 'l11',
        startDate: '2027-02-01',
        endDate: '2027-02-02',
        requestedDays: 1,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.id}/approve`)
      .send({ managerId: 'mgr' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/mock-hcm/failure-mode')
      .send({ enabled: true, mode: 'DOWN' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.id}/cancel`)
      .send({ cancelledBy: 'emp' })
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe('HCM_CANCEL_REJECTED');
      });
  });

  it('returns 503 when HCM is down on approve', async () => {
    await request(app.getHttpServer())
      .post('/mock-hcm/balances')
      .send({ employeeId: 'e12', locationId: 'l12', availableDays: 5 })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 'e12',
        locationId: 'l12',
        startDate: '2027-03-01',
        endDate: '2027-03-02',
        requestedDays: 1,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/mock-hcm/failure-mode')
      .send({ enabled: true, mode: 'DOWN' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.id}/approve`)
      .send({ managerId: 'mgr' })
      .expect(503)
      .expect((res) => {
        expect(res.body.error.code).toBe('HCM_UNAVAILABLE');
      });
  });

  it('returns 409 when cancelling rejected request', async () => {
    await request(app.getHttpServer())
      .post('/mock-hcm/balances')
      .send({ employeeId: 'e13', locationId: 'l13', availableDays: 5 })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 'e13',
        locationId: 'l13',
        startDate: '2027-04-01',
        endDate: '2027-04-02',
        requestedDays: 1,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.id}/reject`)
      .send({ managerId: 'mgr' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.id}/cancel`)
      .send({ cancelledBy: 'emp' })
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
      });
  });
});
