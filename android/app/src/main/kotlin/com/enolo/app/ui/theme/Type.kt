package com.enolo.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// Geist → system default (Roboto), Geist Mono → system monospace (Roboto Mono)
val MerloticSans  = FontFamily.Default
val MerloticMono  = FontFamily.Monospace

val MerloticTypography = Typography(
    // Основной текст
    bodyLarge = TextStyle(
        fontFamily = MerloticSans,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp
    ),
    bodyMedium = TextStyle(
        fontFamily = MerloticSans,
        fontWeight = FontWeight.Normal,
        fontSize = 13.5.sp,
        lineHeight = 20.sp
    ),
    bodySmall = TextStyle(
        fontFamily = MerloticSans,
        fontWeight = FontWeight.Normal,
        fontSize = 11.5.sp,
        lineHeight = 16.sp
    ),

    // Лейблы
    labelLarge = TextStyle(
        fontFamily = MerloticSans,
        fontWeight = FontWeight.Medium,
        fontSize = 13.sp,
        lineHeight = 18.sp
    ),
    labelMedium = TextStyle(
        fontFamily = MerloticMono,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 14.sp,
        letterSpacing = 0.16.sp
    ),
    labelSmall = TextStyle(
        fontFamily = MerloticMono,
        fontWeight = FontWeight.Normal,
        fontSize = 11.5.sp,
        lineHeight = 14.sp
    ),

    // Заголовки
    titleLarge = TextStyle(
        fontFamily = MerloticSans,
        fontWeight = FontWeight.SemiBold,
        fontSize = 21.sp,
        lineHeight = 28.sp,
        letterSpacing = (-0.42).sp
    ),
    titleMedium = TextStyle(
        fontFamily = MerloticSans,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        lineHeight = 22.sp
    ),
    titleSmall = TextStyle(
        fontFamily = MerloticSans,
        fontWeight = FontWeight.SemiBold,
        fontSize = 13.5.sp,
        lineHeight = 18.sp
    ),

    // Отображение (счётчик погреба)
    displaySmall = TextStyle(
        fontFamily = MerloticMono,
        fontWeight = FontWeight.SemiBold,
        fontSize = 38.sp,
        lineHeight = 44.sp,
        letterSpacing = (-1.14).sp
    ),

    headlineMedium = TextStyle(
        fontFamily = MerloticSans,
        fontWeight = FontWeight.SemiBold,
        fontSize = 21.sp,
        lineHeight = 28.sp
    ),
    headlineSmall = TextStyle(
        fontFamily = MerloticSans,
        fontWeight = FontWeight.SemiBold,
        fontSize = 18.sp,
        lineHeight = 24.sp
    )
)
