package com.enolo.app.data.dto

import kotlinx.serialization.Serializable

@Serializable
data class DailyFactDto(
    val text: String,
    val source: String = "",
)

@Serializable
data class DailyFactsResponse(
    val facts: List<DailyFactDto> = emptyList(),
)
