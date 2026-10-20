
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const loginScript = fs.readFileSync(
  path.join(__dirname, '../../src/frontend/login.js'),
  'utf8'
);

function prepararEntorno({
  status = 200,
  responseBody = {},
  fetchError = null
} = {}) {
  const elementos = {
    '#login-form': {
      listener: null,
      addEventListener(evento, callback) {
        this.listener = callback;
      }
    },
    '#login-button': {
      disabled: false,
      innerHTML: 'Ingresar'
    },
    '#login-message': {
      textContent: ''
    }
  };

  const solicitudes = [];
  const navegacion = [];

  const contexto = {
    document: {
      querySelector(selector) {
        return elementos[selector];
      }
    },

    FormData: class {
      constructor() {
        this.valores = {
          email: 'usuario@ejemplo.com',
          password: 'ClaveDePrueba123'
        };
      }

      get(campo) {
        return this.valores[campo];
      }
    },

    fetch: async (url, opciones) => {
      solicitudes.push({ url, opciones });

      if (fetchError) {
        throw fetchError;
      }

      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => responseBody
      };
    },

    window: {
      location: {
        assign(url) {
          navegacion.push(url);
        }
      }
    }
  };

  vm.runInNewContext(loginScript, contexto, {
    filename: 'login.js'
  });

  async function enviarFormulario() {
    let envioPrevenido = false;

    await elementos['#login-form'].listener({
      preventDefault() {
        envioPrevenido = true;
      }
    });

    return envioPrevenido;
  }

  return {
    elementos,
    solicitudes,
    navegacion,
    enviarFormulario
  };
}

test('PF-01: evita el envio tradicional del formulario', async () => {
  const entorno = prepararEntorno();

  const prevenido = await entorno.enviarFormulario();

  assert.equal(prevenido, true);
});

test('PF-02: desactiva el boton mientras valida credenciales', async () => {
  const entorno = prepararEntorno();

  await entorno.enviarFormulario();

  assert.equal(
    entorno.elementos['#login-button'].disabled,
    true
  );

  assert.match(
    entorno.elementos['#login-button'].innerHTML,
    /Validando/
  );
});

test('PF-03: envia credenciales mediante POST al endpoint correcto', async () => {
  const entorno = prepararEntorno();

  await entorno.enviarFormulario();

  assert.equal(entorno.solicitudes.length, 1);

  const solicitud = entorno.solicitudes[0];

  assert.equal(solicitud.url, '/api/v1/auth/login');
  assert.equal(solicitud.opciones.method, 'POST');
  assert.equal(
    solicitud.opciones.headers['Content-Type'],
    'application/json'
  );

  const cuerpo = JSON.parse(solicitud.opciones.body);

  assert.equal(cuerpo.email, 'usuario@ejemplo.com');
  assert.equal(cuerpo.password, 'ClaveDePrueba123');
});

test('PF-04: redirige al inventario cuando el login es exitoso', async () => {
  const entorno = prepararEntorno({
    status: 200
  });

  await entorno.enviarFormulario();

  assert.equal(entorno.navegacion.length, 1);
  assert.equal(entorno.navegacion[0], '/inventario');
});

test('PF-05: muestra error y habilita nuevamente el boton', async () => {
  const entorno = prepararEntorno({
    status: 401,
    responseBody: {
      message: 'Credenciales invalidas'
    }
  });

  await entorno.enviarFormulario();

  assert.equal(
    entorno.elementos['#login-message'].textContent,
    'Credenciales invalidas'
  );

  assert.equal(
    entorno.elementos['#login-button'].disabled,
    false
  );

  assert.match(
    entorno.elementos['#login-button'].innerHTML,
    /Ingresar/
  );

  assert.equal(entorno.navegacion.length, 0);
});
