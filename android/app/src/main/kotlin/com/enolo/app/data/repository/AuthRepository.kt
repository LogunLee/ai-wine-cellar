package com.enolo.app.data.repository

import com.enolo.app.core.network.ApiResult
import com.enolo.app.core.network.safeApiCall
import com.enolo.app.core.storage.SessionManager
import com.enolo.app.core.storage.SettingsStore
import com.enolo.app.data.api.AuthApi
import com.enolo.app.data.dto.AuthResponse
import com.enolo.app.data.dto.LoginRequest
import com.enolo.app.data.dto.LogoutRequest
import com.enolo.app.data.dto.RegisterRequest
import com.enolo.app.data.dto.UserDto
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val authApi: AuthApi,
    private val sessionManager: SessionManager,
    private val settingsStore: SettingsStore
) {
    suspend fun login(serverUrl: String, email: String, password: String): ApiResult<AuthResponse> {
        settingsStore.setServerUrl(serverUrl)
        return safeApiCall { authApi.login(LoginRequest(email, password)) }.also { result ->
            if (result is ApiResult.Success) {
                sessionManager.saveTokens(result.data.accessToken, result.data.refreshToken)
            }
        }
    }

    suspend fun register(serverUrl: String, email: String, password: String, displayName: String?): ApiResult<AuthResponse> {
        settingsStore.setServerUrl(serverUrl)
        return safeApiCall { authApi.register(RegisterRequest(email, password, displayName)) }.also { result ->
            if (result is ApiResult.Success) {
                sessionManager.saveTokens(result.data.accessToken, result.data.refreshToken)
            }
        }
    }

    suspend fun logout(): ApiResult<Unit> {
        val refresh = sessionManager.refreshTokenBlocking() ?: return ApiResult.Success(Unit)
        val result = safeApiCall { authApi.logout(LogoutRequest(refresh)); Unit }
        sessionManager.clear()
        return ApiResult.Success(Unit)
    }

    suspend fun getMe(): ApiResult<UserDto> = safeApiCall { authApi.me() }
}
