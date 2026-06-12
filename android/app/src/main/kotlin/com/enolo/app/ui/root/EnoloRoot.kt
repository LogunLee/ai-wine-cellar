package com.enolo.app.ui.root

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.enolo.app.core.network.ApiResult
import com.enolo.app.core.storage.SessionManager
import com.enolo.app.data.repository.AuthRepository
import com.enolo.app.data.repository.PushRepository
import com.enolo.app.ui.auth.LoginScreen
import com.enolo.app.ui.auth.RegisterScreen
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class RootViewModel @Inject constructor(
    val sessionManager: SessionManager,
    private val authRepository: AuthRepository,
    private val pushRepository: PushRepository,
) : ViewModel() {
    enum class AuthState { CHECKING, LOGGED_IN, LOGGED_OUT }

    private val _authState = MutableStateFlow(AuthState.CHECKING)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    private val _pendingRoute = MutableStateFlow<String?>(null)
    val pendingRoute: StateFlow<String?> = _pendingRoute.asStateFlow()

    init {
        viewModelScope.launch {
            val token = sessionManager.accessTokenBlocking()
            if (token.isNullOrEmpty()) {
                _authState.value = AuthState.LOGGED_OUT
                return@launch
            }
            when (authRepository.getMe()) {
                is ApiResult.Success -> _authState.value = AuthState.LOGGED_IN
                else -> {
                    _authState.value = if (!sessionManager.accessTokenBlocking().isNullOrEmpty())
                        AuthState.LOGGED_IN else AuthState.LOGGED_OUT
                }
            }
        }
        viewModelScope.launch {
            sessionManager.isLoggedIn.collect { loggedIn ->
                if (_authState.value != AuthState.CHECKING) {
                    _authState.value = if (loggedIn) AuthState.LOGGED_IN else AuthState.LOGGED_OUT
                }
                if (loggedIn) {
                    pushRepository.syncFcmToken()
                }
            }
        }
    }

    fun handlePushRoute(route: String) {
        _pendingRoute.value = route
    }

    fun clearPendingRoute() {
        _pendingRoute.value = null
    }
}

@Composable
fun MerloticRoot(
    viewModel: RootViewModel = hiltViewModel()
) {
    val authState by viewModel.authState.collectAsState()
    val navController = rememberNavController()

    when (authState) {
        RootViewModel.AuthState.CHECKING -> {
            androidx.compose.foundation.layout.Box(modifier = Modifier.fillMaxSize()) {
                androidx.compose.material3.CircularProgressIndicator(
                    modifier = Modifier.align(androidx.compose.ui.Alignment.Center)
                )
            }
        }
        RootViewModel.AuthState.LOGGED_OUT -> {
            NavHost(navController = navController, startDestination = "login") {
                composable("login") {
                    LoginScreen(
                        onLoginSuccess = {},
                        onNavigateToRegister = { navController.navigate("register") }
                    )
                }
                composable("register") {
                    RegisterScreen(
                        onRegisterSuccess = {},
                        onNavigateToLogin = { navController.popBackStack() }
                    )
                }
            }
        }
        RootViewModel.AuthState.LOGGED_IN -> {
            MainScaffold(rootViewModel = viewModel)
        }
    }
}
