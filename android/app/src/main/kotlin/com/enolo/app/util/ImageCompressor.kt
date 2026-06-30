package com.enolo.app.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.util.Base64
import androidx.exifinterface.media.ExifInterface
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream

object ImageCompressor {
    private const val MAX_SIDE = 1600
    private const val MAX_BYTES = 350 * 1024

    /**
     * Compress image to JPEG, scale to MAX_SIDE, target size MAX_BYTES.
     * Returns pure base64 (no data:... prefix) — matches what the backend expects.
     */
    suspend fun toBase64(context: Context, uri: Uri): String = withContext(Dispatchers.IO) {
        Base64.encodeToString(compressBytes(context, uri), Base64.NO_WRAP)
    }

    /**
     * Сжатый JPEG в файл в cacheDir (для загрузки фото бутылки на сервер). Возвращает файл
     * или null при ошибке. Так фото бутылок не уходят на сервер оригиналами в несколько МБ.
     */
    suspend fun toJpegFile(context: Context, uri: Uri): File? = withContext(Dispatchers.IO) {
        runCatching {
            val bytes = compressBytes(context, uri)
            val f = File(context.cacheDir, "upload_${System.currentTimeMillis()}.jpg")
            f.writeBytes(bytes)
            f
        }.getOrNull()
    }

    /** Декод + EXIF-поворот + масштаб до MAX_SIDE + JPEG с подбором качества под MAX_BYTES. */
    private fun compressBytes(context: Context, uri: Uri): ByteArray {
        val inputStream: InputStream = context.contentResolver.openInputStream(uri)
            ?: throw IllegalArgumentException("Cannot open URI: $uri")
        var bitmap = BitmapFactory.decodeStream(inputStream)
        inputStream.close()

        bitmap = fixOrientation(context, uri, bitmap)

        val w = bitmap.width
        val h = bitmap.height
        if (w > MAX_SIDE || h > MAX_SIDE) {
            val scale = minOf(MAX_SIDE.toFloat() / w, MAX_SIDE.toFloat() / h)
            bitmap = Bitmap.createScaledBitmap(bitmap, (w * scale).toInt(), (h * scale).toInt(), true)
        }

        var quality = 85
        var bytes: ByteArray
        do {
            val out = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
            bytes = out.toByteArray()
            quality -= 10
        } while (bytes.size > MAX_BYTES && quality >= 10)
        return bytes
    }

    private fun fixOrientation(context: Context, uri: Uri, bitmap: Bitmap): Bitmap {
        return try {
            val inputStream = context.contentResolver.openInputStream(uri) ?: return bitmap
            val exif = ExifInterface(inputStream)
            inputStream.close()
            val orientation = exif.getAttributeInt(
                ExifInterface.TAG_ORIENTATION,
                ExifInterface.ORIENTATION_NORMAL
            )
            val matrix = Matrix()
            when (orientation) {
                ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
                ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
                ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
                ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.preScale(-1f, 1f)
                ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.preScale(1f, -1f)
                else -> return bitmap
            }
            Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
        } catch (_: Exception) {
            bitmap
        }
    }
}
