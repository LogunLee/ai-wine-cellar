package com.enolo.app.data.dto

import kotlinx.serialization.Serializable

/** POST /wine-cellar/ai-search */
@Serializable
data class AiSearchRequest(
    val query: String,
)

@Serializable
data class AiSearchPickDto(
    val cellarItemId: String,
    val title: String,
    val rank: Int = 0,
    val reason: String = "",
)

@Serializable
data class AiSearchSourceDto(
    val bookId: String? = null,
    val printedPage: Int? = null,
    val heading: String? = null,
)

@Serializable
data class AiSearchResultDto(
    val query: String = "",
    val answer: String = "",
    val picks: List<AiSearchPickDto> = emptyList(),
    val sources: List<AiSearchSourceDto> = emptyList(),
    val notes: List<String> = emptyList(),
)

/** PUT /wine-cellar/{id}/description */
@Serializable
data class SaveDescriptionRequest(
    val userDescription: String? = null,
    val sellerDescription: String? = null,
)

@Serializable
data class SaveDescriptionResponse(
    val ok: Boolean = true,
    val chunks: Int = 0,
)
