package com.enolo.app.data.dto

import kotlinx.serialization.Serializable

/** Результат инкрементальной синхронизации погреба. */
@Serializable
data class SyncCellarResultDto(
    val serverTime: String,
    val changed: List<CellarItemDto> = emptyList(),
    val deletedIds: List<String> = emptyList(),
)

@Serializable
data class CellarItemDto(
    val id: String,
    val producer: String,
    val name: String,
    val vintageYear: Int? = null,
    val region: String? = null,
    val appellation: String? = null,
    val country: String? = null,
    val countryIso2: String? = null,
    val wineType: String? = null,
    val grapes: List<String>? = null,
    val quantity: Int = 1,
    val status: String = "IN_CELLAR",
    val photoPath: String? = null,
    val purchasePrice: Double? = null,
    val currency: String? = null,
    val storageLocation: String? = null,
    val userDescription: String? = null,
    val sellerDescription: String? = null,
    val producerDescription: String? = null,
    val createdAt: String = "",
    val drinkWindowFrom: Int? = null,
    val drinkWindowTo: Int? = null,
    val vivinoUrl: String? = null,
    val vivinoRating: Double? = null,
    val wineSearcherUrl: String? = null,
    val criticScores: Map<String, Int>? = null,
)

@Serializable
data class AddWineRequest(
    val producer: String,
    val name: String,
    val vintageYear: Int? = null,
    val region: String? = null,
    val appellation: String? = null,
    val country: String? = null,
    val wineType: String? = null,
    val quantity: Int = 1,
    val grapes: List<String>? = null,
    val drinkWindowFrom: Int? = null,
    val drinkWindowTo: Int? = null,
    val userDescription: String? = null,
    val sellerDescription: String? = null,
    val producerDescription: String? = null,
    val purchasePrice: Double? = null,
    val currency: String? = null,
    val storageLocation: String? = null,
)

@Serializable
data class NoteDto(
    val id: String,
    val text: String
)

@Serializable
data class NoteRequest(
    val text: String
)

@Serializable
data class CountDto(
    val count: Int = 0
)

@Serializable
data class PhotoResponse(
    val photoPath: String? = null
)

@Serializable
data class FetchPhotoRequest(
    val producer: String,
    val name: String,
    val vintageYear: Int? = null
)

@Serializable
data class CountryDto(
    val id: String,
    val iso2: String,
    val iso3: String? = null,
    val name: String
)
