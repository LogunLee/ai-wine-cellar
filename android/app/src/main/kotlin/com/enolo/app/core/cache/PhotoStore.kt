package com.enolo.app.core.cache

import android.content.Context
import com.enolo.app.core.storage.SettingsStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Локальное хранилище фото вин для офлайна. Фото скачиваются в filesDir/wine_photos с проверкой,
 * что это реально изображение (магические байты) — иначе мусор не сохранится. Карточки берут
 * локальный файл, если он есть, иначе грузят с сервера.
 */
@Singleton
class PhotoStore @Inject constructor(
    @ApplicationContext private val context: Context,
    private val settingsStore: SettingsStore,
) {
    private val dir = File(context.filesDir, "wine_photos").apply { mkdirs() }

    /** Имя локального файла = последний сегмент пути (он уникален: содержит uuid+timestamp). */
    private fun fileFor(photoPath: String): File =
        File(dir, photoPath.substringAfterLast('/').ifBlank { photoPath.hashCode().toString() })

    /** Локальный file:// URI, если фото уже скачано; иначе null. */
    fun localUri(photoPath: String?): String? {
        if (photoPath.isNullOrBlank()) return null
        val f = fileFor(photoPath)
        return if (f.exists() && f.length() > 0) "file://${f.absolutePath}" else null
    }

    /**
     * Скачать недостающие фото — ПАРАЛЛЕЛЬНО (до 6 за раз) и ДОЖДАТЬСЯ завершения (suspend).
     * Вызывается внутри синхронизации, поэтому кнопка крутится, пока все фото не докачаны.
     * Best-effort: ошибки отдельных фото не прерывают остальные. Уже скачанные пропускаются.
     */
    suspend fun downloadMissing(photoPaths: List<String?>): Unit = coroutineScope {
        val base = settingsStore.serverUrlBlocking().trimEnd('/')
        val todo = photoPaths.filterNotNull().distinct().filter { p ->
            val f = fileFor(p); !(f.exists() && f.length() > 0)
        }
        if (todo.isEmpty()) return@coroutineScope
        val sem = Semaphore(6)
        todo.map { p ->
            async(Dispatchers.IO) {
                sem.withPermit {
                    runCatching {
                        val url = if (p.startsWith("http")) p else "$base$p"
                        val bytes = download(url) ?: return@runCatching
                        if (isImage(bytes)) {
                            val f = fileFor(p)
                            val tmp = File(dir, f.name + ".tmp")
                            tmp.writeBytes(bytes)
                            tmp.renameTo(f) // атомарно: в кэше нет полупустых файлов
                        }
                    }
                }
            }
        }.awaitAll()
    }

    private fun download(url: String): ByteArray? {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15000
            readTimeout = 15000
            requestMethod = "GET"
        }
        return try {
            if (conn.responseCode !in 200..299) return null
            conn.inputStream.use { it.readBytes() }
        } catch (_: Exception) {
            null
        } finally {
            conn.disconnect()
        }
    }

    /** Магические байты: JPEG/PNG/GIF/WEBP. HTML-страница антибота не пройдёт. */
    private fun isImage(b: ByteArray): Boolean {
        if (b.size < 12) return false
        val jpeg = b[0] == 0xFF.toByte() && b[1] == 0xD8.toByte() && b[2] == 0xFF.toByte()
        val png = b[0] == 0x89.toByte() && b[1] == 0x50.toByte() && b[2] == 0x4E.toByte() && b[3] == 0x47.toByte()
        val gif = b[0] == 0x47.toByte() && b[1] == 0x49.toByte() && b[2] == 0x46.toByte() && b[3] == 0x38.toByte()
        val webp = b[0] == 0x52.toByte() && b[1] == 0x49.toByte() && b[2] == 0x46.toByte() && b[3] == 0x46.toByte() &&
            b[8] == 0x57.toByte() && b[9] == 0x45.toByte() && b[10] == 0x42.toByte() && b[11] == 0x50.toByte()
        return jpeg || png || gif || webp
    }
}
