package com.enolo.app.data.api

import com.enolo.app.data.dto.AiCatalogResponse
import com.enolo.app.data.dto.MessageDto
import com.enolo.app.data.dto.AiSettingsResponse
import com.enolo.app.data.dto.SaveKeyRequest
import com.enolo.app.data.dto.SaveKeyResponse
import com.enolo.app.data.dto.SaveTaskSettingRequest
import com.enolo.app.data.dto.TestKeyResponse
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

interface AiSettingsApi {
    @GET("/ai/catalog")
    suspend fun catalog(): AiCatalogResponse

    @GET("/ai/settings")
    suspend fun settings(): AiSettingsResponse

    @PUT("/ai/providers/{code}/key")
    suspend fun saveKey(@Path("code") code: String, @Body body: SaveKeyRequest): SaveKeyResponse

    @POST("/ai/providers/{code}/key/test")
    suspend fun testKey(@Path("code") code: String): TestKeyResponse

    @DELETE("/ai/providers/{code}/key")
    suspend fun deleteKey(@Path("code") code: String): MessageDto

    @PUT("/ai/tasks/{code}/setting")
    suspend fun saveTaskSetting(@Path("code") code: String, @Body body: SaveTaskSettingRequest): MessageDto

    @DELETE("/ai/tasks/{code}/setting")
    suspend fun resetTaskSetting(@Path("code") code: String): MessageDto
}
