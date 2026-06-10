package com.enolo.app.data.api

import com.enolo.app.data.dto.CountryDto
import retrofit2.http.GET

interface CountriesApi {
    @GET("/countries")
    suspend fun getCountries(): List<CountryDto>
}
