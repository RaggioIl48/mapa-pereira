// ---------- Configuración básica ----------

const CENTRO_PEREIRA = [4.8133, -75.6961];
const ZOOM_INICIAL = 13;

const PALETA = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
  '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe',
  '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000',
  '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080',
  '#a9a9a9', '#ff7f50', '#40e0d0', '#c71585',
];

function colorPorIndice(i) {
  return PALETA[i % PALETA.length];
}

// El campo CODBAR del archivo de barrios NO es único (varios barrios
// distintos comparten el mismo código, incluso vacío). Por eso usamos el
// FID -- el identificador interno del archivo, que sí es único por barrio
// -- como llave para guardar los comentarios.
function idDeBarrio(feature) {
  return String(feature.properties.FID);
}

const mapa = L.map('mapa').setView(CENTRO_PEREIRA, ZOOM_INICIAL);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(mapa);

// ---------- Estado de la aplicación ----------

const estado = {
  vista: 'comunas', // 'comunas' | 'comuna' | 'barrio'
  comunas: null,     // GeoJSON completo de comunas
  barrios: null,     // GeoJSON completo de barrios
  capaComunas: null,
  capaBarrios: null,
  comunaActual: null, // { codcom, nombre }
  barrioActual: null, // { idBarrio, nombre }
  resumenComentarios: {}, // { idBarrio: [comentario, ...] }, para saber quién tiene comentarios
};

// ---------- Carga inicial de datos ----------

Promise.all([
  fetch('/data/comunas.geojson').then((r) => r.json()),
  fetch('/data/barrios.geojson').then((r) => r.json()),
  leerRespuesta(fetch('/api/comentarios')).catch((error) => {
    // Si falla solo la carga de comentarios (por ejemplo, la base de
    // datos no responde), igual mostramos el mapa, sin iconos de comentarios
    window.alert('No se pudieron cargar los comentarios guardados: ' + error.message);
    return {};
  }),
]).then(([comunas, barrios, comentarios]) => {
  estado.comunas = comunas;
  estado.barrios = barrios;
  estado.resumenComentarios = comentarios;
  mostrarComunas();
});

// ---------- Iconos de "tiene comentarios" ----------

function tieneComentarios(idBarrio) {
  return (estado.resumenComentarios[idBarrio] || []).length > 0;
}

function comunaTieneComentarios(codcom) {
  return estado.barrios.features.some(
    (f) => f.properties.CODCOM === codcom && tieneComentarios(idDeBarrio(f))
  );
}

function etiquetaConIcono(nombre, tieneComentario) {
  return tieneComentario ? `💬 ${nombre}` : nombre;
}

// Vuelve a poner (o quitar) el icono 💬 en las etiquetas que ya están en el mapa
function actualizarIconos() {
  if (estado.capaComunas) {
    estado.capaComunas.eachLayer((layer) => {
      const { codcom, nombre } = layer.feature.properties;
      layer.setTooltipContent(etiquetaConIcono(nombre, comunaTieneComentarios(codcom)));
    });
  }
  if (estado.capaBarrios) {
    estado.capaBarrios.eachLayer((layer) => {
      layer.setTooltipContent(
        etiquetaConIcono(layer.feature.properties.NOMBRE, tieneComentarios(idDeBarrio(layer.feature)))
      );
    });
  }
}

function encontrarLayerBarrio(idBarrio) {
  if (!estado.capaBarrios) return null;
  let encontrado = null;
  estado.capaBarrios.eachLayer((l) => {
    if (idDeBarrio(l.feature) === idBarrio) encontrado = l;
  });
  return encontrado;
}

// ---------- Vista: todas las comunas ----------

function mostrarComunas() {
  estado.vista = 'comunas';
  estado.comunaActual = null;
  estado.barrioActual = null;

  if (estado.capaBarrios) {
    mapa.removeLayer(estado.capaBarrios);
    estado.capaBarrios = null;
  }
  cerrarPanel();
  cerrarPanelComuna();

  if (!estado.capaComunas) {
    estado.capaComunas = L.geoJSON(estado.comunas, {
      style: (feature) => estiloComuna(feature),
      onEachFeature: (feature, layer) => {
        layer.bindTooltip(
          etiquetaConIcono(feature.properties.nombre, comunaTieneComentarios(feature.properties.codcom)),
          { permanent: true, direction: 'center', className: 'etiqueta-comuna' }
        );
        layer.on('click', () => entrarAComuna(feature));
        layer.on('mouseover', () => layer.setStyle({ weight: 3 }));
        layer.on('mouseout', () => layer.setStyle({ weight: 1.5 }));
      },
    });
  }
  estado.capaComunas.addTo(mapa);
  mapa.fitBounds(estado.capaComunas.getBounds(), { padding: [20, 20] });

  actualizarRuta();
}

