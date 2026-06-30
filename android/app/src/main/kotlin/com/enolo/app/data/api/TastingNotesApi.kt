package com.enolo.app.data.api

import com.enolo.app.data.dto.CreateTastingNoteRequest
import com.enolo.app.data.dto.GenerateVivinoResponse
import com.enolo.app.data.dto.MessageDto
import com.enolo.app.data.dto.SaveVivinoRequest
import com.enolo.app.data.dto.TastingNoteDto
import com.enolo.app.data.dto.TastingNotesPageDto
import com.enolo.app.data.dto.UpdateTastingNoteRequest
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface TastingNotesApi {
    @GET("/tasting-notes")
    suspend fun list(
        @Query("search") search: String? = null,
        @Query("rating_min") ratingMin: Double? = null,
        @Query("rating_max") ratingMax: Double? = null,
        @Query("wine_type") wineType: String? = null,
        @Query("country") country: String? = null,
        @Query("region") region: String? = null,
        @Query("created_year") createdYear: Int? = null,
        @Query("page") page: Int? = null,
        @Query("limit") limit: Int? = null,
        @Query("sort") sort: String? = null,
    ): TastingNotesPageDto

    /** Инкрементальная синхронизация: изменения после серверного времени `since`. */
    @GET("/tasting-notes/sync")
    suspend fun sync(@Query("since") since: String? = null): com.enolo.app.data.dto.SyncNotesResultDto

    @GET("/tasting-notes/{id}")
    suspend fun get(@Path("id") id: String): TastingNoteDto

    @POST("/tasting-notes")
    suspend fun create(@Body body: CreateTastingNoteRequest): TastingNoteDto

    @PATCH("/tasting-notes/{id}")
    suspend fun update(@Path("id") id: String, @Body body: UpdateTastingNoteRequest): TastingNoteDto

    @DELETE("/tasting-notes/{id}")
    suspend fun delete(@Path("id") id: String): MessageDto

    @POST("/tasting-notes/{id}/generate-vivino-note")
    suspend fun generateVivino(@Path("id") id: String): GenerateVivinoResponse

    @PATCH("/tasting-notes/{id}/vivino-note")
    suspend fun saveVivino(@Path("id") id: String, @Body body: SaveVivinoRequest): TastingNoteDto

    @DELETE("/tasting-notes/{id}/vivino-note")
    suspend fun deleteVivino(@Path("id") id: String): TastingNoteDto
}
