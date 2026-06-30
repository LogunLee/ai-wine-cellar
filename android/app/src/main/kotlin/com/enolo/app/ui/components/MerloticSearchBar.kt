package com.enolo.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.enolo.app.ui.theme.TokenInk
import com.enolo.app.ui.theme.TokenInk3
import com.enolo.app.ui.theme.TokenLine
import com.enolo.app.ui.theme.TokenTeal

/**
 * Единая поисковая строка приложения (эталон — раздел «Погреб»). Вёрстка
 * абсолютно одинакова во всех разделах: меняется только [placeholder] и
 * содержимое правого слота [trailing] (кнопки галереи/камеры/AI-поиска).
 *
 * Высота фиксируется по высоте круглой кнопки (38dp), чтобы строка выглядела
 * одинаково и там, где кнопок справа нет.
 */
@Composable
fun MerloticSearchBar(
    value         : String,
    onValueChange : (String) -> Unit,
    onClear       : () -> Unit,
    placeholder   : String,
    modifier      : Modifier = Modifier,
    onSubmit      : (() -> Unit)? = null,
    trailing      : @Composable RowScope.() -> Unit = {},
) {
    Surface(
        modifier        = modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
        shape           = CircleShape,
        color           = Color.White,
        border          = BorderStroke(1.dp, TokenLine),
        shadowElevation = 1.dp,
    ) {
        Row(
            // min 50dp = высота строки с круглой кнопкой 38dp (6+38+6). Гарантирует
            // одинаковую высоту даже там, где кнопок справа нет (раздел «Скидки»).
            modifier              = Modifier.heightIn(min = 50.dp).padding(start = 16.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
            verticalAlignment     = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(Icons.Default.Search, contentDescription = null, tint = TokenInk3, modifier = Modifier.size(20.dp))
            BasicTextField(
                value           = value,
                onValueChange   = onValueChange,
                modifier        = Modifier.weight(1f),
                singleLine      = true,
                textStyle       = TextStyle(fontSize = 15.sp, color = TokenInk),
                cursorBrush     = SolidColor(TokenTeal),
                keyboardOptions = if (onSubmit != null) KeyboardOptions(imeAction = ImeAction.Search) else KeyboardOptions.Default,
                keyboardActions = if (onSubmit != null) KeyboardActions(onSearch = { onSubmit() }) else KeyboardActions.Default,
                decorationBox   = { inner ->
                    if (value.isEmpty()) Text(placeholder, fontSize = 15.sp, color = TokenInk3)
                    inner()
                },
            )
            if (value.isNotEmpty()) {
                Icon(
                    Icons.Default.Close, contentDescription = "Очистить", tint = TokenInk3,
                    modifier = Modifier.size(18.dp).clickable(onClick = onClear),
                )
            }
            trailing()
        }
    }
}

/** Круглая кнопка-действие внутри поисковой строки (эталон — кнопка AI-поиска). */
@Composable
fun SearchBarActionButton(
    icon              : ImageVector,
    contentDescription: String,
    onClick           : () -> Unit,
) {
    Box(
        Modifier.size(38.dp).clip(CircleShape).background(TokenTeal).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = contentDescription, tint = Color.White, modifier = Modifier.size(19.dp))
    }
}
