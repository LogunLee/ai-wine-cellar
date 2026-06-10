package com.enolo.app.data.repository

import android.content.Context
import com.enolo.app.core.network.ApiResult
import com.enolo.app.core.network.safeApiCall
import com.enolo.app.core.storage.SettingsStore
import com.enolo.app.data.api.CellarApi
import com.enolo.app.data.dto.AddWineRequest
import com.enolo.app.data.dto.CellarItemDto
import com.enolo.app.data.dto.FetchPhotoRequest
import com.enolo.app.data.dto.NoteDto
import com.enolo.app.data.dto.NoteRequest
import com.enolo.app.data.dto.PhotoResponse
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
    @ApplicationContext private val context: Context
) {
    suspend fun getItems(): ApiResult<List<CellarItemDto>> = safeApiCall { cellarApi.getItems() }

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

    /** Build absolute URL for a relative photo path from the server */
    fun absolutePhotoUrl(relativePath: String?): String? {
        if (relativePath.isNullOrBlank()) return null
        val base = settingsStore.serverUrlBlocking().trimEnd('/')
        return "$base$relativePath"
    }
}
