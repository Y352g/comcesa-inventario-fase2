
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const loginScript = fs.readFileSync(
  path.join(__dirname, '../../src/frontend/login.js'),
  'utf8'
);

function prepararFormulario({ status = 200, body = {}, networkError = null } = {}) {
  const form = {};
  const button = { disabled: false, innerHTML: 'Ingresar' };
  const message = { textContent: '' };

  let submitHandler;
  let requestedUrl;
  let requestedOptions;
  let destination = null;

  form.addEventListener = (event, handler) => {
    if (event === 'submit') submitHandler = handler;
  };

  const context = {
    document: {
      querySelector(selector) {
        const elements = {
          '#login-form': form,
          '#login-button': button,
          '#login-message': message
        };
        return elements[selector];
      }
    },
    FormData: class {
      get(key) {
        return {
          email: 'usuario@comcesa.com',
          password: 'ClaveDePrueba123'
        }[key];
      }
    },
    fetch: async (url, options) => {
      requestedUrl = url;
      requestedOptions = options;

      if (networkError) throw networkError;

      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body
      };
    },
    window: {
      location: {
        assign(url) {
          destination = url;
        }
      }
    }
  };

  vm.runInNewContext(loginScript, context);

  async function submit() {
    let prevented = false;

    await submitHandler({
      preventDefault() {
        prevented = true;
      }
    });

    return prevented;
  }

  return {
    submit,
    button,
    message,
    getRequest: () => ({
      url: requestedUrl,
      options: requestedOptions
    }),
    getDestination: () => destination
  };
}

test('PF-01: evita el envío tradicional del formulario', async () => {
  const app = prepararFormulario();

  const prevented = await app.submit();

  assert.equal(prevented, true);
});

test('PF-02: envía las credenciales al endpoint correcto', async () => {
  const app = prepararFormulario();

  await app.submit();

  const request = app.getRequest();

  assert.equal(request.url, '/api/v1/auth/login');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.credentials, 'same-origin');
  assert.equal(request.options.headers['Content-Type'], 'application/json');

  assert.deepEqual(JSON.parse(request.options.body), {
    email: 'usuario@comcesa.com',
    password: 'ClaveDePrueba123'
  });
});

test('PF-03: redirige al inventario después del login exitoso', async () => {
  const app = prepararFormulario({ status: 200 });

  await app.submit();

  assert.equal(app.getDestination(), '/inventario');
  assert.equal(app.button.disabled, true);
});

test('PF-04: muestra mensaje cuando las credenciales son inválidas', async () => {
  const app = prepararFormulario({
    status: 401,
    body: { message: 'Credenciales invalidas' }
  });

  await app.submit();

  assert.equal(app.message.textContent, 'Credenciales invalidas');
  assert.equal(app.button.disabled, false);
  assert.equal(app.getDestination(), null);
});

test('PF-05: muestra advertencia cuando hay demasiados intentos', async () => {
  const app = prepararFormulario({
    status: 429,
    body: { message: 'Error del servidor' }
  });

  await app.submit();

  assert.equal(
    app.message.textContent,
    'Demasiados intentos. Espera unos minutos.'
  );
  assert.equal(app.button.disabled, false);
});
