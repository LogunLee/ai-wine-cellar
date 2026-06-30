package com.enolo.app.core.cache

import android.content.Context
import com.enolo.app.data.dto.CellarItemDto
import com.enolo.app.data.dto.TastingNoteDto
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Простой файловый JSON-кэш для офлайн-просмотра. Аддитивный и безопасный:
 * репозитории пишут сюда при успешном ответе и читают, когда сети нет.
 */
@Singleton
class OfflineCache @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    private fun file(name: String) = File(context.filesDir, name)

    // ── Погреб (полный список — кэшируем целиком) ──
    fun saveCellar(items: List<CellarItemDto>) {
        runCatching { file(CELLAR).writeText(json.encodeToString(items)) }
    }

    /** Применить дельту синхронизации погреба: upsert по id + удаление по id. Возвращает список. */
    fun applyCellarDelta(changed: List<CellarItemDto>, deletedIds: List<String>): List<CellarItemDto> {
        return runCatching {
            val map = (readCellar() ?: emptyList()).associateBy { it.id }.toMutableMap()
            for (i in changed) map[i.id] = i
            for (id in deletedIds) map.remove(id)
            val all = map.values.toList()
            file(CELLAR).writeText(json.encodeToString(all))
            all
        }.getOrDefault(changed)
    }

    fun readCellar(): List<CellarItemDto>? = runCatching {
        file(CELLAR).takeIf { it.exists() }?.let { json.decodeFromString<List<CellarItemDto>>(it.readText()) }
    }.getOrNull()

    // ── Заметки ──
    /** Полная замена кэша заметок (для «синхронизировать всё»: убирает и удалённые на сервере). */
    fun saveNotes(items: List<TastingNoteDto>) {
        runCatching { file(NOTES).writeText(json.encodeToString(items)) }
    }

    /** Накопление по id (инкрементально, т.к. список грузится страницами). */
    fun mergeNotes(items: List<TastingNoteDto>) {
        runCatching {
            val map = (readNotes() ?: emptyList()).associateBy { it.id }.toMutableMap()
            for (n in items) map[n.id] = n
            file(NOTES).writeText(json.encodeToString(map.values.toList()))
        }
    }

    /** Применить дельту синхронизации: upsert изменённых по id + удаление по id. Возвращает новый размер. */
    fun applyNotesDelta(changed: List<TastingNoteDto>, deletedIds: List<String>): Int {
        return runCatching {
            val map = (readNotes() ?: emptyList()).associateBy { it.id }.toMutableMap()
            for (n in changed) map[n.id] = n
            for (id in deletedIds) map.remove(id)
            val all = map.values.toList()
            file(NOTES).writeText(json.encodeToString(all))
            all.size
        }.getOrDefault(0)
    }

    fun readNotes(): List<TastingNoteDto>? = runCatching {
        file(NOTES).takeIf { it.exists() }?.let { json.decodeFromString<List<TastingNoteDto>>(it.readText()) }
    }.getOrNull()

    private companion object {
        const val CELLAR = "cache_cellar.json"
        const val NOTES = "cache_notes.json"
    }
}
