const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const PROJECT = path.join(__dirname, '..'); // la carpeta del proyecto, un nivel arriba

function leer(p) { return fs.readFileSync(p, 'utf8'); }

function lit(s) {
  // JS string literal seguro para pegar dentro de un <script> en línea
  return JSON.stringify(s).replace(/</g, '\\u003c');
}

function sustituir(texto, marcador, valor) {
  if (!texto.includes(marcador)) {
    throw new Error('No se encontró el marcador ' + marcador);
  }
  return texto.split(marcador).join(valor);
}

// ---------- 1. Plantilla HTML + CSS de leaflet ----------
let template = leer(path.join(DIR, 'template.html'));
const leafletCss = leer(path.join(DIR, 'leaflet.min.css'));
template = sustituir(template, '__LEAFLET_CSS__', leafletCss);

// ---------- 2. Partir la plantilla alrededor del bloque de datos y del logic-script ----------
const OPEN_DATA = '<script id="datos-comentarios" type="application/json">';
const idxOpenStart = template.indexOf(OPEN_DATA);
if (idxOpenStart === -1) throw new Error('No se encontró el tag de datos-comentarios');
const idxOpenEnd = idxOpenStart + OPEN_DATA.length;
const htmlBeforeData = template.slice(0, idxOpenEnd);

const idxDataClose = template.indexOf('</script>', idxOpenEnd);
if (idxDataClose === -1) throw new Error('No se encontró el cierre de datos-comentarios');
const idxAfterDataClose = idxDataClose + '</script>'.length;

const LOGIC_PLACEHOLDER = '__LOGIC_SCRIPT__';
const idxLogicPlaceholder = template.indexOf(LOGIC_PLACEHOLDER);
if (idxLogicPlaceholder === -1) throw new Error('No se encontró el marcador de logic-script');
const htmlBetween = template.slice(idxAfterDataClose, idxLogicPlaceholder);

const idxAfterPlaceholder = idxLogicPlaceholder + LOGIC_PLACEHOLDER.length;
const htmlTail = template.slice(idxAfterPlaceholder);

// ---------- 3. Datos geográficos ----------
const comunasJson = leer(path.join(PROJECT, 'data', 'comunas.geojson')).trim();
const barriosJson = leer(path.join(PROJECT, 'data', 'barrios.geojson')).trim();
const comunasSeguro = comunasJson.split('</').join('<\\/');
const barriosSeguro = barriosJson.split('</').join('<\\/');

// ---------- 4. Rellenar logic.template.js ----------
let logic = leer(path.join(DIR, 'logic.template.js'));
logic = sustituir(logic, '__HTML_BEFORE_DATA_LITERAL__', lit(htmlBeforeData));
logic = sustituir(logic, '__HTML_BETWEEN_LITERAL__', lit(htmlBetween));
logic = sustituir(logic, '__HTML_TAIL_LITERAL__', lit(htmlTail));
logic = sustituir(logic, '__COMUNAS_JSON__', comunasSeguro);
logic = sustituir(logic, '__BARRIOS_JSON__', barriosSeguro);

// ---------- 5. Armar el HTML final ----------
const finalHtml = template.slice(0, idxLogicPlaceholder) + logic + template.slice(idxAfterPlaceholder);

const outPath = path.join(DIR, 'atlas-pereira.html');
fs.writeFileSync(outPath, finalHtml, 'utf8');

console.log('OK ->', outPath);
console.log('Tamaño final:', (finalHtml.length / 1024 / 1024).toFixed(2), 'MB');
