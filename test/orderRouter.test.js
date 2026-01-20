const request = require('supertest');
const app = require('../src/service');


const testUser = { name: 'menu tester', email: 'menutester@test.com', password: 'a' };
let testUserAuthToken;

beforeAll(async () => {
    let authenticateRes;
    authenticateRes = await request(app).post('/api/auth').send(testUser);
    if (authenticateRes.status === 400){
        authenticateRes = await request(app).put('/api/auth').send(testUser);
    }
    testUserAuthToken = authenticateRes.body.token;
});

test('Get menu', async () =>{
    const getMenuRes = await request(app).get('/api/order/menu');
    expect(getMenuRes.status).toBe(200);
    expect(Array.isArray(getMenuRes.body)).toBe(true);
});

