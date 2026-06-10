package com.enolo.app.data.dto

import kotlinx.serialization.Serializable

@Serializable
data class CellarItemDto(
    val id: String,
    val producer: String,
    val name: String,
    val vintageYear: Int? = null,
    val region: String? = null,
    val country: String? = null,
    val countryIso2: String? = null,
    val wineType: String? = null,
    val grapes: List<String>? = null,
    val quantity: Int = 1,
    val status: String = "IN_CELLAR",
    val photoPath: String? = null,
    val createdAt: String = "",
    val drinkWindowFrom: Int? = null,
    val drinkWindowTo: Int? = null,
)

@Serializable
data class AddWineRequest(
    val producer: String,
    val name: String,
    val vintageYear: Int? = null,
    val region: String? = null,
    val country: String? = null,
    val wineType: String? = null,
    val quantity: Int = 1,
    val drinkWindowFrom: Int? = null,
    val drinkWindowTo: Int? = null,
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
