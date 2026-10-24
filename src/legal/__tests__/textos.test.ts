import { ELIMINAR_CUENTA, FECHA_LEGAL, PRIVACIDAD, TERMINOS } from '../textos';

it('los tres documentos llevan la fecha de la última actualización', () => {
  for (const texto of [TERMINOS, PRIVACIDAD, ELIMINAR_CUENTA]) {
    expect(texto).toContain(`Última actualización: ${FECHA_LEGAL}`);
  }
});

it('la página de eliminar cuenta explica el camino dentro de la app', () => {
  expect(ELIMINAR_CUENTA).toContain('Más → Eliminar cuenta y datos');
  expect(ELIMINAR_CUENTA).toContain('Más → Exportar datos → Respaldo completo');
});

// Lo exige Google Play y debe calzar con la Política de privacidad (punto 1 y 5).
it('la página de eliminar cuenta dice qué se conserva después de eliminarla', () => {
  expect(ELIMINAR_CUENTA).toContain('código de la prueba gratis');
  expect(ELIMINAR_CUENTA).toContain('Lo que la ley obligue a conservar');
});

// El correo lo pone el generador (scripts/generar-legal.mjs) y la app desde @/config:
// si se escribe a mano acá, queda en dos partes y se desincroniza.
it('ningún texto legal trae el correo de contacto escrito a mano', () => {
  for (const texto of [TERMINOS, PRIVACIDAD, ELIMINAR_CUENTA]) {
    expect(texto).not.toMatch(/@/);
  }
});
