/**
 * Términos y condiciones y política de privacidad (borradores).
 * IMPORTANTE: deben revisarse con un abogado antes de vender la app
 * (Ley 19.628 y Ley 21.719 de protección de datos personales, Ley 19.496 del consumidor).
 * Al cambiarlos, actualizar la fecha.
 */

export const FECHA_LEGAL = '29 de septiembre de 2026';

export const TERMINOS = `Términos y condiciones de uso de Stockeao

Última actualización: ${FECHA_LEGAL}

1. El servicio
Stockeao es una aplicación para administrar el inventario, las ventas y la caja de almacenes, botillerías y comercios similares. Se ofrece como servicio con pago mensual por negocio.

2. Cuenta y usuarios
El negocio se registra con un correo y contraseña, que son responsabilidad de quien los crea. Los usuarios del local (dueño y cajeros) se identifican con un PIN, que sirve para distinguir a las personas en el teléfono y no reemplaza la contraseña de la cuenta.

3. Prueba gratis, planes y pagos
Cada negocio nuevo tiene un período de prueba gratis. Luego debe contratar un plan mensual directamente con Stockeao. Los planes difieren, entre otras cosas, en la cantidad de teléfonos que se pueden usar. Los precios vigentes se informan al contratar y pueden cambiar con aviso previo de al menos 30 días.

4. Vencimiento y suspensión
Si la suscripción vence, hay un período de gracia durante el cual la app sigue funcionando con avisos. Terminado ese período, la app queda en modo solo lectura: se pueden consultar los datos, pero no registrar ventas ni hacer cambios. Los datos no se borran por falta de pago y el servicio se reactiva al pagar.

5. Uso correcto
El cliente se compromete a usar la app para fines lícitos y a no intentar acceder a datos de otros negocios. Stockeao no es un sistema de facturación ni de boleta electrónica: los comprobantes que genera son internos y no tienen validez tributaria. El cumplimiento de las obligaciones tributarias es responsabilidad del cliente.

6. Disponibilidad
La app funciona sin internet y sincroniza los datos cuando hay conexión. Se hacen esfuerzos razonables para que el servicio esté disponible y los datos respaldados, pero pueden ocurrir interrupciones. Se recomienda revisar periódicamente los reportes y cierres de caja.

7. Responsabilidad
El servicio se entrega "tal cual". Stockeao no responde por pérdidas derivadas de un mal uso, de datos ingresados incorrectamente, de fallas del teléfono o de la conexión, ni por decisiones comerciales tomadas con la información de la app, en la medida que la ley lo permita.

8. Término del servicio
El cliente puede dejar de usar el servicio en cualquier momento. Puede descargar una copia de sus datos (Más → Exportar datos) y eliminar el negocio con todos sus datos (Más → Eliminar cuenta y datos), según la Política de privacidad.

9. Cambios
Estos términos pueden actualizarse. Los cambios relevantes se avisarán en la app.

10. Ley aplicable
Estos términos se rigen por las leyes de la República de Chile.`;

export const PRIVACIDAD = `Política de privacidad de Stockeao

Última actualización: ${FECHA_LEGAL}

1. Qué datos se guardan
- Datos de la cuenta: correo del dueño y datos del negocio (nombre, RUT y dirección, si se ingresan).
- Datos de uso del local: usuarios y sus PIN (guardados cifrados con una función hash, nunca en texto), productos, precios, costos, stock, ventas, pagos, cajas, proveedores e ingresos de mercadería.
- Datos técnicos: modelo del teléfono y fecha de la última sincronización.
La app no pide ni guarda datos de los clientes finales del local ni datos de tarjetas.

2. Para qué se usan
Para prestar el servicio (guardar y sincronizar la información entre los teléfonos del negocio), administrar la suscripción y dar soporte. No se venden ni se ceden los datos a terceros.

3. Dónde se guardan
En el teléfono (para funcionar sin internet) y en servidores de Supabase, proveedor de infraestructura que puede alojar los datos fuera de Chile. Cada negocio solo puede ver sus propios datos.

4. Cámara
La cámara se usa solo para leer códigos de barras. No se guardan fotos ni videos.

5. Cuánto tiempo se guardan y cómo eliminarlos
Mientras la cuenta exista. El dueño del negocio puede eliminar el negocio y todos sus datos en cualquier momento desde la app, en Más → Eliminar cuenta y datos, o solicitarlo escribiendo al contacto indicado. La eliminación es definitiva e incluye productos, ventas, cajas, usuarios, teléfonos y suscripción; solo se conservan registros técnicos anónimos de errores y lo que la ley obligue a conservar.

6. Derechos
El titular puede solicitar acceso, rectificación, eliminación u oposición al tratamiento de sus datos, y una copia de ellos, escribiendo al contacto indicado en la app.

7. Seguridad
La comunicación con el servidor va cifrada y el acceso está restringido por negocio. Aun así, ningún sistema es completamente seguro: se recomienda proteger el teléfono y la contraseña de la cuenta.

8. Cambios
Esta política puede actualizarse. Los cambios relevantes se avisarán en la app.`;
