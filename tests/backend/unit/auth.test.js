
const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

process.env.SESSION_SECRET ||= 'clave-ficticia-exclusiva-para-pruebas-unitarias-2026';
process.env.POSTGRES_PASSWORD ||= 'password-ficticio-para-pruebas';

const { pool } = require('../../../src/backend/config/database');

let sessionResult = null;
let sessionError = null;
let receivedToken = null;

const sessionMock = {
  SESSION_COOKIE: 'comcesa_session',
  getSession: async (token) => {
    receivedToken = token;
    if (sessionError) throw sessionError;
    return sessionResult;
  }
};

const originalLoad = Module._load;
let requireAuth;

try {
  Module._load = function (request, parent, isMain) {
    if (
      request === '../services/sessionService' &&
      path.normalize(parent?.filename || '').endsWith(
        path.join('middlewares', 'auth.js')
      )
    ) {
      return sessionMock;
    }

    return originalLoad.apply(this, arguments);
  };

  ({ requireAuth } = require('../../../src/backend/middlewares/auth'));
} finally {
  Module._load = originalLoad;
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
}

function mockUser(user) {
  mock.method(pool, 'query', async () => ({
    rows: user ? [{
      id: user.id,
      email: user.email,
      role: user.role,
      active: true,
      must_change_password: false
    }] : []
  }));
}

test.beforeEach(() => {
  sessionResult = null;
  sessionError = null;
  receivedToken = null;
});

test.afterEach(() => {
  mock.restoreAll();
});

test('PA-01: rechaza solicitudes sin sesión válida', async () => {
  const request = { headers: {} };
  const response = createResponse();
  let nextCalled = false;

  await requireAuth(request, response, () => {
    nextCalled = true;
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error, 'UNAUTHENTICATED');
  assert.equal(nextCalled, false);
});

test('PA-02: rechaza sesiones inexistentes', async () => {
  const request = {
    headers: { cookie: 'comcesa_session=token-invalido' }
  };
  const response = createResponse();

  await requireAuth(request, response, () => {});

  assert.equal(response.statusCode, 401);
  assert.equal(receivedToken, 'token-invalido');
});

test('PA-03: permite acceso con sesión válida', async () => {
  sessionResult = { id: 1 };
  mockUser({
    id: 1,
    email: 'usuario@ejemplo.com',
    role: 'admin'
  });

  const request = {
    headers: { cookie: 'comcesa_session=token-valido' }
  };
  const response = createResponse();
  let nextCalled = false;

  await requireAuth(request, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(response.statusCode, 200);
});

test('PA-04: asigna correctamente los datos del usuario', async () => {
  sessionResult = { id: 5 };

  const user = {
    id: 5,
    email: 'vendedor@ejemplo.com',
    role: 'sales'
  };

  mockUser(user);

  const request = {
    headers: { cookie: 'comcesa_session=token-123' }
  };

  await requireAuth(request, createResponse(), () => {});

  assert.deepEqual(request.user, {
    ...user,
    mustChangePassword: false
  });
});

test('PA-05: obtiene el token de la cookie correcta', async () => {
  sessionResult = { id: 2 };

  mockUser({
    id: 2,
    email: 'admin@ejemplo.com',
    role: 'admin'
  });

  const request = {
    headers: {
      cookie: 'otra_cookie=abc; comcesa_session=token-correcto'
    }
  };

  await requireAuth(request, createResponse(), () => {});

  assert.equal(receivedToken, 'token-correcto');
});

test('PA-06: envía errores inesperados al manejador de Express', async () => {
  sessionError = new Error('Error simulado de Redis');

  const request = {
    headers: { cookie: 'comcesa_session=token-error' }
  };

  const response = createResponse();
  let capturedError = null;

  await requireAuth(request, response, (error) => {
    capturedError = error;
  });

  assert.ok(capturedError instanceof Error);
  assert.equal(capturedError.message, 'Error simulado de Redis');
});
