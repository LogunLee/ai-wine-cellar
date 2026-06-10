package com.enolo.app.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.enolo.app.core.config.AppConfig
import com.enolo.app.core.network.ApiResult
import com.enolo.app.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class RegisterUiState(
    val serverUrl: String = AppConfig.defaultServerUrl,
    val email: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val isLoading: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class RegisterViewModel @Inject constructor(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(RegisterUiState())
    val uiState: StateFlow<RegisterUiState> = _uiState.asStateFlow()

    fun onServerUrlChange(v: String) { _uiState.value = _uiState.value.copy(serverUrl = v, error = null) }
    fun onEmailChange(v: String) { _uiState.value = _uiState.value.copy(email = v, error = null) }
    fun onPasswordChange(v: String) { _uiState.value = _uiState.value.copy(password = v, error = null) }
    fun onConfirmPasswordChange(v: String) { _uiState.value = _uiState.value.copy(confirmPassword = v, error = null) }

    fun register(onSuccess: () -> Unit) {
        val s = _uiState.value
        if (s.serverUrl.isBlank()) { _uiState.value = s.copy(error = "Укажите адрес сервера"); return }
        if (s.email.isBlank()) { _uiState.value = s.copy(error = "Введите email"); return }
        if (s.password.length < 6) { _uiState.value = s.copy(error = "Пароль не менее 6 символов"); return }
        if (s.password != s.confirmPassword) { _uiState.value = s.copy(error = "Пароли не совпадают"); return }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            when (val res = authRepository.register(s.serverUrl, s.email, s.password, null)) {
                is ApiResult.Success -> onSuccess()
                is ApiResult.Error -> _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = res.message ?: "Ошибка регистрации (${res.code})"
                )
                is ApiResult.NetworkError -> _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "Нет соединения: ${res.message}"
                )
            }
        }
    }
}
