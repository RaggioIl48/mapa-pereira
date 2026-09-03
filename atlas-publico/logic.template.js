(function () {
  'use strict';

  // Se captura el HTML exacto de este mismo <script> apenas empieza a
  // ejecutarse (nunca cambia durante la vida de la página), para poder
  // re-publicar la página completa más adelante sin duplicar el código.
  var MI_SCRIPT_HTML = document.currentScript.outerHTML;

  // ---------- Datos geográficos (no cambian) ----------
  var COMUNAS_GEOJSON = __COMUNAS_JSON__;
  var BARRIOS_GEOJSON = __BARRIOS_JSON__;

  // ---------- Fragmentos de la plantilla, para re-publicar la página ----------
  var PLANTILLA_ANTES = __HTML_BEFORE_DATA_LITERAL__;
  var PLANTILLA_ENTRE = __HTML_BETWEEN_LITERAL__;
  var PLANTILLA_FINAL = __HTML_TAIL_LITERAL__;

  function jsonSeguroParaTag(valor) {
    // JSON válido, seguro para pegar dentro de un <script type="application/json">
    return JSON.stringify(valor).replace(/</g, '\\u003c');
  }

  function construirHTMLCompleto(comentarios) {
    return (
      PLANTILLA_ANTES +
      jsonSeguroParaTag(comentarios) +
      PLANTILLA_ENTRE +
      MI_SCRIPT_HTML +
      PLANTILLA_FINAL
    );
  }

  // ---------- Paleta de color (comunas y barrios) ----------
  var PALETA = [
    '#6f9c78', '#c68e46', '#5f8fa6', '#a8735c',
    '#8f9457', '#7aa79c', '#b78a52', '#4f7d5c',
    '#a67862', '#6486a0', '#9c8a4e', '#5c8f7e',
    '#b98456', '#5f7a5a', '#8a7396', '#4f8f86',
  ];
  function colorPorIndice(i) { return PALETA[i % PALETA.length]; }

  // El campo CODBAR del archivo de barrios NO es único (varios barrios
  // distintos comparten el mismo código, incluso vacío). El FID sí es
  // único por barrio, así que es lo que usamos como llave interna.
  function idDeBarrio(feature) { return String(feature.properties.FID); }

  function esOscuro() {
    var atributo = document.documentElement.getAttribute('data-theme');
    if (atributo === 'dark') return true;
    if (atributo === 'light') return false;
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  var COLOR_TRAZO = esOscuro() ? 'rgba(238,241,230,0.4)' : 'rgba(28,38,32,0.45)';

  // ---------- Estado ----------
  var estado = {
    vista: 'comunas', // 'comunas' | 'comuna' | 'barrio'
    comunaActual: null, // { codcom, nombre }
    barrioActual: null, // { idBarrio, nombre, codigoOficial }
    comentarios: {}, // idBarrio (FID) -> [ {id, texto, fecha} ]
    capaComunas: null,
    capaBarrios: null,
    soloLectura: false, // se activa si un intento de guardar falla por permisos
    guardando: false,
  };

  try {
    var elDatos = document.getElementById('datos-comentarios');
    estado.comentarios = JSON.parse(elDatos.textContent || '{}');
  } catch (e) {
    estado.comentarios = {};
  }

  // ---------- Restaurar un borrador si veníamos de guardar justo antes de un reload ----------
  var borradorPendiente = null;
  try {
    var crudo = sessionStorage.getItem('borrador-comentario');
    if (crudo) {
      borradorPendiente = JSON.parse(crudo);
      sessionStorage.removeItem('borrador-comentario');
    }
  } catch (e) { /* sin sessionStorage disponible: seguimos sin borrador */ }

  // ---------- Mapa ----------
  var mapa = L.map('mapa', { zoomControl: true }).setView([4.8133, -75.6961], 13);

  // Leaflet mide el tamaño del contenedor cuando se crea; si la ventana
  // cambia de tamaño (o el contenedor no tenía su tamaño final todavía),
  // hay que avisarle explícitamente.
  window.addEventListener('resize', function () { mapa.invalidateSize(); });
  setTimeout(function () { mapa.invalidateSize(); }, 0);

  // ---------- Iconos de "tiene comentarios" ----------
  function tieneComentarios(idBarrio) {
    return (estado.comentarios[idBarrio] || []).length > 0;
  }
  function comunaTieneComentarios(codcom) {
    return BARRIOS_GEOJSON.features.some(function (f) {
      return f.properties.CODCOM === codcom && tieneComentarios(idDeBarrio(f));
    });
  }
  function etiquetaConIcono(nombre, marcar) {
    return marcar ? ('💬 ' + nombre) : nombre;
  }
  function actualizarIconos() {
    if (estado.capaComunas) {
      estado.capaComunas.eachLayer(function (layer) {
        var p = layer.feature.properties;
        layer.setTooltipContent(etiquetaConIcono(p.nombre, comunaTieneComentarios(p.codcom)));
      });
    }
    if (estado.capaBarrios) {
      estado.capaBarrios.eachLayer(function (layer) {
        layer.setTooltipContent(
          etiquetaConIcono(layer.feature.properties.NOMBRE, tieneComentarios(idDeBarrio(layer.feature)))
        );
      });
    }
  }
  function encontrarLayerBarrio(idBarrio) {
    if (!estado.capaBarrios) return null;
    var encontrado = null;
    estado.capaBarrios.eachLayer(function (l) {
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
      estado.capaComunas = L.geoJSON(COMUNAS_GEOJSON, {
        style: function (feature) { return estiloComuna(feature); },
        onEachFeature: function (feature, layer) {
          layer.bindTooltip(
            etiquetaConIcono(feature.properties.nombre, comunaTieneComentarios(feature.properties.codcom)),
            { permanent: true, direction: 'center', className: 'etiqueta-comuna' }
          );
          layer.on('click', function () { entrarAComuna(feature); });
          layer.on('mouseover', function () { layer.setStyle({ weight: 2.6 }); });
          layer.on('mouseout', function () { layer.setStyle({ weight: 1.3 }); });
        },
      });
    }
    estado.capaComunas.addTo(mapa);
    mapa.fitBounds(estado.capaComunas.getBounds(), { padding: [24, 24] });

    actualizarRuta();
  }

  function estiloComuna(feature) {
    var indice = COMUNAS_GEOJSON.features.indexOf(feature);
    return {
      color: COLOR_TRAZO,
      weight: 1.3,
      opacity: 1,
      fillColor: colorPorIndice(indice),
      fillOpacity: 0.5,
    };
  }

  // ---------- Vista: barrios de una comuna ----------
  function entrarAComuna(feature) {
    var codcom = feature.properties.codcom;
    var nombre = feature.properties.nombre;
    estado.vista = 'comuna';
    estado.comunaActual = { codcom: codcom, nombre: nombre };
    estado.barrioActual = null;
    cerrarPanel();
    cerrarPanelComuna();

    mapa.removeLayer(estado.capaComunas);
    if (estado.capaBarrios) mapa.removeLayer(estado.capaBarrios);

    var barriosDeLaComuna = {
      type: 'FeatureCollection',
      features: BARRIOS_GEOJSON.features.filter(function (f) {
        return f.properties.CODCOM === codcom;
      }),
    };

    estado.capaBarrios = L.geoJSON(barriosDeLaComuna, {
      style: function (feature) { return estiloBarrio(feature, barriosDeLaComuna.features); },
      onEachFeature: function (feature, layer) {
        layer.bindTooltip(
          etiquetaConIcono(feature.properties.NOMBRE, tieneComentarios(idDeBarrio(feature))),
          { permanent: true, direction: 'center', className: 'etiqueta-barrio' }
        );
        layer.on('click', function () { entrarABarrio(feature, layer); });
        layer.on('mouseover', function () { layer.setStyle({ weight: 2.4 }); });
        layer.on('mouseout', function () { restaurarEstiloBarrio(layer, feature); });
      },
    }).addTo(mapa);

    if (barriosDeLaComuna.features.length > 0) {
      mapa.fitBounds(estado.capaBarrios.getBounds(), { padding: [24, 24] });
    }

    actualizarRuta();
  }

  function estiloBarrio(feature, listaBarrios) {
    var indice = listaBarrios.indexOf(feature);
    var esSeleccionado = estado.barrioActual && estado.barrioActual.idBarrio === idDeBarrio(feature);
    return {
      color: COLOR_TRAZO,
      weight: esSeleccionado ? 2.6 : 1,
      opacity: esSeleccionado ? 1 : 0.65,
      fillColor: colorPorIndice(indice + 3),
      fillOpacity: esSeleccionado ? 0.72 : 0.55,
    };
  }

  function restaurarEstiloBarrio(layer, feature) {
    var lista = [];
    if (estado.capaBarrios) {
      estado.capaBarrios.eachLayer(function (l) { lista.push(l.feature); });
    }
    layer.setStyle(estiloBarrio(feature, lista));
  }

  // ---------- Vista: un barrio ----------
  function entrarABarrio(feature, layer) {
    estado.vista = 'barrio';
    estado.barrioActual = {
      idBarrio: idDeBarrio(feature),
      nombre: feature.properties.NOMBRE,
      codigoOficial: feature.properties.CODBAR,
    };
    cerrarPanelComuna();

    estado.capaBarrios.eachLayer(function (l) { restaurarEstiloBarrio(l, l.feature); });
    mapa.fitBounds(layer.getBounds(), { padding: [50, 50], maxZoom: 17 });

    actualizarRuta();
    abrirPanel(estado.barrioActual);
  }

  // ---------- Ruta (breadcrumb) ----------
  function actualizarRuta() {
    var html = '';
    if (estado.vista !== 'comunas') {
      html += '<button type="button" class="btn-atras" id="btn-atras">← Volver</button>';
    }
    html += '<button type="button" class="' + (estado.vista === 'comunas' ? 'nivel-actual' : 'enlace') + '" id="ir-comunas">Comunas</button>';
    if (estado.comunaActual) {
      var actualComuna = estado.vista === 'comuna';
      html += '<span class="separador">›</span>';
      html += '<button type="button" class="' + (actualComuna ? 'nivel-actual' : 'enlace') + '" id="ir-comuna">' + escaparHTML(estado.comunaActual.nombre) + '</button>';
    }
    if (estado.barrioActual) {
      html += '<span class="separador">›</span>';
      html += '<span class="nivel-actual">' + escaparHTML(estado.barrioActual.nombre) + '</span>';
    }
    document.getElementById('ruta').innerHTML = html;

    var btnVer = document.getElementById('btn-ver-comentarios');
    btnVer.classList.toggle('oculto', estado.vista !== 'comuna');

    document.getElementById('ir-comunas').addEventListener('click', mostrarComunas);
    var irComuna = document.getElementById('ir-comuna');
    if (irComuna) {
      irComuna.addEventListener('click', function () {
        entrarAComuna({ properties: { codcom: estado.comunaActual.codcom, nombre: estado.comunaActual.nombre } });
      });
    }
    var btnAtras = document.getElementById('btn-atras');
    if (btnAtras) btnAtras.addEventListener('click', volverAtras);
  }

  function volverAtras() {
    if (estado.vista === 'barrio') {
      estado.vista = 'comuna';
      estado.barrioActual = null;
      cerrarPanel();
      estado.capaBarrios.eachLayer(function (l) { restaurarEstiloBarrio(l, l.feature); });
      if (estado.capaBarrios.getBounds().isValid()) {
        mapa.fitBounds(estado.capaBarrios.getBounds(), { padding: [24, 24] });
      }
      actualizarRuta();
    } else if (estado.vista === 'comuna') {
      mostrarComunas();
    }
  }

  function escaparHTML(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ---------- Panel: un barrio ----------
  function abrirPanel(barrio) {
    document.getElementById('panel-titulo').textContent = barrio.nombre;
    var meta = (estado.comunaActual ? estado.comunaActual.nombre.toUpperCase() : '');
    if (barrio.codigoOficial && barrio.codigoOficial.trim()) {
      meta += (meta ? ' · ' : '') + 'CÓDIGO ' + barrio.codigoOficial;
    }
    document.getElementById('panel-meta').textContent = meta;
    document.getElementById('panel-barrio').classList.remove('oculto');
    renderizarComentarios(barrio.idBarrio);
    renderizarZonaFormulario(barrio.idBarrio);

    if (borradorPendiente && borradorPendiente.idBarrio === barrio.idBarrio) {
      var ta = document.getElementById('texto-comentario');
      if (ta) ta.value = borradorPendiente.texto;
      borradorPendiente = null;
    }
  }

  function cerrarPanel() {
    document.getElementById('panel-barrio').classList.add('oculto');
    document.getElementById('lista-comentarios').innerHTML = '';
    document.getElementById('zona-form-comentario').innerHTML = '';
  }

  document.getElementById('cerrar-panel').addEventListener('click', function () {
    if (estado.vista === 'barrio') volverAtras(); else cerrarPanel();
  });

  function renderizarComentarios(idBarrio) {
    var contenedor = document.getElementById('lista-comentarios');
    var comentarios = estado.comentarios[idBarrio] || [];

    if (comentarios.length === 0) {
      contenedor.innerHTML = '<p class="comentario-vacio">Todavía no hay comentarios para este barrio.</p>';
      return;
    }

    contenedor.innerHTML = '';
    comentarios.slice().reverse().forEach(function (comentario) {
      var div = document.createElement('div');
      div.className = 'comentario';

      var fecha = document.createElement('div');
      fecha.className = 'comentario-fecha mono';
      fecha.textContent = formatearFecha(comentario.fecha);

      var texto = document.createElement('p');
      texto.className = 'comentario-texto';
      texto.textContent = comentario.texto;

      if (!estado.soloLectura) {
        var borrar = document.createElement('button');
        borrar.type = 'button';
        borrar.className = 'comentario-borrar';
        borrar.textContent = 'Borrar';
        borrar.addEventListener('click', function () { borrarComentario(idBarrio, comentario.id); });
        div.appendChild(borrar);
      }

      div.appendChild(fecha);
      div.appendChild(texto);
      contenedor.appendChild(div);
    });
  }

  function renderizarZonaFormulario(idBarrio) {
    var zona = document.getElementById('zona-form-comentario');
    if (estado.soloLectura) {
      zona.innerHTML =
        '<p class="aviso-solo-lectura">Estás viendo una copia pública de solo lectura: tus comentarios no se pueden guardar aquí para otras personas.</p>';
      return;
    }
    zona.innerHTML =
      '<form id="form-comentario">' +
      '<textarea id="texto-comentario" placeholder="Escribe un comentario sobre este barrio..." rows="3" required></textarea>' +
      '<button type="submit" id="btn-guardar-comentario">Guardar comentario</button>' +
      '</form>';

    document.getElementById('form-comentario').addEventListener('submit', function (evento) {
      evento.preventDefault();
      var textarea = document.getElementById('texto-comentario');
      var texto = textarea.value.trim();
      if (!texto || estado.guardando) return;
      agregarComentario(idBarrio, texto);
    });
  }

  function formatearFecha(isoString) {
    var fecha = new Date(isoString);
    return fecha.toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // ---------- Panel: comentarios de toda la comuna ----------
  function abrirPanelComuna() {
    if (!estado.comunaActual) return;
    document.getElementById('panel-comuna-titulo').textContent = 'Comentarios en ' + estado.comunaActual.nombre;
    renderizarComentariosComuna();
    document.getElementById('panel-comuna').classList.remove('oculto');
  }

  function cerrarPanelComuna() {
    document.getElementById('panel-comuna').classList.add('oculto');
  }

  function renderizarComentariosComuna() {
    var contenedor = document.getElementById('lista-comentarios-comuna');
    if (!estado.comunaActual) return;

    var codcom = estado.comunaActual.codcom;
    var barriosDeLaComuna = BARRIOS_GEOJSON.features.filter(function (f) { return f.properties.CODCOM === codcom; });

    var items = [];
    barriosDeLaComuna.forEach(function (f) {
      var idBarrio = idDeBarrio(f);
      (estado.comentarios[idBarrio] || []).forEach(function (comentario) {
        items.push({ idBarrio: idBarrio, nombreBarrio: f.properties.NOMBRE, comentario: comentario });
      });
    });

    if (items.length === 0) {
      contenedor.innerHTML = '<p class="comentario-vacio">Todavía no hay comentarios en ningún barrio de esta comuna.</p>';
      return;
    }

    items.sort(function (a, b) { return new Date(b.comentario.fecha) - new Date(a.comentario.fecha); });

    contenedor.innerHTML = '';
    items.forEach(function (item) {
      var div = document.createElement('div');
      div.className = 'comentario comentario-clicable';
      div.title = 'Ver este barrio en el mapa';
      div.tabIndex = 0;

      var barrioNombre = document.createElement('div');
      barrioNombre.className = 'comentario-barrio';
      barrioNombre.textContent = item.nombreBarrio;

      var fecha = document.createElement('div');
      fecha.className = 'comentario-fecha mono';
      fecha.textContent = formatearFecha(item.comentario.fecha);

      var texto = document.createElement('p');
      texto.className = 'comentario-texto';
      texto.textContent = item.comentario.texto;

      div.appendChild(barrioNombre);
      div.appendChild(fecha);
      div.appendChild(texto);

      var ir = function () {
        var layer = encontrarLayerBarrio(item.idBarrio);
        if (layer) entrarABarrio(layer.feature, layer);
      };
      div.addEventListener('click', ir);
      div.addEventListener('keydown', function (e) { if (e.key === 'Enter') ir(); });

      contenedor.appendChild(div);
    });
  }

  document.getElementById('btn-ver-comentarios').addEventListener('click', abrirPanelComuna);
  document.getElementById('cerrar-panel-comuna').addEventListener('click', cerrarPanelComuna);

  // ---------- Guardar en la nube (re-publica la página) ----------
  var capacidadArtifact = null; // se llena de forma perezosa
  function obtenerCapacidadArtifact() {
    if (!capacidadArtifact) {
      capacidadArtifact = (window.claude && typeof window.claude.use === 'function')
        ? window.claude.use('artifact')
        : Promise.resolve(null);
    }
    return capacidadArtifact;
  }

  function marcarSoloLectura(mensaje) {
    estado.soloLectura = true;
    if (estado.barrioActual) renderizarZonaFormulario(estado.barrioActual.idBarrio);
    if (estado.barrioActual) renderizarComentarios(estado.barrioActual.idBarrio);
    if (mensaje) window.alert(mensaje);
  }

  function agregarComentario(idBarrio, texto) {
    var nuevoComentario = {
      id: (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
      texto: texto,
      fecha: new Date().toISOString(),
    };
    var copia = JSON.parse(JSON.stringify(estado.comentarios));
    if (!copia[idBarrio]) copia[idBarrio] = [];
    copia[idBarrio].push(nuevoComentario);

    try {
      sessionStorage.setItem('borrador-comentario', JSON.stringify({ idBarrio: idBarrio, texto: texto }));
    } catch (e) { /* sin sessionStorage: seguimos igual */ }

    guardarComentarios(copia, 'No se pudo guardar tu comentario: esta copia pública es de solo lectura para ti.');
  }

  function borrarComentario(idBarrio, id) {
    var copia = JSON.parse(JSON.stringify(estado.comentarios));
    copia[idBarrio] = (copia[idBarrio] || []).filter(function (c) { return c.id !== id; });
    guardarComentarios(copia, 'No se pudo borrar el comentario: esta copia pública es de solo lectura para ti.');
  }

  function guardarComentarios(nuevosComentarios, mensajeSiSoloLectura) {
    estado.guardando = true;
    var boton = document.getElementById('btn-guardar-comentario');
    if (boton) { boton.disabled = true; boton.textContent = 'Guardando…'; }

    obtenerCapacidadArtifact().then(function (artifact) {
      if (!artifact) {
        estado.guardando = false;
        marcarSoloLectura('Los comentarios no se pueden guardar desde esta vista.');
        return;
      }
      var html = construirHTMLCompleto(nuevosComentarios);
      artifact.publish(html).then(function () {
        // Si tuvo éxito, la propia plataforma recarga esta vista con los
        // datos nuevos — no hace falta re-renderizar a mano.
      }).catch(function (err) {
        estado.guardando = false;
        if (boton) { boton.disabled = false; boton.textContent = 'Guardar comentario'; }
        var codigo = err && err.code;
        if (codigo === 'not_writer' || codigo === 'not_granted' || codigo === 'consent_required') {
          marcarSoloLectura(mensajeSiSoloLectura);
        } else if (codigo === 'conflict') {
          // La vista ya se está recargando con la versión más reciente.
        } else {
          window.alert('No se pudo guardar el comentario. Intenta de nuevo en un momento.');
        }
      });
    });
  }

  // ---------- Arranque ----------
  mostrarComunas();
  actualizarIconos();

  if (borradorPendiente) {
    var barrioDelBorrador = BARRIOS_GEOJSON.features.find(function (f) { return idDeBarrio(f) === borradorPendiente.idBarrio; });
    if (barrioDelBorrador) {
      var comunaFeature = COMUNAS_GEOJSON.features.find(function (f) { return f.properties.codcom === barrioDelBorrador.properties.CODCOM; });
      if (comunaFeature) {
        entrarAComuna(comunaFeature); // esto construye estado.capaBarrios
        var layerBorrador = encontrarLayerBarrio(borradorPendiente.idBarrio);
        if (layerBorrador) entrarABarrio(layerBorrador.feature, layerBorrador);
      }
    }
  }
})();
