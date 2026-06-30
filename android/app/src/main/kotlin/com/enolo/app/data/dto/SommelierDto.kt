package com.enolo.app.data.dto

import kotlinx.serialization.Serializable

@Serializable
data class ChatWinePickDto(
    val cellarItemId: String,
    val title: String,
    val reason: String = "",
)

@Serializable
data class ChatSourceDto(
    val book: String,
    val page: Int? = null,
    val heading: String? = null,
)

@Serializable
data class ChatMessageDto(
    val id: String,
    val role: String, // "user" | "assistant"
    val mode: String? = null, // "pogreb" | "consult" | "chat"
    val content: String,
    val picks: List<ChatWinePickDto> = emptyList(),
    val sources: List<ChatSourceDto> = emptyList(),
    val createdAt: String = "",
)

@Serializable
data class ChatSessionDto(
    val id: String,
    val title: String? = null,
    val createdAt: String = "",
    val updatedAt: String = "",
)

@Serializable
data class ChatSessionWithMessagesDto(
    val id: String,
    val title: String? = null,
    val createdAt: String = "",
    val updatedAt: String = "",
    val messages: List<ChatMessageDto> = emptyList(),
)

@Serializable
data class SendMessageRequest(val text: String)

/** Событие потоковой выдачи ответа сомелье (NDJSON-строки от стрим-эндпоинта). */
sealed class ChatStreamEvent {
    data class Delta(val text: String) : ChatStreamEvent()
    data class Done(val message: ChatMessageDto) : ChatStreamEvent()
    data class Error(val message: String) : ChatStreamEvent()
}
