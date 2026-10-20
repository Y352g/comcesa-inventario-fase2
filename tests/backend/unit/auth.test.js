
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
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

let requireAuth;

try {
  Module._load = function (request, parent, isMain) {
    if (request === '../services/sessionService' &&
        parent?.filename.endsWith('/middlewares/auth.js')) {
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

test.beforeEach(() => {
  sessionResult = null;
  sessionError = null;
  receivedToken = null;
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
  sessionResult = {
    id: 1,
    email: 'usuario@ejemplo.com',
    role: 'admin'
  };

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
  sessionResult = {
    id: 5,
    email: 'vendedor@ejemplo.com',
    role: 'sales'
  };

  const request = {
    headers: { cookie: 'comcesa_session=token-123' }
  };

  await requireAuth(request, createResponse(), () => {});

  assert.deepEqual(request.user, sessionResult);
});

test('PA-05: obtiene el token de la cookie correcta', async () => {
  sessionResult = { id: 2, role: 'admin' };

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
