package com.enolo.app.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import com.enolo.app.ui.theme.TokenInk2 as Ink2
import com.enolo.app.ui.theme.TokenTeal as Teal

/**
 * Кнопка синхронизации в шапке: при [syncing] значок непрерывно вращается и подсвечивается,
 * клик блокируется. Используется на экранах «Погреб» и «Заметки» — там фоновая загрузка
 * крутит именно эту кнопку, а не общий полноэкранный спиннер.
 */
@Composable
fun SyncIconButton(syncing: Boolean, onClick: () -> Unit) {
    val transition = rememberInfiniteTransition(label = "sync")
    val rotation by if (syncing) {
        transition.animateFloat(
            initialValue = 0f,
            targetValue = 360f,
            animationSpec = infiniteRepeatable(tween(900, easing = LinearEasing)),
            label = "rot",
        )
    } else {
        remember { mutableStateOf(0f) }
    }
    IconButton(onClick = onClick, enabled = !syncing) {
        Icon(
            Icons.Default.Sync,
            contentDescription = "Синхронизировать",
            tint = if (syncing) Teal else Ink2,
            modifier = Modifier.graphicsLayer { rotationZ = rotation },
        )
    }
}
