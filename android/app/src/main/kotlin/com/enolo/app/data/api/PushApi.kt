package com.enolo.app.data.api

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.PUT

@Serializable
data class FcmTokenRequest(val token: String)

interface PushApi {
    @PUT("/auth/me/fcm-token")
    suspend fun registerToken(@Body body: FcmTokenRequest): MessageResponse
}

@Serializable
data class MessageResponse(val ok: Boolean = false)
