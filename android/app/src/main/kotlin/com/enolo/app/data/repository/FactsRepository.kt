package com.enolo.app.data.repository

import com.enolo.app.core.network.ApiResult
import com.enolo.app.core.network.safeApiCall
import com.enolo.app.data.api.FactsApi
import com.enolo.app.data.dto.DailyFactDto
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FactsRepository @Inject constructor(
    private val api: FactsApi,
) {
    suspend fun daily(count: Int = 3): ApiResult<List<DailyFactDto>> =
        safeApiCall { api.daily(count).facts }
}
