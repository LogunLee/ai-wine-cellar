package com.enolo.app.data.repository

import com.enolo.app.core.network.ApiResult
import com.enolo.app.core.network.safeApiCall
import com.enolo.app.data.api.AiSettingsApi
import com.enolo.app.data.dto.AiCatalogResponse
import com.enolo.app.data.dto.AiSettingsResponse
import com.enolo.app.data.dto.SaveKeyRequest
import com.enolo.app.data.dto.SaveKeyResponse
import com.enolo.app.data.dto.SaveTaskSettingRequest
import com.enolo.app.data.dto.TestKeyResponse
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AiSettingsRepository @Inject constructor(
    private val api: AiSettingsApi,
) {
    suspend fun catalog(): ApiResult<AiCatalogResponse> = safeApiCall { api.catalog() }

    suspend fun settings(): ApiResult<AiSettingsResponse> = safeApiCall { api.settings() }

    suspend fun saveKey(providerCode: String, apiKey: String): ApiResult<SaveKeyResponse> =
        safeApiCall { api.saveKey(providerCode, SaveKeyRequest(apiKey)) }

    suspend fun testKey(providerCode: String): ApiResult<TestKeyResponse> =
        safeApiCall { api.testKey(providerCode) }

    suspend fun deleteKey(providerCode: String): ApiResult<Unit> =
        safeApiCall { api.deleteKey(providerCode); Unit }

    suspend fun saveTaskSetting(taskCode: String, modelId: String?, customPrompt: String?): ApiResult<Unit> =
        safeApiCall { api.saveTaskSetting(taskCode, SaveTaskSettingRequest(modelId, customPrompt)); Unit }

    suspend fun resetTaskSetting(taskCode: String): ApiResult<Unit> =
        safeApiCall { api.resetTaskSetting(taskCode); Unit }
}
