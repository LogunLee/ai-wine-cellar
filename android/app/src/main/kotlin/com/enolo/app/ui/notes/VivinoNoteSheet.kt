package com.enolo.app.ui.notes

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.enolo.app.data.dto.TastingNoteDto
import com.enolo.app.ui.components.MerloticSheet
import com.enolo.app.ui.components.SheetDragHandle
import com.enolo.app.ui.theme.TokenInk as Ink
import com.enolo.app.ui.theme.TokenInk2 as Ink2
import com.enolo.app.ui.theme.TokenInk3 as Ink3
import com.enolo.app.ui.theme.TokenLine as Line
import com.enolo.app.ui.theme.TokenRed as Red
import com.enolo.app.ui.theme.TokenTeal as Teal

private const val NOTE_MAX = 5000

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VivinoNoteSheet(
    note: TastingNoteDto,
    generate: suspend (String) -> Result<String>,
    onReplace: (String) -> Unit,
    onAppend: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val scroll = rememberScrollState()
    val screenH = androidx.compose.ui.platform.LocalConfiguration.current.screenHeightDp.dp

    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var text by remember { mutableStateOf("") }
    var attempt by remember { mutableStateOf(0) }

    LaunchedEffect(attempt) {
        loading = true
        error = null
        generate(note.id)
            .onSuccess { text = it; loading = false }
            .onFailure { error = it.message ?: "Не удалось сгенерировать текст"; loading = false }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Color.White,
        shape = MerloticSheet.Shape,
        scrimColor = MerloticSheet.ScrimColor,
        dragHandle = { SheetDragHandle() },
    ) {
        Column(Modifier.fillMaxWidth().heightIn(max = screenH * 0.92f)) {
            Text(
                "Заметка для Vivino",
                fontSize = 19.sp, fontWeight = FontWeight.SemiBold, color = Ink,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 14.dp),
            )
            HorizontalDivider(color = Line)

            Column(
                Modifier.weight(1f, fill = false).verticalScroll(scroll).padding(horizontal = 20.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Text("Ваша исходная заметка", fontSize = 12.sp, color = Ink3)
                Text(
                    note.noteText?.trim()?.ifBlank { null } ?: "(текст не заполнен)",
                    fontSize = 14.sp, color = Ink2,
                )
                HorizontalDivider(color = Line)

                when {
                    loading -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(vertical = 12.dp)) {
                        CircularProgressIndicator(Modifier.size(22.dp), color = Teal, strokeWidth = 2.dp)
                        Text("Генерируем текст…", color = Ink2, fontSize = 14.sp)
                    }
                    error != null -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(error!!, color = Red, fontSize = 14.sp)
                        OutlinedButton(onClick = { attempt++ }, shape = RoundedCornerShape(12.dp)) {
                            Icon(Icons.Default.Refresh, null, Modifier.size(16.dp)); Spacer(Modifier.width(8.dp)); Text("Повторить")
                        }
                    }
                    else -> OutlinedTextField(
                        value = text,
                        onValueChange = { if (it.length <= NOTE_MAX) text = it },
                        label = { Text("Сгенерированный текст (можно изменить)") },
                        modifier = Modifier.fillMaxWidth().heightIn(min = 140.dp),
                        minLines = 5,
                        supportingText = { Text("${text.length} / $NOTE_MAX", color = Ink3) },
                    )
                }
            }

            HorizontalDivider(color = Line)
            Column(Modifier.fillMaxWidth().padding(16.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                val enabled = !loading && error == null && text.isNotBlank()
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp)) { Text("Отмена") }
                    OutlinedButton(
                        onClick = {
                            clipboard.setText(AnnotatedString(text))
                            android.widget.Toast.makeText(context, "Скопировано в буфер обмена", android.widget.Toast.LENGTH_SHORT).show()
                        },
                        enabled = enabled, modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp),
                    ) {
                        Icon(Icons.Default.ContentCopy, null, Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)); Text("Копировать")
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { onAppend(text) }, enabled = enabled, modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp)) {
                        Text("Дополнительно")
                    }
                    Button(
                        onClick = { onReplace(text) }, enabled = enabled, modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(12.dp), colors = ButtonDefaults.buttonColors(containerColor = Teal),
                    ) { Text("Заменить", color = Color.White) }
                }
            }
        }
    }
}
