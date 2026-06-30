package com.enolo.app.ui.notes

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.WineBar
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.enolo.app.data.dto.TastingNoteDto
import com.enolo.app.util.Formatters
import com.enolo.app.ui.theme.TokenFill as Fill
import com.enolo.app.ui.theme.TokenInk as Ink
import com.enolo.app.ui.theme.TokenInk2 as Ink2
import com.enolo.app.ui.theme.TokenInk3 as Ink3
import com.enolo.app.ui.theme.TokenLine as Line
import com.enolo.app.ui.theme.TokenRed as Red
import com.enolo.app.ui.theme.TokenTeal as Teal
import com.enolo.app.ui.theme.TokenYellow as Gold

/** Деталь дегустационной заметки — отдельный полноэкранный экран (раньше была нижняя модалка). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NoteDetailSheet(
    note: TastingNoteDto,
    photoUrl: String?,
    onEdit: () -> Unit,
    onPrepareVivino: () -> Unit,
    onDelete: () -> Unit,
    onSaveVivino: (String) -> Unit,
    onDeleteVivino: () -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val scroll = rememberScrollState()

    var editingVivino by remember(note.id, note.vivinoNoteText) { mutableStateOf(false) }
    var vivinoDraft by remember(note.id) { mutableStateOf(note.vivinoNoteText ?: "") }

    val title = listOfNotNull(note.wine.producer, note.wine.name).joinToString(" ").ifBlank { "Вино" }
    val subtitle = listOfNotNull(
        note.wine.wineType?.let { Formatters.wineTypeRu(it).ifBlank { null } },
        note.wine.region ?: note.wine.country,
        (note.vintage ?: note.wine.vintageYear)?.toString(),
    ).joinToString(" · ")

    BackHandler { onDismiss() }

    Surface(Modifier.fillMaxSize(), color = Color.White) {
        Column(Modifier.fillMaxSize()) {
            // ── Top bar: назад + заголовок ──
            Row(
                Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 8.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onDismiss) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад", tint = Ink) }
                Text("Заметка", fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = Ink)
            }
            HorizontalDivider(color = Line)

            Column(
                Modifier.weight(1f).verticalScroll(scroll).padding(horizontal = 20.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                // ── Шапка: фото слева + полное наименование (без обрезки) ──
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.Top) {
                    Box(Modifier.size(width = 76.dp, height = 104.dp).clip(RoundedCornerShape(12.dp)).background(Fill), contentAlignment = Alignment.Center) {
                        if (!photoUrl.isNullOrBlank()) {
                            AsyncImage(model = photoUrl, contentDescription = null, contentScale = ContentScale.FillHeight, alignment = Alignment.Center, modifier = Modifier.fillMaxSize())
                        } else {
                            Icon(Icons.Default.WineBar, null, tint = Ink3, modifier = Modifier.size(34.dp))
                        }
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(title, fontSize = 19.sp, fontWeight = FontWeight.SemiBold, color = Ink)
                        if (subtitle.isNotBlank()) Text(subtitle, fontSize = 13.sp, color = Ink3)
                        // Оценка — как в списке: звезда + чёткая цифра
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Icon(Icons.Default.Star, null, Modifier.size(18.dp), tint = Gold)
                            Text("%.1f".format(note.rating), fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Ink)
                            Text("· ${note.tastingDate}", fontSize = 13.sp, color = Ink3)
                        }
                    }
                }

                note.wine.grapes?.takeIf { it.isNotEmpty() }?.let { grapes ->
                    Text(grapes.joinToString(", "), fontSize = 13.sp, color = Ink3)
                }

                FlowChips(note)

                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Личная заметка", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Ink)
                    Text(
                        note.noteText?.trim()?.ifBlank { null } ?: "Без текста",
                        fontSize = 14.sp, color = if (note.noteText.isNullOrBlank()) Ink3 else Ink2,
                    )
                }

                if (note.hasVivinoNote) {
                    HorizontalDivider(color = Line)
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Заметка для Vivino", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Ink, modifier = Modifier.weight(1f))
                            if (!editingVivino) {
                                IconButton(onClick = { vivinoDraft = note.vivinoNoteText ?: ""; editingVivino = true }, modifier = Modifier.size(34.dp)) {
                                    Icon(Icons.Default.Edit, "Редактировать", Modifier.size(18.dp), tint = Ink2)
                                }
                                IconButton(onClick = {
                                    clipboard.setText(AnnotatedString(note.vivinoNoteText ?: ""))
                                    android.widget.Toast.makeText(context, "Скопировано", android.widget.Toast.LENGTH_SHORT).show()
                                }, modifier = Modifier.size(34.dp)) {
                                    Icon(Icons.Default.ContentCopy, "Копировать", Modifier.size(18.dp), tint = Ink2)
                                }
                                IconButton(onClick = onDeleteVivino, modifier = Modifier.size(34.dp)) {
                                    Icon(Icons.Default.Delete, "Удалить Vivino-версию", Modifier.size(18.dp), tint = Red)
                                }
                            }
                        }
                        if (editingVivino) {
                            OutlinedTextField(
                                value = vivinoDraft, onValueChange = { if (it.length <= 5000) vivinoDraft = it },
                                modifier = Modifier.fillMaxWidth(), minLines = 4,
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.align(Alignment.End)) {
                                TextButton(onClick = { editingVivino = false }) { Text("Отмена") }
                                Button(
                                    onClick = { onSaveVivino(vivinoDraft); editingVivino = false },
                                    enabled = vivinoDraft.isNotBlank(),
                                    colors = ButtonDefaults.buttonColors(containerColor = Teal),
                                    shape = RoundedCornerShape(10.dp),
                                ) { Text("Сохранить", color = Color.White) }
                            }
                        } else {
                            Text(note.vivinoNoteText ?: "", fontSize = 14.sp, color = Ink2)
                        }
                    }
                }
            }

            // ── Футер: все кнопки в одну строку (без «Вино») ──
            HorizontalDivider(color = Line)
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 12.dp).navigationBarsPadding(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                val tight = PaddingValues(horizontal = 6.dp)
                OutlinedButton(onClick = onPrepareVivino, modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp), contentPadding = tight) {
                    Icon(Icons.Default.AutoAwesome, null, Modifier.size(16.dp)); Spacer(Modifier.width(4.dp))
                    Text("Vivino", fontSize = 13.sp, maxLines = 1)
                }
                OutlinedButton(onClick = onEdit, modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp), contentPadding = tight) {
                    Icon(Icons.Default.Edit, null, Modifier.size(16.dp)); Spacer(Modifier.width(4.dp))
                    Text("Изменить", fontSize = 13.sp, maxLines = 1)
                }
                OutlinedButton(
                    onClick = onDelete, modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp), contentPadding = tight,
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Red),
                ) {
                    Icon(Icons.Default.Delete, null, Modifier.size(16.dp)); Spacer(Modifier.width(4.dp))
                    Text("Удалить", fontSize = 13.sp, maxLines = 1)
                }
            }
        }
    }
}

@Composable
private fun FlowChips(note: TastingNoteDto) {
    val chips = buildList {
        note.place?.takeIf { it.isNotBlank() }?.let { add("Место: $it") }
        note.price?.let { add("Цена: ${if (it % 1.0 == 0.0) it.toInt() else it} ₽") }
        note.wouldBuyAgain?.let { add(if (it) "Купил бы снова" else "Не купил бы снова") }
    }
    if (chips.isEmpty()) return
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        chips.forEach { c ->
            Box(Modifier.clip(RoundedCornerShape(8.dp)).background(Fill).padding(horizontal = 10.dp, vertical = 5.dp)) {
                Text(c, fontSize = 12.sp, color = Ink2)
            }
        }
    }
}