function estiloComuna(feature) {
  const indice = estado.comunas.features.indexOf(feature);
  return {
    color: '#1f2937',
    weight: 1.5,
    fillColor: colorPorIndice(indice),
    fillOpacity: 0.45,
  };
}

// ---------- Vista: barrios de una comuna ----------

function entrarAComuna(feature) {
  const codcom = feature.properties.codcom;
  const nombre = feature.properties.nombre;
  estado.vista = 'comuna';
  estado.comunaActual = { codcom, nombre };
  estado.barrioActual = null;
  cerrarPanel();
  cerrarPanelComuna();

  mapa.removeLayer(estado.capaComunas);
  if (estado.capaBarrios) {
    mapa.removeLayer(estado.capaBarrios);
  }

  const barriosDeLaComuna = {
    type: 'FeatureCollection',
    features: estado.barrios.features.filter(
      (f) => f.properties.CODCOM === codcom
    ),
  };

  estado.capaBarrios = L.geoJSON(barriosDeLaComuna, {
    style: (feature) => estiloBarrio(feature, barriosDeLaComuna.features),
    onEachFeature: (feature, layer) => {
      layer.bindTooltip(
        etiquetaConIcono(feature.properties.NOMBRE, tieneComentarios(idDeBarrio(feature))),
        { permanent: true, direction: 'center', className: 'etiqueta-barrio' }
      );
      layer.on('click', () => entrarABarrio(feature, layer));
      layer.on('mouseover', () => layer.setStyle({ weight: 3 }));
      layer.on('mouseout', () => restaurarEstiloBarrio(layer, feature));
    },
  }).addTo(mapa);

  if (barriosDeLaComuna.features.length > 0) {
    mapa.fitBounds(estado.capaBarrios.getBounds(), { padding: [20, 20] });
  }

  actualizarRuta();
}

function estiloBarrio(feature, listaBarrios) {
  const indice = listaBarrios.indexOf(feature);
  const esSeleccionado =
    estado.barrioActual &&
    estado.barrioActual.idBarrio === idDeBarrio(feature);
  return {
    color: esSeleccionado ? '#111827' : '#374151',
    weight: esSeleccionado ? 3 : 1,
    fillColor: colorPorIndice(indice + 3),
    fillOpacity: esSeleccionado ? 0.7 : 0.5,
  };
}

function restaurarEstiloBarrio(layer, feature) {
  const listaActual = estado.capaBarrios
    ? Object.values(estado.capaBarrios._layers).map((l) => l.feature)
    : [];
  layer.setStyle(estiloBarrio(feature, listaActual));
}

// ---------- Vista: un barrio seleccionado ----------

function entrarABarrio(feature, layer) {
  estado.vista = 'barrio';
  estado.barrioActual = {
    idBarrio: idDeBarrio(feature),
    nombre: feature.properties.NOMBRE,
  };
  cerrarPanelComuna();

  // Vuelve a pintar todos los barrios para resaltar el seleccionado
  estado.capaBarrios.eachLayer((l) => {
    restaurarEstiloBarrio(l, l.feature);
  });

  mapa.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 17 });

  actualizarRuta();
  abrirPanel(estado.barrioActual);
}

// ---------- Ruta (breadcrumb) y botón volver ----------

