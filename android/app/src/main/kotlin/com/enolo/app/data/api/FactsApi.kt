package com.enolo.app.data.api

import com.enolo.app.data.dto.DailyFactsResponse
import retrofit2.http.GET
import retrofit2.http.Query

interface FactsApi {
    @GET("/facts/daily")
    suspend fun daily(@Query("count") count: Int = 3): DailyFactsResponse
}
