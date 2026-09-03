const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const COMENTARIOS_PATH = path.join(__dirname, 'data', 'comentarios.json');

function leerComentarios() {
  if (!fs.existsSync(COMENTARIOS_PATH)) return {};
  const contenido = fs.readFileSync(COMENTARIOS_PATH, 'utf8').trim();
  if (!contenido) return {};
  return JSON.parse(contenido);
}

function guardarComentarios(datos) {
  fs.writeFileSync(COMENTARIOS_PATH, JSON.stringify(datos, null, 2), 'utf8');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/data', express.static(path.join(__dirname, 'data')));

// Obtener TODOS los comentarios (de todos los barrios), para pintar iconos
// en el mapa y listar comentarios por comuna
app.get('/api/comentarios', (req, res) => {
  res.json(leerComentarios());
});

// Obtener los comentarios de un barrio (identificado por su CODBAR)
app.get('/api/comentarios/:codbar', (req, res) => {
  const todos = leerComentarios();
  res.json(todos[req.params.codbar] || []);
});

// Agregar un comentario nuevo a un barrio
app.post('/api/comentarios/:codbar', (req, res) => {
  const texto = (req.body.texto || '').trim();
  if (!texto) {
    return res.status(400).json({ error: 'El comentario no puede estar vacío' });
  }

  const todos = leerComentarios();
  const codbar = req.params.codbar;
  if (!todos[codbar]) todos[codbar] = [];

  const nuevoComentario = {
    id: crypto.randomUUID(),
    texto,
    fecha: new Date().toISOString(),
  };
  todos[codbar].push(nuevoComentario);
  guardarComentarios(todos);

  res.status(201).json(nuevoComentario);
});

// Borrar un comentario de un barrio
app.delete('/api/comentarios/:codbar/:id', (req, res) => {
  const todos = leerComentarios();
  const codbar = req.params.codbar;
  const lista = todos[codbar] || [];
  const nuevaLista = lista.filter((c) => c.id !== req.params.id);

  if (nuevaLista.length === lista.length) {
    return res.status(404).json({ error: 'Comentario no encontrado' });
  }

  todos[codbar] = nuevaLista;
  guardarComentarios(todos);
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
