# Mapa interactivo de Pereira

Mapa por capas de las comunas y barrios de Pereira (Colombia), con la
posibilidad de dejar comentarios en cada barrio (por ejemplo, para
registrar afectaciones por inundaciones, sismos, etc.).

## Cómo funciona

1. El mapa arranca mostrando las 21 comunas de Pereira, coloreadas y con
   su nombre.
2. Al hacer clic en una comuna, el mapa se acerca y muestra solo sus
   barrios.
3. Al hacer clic en un barrio, se abre un panel para leer y agregar
   comentarios sobre ese barrio.
4. Las comunas y los barrios que ya tienen comentarios muestran un
   ícono 💬 junto a su nombre. Dentro de una comuna hay un botón para
   ver todos sus comentarios en una sola lista.

Los datos de comunas y barrios vienen del portal de datos abiertos del
municipio de Pereira (ArcGIS). Los comentarios se guardan en un archivo
(`data/comentarios.json`) en el servidor.

## Cómo ejecutarlo en tu computador

Necesitas tener [Node.js](https://nodejs.org) instalado.

```bash
npm install
npm start
```

Luego abre `http://localhost:3000` en tu navegador.

## Estructura del proyecto

```
server.js              → backend (Express): sirve la página y la API de comentarios
data/
  comunas.geojson       → dibujo de las comunas
  barrios.geojson        → dibujo de los barrios
  comentarios.json       → comentarios guardados (no se sube a GitHub, ver .gitignore)
public/
  index.html
  css/style.css
  js/app.js              → toda la lógica del mapa (Leaflet.js)
```

## Versión pública (Atlas de Pereira)

Existe una segunda versión de esta app, pensada solo para compartir por
internet, publicada como un "Artifact" de Claude (no vive en este
repositorio de GitHub, sino en `scratchpad/atlas-pereira.html` + su
plantilla). Usa un diseño propio y guarda los comentarios re-publicando
la propia página en vez de un servidor Node — así no depende de que tu
computador esté prendido. El acceso de lectura/escritura para otras
personas depende de cómo compartas ese link desde claude.ai.

## Publicarlo en internet (esta versión, la de GitHub)

Este proyecto tiene un backend (Node/Express) que necesita estar
"corriendo" todo el tiempo para guardar comentarios de verdad. Por eso
GitHub por sí solo no puede servir la app completa (GitHub sólo aloja
el código). Para que otras personas la usen por internet hace falta
desplegarlo en un servicio de hosting que ejecute Node.js, por ejemplo
[Render](https://render.com) (tiene un plan gratuito):

1. Crea una cuenta en Render (o el hosting que prefieras).
2. "New Web Service" → conecta este repositorio de GitHub.
3. Comando de build: `npm install`. Comando de arranque: `npm start`.
4. Render te da un link público (algo como `https://tu-app.onrender.com`).
