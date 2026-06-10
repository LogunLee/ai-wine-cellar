package com.enolo.app.core.network

import com.enolo.app.core.storage.SessionManager
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject

class AuthInterceptor @Inject constructor(
    private val sessionManager: SessionManager
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val req = chain.request()
        val path = req.url.encodedPath
        val skip = path.endsWith("/auth/login") ||
                path.endsWith("/auth/register") ||
                path.endsWith("/auth/refresh")
        val token = sessionManager.accessTokenBlocking()
        val out = if (!skip && !token.isNullOrEmpty()) {
            req.newBuilder().header("Authorization", "Bearer $token").build()
        } else req
        return chain.proceed(out)
    }
}
