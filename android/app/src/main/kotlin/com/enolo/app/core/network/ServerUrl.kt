package com.enolo.app.core.network

import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

object ServerUrl {
    /** Normalize raw user input to http(s)://host:port without trailing slash */
    fun normalize(raw: String): String {
        var s = raw.trim()
        if (s.isEmpty()) return s
        if (!s.startsWith("http://") && !s.startsWith("https://")) {
            s = "http://$s"
        }
        return s.trimEnd('/')
    }

    fun toHttpUrl(raw: String): HttpUrl? = normalize(raw).toHttpUrlOrNull()
}
