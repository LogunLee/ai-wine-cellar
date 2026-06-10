package com.enolo.app.data.repository

import com.enolo.app.core.network.ApiResult
import com.enolo.app.core.network.safeApiCall
import com.enolo.app.data.api.DiscountsApi
import com.enolo.app.data.dto.DiscountsResponse
import com.enolo.app.data.dto.FilterOptionsResponse
import com.enolo.app.data.dto.LastUpdatedResponse
import com.enolo.app.data.dto.StoreDto
import javax.inject.Inject
import javax.inject.Singleton

data class DiscountFilters(
    val search: String = "",
    val wineType: String = "",
    val country: String = "",
    val minDiscount: Int? = null,
    val minPrice: Int? = null,
    val maxPrice: Int? = null,
    val seller: String = "",
    val grapes: List<String> = emptyList(),
    val monosort: Boolean = false,
    val sort: String = "discountPercent_desc",
    val page: Int = 1,
    val limit: Int = 50
)

@Singleton
class DiscountsRepository @Inject constructor(
    private val discountsApi: DiscountsApi
) {
    suspend fun getOffers(filters: DiscountFilters): ApiResult<DiscountsResponse> {
        val params = mutableMapOf<String, String>()
        params["sort"] = filters.sort
        params["page"] = filters.page.toString()
        params["limit"] = filters.limit.toString()
        if (filters.search.isNotBlank()) params["search"] = filters.search
        if (filters.wineType.isNotBlank()) params["wineType"] = filters.wineType
        if (filters.country.isNotBlank()) params["country"] = filters.country
        filters.minDiscount?.let { params["minDiscount"] = it.toString() }
        filters.minPrice?.let { params["minPrice"] = it.toString() }
        filters.maxPrice?.let { params["maxPrice"] = it.toString() }
        if (filters.seller.isNotBlank()) params["seller"] = filters.seller
        if (filters.grapes.isNotEmpty()) params["grapes"] = filters.grapes.joinToString(",")
        if (filters.monosort) params["monosort"] = "true"
        return safeApiCall { discountsApi.getOffers(params) }
    }

    suspend fun getStores(): ApiResult<List<StoreDto>> = safeApiCall { discountsApi.getStores() }

    suspend fun getLastUpdated(): ApiResult<LastUpdatedResponse> =
        safeApiCall { discountsApi.getLastUpdated() }

    suspend fun getFilterOptions(): ApiResult<FilterOptionsResponse> =
        safeApiCall { discountsApi.getFilterOptions() }
}
