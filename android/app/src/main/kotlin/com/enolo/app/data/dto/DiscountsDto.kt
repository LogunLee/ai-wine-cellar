package com.enolo.app.data.dto

import kotlinx.serialization.Serializable

@Serializable
data class DiscountOfferDto(
    val id: String,
    val sellerName: String = "",
    val producer: String? = null,
    val wineName: String? = null,
    val wineNameRaw: String? = null,
    val fullName: String? = null,
    val vintage: String? = null,
    val country: String? = null,
    val region: String? = null,
    val regionCanonical: String? = null,
    val appellation: String? = null,
    val sweetness: String? = null,
    val alcohol: Double? = null,
    val ageingVessel: String? = null,
    val storagePotential: String? = null,
    val description: String? = null,
    val wineType: String? = null,
    val volumeMl: Int? = null,
    val currentPrice: Double = 0.0,
    val oldPrice: Double? = null,
    val discountPercent: Int? = null,
    val discountAmount: Double? = null,
    val currency: String = "RUB",
    val url: String = "",
    val imageUrl: String? = null,
    val availability: String? = null,
    val grapes: List<String> = emptyList(),
    val grapeCount: Int = 0,
    val confidence: String = "medium",
    val status: String = "active",
    val lastCheckedAt: String = ""
)

@Serializable
data class DiscountsResponse(
    val items: List<DiscountOfferDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val limit: Int = 50
)

@Serializable
data class LastUpdatedResponse(
    val lastUpdated: String? = null
)

@Serializable
data class FilterOptionsResponse(
    val grapes: List<String> = emptyList(),
    val countries: List<String> = emptyList()
)

@Serializable
data class StoreDto(
    val id: String,
    val name: String,
    val code: String = "",
    val baseUrl: String = "",
    val active: Boolean = true
)
