package com.enolo.app.data.repository

import com.enolo.app.core.network.ApiResult
import com.enolo.app.core.network.safeApiCall
import com.enolo.app.data.api.VivinoApi
import com.enolo.app.data.dto.VivinoResultDto
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class VivinoRepository @Inject constructor(private val vivinoApi: VivinoApi) {
    suspend fun search(query: String): ApiResult<List<VivinoResultDto>> =
        safeApiCall { vivinoApi.search(query).results }
}
