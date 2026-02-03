const request = require("supertest");
const app = require("../src/service");
const { Role, DB } = require("../src/database/database.js");


async function createAdminUser() {
  let user = { password: "toomanysecrets", roles: [{ role: Role.Admin }] };
  user.name = "adminUserTester";
  user.email = user.name + "@admin.com";

  user = await DB.addUser(user);
  return { ...user, password: "toomanysecrets" };
}

let testAdminUser;
let testUserAuthToken;

beforeAll(async () => {
  testAdminUser = await createAdminUser();
  const authenticateRes = await request(app).put("/api/auth").send(testAdminUser);
  testUserAuthToken = authenticateRes.body.token;
});

test('Get my own user info', async () => {
    const getMyUserRes = await request(app).get('/api/user/me').set("Authorization", `Bearer ${testUserAuthToken}`);

    expect(getMyUserRes.status).toBe(200);
    const expectedCurrUser = {email: testAdminUser.email, name: testAdminUser.name, iat: expect.any(Number), id: expect.any(Number)}
    expect(getMyUserRes.body).toMatchObject(expectedCurrUser);
});

test('list users unauthorized', async () => {
  const listUsersRes = await request(app).get('/api/user');
  expect(listUsersRes.status).toBe(401);
});

test('list users', async () => {
  const [user, userToken] = await registerUser(request(app));
  const listUsersRes = await request(app)
    .get('/api/user')
    .set('Authorization', 'Bearer ' + userToken);
  expect(listUsersRes.status).toBe(200);
});

async function registerUser(service) {
  const testUser = {
    name: 'pizza diner',
    email: `${randomName()}@test.com`,
    password: 'a',
  };
  const registerRes = await service.post('/api/auth').send(testUser);
  registerRes.body.user.password = testUser.password;

  return [registerRes.body.user, registerRes.body.token];
}

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}