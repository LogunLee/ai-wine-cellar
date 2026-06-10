package com.enolo.app.core.network

sealed class ApiResult<out T> {
    data class Success<T>(val data: T) : ApiResult<T>()
    data class Error(val code: Int, val message: String) : ApiResult<Nothing>()
    data class NetworkError(val message: String) : ApiResult<Nothing>()
}

suspend fun <T> safeApiCall(call: suspend () -> T): ApiResult<T> {
    return try {
        ApiResult.Success(call())
    } catch (e: retrofit2.HttpException) {
        val errorBody = e.response()?.errorBody()?.string() ?: e.message()
        ApiResult.Error(e.code(), extractMessage(errorBody))
    } catch (e: java.io.IOException) {
        ApiResult.NetworkError(e.message ?: "Network error")
    } catch (e: Exception) {
        ApiResult.Error(-1, e.message ?: "Unknown error")
    }
}

private fun extractMessage(body: String?): String {
    if (body.isNullOrBlank()) return "Unknown error"
    return try {
        val json = kotlinx.serialization.json.Json.parseToJsonElement(body)
        val obj = json as? kotlinx.serialization.json.JsonObject
        obj?.get("message")?.toString()?.trim('"') ?: body
    } catch (_: Exception) {
        body
    }
}
