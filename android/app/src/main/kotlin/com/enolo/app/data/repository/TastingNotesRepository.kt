package com.enolo.app.data.repository

import com.enolo.app.core.cache.OfflineCache
import com.enolo.app.core.cache.PhotoStore
import com.enolo.app.core.network.ApiResult
import com.enolo.app.core.network.safeApiCall
import com.enolo.app.core.storage.SettingsStore
import com.enolo.app.data.api.TastingNotesApi
import com.enolo.app.data.dto.CreateTastingNoteRequest
import com.enolo.app.data.dto.SaveVivinoRequest
import com.enolo.app.data.dto.TastingNoteDto
import com.enolo.app.data.dto.TastingNotesPageDto
import com.enolo.app.data.dto.UpdateTastingNoteRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TastingNotesRepository @Inject constructor(
    private val api: TastingNotesApi,
    private val settingsStore: SettingsStore,
    private val offlineCache: OfflineCache,
    private val photoStore: PhotoStore,
) {
    /** URI фото: локальный файл, если скачан (офлайн), иначе абсолютный URL сервера. */
    fun photoUri(photoPath: String?): String? = photoStore.localUri(photoPath) ?: absolutePhotoUrl(photoPath)

    suspend fun list(
        search: String?,
        ratingMin: Double?,
        wineType: String?,
        country: String?,
        region: String?,
        createdYear: Int? = null,
        sort: String = "tasting_date_desc",
        page: Int,
        limit: Int,
    ): ApiResult<TastingNotesPageDto> {
        val res = safeApiCall {
            api.list(
                search = search?.takeIf { it.isNotBlank() },
                ratingMin = ratingMin,
                wineType = wineType?.takeIf { it.isNotBlank() },
                country = country?.takeIf { it.isNotBlank() },
                region = region?.takeIf { it.isNotBlank() },
                createdYear = createdYear,
                sort = sort,
                page = page,
                limit = limit,
            )
        }
        return when (res) {
            is ApiResult.Success -> { offlineCache.mergeNotes(res.data.items); res }
            is ApiResult.NetworkError -> {
                val cached = offlineCache.readNotes() ?: return res
                // Офлайн: «тупой» поиск/фильтры по кэшу, всё одной страницей (page 1).
                val filtered = filterNotesLocally(cached, search, ratingMin, wineType, createdYear, sort)
                if (page > 1) {
                    ApiResult.Success(TastingNotesPageDto(items = emptyList(), page = page, limit = limit, total = filtered.size, totalPages = 1))
                } else {
                    ApiResult.Success(TastingNotesPageDto(items = filtered, page = 1, limit = filtered.size.coerceAtLeast(1), total = filtered.size, totalPages = 1))
                }
            }
            else -> res
        }
    }

    /** Мгновенное чтение заметок из локального кэша (без сети) — для cache-first показа. */
    fun cachedNotes(): List<TastingNoteDto>? = offlineCache.readNotes()?.sortedByDescending { it.createdAt }

    /**
     * Инкрементальная синхронизация заметок: шлём серверное время прошлого синка (`since`),
     * получаем только изменённые/удалённые с тех пор + новое серверное время, применяем к кэшу
     * и сохраняем время. Первый раз (since=null) сервер отдаёт всё. Возвращает размер кэша.
     */
    suspend fun syncDelta(): ApiResult<Int> {
        val since = settingsStore.notesSyncedAt()
        return when (val res = safeApiCall { api.sync(since) }) {
            is ApiResult.Success -> {
                // Первый синк (since=null) — чистый снимок; далее — дельта поверх кэша.
                val size = if (since == null) {
                    offlineCache.saveNotes(res.data.changed); res.data.changed.size
                } else {
                    offlineCache.applyNotesDelta(res.data.changed, res.data.deletedIds)
                }
                settingsStore.setNotesSyncedAt(res.data.serverTime) // фиксируем СЕРВЕРНОЕ время
                photoStore.downloadMissing((offlineCache.readNotes() ?: emptyList()).map { it.wine.photoPath })
                ApiResult.Success(size)
            }
            is ApiResult.Error -> res
            is ApiResult.NetworkError -> res
        }
    }

    private fun filterNotesLocally(
        all: List<TastingNoteDto>,
        search: String?,
        ratingMin: Double?,
        wineType: String?,
        createdYear: Int?,
        sort: String,
    ): List<TastingNoteDto> {
        val q = search?.trim()?.lowercase().orEmpty()
        val filtered = all.filter { n ->
            (q.isBlank() ||
                (n.wine.producer?.lowercase()?.contains(q) == true) ||
                (n.wine.name?.lowercase()?.contains(q) == true)) &&
            (ratingMin == null || n.rating >= ratingMin) &&
            (wineType.isNullOrBlank() || n.wine.wineType.equals(wineType, ignoreCase = true)) &&
            (createdYear == null || n.createdAt.take(4) == createdYear.toString())
        }
        return when (sort) {
            "tasting_date_asc" -> filtered.sortedBy { it.tastingDate }
            "rating_desc"      -> filtered.sortedByDescending { it.rating }
            "rating_asc"       -> filtered.sortedBy { it.rating }
            else                -> filtered.sortedByDescending { it.tastingDate } // tasting_date_desc
        }
    }

    /** Общее число дегустационных заметок пользователя (для счётчика на главном экране).
     *  Офлайн: отдаём число из локального кэша, чтобы счётчик не показывал 0. */
    suspend fun count(): ApiResult<Int> = when (val res = safeApiCall { api.list(limit = 1).total }) {
        is ApiResult.Success -> res
        is ApiResult.NetworkError -> offlineCache.readNotes()?.let { ApiResult.Success(it.size) } ?: res
        else -> res
    }

    suspend fun create(request: CreateTastingNoteRequest): ApiResult<TastingNoteDto> =
        safeApiCall { api.create(request) }

    suspend fun update(id: String, request: UpdateTastingNoteRequest): ApiResult<TastingNoteDto> =
        safeApiCall { api.update(id, request) }

    suspend fun delete(id: String): ApiResult<Unit> = safeApiCall { api.delete(id); Unit }

    suspend fun generateVivino(id: String): ApiResult<String> =
        safeApiCall { api.generateVivino(id).vivinoNoteText }

    suspend fun saveVivino(id: String, text: String): ApiResult<TastingNoteDto> =
        safeApiCall { api.saveVivino(id, SaveVivinoRequest(text)) }

    suspend fun deleteVivino(id: String): ApiResult<TastingNoteDto> =
        safeApiCall { api.deleteVivino(id) }

    /** Абсолютный URL фото из относительного пути сервера. */
    fun absolutePhotoUrl(relativePath: String?): String? {
        if (relativePath.isNullOrBlank()) return null
        val base = settingsStore.serverUrlBlocking().trimEnd('/')
        return "$base$relativePath"
    }
}
