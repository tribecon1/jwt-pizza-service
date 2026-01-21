const request = require("supertest");
const app = require("../src/service");
const { Role, DB } = require("../src/database/database.js");

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

async function createAdminUser() {
  let user = { password: "toomanysecrets", roles: [{ role: Role.Admin }] };
  user.name = "adminTester";
  user.email = user.name + "@admin.com";

  user = await DB.addUser(user);
  return { ...user, password: "toomanysecrets" };
}

let testAdminUser;
let testUserAuthToken;
const testFranchise = {name: `${randomName()} Franchise`, admins: [{ email: "adminTester@admin.com" }]};

beforeAll(async () => {
  testAdminUser = await createAdminUser();
  const authenticateRes = await request(app).put("/api/auth").send(testAdminUser);
  testUserAuthToken = authenticateRes.body.token;
});

test("Get franchises", async () => {
  const getFranchisesRes = await request(app).get("/api/franchise");

  expect(getFranchisesRes.status).toBe(200);
  expect(Array.isArray(getFranchisesRes.body.franchises)).toBe(true);
});

test("Get user's franchises", async () => {
  const getUserFranchisesRes = await request(app).get(`/api/franchise/${testAdminUser}`).set("Authorization", `Bearer ${testUserAuthToken}`);

  expect(getUserFranchisesRes.status).toBe(200);
  expect(Array.isArray(getUserFranchisesRes.body)).toBe(true);
});

test("Create franchise", async () => {
  const createNewFranchiseRes = await request(app).post("/api/franchise").set("Authorization", `Bearer ${testUserAuthToken}`).send(testFranchise);

  expect(createNewFranchiseRes.status).toBe(200);
  const mockCreatedFranchise = { ...testFranchise, id: expect.any(Number) };
  expect(createNewFranchiseRes.body).toMatchObject(mockCreatedFranchise);
});

test("Create/Delete franchise", async () => {
  const tempFranchise = {name: `Temp ${randomName()} Franchise`, admins: [{ email: "adminTester@admin.com" }],};
  const createTempFranchiseRes = await request(app).post("/api/franchise").set("Authorization", `Bearer ${testUserAuthToken}`).send(tempFranchise);
  const tempFranchiseId = createTempFranchiseRes.body.id;
  
  const deleteFranchiseRes = await request(app).delete(`/api/franchise/${tempFranchiseId}`).set("Authorization", `Bearer ${testUserAuthToken}`);

  expect(deleteFranchiseRes.status).toBe(200);
  expect(deleteFranchiseRes.body.message).toBe("franchise deleted");
});

test("Create store of franchise", async () => {
    const newFranchise = {name: `StoreTest ${randomName()} Franchise`, admins: [{ email: "adminTester@admin.com" }],};
    const createStoreFranchiseRes = await request(app).post("/api/franchise").set("Authorization", `Bearer ${testUserAuthToken}`).send(newFranchise);
    const storeFranchiseId = createStoreFranchiseRes.body.id;
    const testStore = {name: "Test Store"};

    const createStoreRes = await request(app).post(`/api/franchise/${storeFranchiseId}/store`).set("Authorization", `Bearer ${testUserAuthToken}`).send(testStore);

    expect(createStoreRes.status).toBe(200);
    const mockCreatedStore = {...testStore, id: expect.any(Number), franchiseId: storeFranchiseId};
    expect(createStoreRes.body).toMatchObject(mockCreatedStore);
});

test("Create/Delete store", async () => {
    const createFranchiseRes = await request(app).post("/api/franchise").set("Authorization", `Bearer ${testUserAuthToken}`).send(testFranchise);
    const testFranchiseId = createFranchiseRes.body.id;
    const tempStore = {name: "Temporary Store"};
    const createTempStoreRes = await request(app).post(`/api/franchise/${testFranchiseId}/store`).set("Authorization", `Bearer ${testUserAuthToken}`).send(tempStore);
    const tempStoreId = createTempStoreRes.body.id;

    const deleteStoreRes = await request(app).delete(`/api/franchise/${testFranchiseId}/store/${tempStoreId}`).set("Authorization", `Bearer ${testUserAuthToken}`);

    expect(deleteStoreRes.status).toBe(200);
    expect(deleteStoreRes.body.message).toBe('store deleted');

});
