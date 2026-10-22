
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const originalLoad = Module._load;

const calls = [];
let redisStatus = 'ready';
let redisValue = null;
let redisError = null;

const redisMock = {
  get status() {
    return redisStatus;
  },

  async connect() {
    calls.push('connect');
    redisStatus = 'ready';
  },

  async get(key) {
    calls.push({ operation: 'get', key });

    if (redisError) {
      throw redisError;
    }

    return redisValue;
  },

  async del(key) {
    calls.push({ operation: 'del', key });
    return 1;
  },

  async set(key, value, mode, ttl) {
    calls.push({ operation: 'set', key, value, mode, ttl });
    return 'OK';
  }
};

let service;

try {
  Module._load = function(request, parent, isMain) {
    if (
      request === '../config/redis' &&
      path.normalize(parent?.filename || '').endsWith(
      path.join('services', 'sessionService.js')
    )
) {
  return { redis: redisMock };
}

    return originalLoad.apply(this, arguments);
  };

  const servicePath = require.resolve(
    '../../../src/backend/services/sessionService'
  );

  delete require.cache[servicePath];
  service = require(servicePath);

} finally {
  Module._load = originalLoad;
}

function resetMocks() {
  calls.length = 0;
  redisStatus = 'ready';
  redisValue = null;
  redisError = null;
}

test('PU-05: devuelve null cuando no existe token', async () => {
  resetMocks();

  const result = await service.getSession('');

  assert.equal(result, null);
  assert.equal(calls.length, 0);
});

test('PU-06: no elimina sesiones sin token', async () => {
  resetMocks();

  await service.destroySession(null);

  assert.equal(calls.length, 0);
});

test('PU-07: devuelve null cuando Redis no encuentra la sesion', async () => {
  resetMocks();

  redisValue = null;

  const result = await service.getSession('token-inexistente');

  assert.equal(result, null);
  assert.equal(calls[0].operation, 'get');
});

test('PU-08: recupera correctamente una sesion existente', async () => {
  resetMocks();

  const user = {
    id: 1,
    email: 'usuario@ejemplo.com',
    role: 'admin'
  };

  redisValue = JSON.stringify(user);

  const result = await service.getSession('token-valido');

  assert.deepEqual(result, user);
  assert.equal(calls[0].operation, 'get');
});

test('PU-09: elimina la sesion correspondiente al token', async () => {
  resetMocks();

  await service.destroySession('token-a-eliminar');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].operation, 'del');
  assert.match(calls[0].key, /^session:[a-f0-9]{64}$/);
});

test('PU-10: propaga errores durante la consulta a Redis', async () => {
  resetMocks();

  redisError = new Error('Error simulado de Redis');

  await assert.rejects(
    service.getSession('token-error'),
    /Error simulado de Redis/
  );
});
