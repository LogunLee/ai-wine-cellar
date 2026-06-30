package com.enolo.app.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.enolo.app.BuildConfig
import com.enolo.app.core.config.AppConfig
import com.enolo.app.core.network.ApiResult
import com.enolo.app.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LoginUiState(
    val serverUrl: String = AppConfig.defaultServerUrl,
    val email: String = BuildConfig.DEBUG_DEFAULT_EMAIL,
    val password: String = "",
    val isLoading: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    fun onServerUrlChange(v: String) { _uiState.value = _uiState.value.copy(serverUrl = v, error = null) }
    fun onEmailChange(v: String) { _uiState.value = _uiState.value.copy(email = v, error = null) }
    fun onPasswordChange(v: String) { _uiState.value = _uiState.value.copy(password = v, error = null) }

    fun login(onSuccess: () -> Unit) {
        val s = _uiState.value
        if (s.serverUrl.isBlank()) { _uiState.value = s.copy(error = "Укажите адрес сервера"); return }
        if (s.email.isBlank()) { _uiState.value = s.copy(error = "Введите email"); return }
        if (s.password.isBlank()) { _uiState.value = s.copy(error = "Введите пароль"); return }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            when (val res = authRepository.login(s.serverUrl, s.email, s.password)) {
                // isLoading сбрасываем и при успехе: ViewModel переживает logout,
                // иначе после выхода кнопка «Войти» останется с вечным спиннером
                is ApiResult.Success -> {
                    _uiState.value = _uiState.value.copy(isLoading = false, password = "")
                    onSuccess()
                }
                is ApiResult.Error -> _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = res.message ?: "Ошибка входа (${res.code})"
                )
                is ApiResult.NetworkError -> _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Нет соединения: ${res.message}"
                )
            }
        }
    }
}
