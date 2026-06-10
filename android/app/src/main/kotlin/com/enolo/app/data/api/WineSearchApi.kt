package com.enolo.app.data.api

import com.enolo.app.data.dto.RecognizeRequest
import com.enolo.app.data.dto.RecognizeResponse
import com.enolo.app.data.dto.TextSearchRequest
import com.enolo.app.data.dto.WineResearchInput
import com.enolo.app.data.dto.WineResearchResult
import retrofit2.http.Body
import retrofit2.http.POST

interface WineSearchApi {
    @POST("/wine-search/recognize")
    suspend fun recognize(@Body body: RecognizeRequest): RecognizeResponse

    @POST("/wine-search/text-search")
    suspend fun textSearch(@Body body: TextSearchRequest): RecognizeResponse

    @POST("/wine-research/research")
    suspend fun research(@Body body: WineResearchInput): WineResearchResult
}
