package com.enolo.app.data.dto

import kotlinx.serialization.Serializable

@Serializable
data class RecognizeRequest(
    val images: List<String>
)

@Serializable
data class TextSearchRequest(
    val text: String
)

@Serializable
data class WineRecognitionResult(
    val producer: String = "",
    val name: String = "",
    val vintageYear: Int? = null,
    val region: String? = null,
    val country: String? = null,
    val wineType: String? = null,
    val confidence: Double = 0.5
)

@Serializable
data class RecognizeResponse(
    val wines: List<WineRecognitionResult> = emptyList()
)

@Serializable
data class WineResearchInput(
    val wineName: String,
    val vintage: String? = null,
    val producerHint: String? = null,
    val countryHint: String? = null
)

@Serializable
data class WineResearchResult(
    val wine: WineInfo,
    val confidence: String = "low",
    val missingFields: List<String> = emptyList(),
    val sources: List<ResearchSource> = emptyList(),
    val notes: List<String> = emptyList()
)

@Serializable
data class WineInfo(
    val fullName: String? = null,
    val producer: String? = null,
    val country: String? = null,
    val region: String? = null,
    val appellation: String? = null,
    val vintage: String? = null,
    val wineType: String? = null,
    val grapes: List<String>? = null,
    val alcohol: String? = null,
    val sugar: String? = null,
    val acidity: String? = null,
    val aging: String? = null,
    val style: String? = null,
    val tastingProfile: String? = null,
    val storagePotential: String? = null,
    val servingTemperature: String? = null,
    val foodPairing: List<String>? = null
)

@Serializable
data class ResearchSource(
    val title: String? = null,
    val url: String,
    val sourceType: String = "unknown",
    val trustLevel: String = "low",
    val used: Boolean = false
)
