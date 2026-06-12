package com.enolo.app.data.api

import com.enolo.app.data.dto.VivinoSearchResponse
import retrofit2.http.GET
import retrofit2.http.Query

interface VivinoApi {
    @GET("/vivino/search")
    suspend fun search(@Query("q") query: String): VivinoSearchResponse
}
