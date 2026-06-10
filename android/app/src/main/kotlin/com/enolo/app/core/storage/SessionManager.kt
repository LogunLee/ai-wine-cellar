package com.enolo.app.core.storage

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SessionManager @Inject constructor(
    private val settingsStore: SettingsStore
) {
    val isLoggedIn: Flow<Boolean> = settingsStore.accessTokenFlow.map { !it.isNullOrEmpty() }

    suspend fun saveTokens(accessToken: String, refreshToken: String) {
        settingsStore.setTokens(accessToken, refreshToken)
    }

    suspend fun clear() {
        settingsStore.clearTokens()
    }

    fun accessTokenBlocking(): String? = settingsStore.accessTokenBlocking()
    fun refreshTokenBlocking(): String? = settingsStore.refreshTokenBlocking()
    fun saveTokensBlocking(accessToken: String, refreshToken: String) =
        settingsStore.saveTokensBlocking(accessToken, refreshToken)
    fun clearBlocking() = settingsStore.clearBlocking()
}
