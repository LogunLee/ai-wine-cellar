package com.enolo.app.core.di

import com.enolo.app.core.network.AuthInterceptor
import com.enolo.app.core.network.HostSelectionInterceptor
import com.enolo.app.core.network.TokenAuthenticator
import com.enolo.app.data.api.AuthApi
import com.enolo.app.data.api.CellarApi
import com.enolo.app.data.api.CountriesApi
import com.enolo.app.data.api.DiscountsApi
import com.enolo.app.data.api.PushApi
import com.enolo.app.data.api.WineSearchApi
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit
import javax.inject.Named
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        isLenient = true
    }

    @Provides
    @Singleton
    @Named("logging")
    fun provideLoggingInterceptor(): HttpLoggingInterceptor =
        HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }

    /** OkHttp client for token refresh — NO TokenAuthenticator to avoid recursion */
    @Provides
    @Singleton
    @Named("refresh")
    fun provideRefreshClient(
        hostInterceptor: HostSelectionInterceptor,
        @Named("logging") logging: HttpLoggingInterceptor
    ): OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(hostInterceptor)
        .addInterceptor(logging)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    /** Main OkHttp client — includes auth interceptor and token authenticator */
    @Provides
    @Singleton
    fun provideMainClient(
        hostInterceptor: HostSelectionInterceptor,
        authInterceptor: AuthInterceptor,
        tokenAuthenticator: TokenAuthenticator,
        @Named("logging") logging: HttpLoggingInterceptor
    ): OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(hostInterceptor)
        .addInterceptor(authInterceptor)
        .addInterceptor(logging)
        .authenticator(tokenAuthenticator)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    /** Long-running OkHttp client for wine research (up to 130s read timeout) */
    @Provides
    @Singleton
    @Named("longRunning")
    fun provideLongRunningClient(
        hostInterceptor: HostSelectionInterceptor,
        authInterceptor: AuthInterceptor,
        tokenAuthenticator: TokenAuthenticator,
        @Named("logging") logging: HttpLoggingInterceptor
    ): OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(hostInterceptor)
        .addInterceptor(authInterceptor)
        .addInterceptor(logging)
        .authenticator(tokenAuthenticator)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(130, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    @Provides
    @Singleton
    fun provideRetrofit(client: OkHttpClient): Retrofit = Retrofit.Builder()
        .baseUrl("http://localhost/") // host overridden by HostSelectionInterceptor
        .client(client)
        .addConverterFactory(json.asConverterFactory("application/json; charset=UTF-8".toMediaType()))
        .build()

    @Provides
    @Singleton
    @Named("refreshRetrofit")
    fun provideRefreshRetrofit(@Named("refresh") client: OkHttpClient): Retrofit = Retrofit.Builder()
        .baseUrl("http://localhost/")
        .client(client)
        .addConverterFactory(json.asConverterFactory("application/json; charset=UTF-8".toMediaType()))
        .build()

    @Provides
    @Singleton
    @Named("longRunningRetrofit")
    fun provideLongRunningRetrofit(@Named("longRunning") client: OkHttpClient): Retrofit = Retrofit.Builder()
        .baseUrl("http://localhost/")
        .client(client)
        .addConverterFactory(json.asConverterFactory("application/json; charset=UTF-8".toMediaType()))
        .build()

    @Provides
    @Singleton
    fun provideAuthApi(@Named("refreshRetrofit") retrofit: Retrofit): AuthApi =
        retrofit.create(AuthApi::class.java)

    @Provides
    @Singleton
    fun provideCellarApi(retrofit: Retrofit): CellarApi =
        retrofit.create(CellarApi::class.java)

    @Provides
    @Singleton
    fun provideWineSearchApi(@Named("longRunningRetrofit") retrofit: Retrofit): WineSearchApi =
        retrofit.create(WineSearchApi::class.java)

    @Provides
    @Singleton
    fun provideDiscountsApi(retrofit: Retrofit): DiscountsApi =
        retrofit.create(DiscountsApi::class.java)

    @Provides
    @Singleton
    fun provideCountriesApi(retrofit: Retrofit): CountriesApi =
        retrofit.create(CountriesApi::class.java)

    @Provides
    @Singleton
    fun providePushApi(retrofit: Retrofit): PushApi =
        retrofit.create(PushApi::class.java)
}
