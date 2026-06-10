package com.enolo.app.data.repository

import com.enolo.app.core.network.ApiResult
import com.enolo.app.core.network.safeApiCall
import com.enolo.app.data.api.CountriesApi
import com.enolo.app.data.dto.CountryDto
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CountriesRepository @Inject constructor(
    private val countriesApi: CountriesApi
) {
    private var cache: List<CountryDto>? = null

    suspend fun getCountries(): ApiResult<List<CountryDto>> {
        cache?.let { return ApiResult.Success(it) }
        return safeApiCall { countriesApi.getCountries() }.also { result ->
            if (result is ApiResult.Success) cache = result.data
        }
    }
}
