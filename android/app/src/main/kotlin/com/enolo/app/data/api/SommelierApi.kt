package com.enolo.app.data.api

import com.enolo.app.data.dto.ChatMessageDto
import com.enolo.app.data.dto.ChatSessionDto
import com.enolo.app.data.dto.ChatSessionWithMessagesDto
import com.enolo.app.data.dto.SendMessageRequest
import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Streaming

interface SommelierApi {
    @POST("sommelier/sessions")
    suspend fun createSession(): ChatSessionDto

    @GET("sommelier/sessions")
    suspend fun listSessions(): List<ChatSessionDto>

    @GET("sommelier/sessions/{id}")
    suspend fun getSession(@Path("id") id: String): ChatSessionWithMessagesDto

    @DELETE("sommelier/sessions/{id}")
    suspend fun deleteSession(@Path("id") id: String)

    @POST("sommelier/sessions/{id}/messages")
    suspend fun sendMessage(@Path("id") id: String, @Body body: SendMessageRequest): ChatMessageDto

    /** Потоковая выдача (NDJSON): читать построчно из ResponseBody. */
    @Streaming
    @POST("sommelier/sessions/{id}/messages/stream")
    suspend fun streamMessage(@Path("id") id: String, @Body body: SendMessageRequest): ResponseBody
}
