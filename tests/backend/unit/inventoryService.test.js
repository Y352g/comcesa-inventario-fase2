
const { test, mock } = require('node:test');
const assert = require('node:assert/strict');

process.env.SESSION_SECRET ||= 'test-secret-for-unit-tests';
process.env.POSTGRES_PASSWORD ||= 'test-password';

const { pool } = require('../../../src/backend/config/database');
const { findInventory } = require('../../../src/backend/services/inventoryService');

const originalQuery = pool.query;

function filters(overrides = {}) {
  return {
    page: 1,
    limit: 20,
    sort: 'article',
    direction: 'asc',
    ...overrides
  };
}

function mockDatabase(items = [], total = items.length) {
  const queries = [];

  mock.method(pool, 'query', async (sql, values) => {
    queries.push({ sql, values });

    if (sql.includes('COUNT(*)')) {
      return { rows: [{ total }] };
    }

    return { rows: items };
  });

  return queries;
}

test.afterEach(() => {
  mock.restoreAll();
});

test('PI-01: devuelve una lista vacía cuando no hay artículos', async () => {
  mockDatabase([], 0);

  const result = await findInventory(filters());

  assert.deepEqual(result.items, []);
  assert.equal(result.total, 0);
});

test('PI-02: devuelve los artículos encontrados', async () => {
  const items = [{ article: 'A001', description: 'Producto A' }];
  mockDatabase(items);

  const result = await findInventory(filters());

  assert.deepEqual(result.items, items);
});

test('PI-03: devuelve la página solicitada', async () => {
  mockDatabase();

  const result = await findInventory(filters({ page: 2 }));

  assert.equal(result.page, 2);
});

test('PI-04: devuelve el límite configurado', async () => {
  mockDatabase();

  const result = await findInventory(filters({ limit: 10 }));

  assert.equal(result.limit, 10);
});

test('PI-05: calcula correctamente el total de páginas', async () => {
  mockDatabase([], 45);

  const result = await findInventory(filters());

  assert.equal(result.totalPages, 3);
});

test('PI-06: aplica filtro por búsqueda', async () => {
  const queries = mockDatabase();

  await findInventory(filters({ search: 'motor' }));

  assert.match(queries[0].sql, /ILIKE/);
  assert.deepEqual(queries[0].values, ['%motor%']);
});

test('PI-07: aplica filtro por bodega', async () => {
  const queries = mockDatabase();

  await findInventory(filters({ warehouse: 2 }));

  assert.match(queries[0].sql, /m\.cve_alm = \$1/);
  assert.deepEqual(queries[0].values, [2]);
});

test('PI-08: aplica filtro por línea de producto', async () => {
  const queries = mockDatabase();

  await findInventory(filters({ line: 'ELEC' }));

  assert.match(queries[0].sql, /i\.lin_prod = \$1/);
});

test('PI-09: aplica filtro por estado', async () => {
  const queries = mockDatabase();

  await findInventory(filters({ status: 'A' }));

  assert.match(queries[0].sql, /m\.status = \$1/);
});

test('PI-10: combina múltiples filtros', async () => {
  const queries = mockDatabase();

  await findInventory(filters({
    search: 'motor',
    warehouse: 1,
    status: 'A'
  }));

  assert.deepEqual(queries[0].values, ['%motor%', 1, 'A']);
  assert.match(queries[0].sql, /AND/);
});

test('PI-11: ordena por artículo de forma predeterminada', async () => {
  const queries = mockDatabase();

  await findInventory(filters());

  assert.match(queries[1].sql, /ORDER BY i\.cve_art ASC/);
});

test('PI-12: permite ordenar por existencia descendente', async () => {
  const queries = mockDatabase();

  await findInventory(filters({ sort: 'stock', direction: 'desc' }));

  assert.match(queries[1].sql, /ORDER BY m\.exist DESC/);
});

test('PI-13: utiliza orden seguro ante un campo desconocido', async () => {
  const queries = mockDatabase();

  await findInventory(filters({ sort: 'campo_invalido' }));

  assert.match(queries[1].sql, /ORDER BY i\.cve_art ASC/);
});

test('PI-14: calcula correctamente el desplazamiento', async () => {
  const queries = mockDatabase();

  await findInventory(filters({ page: 3, limit: 10 }));

  assert.deepEqual(queries[1].values.slice(-2), [10, 20]);
});

test('PI-15: utiliza parámetros SQL para la búsqueda', async () => {
  const queries = mockDatabase();

  await findInventory(filters({ search: "' OR 1=1 --" }));

  assert.match(queries[0].sql, /ILIKE \$1/);
  assert.equal(queries[0].values[0], "%' OR 1=1 --%");
});
