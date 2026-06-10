package com.enolo.app.data.api

import com.enolo.app.data.dto.AuthResponse
import com.enolo.app.data.dto.LoginRequest
import com.enolo.app.data.dto.LogoutRequest
import com.enolo.app.data.dto.MessageDto
import com.enolo.app.data.dto.RefreshRequest
import com.enolo.app.data.dto.RegisterRequest
import com.enolo.app.data.dto.UserDto
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

interface AuthApi {
    @POST("/auth/login")
    suspend fun login(@Body body: LoginRequest): AuthResponse

    @POST("/auth/register")
    suspend fun register(@Body body: RegisterRequest): AuthResponse

    @POST("/auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): AuthResponse

    @POST("/auth/logout")
    suspend fun logout(@Body body: LogoutRequest): MessageDto

    @GET("/auth/me")
    suspend fun me(): UserDto
}
