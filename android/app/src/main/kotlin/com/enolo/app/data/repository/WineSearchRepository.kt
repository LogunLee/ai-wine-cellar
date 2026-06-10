package com.enolo.app.data.repository

import com.enolo.app.core.network.ApiResult
import com.enolo.app.core.network.safeApiCall
import com.enolo.app.data.api.WineSearchApi
import com.enolo.app.data.dto.RecognizeRequest
import com.enolo.app.data.dto.TextSearchRequest
import com.enolo.app.data.dto.WineRecognitionResult
import com.enolo.app.data.dto.WineResearchInput
import com.enolo.app.data.dto.WineResearchResult
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class WineSearchRepository @Inject constructor(
    private val wineSearchApi: WineSearchApi
) {
    suspend fun recognizeFromImages(images: List<String>): ApiResult<List<WineRecognitionResult>> =
        safeApiCall { wineSearchApi.recognize(RecognizeRequest(images)).wines }

    suspend fun textSearch(text: String): ApiResult<List<WineRecognitionResult>> =
        safeApiCall { wineSearchApi.textSearch(TextSearchRequest(text)).wines }

    suspend fun research(input: WineResearchInput): ApiResult<WineResearchResult> =
        safeApiCall { wineSearchApi.research(input) }
}
