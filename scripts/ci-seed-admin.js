const { DB, Role } = require('../src/database/database.js');

async function main() {
  // Ensure schema initialization finished before attempting inserts.
  if (DB && DB.initialized && typeof DB.initialized.then === 'function') {
    await DB.initialized;
  }

  const defaultAdmin = {
    name: '常用名字',
    email: 'a@jwt.com',
    password: 'admin',
    roles: [{ role: Role.Admin }],
  };

  const user = await DB.addUser(defaultAdmin);
  console.log(`Seeded admin user: ${user.email} (id=${user.id ?? 'unknown'})`);
}

main().catch((err) => {
  // Fail loudly in CI with a useful error.
  console.error('Failed to seed admin user', err);
  process.exitCode = 1;
});
