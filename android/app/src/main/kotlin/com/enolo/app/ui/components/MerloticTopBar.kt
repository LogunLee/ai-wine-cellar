package com.enolo.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.enolo.app.ui.theme.TokenBg
import com.enolo.app.ui.theme.TokenInk

/**
 * Единая верхняя панель приложения. Вёрстка строго одинакова во всех разделах
 * (логотип + заголовок слева). Меняется только [title] и содержимое правой
 * части — слот [actions].
 */
@Composable
fun MerloticTopBar(
    title: String,
    modifier: Modifier = Modifier,
    leading: @Composable () -> Unit = { MerloticLogo() },
    actions: @Composable RowScope.() -> Unit = {},
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            // Фиксированная высота: панель не должна «прыгать» из-за разной
            // высоты содержимого правой части на разных экранах.
            .height(54.dp)
            .background(TokenBg)
            .padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        leading()
        Spacer(Modifier.width(8.dp))
        Text(
            text  = title,
            style = MaterialTheme.typography.titleLarge.copy(
                fontWeight    = FontWeight.SemiBold,
                fontSize      = 21.sp,
                letterSpacing = (-0.42).sp,
            ),
            color = TokenInk,
        )
        Spacer(Modifier.weight(1f))
        actions()
    }
}

/** Логотип-плашка приложения (леворазмерный слот 30dp) — дефолтный leading в шапке. */
@Composable
fun MerloticLogo() {
    AsyncImage(
        model              = "file:///android_asset/logo.png",
        contentDescription = "Merlotic",
        contentScale       = ContentScale.Crop,
        modifier           = Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)),
    )
}
