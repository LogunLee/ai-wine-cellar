package com.enolo.app.core.network

import com.enolo.app.core.storage.SettingsStore
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject

class HostSelectionInterceptor @Inject constructor(
    private val settingsStore: SettingsStore
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val req = chain.request()
        val baseRaw = settingsStore.serverUrlBlocking()
        val newBase = ServerUrl.toHttpUrl(baseRaw)
            ?: return chain.proceed(req)

        val newUrl = req.url.newBuilder()
            .scheme(newBase.scheme)
            .host(newBase.host)
            .port(newBase.port)
            .build()

        return chain.proceed(req.newBuilder().url(newUrl).build())
    }
}
