// Run this with: node generate_password_hash.js
// or in browser console

const bcrypt = require('bcryptjs');

const password = 'Test@123';
const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync(password, salt);

console.log('\n=== Password Hash Generated ===');
console.log('Password:', password);
console.log('Hash:', hash);
console.log('\nUse this hash in the SQL INSERT statement for users.password_hash');
console.log('\n');

// Verify it works
const isValid = bcrypt.compareSync(password, hash);
console.log('Verification test:', isValid ? '✅ PASS' : '❌ FAIL');
