package com.enolo.app.data.repository

import com.enolo.app.core.network.safeApiCall
import com.enolo.app.core.storage.SettingsStore
import com.enolo.app.data.api.FcmTokenRequest
import com.enolo.app.data.api.PushApi
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PushRepository @Inject constructor(
    private val pushApi: PushApi,
    private val settingsStore: SettingsStore,
) {
    /** Called after login. Reads the FCM token saved by EnoloFirebaseMessagingService and sends it to the backend. */
    suspend fun syncFcmToken() {
        val token = settingsStore.fcmTokenBlocking() ?: return
        safeApiCall { pushApi.registerToken(FcmTokenRequest(token)) }
    }
}
