package expo.modules.verificadorapk

import android.net.Uri
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

/**
 * Calcula el SHA-256 de un archivo leyendo por bloques: un APK de ~70 MB no se carga
 * entero en memoria. Solo acepta archivos de la caché de la app (donde se descarga el APK).
 */
class VerificadorApkModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VerificadorApk")

    AsyncFunction("sha256Async") { uri: String ->
      val ruta = if (uri.startsWith("file://")) Uri.parse(uri).path else uri
      val archivo = File(ruta ?: throw ArchivoNoPermitido()).canonicalFile
      val cache = appContext.reactContext?.cacheDir?.canonicalFile ?: throw ArchivoNoPermitido()
      if (!archivo.path.startsWith(cache.path + File.separator) || !archivo.isFile) {
        throw ArchivoNoPermitido()
      }
      val digest = MessageDigest.getInstance("SHA-256")
      FileInputStream(archivo).use { entrada ->
        val buffer = ByteArray(64 * 1024)
        while (true) {
          val leidos = entrada.read(buffer)
          if (leidos < 0) break
          digest.update(buffer, 0, leidos)
        }
      }
      digest.digest().joinToString("") { "%02x".format(it) }
    }
  }
}

private class ArchivoNoPermitido :
  CodedException("Solo se puede verificar un archivo existente de la caché de la app.")
