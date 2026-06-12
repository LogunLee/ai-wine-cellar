package com.enolo.app.data.repository

import com.enolo.app.core.network.ApiResult
import com.enolo.app.core.network.safeApiCall
import com.enolo.app.data.api.WineCriticApi
import com.enolo.app.data.dto.WineSearcherResultDto
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class WineCriticRepository @Inject constructor(
    private val wineCriticApi: WineCriticApi,
) {
    suspend fun search(query: String): ApiResult<List<WineSearcherResultDto>> =
        safeApiCall { wineCriticApi.search(query).results }
}
