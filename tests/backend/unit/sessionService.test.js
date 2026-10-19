
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SESSION_COOKIE,
  cookieOptions
} = require('../../../src/backend/services/sessionService');

test('PU-01: utiliza el nombre correcto de la cookie', () => {
  assert.equal(SESSION_COOKIE, 'comcesa_session');
});

test('PU-02: configura la cookie como httpOnly', () => {
  const options = cookieOptions(false);

  assert.equal(options.httpOnly, true);
});

test('PU-03: habilita secure en producción', () => {
  const options = cookieOptions(true);

  assert.equal(options.secure, true);
});

test('PU-04: deshabilita secure fuera de producción', () => {
  const options = cookieOptions(false);

  assert.equal(options.secure, false);
});
