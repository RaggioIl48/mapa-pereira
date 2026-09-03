# Atlas de Pereira — versión pública (Claude Artifact)

Código fuente de la versión del mapa publicada como un "Artifact" de
Claude, para compartir por internet con un solo link — sin necesitar un
servidor Node propio corriendo todo el tiempo.

## Cómo está armado

- `template.html` — el HTML/CSS de la página (diseño, estructura).
- `logic.template.js` — toda la lógica del mapa (mismo comportamiento
  que `public/js/app.js`, adaptado para guardar los comentarios
  re-publicando la propia página en vez de llamar a un servidor).
- `leaflet.min.css` — CSS de Leaflet.js, incluido tal cual porque un
  Artifact de Claude no puede cargar hojas de estilo externas.
- `build.js` — junta todo lo anterior más `../data/comunas.geojson` y
  `../data/barrios.geojson` en un solo archivo `atlas-pereira.html`
  (~1.3 MB), listo para publicar.

## Cómo generar el archivo final

```bash
cd atlas-publico
node build.js
```

Esto crea/actualiza `atlas-pereira.html`. Para volver a publicarlo hay
que subir ese archivo con la herramienta de Artifacts de Claude (esto
no se puede automatizar desde un `npm script` normal).

## Por qué existe una copia aparte del código

Un Artifact de Claude no puede cargar `public/js/app.js` ni
`public/css/style.css` desde este repositorio (todo tiene que ir
empaquetado en un solo archivo HTML, y las hojas de estilo externas no
están permitidas por su política de seguridad). Por eso el diseño y
parte de la lógica están duplicados a propósito en esta carpeta en vez
de compartirse con `public/`.

## Diferencias importantes con la versión de `public/`

- No usa mapa base (calles/satélite): las comunas y barrios se dibujan
  sobre un fondo con cuadrícula, sin depender de tiles externos (también
  por la política de seguridad de los Artifacts).
- Los comentarios se guardan re-publicando el HTML completo de la
  página (función `guardarComentarios` en `logic.template.js`), no con
  una API HTTP.
- Si quien abre el link no tiene permiso de edición sobre el Artifact,
  la página queda de solo lectura automáticamente.
