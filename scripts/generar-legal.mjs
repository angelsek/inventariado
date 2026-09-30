// Genera las páginas web públicas que pide Google Play (política de privacidad,
// términos y eliminación de cuenta) desde los mismos textos que muestra la app.
//
// Uso:  CONTACTO_CORREO=tu@correo.cl node --experimental-strip-types scripts/generar-legal.mjs
// Resultado: docs/legal-web/*.html, listos para publicar (ver docs/PLAY_STORE.md).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const { FECHA_LEGAL, PRIVACIDAD, TERMINOS } = await import(join(raiz, 'src/legal/textos.ts'));

const correo = process.env.CONTACTO_CORREO || '[correo de contacto]';
const salida = join(raiz, 'docs/legal-web');
mkdirSync(salida, { recursive: true });

const escapar = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Convierte el texto plano (título, párrafos y listas con "- ") en HTML simple. */
function aHtml(texto) {
  const [titulo, ...resto] = texto.split('\n');
  const bloques = resto
    .join('\n')
    .trim()
    .split(/\n\s*\n/);
  const cuerpo = bloques
    .map((bloque) => {
      const lineas = bloque.split('\n');
      if (/^\d+\. /.test(lineas[0])) {
        const [encabezado, ...parrafo] = lineas;
        return `<h2>${escapar(encabezado)}</h2>\n${lista(parrafo)}`;
      }
      return lista(lineas);
    })
    .join('\n');
  return { titulo, cuerpo };
}

/** Agrupa líneas seguidas que empiezan con "- " en una lista; el resto son párrafos. */
function lista(lineas) {
  const html = [];
  let items = [];
  const cerrarLista = () => {
    if (items.length) html.push(`<ul>${items.map((l) => `<li>${escapar(l)}</li>`).join('')}</ul>`);
    items = [];
  };
  for (const linea of lineas.filter(Boolean)) {
    if (linea.startsWith('- ')) {
      items.push(linea.slice(2));
    } else {
      cerrarLista();
      html.push(`<p>${escapar(linea)}</p>`);
    }
  }
  cerrarLista();
  return html.join('\n');
}

function pagina(titulo, cuerpo) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(titulo)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; line-height: 1.55; color: #1a1a1a; }
  h1 { color: #1565c0; font-size: 1.6rem; }
  h2 { font-size: 1.1rem; margin-top: 1.6rem; }
  a { color: #1565c0; }
  nav { margin-bottom: 24px; font-size: 0.95rem; }
  nav a { margin-right: 16px; }
  .contacto { margin-top: 32px; padding: 16px; background: #f5f7fa; border-radius: 8px; }
</style>
</head>
<body>
<nav><a href="index.html">Stockeao</a><a href="privacidad.html">Privacidad</a><a href="terminos.html">Términos</a><a href="eliminar-cuenta.html">Eliminar cuenta</a></nav>
<h1>${escapar(titulo)}</h1>
${cuerpo}
<div class="contacto">Contacto: <a href="mailto:${escapar(correo)}">${escapar(correo)}</a></div>
</body>
</html>
`;
}

const escribir = (nombre, html) => {
  writeFileSync(join(salida, nombre), html);
  console.log('generado', `docs/legal-web/${nombre}`);
};

for (const [nombre, texto] of [
  ['privacidad.html', PRIVACIDAD],
  ['terminos.html', TERMINOS],
]) {
  const { titulo, cuerpo } = aHtml(texto);
  escribir(nombre, pagina(titulo, cuerpo));
}

escribir(
  'eliminar-cuenta.html',
  pagina(
    'Eliminar tu cuenta de Stockeao',
    `<p>El dueño del negocio puede eliminar el negocio y <strong>todos sus datos</strong> en cualquier momento:</p>
<ol>
  <li>Abre Stockeao e ingresa con tu PIN de dueño.</li>
  <li>Ve a la pestaña <strong>Más</strong> → <strong>Eliminar cuenta y datos</strong>.</li>
  <li>Escribe ELIMINAR, ingresa la contraseña de la cuenta y confirma.</li>
</ol>
<p>Se eliminan de forma definitiva: el negocio, sus usuarios y teléfonos, productos, stock, ventas, cajas, proveedores, ingresos de mercadería, la suscripción y su historial de pagos. Solo se conservan registros técnicos anónimos de errores y lo que la ley obligue a conservar.</p>
<p>Si ya no tienes acceso a la app, escríbenos a <a href="mailto:${escapar(correo)}">${escapar(correo)}</a> desde el correo de la cuenta, indicando el nombre del negocio. Eliminaremos los datos en un plazo máximo de 30 días y te confirmaremos por correo.</p>
<p>Antes de eliminar, puedes descargar una copia de tus datos en Más → Exportar datos.</p>`,
  ),
);

escribir(
  'index.html',
  pagina(
    'Stockeao',
    `<p>Inventario, ventas y caja para almacenes, botillerías y minimarkets. Funciona sin internet y sincroniza entre los teléfonos del local.</p>
<ul>
  <li><a href="privacidad.html">Política de privacidad</a></li>
  <li><a href="terminos.html">Términos y condiciones</a></li>
  <li><a href="eliminar-cuenta.html">Cómo eliminar tu cuenta y datos</a></li>
</ul>
<p>Última actualización: ${escapar(FECHA_LEGAL)}.</p>`,
  ),
);
