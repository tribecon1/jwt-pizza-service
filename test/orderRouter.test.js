const request = require('supertest');
const app = require('../src/service');


const testUser = { name: 'menu tester', email: 'menutester@test.com', password: 'a' };
const testPizzaJWT = "fakeJWTvaluehere";
const testOrder = { franchiseId: 1, storeId: 1, items: [{menuId: 2, description: 'Pepperoni', price: 0.0042}] } // The npm run test command would drop and re-insert data to make these tests reliable
let testUserAuthToken;

beforeAll(async () => {
    let authenticateRes;
    authenticateRes = await request(app).post('/api/auth').send(testUser);
    testUserAuthToken = authenticateRes.body.token;
});

test('Get menu', async () =>{
    const getMenuRes = await request(app).get('/api/order/menu');
    expect(getMenuRes.status).toBe(200);
    expect(Array.isArray(getMenuRes.body)).toBe(true);
});

test('Get orders', async () => {
    const getOrdersRes = await request(app).get('/api/order').set('Authorization', `Bearer ${testUserAuthToken}`).query({ page: 1 }); 

    expect(getOrdersRes.status).toBe(200);
    expect(getOrdersRes.body).toBeDefined();
    expect(Array.isArray(getOrdersRes.body.orders)).toBe(true);
});

test('Place order', async () => {
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
            reportUrl: "fakelink.com",
            jwt: testPizzaJWT,
        })
    });

    const placeOrderRes = await request(app).post('/api/order').set('Authorization', `Bearer ${testUserAuthToken}`).send(testOrder);

    expect(placeOrderRes.status).toBe(200);
    expect(placeOrderRes.body.jwt).toBe(testPizzaJWT);
    const mockInsertedOrder = {...testOrder, id: expect.any(Number)}
    expect(placeOrderRes.body.order).toMatchObject(mockInsertedOrder);
});