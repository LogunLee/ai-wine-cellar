package com.enolo.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val MerloticColorScheme = lightColorScheme(
    primary              = TokenTeal,
    onPrimary            = Color.White,
    primaryContainer     = TokenTealWash,
    onPrimaryContainer   = TokenTealInk,

    secondary            = TokenInk2,
    onSecondary          = Color.White,
    secondaryContainer   = TokenFill,
    onSecondaryContainer = TokenInk,

    tertiary             = TokenMaroon,
    onTertiary           = Color.White,

    background           = TokenBg,
    onBackground         = TokenInk,

    surface              = TokenCard,
    onSurface            = TokenInk,
    surfaceVariant       = TokenFill,
    onSurfaceVariant     = TokenInk2,

    outline              = TokenLine,
    outlineVariant       = TokenLine,

    error                = TokenRed,
    onError              = Color.White,

    inverseSurface       = TokenInk,
    inverseOnSurface     = Color.White,
)

@Composable
fun MerloticTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = MerloticColorScheme,
        typography  = MerloticTypography,
        content     = content
    )
}
