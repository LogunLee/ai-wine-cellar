package com.enolo.app.data.api

import com.enolo.app.data.dto.AddWineRequest
import com.enolo.app.data.dto.CellarItemDto
import com.enolo.app.data.dto.FetchPhotoRequest
import com.enolo.app.data.dto.MessageDto
import com.enolo.app.data.dto.NoteDto
import com.enolo.app.data.dto.NoteRequest
import com.enolo.app.data.dto.PhotoResponse
import com.enolo.app.data.dto.VivinoUrlRequest
import com.enolo.app.data.dto.WineSearcherUrlRequest
import okhttp3.MultipartBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Part
import retrofit2.http.Path

interface CellarApi {
    @GET("/wine-cellar/items")
    suspend fun getItems(): List<CellarItemDto>

    @POST("/wine-cellar/add")
    suspend fun add(@Body body: AddWineRequest): CellarItemDto

    @PUT("/wine-cellar/{id}/vivino-url")
    suspend fun saveVivinoUrl(@Path("id") id: String, @Body body: VivinoUrlRequest): MessageDto

    @PUT("/wine-cellar/{id}/wine-searcher-url")
    suspend fun saveWineSearcherUrl(@Path("id") id: String, @Body body: WineSearcherUrlRequest): MessageDto

    @PUT("/wine-cellar/{id}")
    suspend fun update(@Path("id") id: String, @Body body: AddWineRequest): CellarItemDto

    @DELETE("/wine-cellar/{id}")
    suspend fun delete(@Path("id") id: String): MessageDto

    @GET("/wine-cellar/{id}/note")
    suspend fun getNote(@Path("id") id: String): NoteDto?

    @POST("/wine-cellar/{id}/note")
    suspend fun saveNote(@Path("id") id: String, @Body body: NoteRequest): NoteDto?

    @Multipart
    @POST("/wine-cellar/{id}/photo")
    suspend fun uploadPhoto(@Path("id") id: String, @Part photo: MultipartBody.Part): PhotoResponse

    @POST("/wine-cellar/{id}/fetch-photo")
    suspend fun fetchPhoto(@Path("id") id: String, @Body body: FetchPhotoRequest): PhotoResponse
}
