package com.enolo.app.data.dto

import kotlinx.serialization.Serializable

@Serializable
data class VivinoSearchResponse(
    val results: List<VivinoResultDto>
)

@Serializable
data class VivinoResultDto(
    val name: String,
    val url: String,
    val years: List<Int> = emptyList(),
)

@Serializable
data class VivinoUrlRequest(val vivinoUrl: String)
