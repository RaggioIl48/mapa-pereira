const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Carga las variables de .env si el archivo existe (para desarrollo local;
// en Render estas variables se configuran directamente en su panel).
const ENV_PATH = path.join(__dirname, '.env');
if (fs.existsSync(ENV_PATH)) {
  fs.readFileSync(ENV_PATH, 'utf8').split('\n').forEach((linea) => {
    const match = linea.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = (match[2] || '').trim();
    }
  });
}

const app = express();
const PORT = process.env.PORT || 3000;

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const LLAVE_COMENTARIOS = 'comentarios';

if (!REDIS_URL || !REDIS_TOKEN) {
  console.warn(
    'AVISO: faltan UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. ' +
    'Los comentarios no se van a poder guardar hasta que configures esas variables.'
  );
} else {
  // No imprime la clave, solo confirma que se cargaron bien las variables
  console.log(`Upstash configurado: URL=${REDIS_URL} (token de ${REDIS_TOKEN.length} caracteres)`);
}

// ---------- Guardado de comentarios (Upstash Redis, vía su API REST) ----------
// Todos los comentarios se guardan juntos en una sola llave de Redis, como
// un texto JSON (el mismo formato que antes usábamos en data/comentarios.json).

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function llamarRedis(comando, intento = 1) {
  try {
    const respuesta = await fetch(`${REDIS_URL}/${comando.map(encodeURIComponent).join('/')}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const datos = await respuesta.json();
    if (datos.error) throw new Error(datos.error);
    return datos.result;
  } catch (error) {
    // Reintenta una vez ante un corte de red pasajero antes de rendirse
    if (intento < 3) {
      await esperar(300 * intento);
      return llamarRedis(comando, intento + 1);
    }
    throw error;
  }
}

async function leerComentarios() {
  const crudo = await llamarRedis(['get', LLAVE_COMENTARIOS]);
  if (!crudo) return {};
  return JSON.parse(crudo);
}

async function guardarComentarios(datos) {
  await llamarRedis(['set', LLAVE_COMENTARIOS, JSON.stringify(datos)]);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/data', express.static(path.join(__dirname, 'data')));

// Obtener TODOS los comentarios (de todos los barrios), para pintar iconos
// en el mapa y listar comentarios por comuna
app.get('/api/comentarios', async (req, res) => {
  try {
    res.json(await leerComentarios());
  } catch (e) {
    console.error('Error leyendo comentarios de Upstash:', e);
    res.status(502).json({ error: 'No se pudo conectar con la base de datos de comentarios.', detalle: e.message });
  }
});

// Obtener los comentarios de un barrio (identificado por su FID: el
// CODBAR del archivo de barrios no es único entre barrios, así que no
// sirve como identificador)
app.get('/api/comentarios/:idBarrio', async (req, res) => {
  try {
    const todos = await leerComentarios();
    res.json(todos[req.params.idBarrio] || []);
  } catch (e) {
    console.error('Error leyendo comentarios de Upstash:', e);
    res.status(502).json({ error: 'No se pudo conectar con la base de datos de comentarios.', detalle: e.message });
  }
});

// Agregar un comentario nuevo a un barrio
app.post('/api/comentarios/:idBarrio', async (req, res) => {
  const texto = (req.body.texto || '').trim();
  if (!texto) {
    return res.status(400).json({ error: 'El comentario no puede estar vacío' });
  }

  try {
    const todos = await leerComentarios();
    const idBarrio = req.params.idBarrio;
    if (!todos[idBarrio]) todos[idBarrio] = [];

    const nuevoComentario = {
      id: crypto.randomUUID(),
      texto,
      fecha: new Date().toISOString(),
    };
    todos[idBarrio].push(nuevoComentario);
    await guardarComentarios(todos);

    res.status(201).json(nuevoComentario);
  } catch (e) {
    console.error('Error guardando comentario en Upstash:', e);
    res.status(502).json({ error: 'No se pudo guardar el comentario en la base de datos.', detalle: e.message });
  }
});

// Borrar un comentario de un barrio
app.delete('/api/comentarios/:idBarrio/:id', async (req, res) => {
  try {
    const todos = await leerComentarios();
    const idBarrio = req.params.idBarrio;
    const lista = todos[idBarrio] || [];
    const nuevaLista = lista.filter((c) => c.id !== req.params.id);

    if (nuevaLista.length === lista.length) {
      return res.status(404).json({ error: 'Comentario no encontrado' });
    }

    todos[idBarrio] = nuevaLista;
    await guardarComentarios(todos);
    res.status(204).end();
  } catch (e) {
    console.error('Error borrando comentario en Upstash:', e);
    res.status(502).json({ error: 'No se pudo borrar el comentario en la base de datos.', detalle: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
