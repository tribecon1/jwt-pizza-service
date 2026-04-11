const request = require('supertest');
const app = require('../src/service');
const {
  configureLoginRateLimit,
  resetLoginRateLimitForTests,
} = require('../src/loginRateLimit.js');

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let testUserAuthToken;

beforeAll(async () => {
  resetLoginRateLimitForTests();
  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const registerRes = await request(app).post('/api/auth').send(testUser);
  testUserAuthToken = registerRes.body.token;
  expectValidJwt(testUserAuthToken);
});

afterAll(() => {
  resetLoginRateLimitForTests();
});

test('login', async () => {
  const loginRes = await request(app).put('/api/auth').send(testUser);
  expect(loginRes.status).toBe(200);
  expectValidJwt(loginRes.body.token);

  const expectedUser = { ...testUser, roles: [{ role: 'diner' }] };
  delete expectedUser.password;
  expect(loginRes.body.user).toMatchObject(expectedUser);
});

test('logout success', async () => {
  const logoutRes = await request(app).delete('/api/auth').set('Authorization', `Bearer ${testUserAuthToken}`).send();

  expect(logoutRes.status).toBe(200);
  expect(logoutRes.body.message).toBe('logout successful');
});

test('login rejects wrong password with generic 403', async () => {
  const res = await request(app).put('/api/auth').send({ email: testUser.email, password: 'wrong-password' });
  expect(res.status).toBe(403);
  expect(res.body.message).toBe('incorrect credentials');
});

test('login rejects unknown email with same generic 403', async () => {
  const res = await request(app)
    .put('/api/auth')
    .send({ email: 'definitely-not-registered-' + Date.now() + '@test.com', password: 'any' });
  expect(res.status).toBe(403);
  expect(res.body.message).toBe('incorrect credentials');
});

describe('login rate limit', () => {
  beforeEach(() => {
    resetLoginRateLimitForTests();
    configureLoginRateLimit({ maxAttemptsPerWindow: 3, windowMs: 60_000 });
  });

  afterEach(() => {
    resetLoginRateLimitForTests();
  });

  test('returns 429 after too many attempts from the same IP', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await request(app).put('/api/auth').send({ email: testUser.email, password: 'wrong' });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('incorrect credentials');
    }
    const blocked = await request(app).put('/api/auth').send({ email: testUser.email, password: 'wrong' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toBe('too many login attempts, try again later');
  });
});

function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}