package com.enolo.app.data.repository

import android.content.Context
import com.enolo.app.core.cache.OfflineCache
import com.enolo.app.core.cache.PhotoStore
import com.enolo.app.core.network.ApiResult
import com.enolo.app.core.network.safeApiCall
import com.enolo.app.core.storage.SettingsStore
import com.enolo.app.data.api.CellarApi
import com.enolo.app.data.dto.AddWineRequest
import com.enolo.app.data.dto.AiSearchRequest
import com.enolo.app.data.dto.AiSearchResultDto
import com.enolo.app.data.dto.SaveDescriptionRequest
import com.enolo.app.data.dto.CellarItemDto
import com.enolo.app.data.dto.EnrichPreviewDto
import com.enolo.app.data.dto.EnrichPreviewRequest
import com.enolo.app.data.dto.FetchPhotoRequest
import com.enolo.app.data.dto.PhotoCandidatesDto
import com.enolo.app.data.dto.PhotoFromUrlRequest
import com.enolo.app.data.dto.NoteDto
import com.enolo.app.data.dto.NoteRequest
import com.enolo.app.data.dto.PhotoResponse
import com.enolo.app.data.dto.VivinoUrlRequest
import com.enolo.app.data.dto.WineSearcherUrlRequest
import dagger.hilt.android.qualifiers.ApplicationContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CellarRepository @Inject constructor(
    private val cellarApi: CellarApi,
    private val settingsStore: SettingsStore,
    private val offlineCache: OfflineCache,
    private val photoStore: PhotoStore,
    @ApplicationContext private val context: Context
) {
    /** URI фото: локальный файл, если скачан (офлайн), иначе абсолютный URL сервера. */
    fun photoUri(photoPath: String?): String? = photoStore.localUri(photoPath) ?: absolutePhotoUrl(photoPath)

    /** Мгновенное чтение погреба из локального кэша (без сети) — для cache-first показа. */
    fun cachedItems(): List<CellarItemDto>? = offlineCache.readCellar()

    /**
     * Инкрементальная синхронизация погреба по серверному времени прошлого синка: применяет
     * дельту к кэшу, сохраняет новое серверное время, возвращает актуальный полный список.
     */
    suspend fun syncDelta(): ApiResult<List<CellarItemDto>> {
        val since = settingsStore.cellarSyncedAt()
        return when (val res = safeApiCall { cellarApi.syncItems(since) }) {
            is ApiResult.Success -> {
                // Первый синк (since=null) — чистый снимок; далее — дельта поверх кэша.
                val all = if (since == null) {
                    offlineCache.saveCellar(res.data.changed); res.data.changed
                } else {
                    offlineCache.applyCellarDelta(res.data.changed, res.data.deletedIds)
                }
                settingsStore.setCellarSyncedAt(res.data.serverTime) // СЕРВЕРНОЕ время
                photoStore.downloadMissing(all.map { it.photoPath }) // скачиваем фото на устройство (с ожиданием)
                ApiResult.Success(all)
            }
            is ApiResult.Error -> res
            is ApiResult.NetworkError -> res
        }
    }

    /** Онлайн → кэшируем и отдаём; нет сети → отдаём из офлайн-кэша (если есть). */
    suspend fun getItems(): ApiResult<List<CellarItemDto>> {
        return when (val res = safeApiCall { cellarApi.getItems() }) {
            is ApiResult.Success -> { offlineCache.saveCellar(res.data); res }
            is ApiResult.NetworkError -> offlineCache.readCellar()?.let { ApiResult.Success(it) } ?: res
            else -> res
        }
    }

    suspend fun notesCount(): ApiResult<Int> = safeApiCall { cellarApi.notesCount().count }

    suspend fun add(request: AddWineRequest): ApiResult<CellarItemDto> = safeApiCall { cellarApi.add(request) }

    suspend fun update(id: String, request: AddWineRequest): ApiResult<CellarItemDto> =
        safeApiCall { cellarApi.update(id, request) }

    suspend fun delete(id: String): ApiResult<Unit> = safeApiCall { cellarApi.delete(id); Unit }

    suspend fun getNote(id: String): ApiResult<NoteDto?> = safeApiCall { cellarApi.getNote(id) }

    suspend fun saveNote(id: String, text: String): ApiResult<NoteDto?> =
        safeApiCall { cellarApi.saveNote(id, NoteRequest(text)) }

    suspend fun uploadPhoto(id: String, file: File): ApiResult<PhotoResponse> {
        return safeApiCall {
            val requestBody = file.asRequestBody("image/jpeg".toMediaTypeOrNull())
            val part = MultipartBody.Part.createFormData("photo", file.name, requestBody)
            cellarApi.uploadPhoto(id, part)
        }
    }

    suspend fun fetchPhoto(id: String, producer: String, name: String, vintageYear: Int?): ApiResult<PhotoResponse> =
        safeApiCall { cellarApi.fetchPhoto(id, FetchPhotoRequest(producer, name, vintageYear)) }

    suspend fun saveVivinoUrl(id: String, url: String): ApiResult<Unit> =
        safeApiCall { cellarApi.saveVivinoUrl(id, VivinoUrlRequest(url)); Unit }

    suspend fun saveWineSearcherUrl(id: String, url: String): ApiResult<Unit> =
        safeApiCall { cellarApi.saveWineSearcherUrl(id, WineSearcherUrlRequest(url)); Unit }

    suspend fun enrichPreview(producer: String, name: String, vintageYear: Int?): ApiResult<EnrichPreviewDto> =
        safeApiCall { cellarApi.enrichPreview(EnrichPreviewRequest(producer, name, vintageYear)) }

    suspend fun photoCandidates(producer: String, name: String, vintageYear: Int?): ApiResult<PhotoCandidatesDto> =
        safeApiCall { cellarApi.photoCandidates(producer, name, vintageYear) }

    suspend fun photoFromUrl(id: String, imageUrl: String): ApiResult<PhotoResponse> =
        safeApiCall { cellarApi.photoFromUrl(id, PhotoFromUrlRequest(imageUrl)) }

    suspend fun aiSearch(query: String): ApiResult<AiSearchResultDto> =
        safeApiCall { cellarApi.aiSearch(AiSearchRequest(query)) }

    suspend fun saveDescription(id: String, userDescription: String?, sellerDescription: String?): ApiResult<Unit> =
        safeApiCall { cellarApi.saveDescription(id, SaveDescriptionRequest(userDescription, sellerDescription)); Unit }

    /** Build absolute URL for a relative photo path from the server */
    fun absolutePhotoUrl(relativePath: String?): String? {
        if (relativePath.isNullOrBlank()) return null
        val base = settingsStore.serverUrlBlocking().trimEnd('/')
        return "$base$relativePath"
    }
}