function actualizarRuta() {
  const ruta = document.getElementById('ruta');
  let html = '';

  if (estado.vista !== 'comunas') {
    html += `<button id="btn-atras">&larr; Volver</button>`;
  }

  html += `<span class="${estado.vista === 'comunas' ? 'nivel-actual' : 'enlace'}" id="ir-comunas">Pereira</span>`;

  if (estado.comunaActual) {
    const esNivelActual = estado.vista === 'comuna';
    html += `<span class="separador">&rsaquo;</span>`;
    html += `<span class="${esNivelActual ? 'nivel-actual' : 'enlace'}" id="ir-comuna">${estado.comunaActual.nombre}</span>`;
  }

  if (estado.barrioActual) {
    html += `<span class="separador">&rsaquo;</span>`;
    html += `<span class="nivel-actual">${estado.barrioActual.nombre}</span>`;
  }

  document.getElementById('ruta').innerHTML = html;

  const btnVerComentarios = document.getElementById('btn-ver-comentarios');
  btnVerComentarios.classList.toggle('oculto', estado.vista !== 'comuna');

  document.getElementById('ir-comunas').addEventListener('click', mostrarComunas);
  const irComuna = document.getElementById('ir-comuna');
  if (irComuna) {
    irComuna.addEventListener('click', () => entrarAComuna({
      properties: { codcom: estado.comunaActual.codcom, nombre: estado.comunaActual.nombre },
    }));
  }
  const btnAtras = document.getElementById('btn-atras');
  if (btnAtras) {
    btnAtras.addEventListener('click', volverAtras);
  }
}

function volverAtras() {
  if (estado.vista === 'barrio') {
    estado.vista = 'comuna';
    estado.barrioActual = null;
    cerrarPanel();
    estado.capaBarrios.eachLayer((l) => restaurarEstiloBarrio(l, l.feature));
    if (estado.capaBarrios.getBounds().isValid()) {
      mapa.fitBounds(estado.capaBarrios.getBounds(), { padding: [20, 20] });
    }
    actualizarRuta();
  } else if (estado.vista === 'comuna') {
    mostrarComunas();
  }
}

// ---------- Panel de comentarios ----------

function abrirPanel(barrio) {
  document.getElementById('panel-titulo').textContent = barrio.nombre;
  document.getElementById('panel-barrio').classList.remove('oculto');
  cargarComentarios(barrio.idBarrio);
}

function cerrarPanel() {
  document.getElementById('panel-barrio').classList.add('oculto');
  document.getElementById('lista-comentarios').innerHTML = '';
  document.getElementById('texto-comentario').value = '';
}

document.getElementById('cerrar-panel').addEventListener('click', () => {
  if (estado.vista === 'barrio') {
    volverAtras();
  } else {
    cerrarPanel();
  }
});

// Convierte una respuesta de fetch en su JSON, o lanza un error legible
// si el servidor respondió con un problema (para no fallar en silencio)
async function leerRespuesta(promesaFetch) {
  let respuesta;
  try {
    respuesta = await promesaFetch;
  } catch (e) {
    throw new Error('No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.');
  }

  let cuerpo = null;
  try {
    cuerpo = await respuesta.json();
  } catch (e) {
    // Respuestas sin cuerpo (por ejemplo, un borrado exitoso) son normales
  }

  if (!respuesta.ok) {
    let mensaje = (cuerpo && cuerpo.error) || `Error del servidor (código ${respuesta.status})`;
    if (cuerpo && cuerpo.detalle) mensaje += ' — ' + cuerpo.detalle;
    throw new Error(mensaje);
  }

  return cuerpo;
}

function cargarComentarios(idBarrio) {
  leerRespuesta(fetch(`/api/comentarios/${idBarrio}`))
    .then((comentarios) => {
      renderizarComentarios(idBarrio, comentarios);

      // Actualiza el resumen global para que los iconos 💬 y el panel de
      // "comentarios de la comuna" queden al día
      estado.resumenComentarios[idBarrio] = comentarios;
      actualizarIconos();
      if (!document.getElementById('panel-comuna').classList.contains('oculto')) {
        renderizarComentariosComuna();
      }
    })
    .catch((error) => {
      window.alert('No se pudieron cargar los comentarios: ' + error.message);
    });
}

function renderizarComentarios(idBarrio, comentarios) {
  const contenedor = document.getElementById('lista-comentarios');

  if (comentarios.length === 0) {
    contenedor.innerHTML = '<p class="comentario-vacio">Todavía no hay comentarios para este barrio.</p>';
    return;
  }

  contenedor.innerHTML = '';
  comentarios
    .slice()
    .reverse()
    .forEach((comentario) => {
      const div = document.createElement('div');
      div.className = 'comentario';

      const fecha = document.createElement('div');
      fecha.className = 'comentario-fecha';
      fecha.textContent = formatearFecha(comentario.fecha);

      const texto = document.createElement('p');
      texto.className = 'comentario-texto';
      texto.textContent = comentario.texto;

      const borrar = document.createElement('button');
      borrar.className = 'comentario-borrar';
      borrar.textContent = 'Borrar';
      borrar.addEventListener('click', () => borrarComentario(idBarrio, comentario.id));

      div.appendChild(borrar);
      div.appendChild(fecha);
      div.appendChild(texto);
      contenedor.appendChild(div);
    });
}

