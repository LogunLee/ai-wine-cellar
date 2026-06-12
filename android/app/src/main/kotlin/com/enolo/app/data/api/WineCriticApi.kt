package com.enolo.app.data.api

import com.enolo.app.data.dto.WineSearcherSearchResponse
import retrofit2.http.GET
import retrofit2.http.Query

interface WineCriticApi {
    @GET("/wine-critic/search")
    suspend fun search(@Query("q") q: String): WineSearcherSearchResponse
}
