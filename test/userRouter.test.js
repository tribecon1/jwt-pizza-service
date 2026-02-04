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
  const listUsersRes = await request(app)
    .get('/api/user')
    .set('Authorization', 'Bearer ' + testUserAuthToken);
  expect(listUsersRes.status).toBe(200);
  const expectedTestAdminUserRoles = testAdminUser.roles.map(roleObj => roleObj.role);
  const expectedTestAdminUser = { email: testAdminUser.email, id: testAdminUser.id, name: testAdminUser.name, roles: expectedTestAdminUserRoles }
  expect(listUsersRes.body.users).toContainEqual(expectedTestAdminUser);
});

test('list users filtered by name', async () => {
  const listUsersRes = await request(app)
    .get('/api/user')
    .set('Authorization', 'Bearer ' + testUserAuthToken)
    .query({ name: 'admin' });
  expect(listUsersRes.status).toBe(200);
  const expectedTestAdminUserRoles = testAdminUser.roles.map(roleObj => roleObj.role);
  const expectedTestAdminUser = { email: testAdminUser.email, id: testAdminUser.id, name: testAdminUser.name, roles: expectedTestAdminUserRoles }
  expect(listUsersRes.body.users.length).toEqual(1);
  expect(listUsersRes.body.users[0]).toEqual(expectedTestAdminUser)
});
