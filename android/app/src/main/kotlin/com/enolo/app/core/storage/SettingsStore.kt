package com.enolo.app.core.storage

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.enolo.app.core.config.AppConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.runBlocking
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "enolo_settings")

@Singleton
class SettingsStore @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val KEY_SERVER_URL    = stringPreferencesKey("server_url")
    private val KEY_ACCESS_TOKEN  = stringPreferencesKey("access_token")
    private val KEY_REFRESH_TOKEN = stringPreferencesKey("refresh_token")
    private val KEY_DISCOUNT_SORT = stringPreferencesKey("discount_sort")
    private val KEY_FCM_TOKEN     = stringPreferencesKey("fcm_token")
    private val KEY_SMART_HISTORY = stringPreferencesKey("smart_search_history")
    private val KEY_NOTES_SYNCED_AT = stringPreferencesKey("notes_synced_at")
    private val KEY_CELLAR_SYNCED_AT = stringPreferencesKey("cellar_synced_at")

    /** История запросов умного поиска (новые сверху). Хранится строками через \n. */
    val smartSearchHistoryFlow: Flow<List<String>> = context.dataStore.data.map { prefs ->
        prefs[KEY_SMART_HISTORY]?.split("\n")?.filter { it.isNotBlank() } ?: emptyList()
    }

    val discountSortFlow: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[KEY_DISCOUNT_SORT] ?: "discountPercent_desc"
    }

    val serverUrlFlow: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[KEY_SERVER_URL]?.takeIf { it.isNotBlank() } ?: AppConfig.defaultServerUrl
    }

    val accessTokenFlow: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[KEY_ACCESS_TOKEN]?.takeIf { it.isNotBlank() }
    }

    val refreshTokenFlow: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[KEY_REFRESH_TOKEN]?.takeIf { it.isNotBlank() }
    }

    val fcmTokenFlow: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[KEY_FCM_TOKEN]?.takeIf { it.isNotBlank() }
    }

    suspend fun setDiscountSort(sort: String) {
        context.dataStore.edit { prefs -> prefs[KEY_DISCOUNT_SORT] = sort }
    }

    suspend fun setServerUrl(url: String) {
        context.dataStore.edit { prefs -> prefs[KEY_SERVER_URL] = url }
    }

    suspend fun setTokens(accessToken: String, refreshToken: String) {
        context.dataStore.edit { prefs ->
            prefs[KEY_ACCESS_TOKEN] = accessToken
            prefs[KEY_REFRESH_TOKEN] = refreshToken
        }
    }

    suspend fun addSmartSearchQuery(query: String) {
        val q = query.trim().replace(Regex("\\s+"), " ")
        if (q.isEmpty()) return
        context.dataStore.edit { prefs ->
            val existing = prefs[KEY_SMART_HISTORY]?.split("\n")?.filter { it.isNotBlank() } ?: emptyList()
            val updated  = (listOf(q) + existing.filterNot { it.equals(q, ignoreCase = true) }).take(20)
            prefs[KEY_SMART_HISTORY] = updated.joinToString("\n")
        }
    }

    /** Серверное время последней успешной синхронизации заметок (для дельта-синка). */
    suspend fun notesSyncedAt(): String? =
        context.dataStore.data.first()[KEY_NOTES_SYNCED_AT]?.takeIf { it.isNotBlank() }

    suspend fun setNotesSyncedAt(serverTime: String) {
        context.dataStore.edit { prefs -> prefs[KEY_NOTES_SYNCED_AT] = serverTime }
    }

    /** Серверное время последней успешной синхронизации погреба (для дельта-синка). */
    suspend fun cellarSyncedAt(): String? =
        context.dataStore.data.first()[KEY_CELLAR_SYNCED_AT]?.takeIf { it.isNotBlank() }

    suspend fun setCellarSyncedAt(serverTime: String) {
        context.dataStore.edit { prefs -> prefs[KEY_CELLAR_SYNCED_AT] = serverTime }
    }

    suspend fun setFcmToken(token: String?) {
        context.dataStore.edit { prefs ->
            if (token != null) prefs[KEY_FCM_TOKEN] = token else prefs.remove(KEY_FCM_TOKEN)
        }
    }

    suspend fun clearTokens() {
        context.dataStore.edit { prefs ->
            prefs.remove(KEY_ACCESS_TOKEN)
            prefs.remove(KEY_REFRESH_TOKEN)
        }
    }

    // Blocking variants for use in OkHttp interceptors
    fun serverUrlBlocking(): String = runBlocking { serverUrlFlow.first() }
    fun accessTokenBlocking(): String? = runBlocking { accessTokenFlow.first() }
    fun refreshTokenBlocking(): String? = runBlocking { refreshTokenFlow.first() }
    fun fcmTokenBlocking(): String? = runBlocking { fcmTokenFlow.first() }

    fun saveTokensBlocking(accessToken: String, refreshToken: String) =
        runBlocking { setTokens(accessToken, refreshToken) }

    fun clearBlocking() = runBlocking { clearTokens() }
}
