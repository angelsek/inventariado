import { File, Paths } from 'expo-file-system';
import { shareAsync } from 'expo-sharing';

/** Guarda el contenido en un archivo temporal y abre el menú de compartir de Android. */
export async function compartirArchivo(nombre: string, tipo: string, contenido: string) {
  const archivo = new File(Paths.cache, nombre);
  if (archivo.exists) archivo.delete();
  archivo.create();
  archivo.write(contenido);
  await shareAsync(archivo.uri, { mimeType: tipo, dialogTitle: nombre });
}
