package com.enolo.app.data.repository

import com.enolo.app.core.network.ApiResult
import com.enolo.app.core.network.safeApiCall
import com.enolo.app.data.api.SommelierApi
import com.enolo.app.data.dto.ChatMessageDto
import com.enolo.app.data.dto.ChatSessionDto
import com.enolo.app.data.dto.ChatSessionWithMessagesDto
import com.enolo.app.data.dto.ChatStreamEvent
import com.enolo.app.data.dto.SendMessageRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SommelierRepository @Inject constructor(
    private val api: SommelierApi,
) {
    suspend fun createSession(): ApiResult<ChatSessionDto> = safeApiCall { api.createSession() }

    suspend fun listSessions(): ApiResult<List<ChatSessionDto>> = safeApiCall { api.listSessions() }

    suspend fun getSession(id: String): ApiResult<ChatSessionWithMessagesDto> = safeApiCall { api.getSession(id) }

    suspend fun deleteSession(id: String): ApiResult<Unit> = safeApiCall { api.deleteSession(id); Unit }

    suspend fun sendMessage(id: String, text: String): ApiResult<ChatMessageDto> =
        safeApiCall { api.sendMessage(id, SendMessageRequest(text)) }

    /**
     * Потоковый ответ сомелье: читаем NDJSON построчно и отдаём события.
     * Ошибки сети/HTTP пробрасываются — собирающий оборачивает в try/catch.
     */
    fun streamMessage(id: String, text: String): Flow<ChatStreamEvent> = flow {
        val body = api.streamMessage(id, SendMessageRequest(text))
        body.use { rb ->
            val source = rb.source()
            while (true) {
                val line = source.readUtf8Line() ?: break
                if (line.isBlank()) continue
                parseEvent(line)?.let { emit(it) }
            }
        }
    }.flowOn(Dispatchers.IO)

    private fun parseEvent(line: String): ChatStreamEvent? = runCatching {
        val obj = streamJson.parseToJsonElement(line).jsonObject
        when (obj["type"]?.jsonPrimitive?.content) {
            "delta" -> ChatStreamEvent.Delta(obj["text"]?.jsonPrimitive?.content ?: "")
            "done" -> ChatStreamEvent.Done(streamJson.decodeFromJsonElement(ChatMessageDto.serializer(), obj["message"]!!))
            "error" -> ChatStreamEvent.Error(obj["message"]?.jsonPrimitive?.content ?: "Ошибка")
            else -> null
        }
    }.getOrNull()

    private companion object {
        val streamJson = Json { ignoreUnknownKeys = true; coerceInputValues = true }
    }
}
