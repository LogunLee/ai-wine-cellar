package com.enolo.app.data.dto

import kotlinx.serialization.Serializable

@Serializable
data class WineSearcherSearchResponse(
    val results: List<WineSearcherResultDto>
)

@Serializable
data class WineSearcherResultDto(
    val name: String,
    val url: String,
)

@Serializable
data class WineSearcherUrlRequest(val wineSearcherUrl: String)
