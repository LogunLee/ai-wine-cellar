package com.enolo.app.data.api

import com.enolo.app.data.dto.DiscountsResponse
import com.enolo.app.data.dto.FilterOptionsResponse
import com.enolo.app.data.dto.LastUpdatedResponse
import com.enolo.app.data.dto.StoreDto
import retrofit2.http.GET
import retrofit2.http.QueryMap

interface DiscountsApi {
    @GET("/discounts/offers")
    suspend fun getOffers(@QueryMap params: Map<String, String>): DiscountsResponse

    @GET("/discounts/last-updated")
    suspend fun getLastUpdated(): LastUpdatedResponse

    @GET("/discounts/filter-options")
    suspend fun getFilterOptions(): FilterOptionsResponse

    @GET("/admin/discount-stores")
    suspend fun getStores(): List<StoreDto>
}
