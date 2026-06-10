package com.enolo.app.core.network

import com.enolo.app.core.storage.SessionManager
import com.enolo.app.data.api.AuthApi
import com.enolo.app.data.dto.RefreshRequest
import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import javax.inject.Inject
import javax.inject.Provider

class TokenAuthenticator @Inject constructor(
    private val sessionManager: SessionManager,
    private val refreshApiProvider: Provider<AuthApi>
) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        if (responseCount(response) >= 2) return null
        val refresh = sessionManager.refreshTokenBlocking() ?: run {
            sessionManager.clearBlocking()
            return null
        }
        val newTokens = runBlocking {
            runCatching {
                refreshApiProvider.get().refresh(RefreshRequest(refresh))
            }.getOrNull()
        }
        if (newTokens == null) {
            sessionManager.clearBlocking()
            return null
        }
        sessionManager.saveTokensBlocking(newTokens.accessToken, newTokens.refreshToken)
        return response.request.newBuilder()
            .header("Authorization", "Bearer ${newTokens.accessToken}")
            .build()
    }

    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }
}
