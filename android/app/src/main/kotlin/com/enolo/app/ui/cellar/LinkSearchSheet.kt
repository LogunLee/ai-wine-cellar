package com.enolo.app.ui.cellar

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.enolo.app.ui.components.MerloticSheet
import com.enolo.app.ui.components.SheetDragHandle
import com.enolo.app.ui.theme.TokenFill as Fill
import com.enolo.app.ui.theme.TokenInk as Ink
import com.enolo.app.ui.theme.TokenInk3 as Ink3
import com.enolo.app.ui.theme.TokenLine as Line
import com.enolo.app.ui.theme.TokenRed as Red
import com.enolo.app.ui.theme.TokenTeal as Teal

/**
 * Общий каркас шторки «найти вино на внешнем сайте и привязать ссылку»
 * (Vivino, Wine-Searcher): заголовок, поле поиска с дебаунсом во ViewModel,
 * стейты загрузки/ошибки/пусто и список результатов.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun <T> LinkSearchSheet(
    title        : String,
    initialQuery : String,
    results      : List<T>,
    loading      : Boolean,
    error        : String?,
    onQueryChange: (String) -> Unit,
    onDismiss    : () -> Unit,
    resultKey    : (T) -> Any,
    resultRow    : @Composable (T) -> Unit,
) {
    var query by remember { mutableStateOf(initialQuery) }

    LaunchedEffect(initialQuery) {
        if (initialQuery.isNotBlank()) onQueryChange(initialQuery)
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor   = Color.White,
        shape            = MerloticSheet.Shape,
        scrimColor       = MerloticSheet.ScrimColor,
        dragHandle       = { SheetDragHandle() },
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.85f)
        ) {
            // Header
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(title, fontSize = 19.sp, fontWeight = FontWeight.SemiBold, color = Ink, modifier = Modifier.weight(1f))
                Box(
                    Modifier.size(34.dp).clip(CircleShape).background(Fill).clickable(onClick = onDismiss),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(18.dp), tint = Ink) }
            }
            HorizontalDivider(color = Line)

            // Search field
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Fill)
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Default.Search, contentDescription = null, tint = Ink3, modifier = Modifier.size(18.dp))
                BasicTextField(
                    value         = query,
                    onValueChange = { q -> query = q; onQueryChange(q) },
                    modifier      = Modifier.weight(1f),
                    singleLine    = true,
                    textStyle     = TextStyle(fontSize = 15.sp, color = Ink),
                    cursorBrush   = SolidColor(Teal),
                    decorationBox = { inner ->
                        if (query.isEmpty()) Text("Введите название вина…", fontSize = 15.sp, color = Ink3)
                        inner()
                    },
                )
                if (query.isNotEmpty()) {
                    IconButton(onClick = { query = ""; onQueryChange("") }, modifier = Modifier.size(20.dp)) {
                        Icon(Icons.Default.Close, contentDescription = null, tint = Ink3, modifier = Modifier.size(16.dp))
                    }
                }
            }

            // Content
            when {
                loading -> {
                    Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Teal, modifier = Modifier.size(28.dp))
                    }
                }
                error != null -> {
                    Text(
                        text     = "Ошибка: $error",
                        color    = Red,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(horizontal = 20.dp),
                    )
                }
                results.isEmpty() && query.length >= 2 && !loading -> {
                    Text(
                        text     = "Ничего не найдено",
                        color    = Ink3,
                        fontSize = 14.sp,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
                    )
                }
                else -> {
                    LazyColumn(
                        Modifier.fillMaxWidth(),
                        contentPadding = PaddingValues(bottom = 24.dp),
                    ) {
                        items(results.size, key = { resultKey(results[it]) }) { index ->
                            resultRow(results[index])
                            HorizontalDivider(color = Line, modifier = Modifier.padding(start = 16.dp))
                        }
                    }
                }
            }
        }
    }
}
