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
    const mockCurrUser = {email: testAdminUser.email, name: testAdminUser.name, iat: expect.any(Number), id: expect.any(Number)}
    expect(getMyUserRes.body).toMatchObject(mockCurrUser);
});