function formatearFecha(isoString) {
  const fecha = new Date(isoString);
  return fecha.toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

document.getElementById('form-comentario').addEventListener('submit', (evento) => {
  evento.preventDefault();
  if (!estado.barrioActual) return;

  const textarea = document.getElementById('texto-comentario');
  const texto = textarea.value.trim();
  if (!texto) return;

  const boton = evento.target.querySelector('button[type="submit"]');
  const textoOriginalBoton = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Guardando…';

  leerRespuesta(fetch(`/api/comentarios/${estado.barrioActual.idBarrio}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto }),
  }))
    .then(() => {
      textarea.value = '';
      cargarComentarios(estado.barrioActual.idBarrio);
    })
    .catch((error) => {
      window.alert('No se pudo guardar el comentario: ' + error.message);
    })
    .finally(() => {
      boton.disabled = false;
      boton.textContent = textoOriginalBoton;
    });
});

function borrarComentario(idBarrio, id) {
  leerRespuesta(fetch(`/api/comentarios/${idBarrio}/${id}`, { method: 'DELETE' }))
    .then(() => {
      cargarComentarios(idBarrio);
    })
    .catch((error) => {
      window.alert('No se pudo borrar el comentario: ' + error.message);
    });
}

// ---------- Panel: todos los comentarios de la comuna actual ----------

function abrirPanelComuna() {
  if (!estado.comunaActual) return;
  document.getElementById('panel-comuna-titulo').textContent =
    `Comentarios en ${estado.comunaActual.nombre}`;
  renderizarComentariosComuna();
  document.getElementById('panel-comuna').classList.remove('oculto');
}

function cerrarPanelComuna() {
  document.getElementById('panel-comuna').classList.add('oculto');
}

function renderizarComentariosComuna() {
  const contenedor = document.getElementById('lista-comentarios-comuna');
  if (!estado.comunaActual) return;

  const codcom = estado.comunaActual.codcom;
  const barriosDeLaComuna = estado.barrios.features.filter(
    (f) => f.properties.CODCOM === codcom
  );

  // Junta todos los comentarios de todos los barrios de esta comuna
  let items = [];
  barriosDeLaComuna.forEach((f) => {
    const idBarrio = idDeBarrio(f);
    (estado.resumenComentarios[idBarrio] || []).forEach((comentario) => {
      items.push({ idBarrio, nombreBarrio: f.properties.NOMBRE, comentario });
    });
  });

  if (items.length === 0) {
    contenedor.innerHTML =
      '<p class="comentario-vacio">Todavía no hay comentarios en ningún barrio de esta comuna.</p>';
    return;
  }

  items.sort((a, b) => new Date(b.comentario.fecha) - new Date(a.comentario.fecha));

  contenedor.innerHTML = '';
  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'comentario comentario-clicable';
    div.title = 'Ver este barrio en el mapa';

    const barrioNombre = document.createElement('div');
    barrioNombre.className = 'comentario-barrio';
    barrioNombre.textContent = item.nombreBarrio;

    const fecha = document.createElement('div');
    fecha.className = 'comentario-fecha';
    fecha.textContent = formatearFecha(item.comentario.fecha);

    const texto = document.createElement('p');
    texto.className = 'comentario-texto';
    texto.textContent = item.comentario.texto;

    div.appendChild(barrioNombre);
    div.appendChild(fecha);
    div.appendChild(texto);

    div.addEventListener('click', () => {
      const layer = encontrarLayerBarrio(item.idBarrio);
      if (layer) entrarABarrio(layer.feature, layer);
    });

    contenedor.appendChild(div);
  });
}

document.getElementById('btn-ver-comentarios').addEventListener('click', abrirPanelComuna);
document.getElementById('cerrar-panel-comuna').addEventListener('click', cerrarPanelComuna);
