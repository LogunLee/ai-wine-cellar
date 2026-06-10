package com.enolo.app.ui.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.*
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import kotlinx.coroutines.delay

private val DarkGreen1 = Color(0xFF0A3D2E)
private val DarkGreen2 = Color(0xFF0D2A1F)
private val DarkGreen3 = Color(0xFF0B1E18)
private val Teal       = Color(0xFF1C6F5E)
private val ErrorRed   = Color(0xFFC23B36)
private val Ink        = Color(0xFF1A1A1D)
private val Ink3       = Color(0xFF787880)

@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    onNavigateToRegister: () -> Unit,
    viewModel: LoginViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val focusManager = LocalFocusManager.current
    var passwordVisible by remember { mutableStateOf(false) }
    val passwordFocusRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        if (uiState.email.isNotBlank()) {
            delay(150)
            runCatching { passwordFocusRequester.requestFocus() }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(DarkGreen1, DarkGreen2, DarkGreen3),
                    startY = 0f,
                    endY = Float.POSITIVE_INFINITY,
                )
            ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(horizontal = 28.dp)
                .padding(top = 64.dp, bottom = 40.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(32.dp),
        ) {
            // ── Logo ──────────────────────────────────────────────────────────
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(80.dp)
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.10f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Box(
                        modifier = Modifier
                            .size(60.dp)
                            .clip(CircleShape)
                            .background(Color.White),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Default.WineBar,
                            contentDescription = null,
                            tint = Teal,
                            modifier = Modifier.size(30.dp),
                        )
                    }
                }
                Text(
                    text = "Enolo",
                    fontSize = 34.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = (-0.02).em,
                    color = Color.White,
                )
                Text(
                    text = "Персональный винный помощник",
                    fontSize = 14.sp,
                    color = Color.White.copy(alpha = 0.50f),
                )
            }

            // ── Login card ────────────────────────────────────────────────────
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(22.dp),
                color = Color.White,
                shadowElevation = 24.dp,
            ) {
                LoginForm(
                    uiState             = uiState,
                    passwordVisible     = passwordVisible,
                    onPasswordToggle    = { passwordVisible = !passwordVisible },
                    passwordFocusReq    = passwordFocusRequester,
                    onServerUrlChange   = viewModel::onServerUrlChange,
                    onEmailChange       = viewModel::onEmailChange,
                    onPasswordChange    = viewModel::onPasswordChange,
                    onLogin             = { viewModel.login(onLoginSuccess) },
                    onNextFocus         = { focusManager.moveFocus(FocusDirection.Down) },
                    onDone              = { focusManager.clearFocus(); viewModel.login(onLoginSuccess) },
                )
            }

            TextButton(onClick = onNavigateToRegister) {
                Text(
                    text = "Нет аккаунта? Зарегистрироваться",
                    color = Color.White.copy(alpha = 0.65f),
                    fontSize = 14.sp,
                )
            }
        }
    }
}

@Composable
private fun LoginForm(
    uiState           : LoginUiState,
    passwordVisible   : Boolean,
    onPasswordToggle  : () -> Unit,
    passwordFocusReq  : FocusRequester,
    onServerUrlChange : (String) -> Unit,
    onEmailChange     : (String) -> Unit,
    onPasswordChange  : (String) -> Unit,
    onLogin           : () -> Unit,
    onNextFocus       : () -> Unit,
    onDone            : () -> Unit,
) {
    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = Teal,
        focusedLabelColor  = Teal,
        cursorColor        = Teal,
    )

    Column(
        modifier = Modifier.padding(horizontal = 24.dp, vertical = 28.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text(
            text = "Вход в аккаунт",
            fontSize = 20.sp,
            fontWeight = FontWeight.SemiBold,
            color = Ink,
        )

        OutlinedTextField(
            value = uiState.serverUrl,
            onValueChange = onServerUrlChange,
            label = { Text("Адрес сервера") },
            placeholder = { Text("http://192.168.1.100:3000", color = Ink3, fontSize = 13.sp) },
            singleLine = true,
            shape = RoundedCornerShape(12.dp),
            colors = fieldColors,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next),
            keyboardActions = KeyboardActions(onNext = { onNextFocus() }),
            modifier = Modifier.fillMaxWidth(),
        )

        OutlinedTextField(
            value = uiState.email,
            onValueChange = onEmailChange,
            label = { Text("Email") },
            singleLine = true,
            shape = RoundedCornerShape(12.dp),
            colors = fieldColors,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            keyboardActions = KeyboardActions(onNext = { onNextFocus() }),
            modifier = Modifier.fillMaxWidth(),
        )

        OutlinedTextField(
            value = uiState.password,
            onValueChange = onPasswordChange,
            label = { Text("Пароль") },
            singleLine = true,
            visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
            shape = RoundedCornerShape(12.dp),
            colors = fieldColors,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { onDone() }),
            trailingIcon = {
                IconButton(onClick = onPasswordToggle) {
                    Icon(
                        imageVector = if (passwordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                        contentDescription = null,
                        tint = Ink3,
                    )
                }
            },
            modifier = Modifier.fillMaxWidth().focusRequester(passwordFocusReq),
        )

        uiState.error?.let { error ->
            Text(text = error, color = ErrorRed, fontSize = 13.sp)
        }

        Spacer(Modifier.height(4.dp))

        Button(
            onClick = onLogin,
            enabled = !uiState.isLoading,
            modifier = Modifier.fillMaxWidth().height(50.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Teal),
        ) {
            if (uiState.isLoading) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = Color.White)
            } else {
                Text("Войти", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
            }
        }
    }
}
