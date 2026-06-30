package com.enolo.app.ui.notes

import android.app.DatePickerDialog
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.WineBar
import androidx.compose.material.icons.filled.Liquor
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.enolo.app.data.dto.CellarItemDto
import com.enolo.app.data.dto.CreateTastingNoteRequest
import com.enolo.app.data.dto.ManualWineRequest
import com.enolo.app.data.dto.TastingNoteDto
import com.enolo.app.data.dto.UpdateTastingNoteRequest
import com.enolo.app.ui.components.MerloticSheet
import com.enolo.app.ui.components.SheetDragHandle
import com.enolo.app.ui.theme.TokenFill as Fill
import com.enolo.app.ui.theme.TokenInk as Ink
import com.enolo.app.ui.theme.TokenInk2 as Ink2
import com.enolo.app.ui.theme.TokenInk3 as Ink3
import com.enolo.app.ui.theme.TokenLine as Line
import com.enolo.app.ui.theme.TokenRed as Red
import com.enolo.app.ui.theme.TokenTeal as Teal
import com.enolo.app.ui.theme.TokenTealWash as TealWash
import java.util.Calendar

private const val NOTE_MAX = 5000

/** Единая высота элементов форм (инпуты, селекты, date picker, кнопки). */
private val FieldHeight = 56.dp

private fun todayIso(): String {
    val c = Calendar.getInstance()
    return "%04d-%02d-%02d".format(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
}

private fun cellarLabel(i: CellarItemDto): String =
    "${i.producer} ${i.name}".trim() + (i.vintageYear?.let { " · $it" } ?: "")

/** Полноэкранная форма создания/редактирования дегустационной заметки (раньше была модалка). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NoteFormSheet(
    editNote: TastingNoteDto?,
    cellarItems: List<CellarItemDto>,
    onCreate: (CreateTastingNoteRequest) -> Unit,
    onUpdate: (UpdateTastingNoteRequest) -> Unit,
    onDismiss: () -> Unit,
) {
    val isEdit = editNote != null
    val context = LocalContext.current

    // ── Привязка вина ──
    var cellarItemId by remember { mutableStateOf(editNote?.wine?.cellarItemId) }
    var manualWine by remember {
        mutableStateOf(
            editNote?.wine?.takeIf { it.cellarItemId == null && (it.producer != null || it.name != null) }?.let { w ->
                ManualWineRequest(
                    producer = w.producer, name = w.name, vintageYear = w.vintageYear,
                    country = w.country, region = w.region, wineType = w.wineType,
                )
            }
        )
    }

    var tastingDate by remember { mutableStateOf(editNote?.tastingDate?.take(10) ?: todayIso()) }
    var rating by remember { mutableStateOf(editNote?.rating?.toFloat() ?: 0f) }
    var noteText by remember { mutableStateOf(editNote?.noteText ?: "") }
    var place by remember { mutableStateOf(editNote?.place ?: "") }
    var wouldBuyAgain by remember { mutableStateOf(editNote?.wouldBuyAgain ?: false) }
    var error by remember { mutableStateOf<String?>(null) }
    var showCellarPicker by remember { mutableStateOf(false) }
    var showManualEntry by remember { mutableStateOf(false) }

    val selectedCellar = cellarItems.find { it.id == cellarItemId }

    fun submit() {
        if (tastingDate.isBlank()) { error = "Укажите дату дегустации"; return }
        if (rating < 1f) { error = "Поставьте оценку"; return }
        val ratingD = (Math.round(rating * 10) / 10.0)
        if (isEdit) {
            onUpdate(
                UpdateTastingNoteRequest(
                    cellarItemId = cellarItemId,
                    manualWine = if (cellarItemId == null) (manualWine ?: ManualWineRequest()) else null,
                    tastingDate = tastingDate,
                    rating = ratingD,
                    noteText = noteText, // "" очистит текст
                    place = place,
                    wouldBuyAgain = wouldBuyAgain,
                )
            )
        } else {
            onCreate(
                CreateTastingNoteRequest(
                    cellarItemId = cellarItemId,
                    manualWine = if (cellarItemId == null) manualWine else null,
                    tastingDate = tastingDate,
                    rating = ratingD,
                    noteText = noteText.ifBlank { null },
                    place = place.ifBlank { null },
                    wouldBuyAgain = wouldBuyAgain,
                )
            )
        }
    }

    BackHandler { onDismiss() }

    Surface(Modifier.fillMaxSize(), color = Color.White) {
        Column(Modifier.fillMaxSize()) {
            // Top bar
            Row(
                Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 8.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onDismiss) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад", tint = Ink) }
                Text(if (isEdit) "Редактировать заметку" else "Новая заметка", fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = Ink)
            }
            HorizontalDivider(color = Line)

            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                error?.let { Text(it, color = Red, fontSize = 13.sp) }

                // ── Вино (необязательно) ──
                Text("Вино (необязательно)", fontSize = 13.sp, color = Ink3)
                val wineTitle = when {
                    selectedCellar != null -> cellarLabel(selectedCellar)
                    manualWine != null -> listOfNotNull(manualWine!!.producer, manualWine!!.name).joinToString(" ").ifBlank { "Вино без названия" }
                    else -> null
                }
                if (wineTitle != null) {
                    Surface(shape = RoundedCornerShape(12.dp), color = Fill, modifier = Modifier.fillMaxWidth()) {
                        Row(Modifier.padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.WineBar, null, Modifier.size(20.dp), tint = Teal)
                            Spacer(Modifier.width(10.dp))
                            Text(wineTitle, fontSize = 14.sp, color = Ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                            Icon(Icons.Default.Close, "Убрать", Modifier.size(18.dp).clickable { cellarItemId = null; manualWine = null }, tint = Ink3)
                        }
                    }
                } else {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        WineSourceButton("Из погреба", Icons.Default.Liquor, Modifier.weight(1f)) { showCellarPicker = true }
                        WineSourceButton("Вручную", Icons.Default.Edit, Modifier.weight(1f)) { showManualEntry = true }
                    }
                }

                // ── Оценка ──
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Оценка", fontSize = 13.sp, color = Ink3)
                        if (rating >= 1f) RatingStars(rating.toDouble(), starSize = 18.dp)
                        Text(if (rating >= 1f) "%.1f".format(rating) else "—", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Ink)
                    }
                    Slider(
                        value = rating,
                        onValueChange = { rating = (Math.round(it * 10) / 10f) },
                        valueRange = 1f..5f,
                        steps = 39,
                        colors = SliderDefaults.colors(thumbColor = Teal, activeTrackColor = Teal),
                    )
                }

                // ── Текст ──
                OutlinedTextField(
                    value = noteText,
                    onValueChange = { if (it.length <= NOTE_MAX) noteText = it },
                    label = { Text("Текст заметки") },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 110.dp),
                    minLines = 4,
                    supportingText = { Text("${noteText.length} / $NOTE_MAX", color = Ink3) },
                )

                // ── Дата дегустации + Место (одна строка, равная высота) ──
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedButton(
                        onClick = {
                            val parts = tastingDate.split("-").mapNotNull { it.toIntOrNull() }
                            val cal = Calendar.getInstance()
                            if (parts.size == 3) cal.set(parts[0], parts[1] - 1, parts[2])
                            DatePickerDialog(
                                context,
                                { _, y, m, d -> tastingDate = "%04d-%02d-%02d".format(y, m + 1, d) },
                                cal.get(Calendar.YEAR), cal.get(Calendar.MONTH), cal.get(Calendar.DAY_OF_MONTH),
                            ).show()
                        },
                        modifier = Modifier.weight(1f).height(FieldHeight),
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, Line),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Ink),
                        contentPadding = PaddingValues(horizontal = 12.dp),
                    ) {
                        Icon(Icons.Default.CalendarMonth, null, Modifier.size(16.dp), tint = Ink2)
                        Spacer(Modifier.width(8.dp))
                        Text(tastingDate, fontSize = 14.sp, maxLines = 1)
                    }
                    OutlinedTextField(
                        value = place, onValueChange = { place = it },
                        label = { Text("Место") }, singleLine = true,
                        modifier = Modifier.weight(1f).height(FieldHeight),
                    )
                }

                // ── Купил бы снова ──
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Купил бы снова", fontSize = 15.sp, color = Ink, modifier = Modifier.weight(1f))
                    Switch(
                        checked = wouldBuyAgain, onCheckedChange = { wouldBuyAgain = it },
                        colors = SwitchDefaults.colors(checkedThumbColor = Color.White, checkedTrackColor = Teal),
                    )
                }
            }

            HorizontalDivider(color = Line)
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp).navigationBarsPadding(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f).height(FieldHeight), shape = RoundedCornerShape(12.dp)) { Text("Отмена") }
                Button(
                    onClick = { submit() },
                    modifier = Modifier.weight(2f).height(FieldHeight), shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Teal),
                ) {
                    Icon(Icons.Default.Check, null, Modifier.size(18.dp), tint = Color.White)
                    Spacer(Modifier.width(8.dp))
                    Text("Сохранить", color = Color.White)
                }
            }
        }
    }

    if (showCellarPicker) {
        CellarPickerSheet(
            cellarItems = cellarItems,
            onSelect = { cellarItemId = it; manualWine = null; showCellarPicker = false },
            onDismiss = { showCellarPicker = false },
        )
    }
    if (showManualEntry) {
        ManualWineSheet(
            initial = manualWine,
            onSave = { manualWine = it; cellarItemId = null; showManualEntry = false },
            onDismiss = { showManualEntry = false },
        )
    }
}

@Composable
private fun WineSourceButton(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, modifier: Modifier, onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick,
        modifier = modifier.height(FieldHeight),
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, Line),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = Ink),
    ) {
        Icon(icon, null, Modifier.size(18.dp), tint = Teal)
        Spacer(Modifier.width(8.dp))
        Text(label, fontSize = 14.sp, maxLines = 1)
    }
}

// ─── Выбор вина из погреба (модалка: без разделителя, выше, поиск + сортировка) ───

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CellarPickerSheet(
    cellarItems: List<CellarItemDto>,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var query by remember { mutableStateOf("") }
    var sortByName by remember { mutableStateOf(true) } // true=По алфавиту(ASC), false=По дате(DESC)
    val screenH = androidx.compose.ui.platform.LocalConfiguration.current.screenHeightDp.dp

    val shown = remember(cellarItems, query, sortByName) {
        val q = query.trim().lowercase()
        cellarItems
            .filter { q.isBlank() || "${it.producer} ${it.name}".lowercase().contains(q) }
            .let { list ->
                if (sortByName) list.sortedBy { "${it.producer} ${it.name}".lowercase() }
                else list.sortedByDescending { it.createdAt }
            }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Color.White,
        shape = MerloticSheet.Shape,
        scrimColor = MerloticSheet.ScrimColor,
        dragHandle = { SheetDragHandle() },
    ) {
        Column(Modifier.fillMaxWidth().heightIn(min = screenH * 0.7f, max = screenH * 0.9f).navigationBarsPadding()) {
            Text("Выберите вино", fontSize = 19.sp, fontWeight = FontWeight.SemiBold, color = Ink, modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 6.dp, bottom = 12.dp))
            // Поиск + переключатель сортировки одной строкой (без горизонтального разделителя после заголовка)
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(
                    value = query, onValueChange = { query = it },
                    placeholder = { Text("Поиск") }, singleLine = true,
                    modifier = Modifier.weight(1f).height(FieldHeight),
                )
                Surface(
                    onClick = { sortByName = !sortByName },
                    shape = RoundedCornerShape(12.dp),
                    color = Fill,
                    modifier = Modifier.height(FieldHeight),
                ) {
                    Row(Modifier.padding(horizontal = 12.dp).fillMaxHeight(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Icon(Icons.AutoMirrored.Filled.Sort, null, Modifier.size(16.dp), tint = Ink2)
                        Text(if (sortByName) "По алфавиту" else "По дате", fontSize = 12.5.sp, color = Ink2, maxLines = 1)
                    }
                }
            }
            if (shown.isEmpty()) {
                Text("Ничего не найдено", color = Ink3, modifier = Modifier.padding(20.dp))
            } else {
                LazyColumn(Modifier.weight(1f)) {
                    items(shown, key = { it.id }) { item ->
                        ListItem(
                            headlineContent = { Text("${item.producer} ${item.name}".trim(), color = Ink) },
                            supportingContent = {
                                val info = listOfNotNull(item.vintageYear?.toString(), item.country).joinToString(" · ")
                                if (info.isNotBlank()) Text(info, color = Ink2)
                            },
                            colors = ListItemDefaults.colors(containerColor = Color.White),
                            modifier = Modifier.clickable(
                                interactionSource = remember { MutableInteractionSource() }, indication = null,
                            ) { onSelect(item.id) },
                        )
                    }
                }
            }
        }
    }
}

// ─── Ручной ввод вина (модалка в стиле экрана добавления, меньше обяз. полей) ───

private val MANUAL_WINE_TYPES = listOf(
    "" to "Не указан", "RED" to "Красное", "WHITE" to "Белое", "ROSE" to "Розовое",
    "SPARKLING" to "Игристое", "SWEET" to "Десертное", "FORTIFIED" to "Креплёное",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ManualWineSheet(
    initial: ManualWineRequest?,
    onSave: (ManualWineRequest) -> Unit,
    onDismiss: () -> Unit,
) {
    var producer by remember { mutableStateOf(initial?.producer ?: "") }
    var name by remember { mutableStateOf(initial?.name ?: "") }
    var vintage by remember { mutableStateOf(initial?.vintageYear?.toString() ?: "") }
    var country by remember { mutableStateOf(initial?.country ?: "") }
    var region by remember { mutableStateOf(initial?.region ?: "") }
    var wineType by remember { mutableStateOf(initial?.wineType ?: "") }
    val screenH = androidx.compose.ui.platform.LocalConfiguration.current.screenHeightDp.dp
    val scroll = rememberScrollState()

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Color.White,
        shape = MerloticSheet.Shape,
        scrimColor = MerloticSheet.ScrimColor,
        dragHandle = { SheetDragHandle() },
    ) {
        Column(Modifier.fillMaxWidth().heightIn(max = screenH * 0.9f)) {
            Text("Вино вручную", fontSize = 19.sp, fontWeight = FontWeight.SemiBold, color = Ink, modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 6.dp, bottom = 8.dp))
            Column(
                Modifier.weight(1f, fill = false).verticalScroll(scroll).padding(horizontal = 20.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedTextField(producer, { producer = it }, label = { Text("Производитель") }, singleLine = true, modifier = Modifier.fillMaxWidth().height(FieldHeight))
                OutlinedTextField(name, { name = it }, label = { Text("Название") }, singleLine = true, modifier = Modifier.fillMaxWidth().height(FieldHeight))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(vintage, { v -> vintage = v.filter { it.isDigit() }.take(4) }, label = { Text("Год") }, singleLine = true, modifier = Modifier.weight(1f).height(FieldHeight))
                    OutlinedTextField(country, { country = it }, label = { Text("Страна") }, singleLine = true, modifier = Modifier.weight(1f).height(FieldHeight))
                }
                OutlinedTextField(region, { region = it }, label = { Text("Регион") }, singleLine = true, modifier = Modifier.fillMaxWidth().height(FieldHeight))
                Text("Тип вина", fontSize = 13.sp, color = Ink3)
                androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    MANUAL_WINE_TYPES.forEach { (value, label) ->
                        FilterChip(selected = wineType == value, onClick = { wineType = value }, label = { Text(label, fontSize = 13.sp) })
                    }
                }
            }
            HorizontalDivider(color = Line)
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp).navigationBarsPadding(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f).height(FieldHeight), shape = RoundedCornerShape(12.dp)) { Text("Отмена") }
                Button(
                    onClick = {
                        onSave(
                            ManualWineRequest(
                                producer = producer.trim().takeIf { it.isNotBlank() },
                                name = name.trim().takeIf { it.isNotBlank() },
                                vintageYear = vintage.toIntOrNull(),
                                country = country.trim().takeIf { it.isNotBlank() },
                                region = region.trim().takeIf { it.isNotBlank() },
                                wineType = wineType.takeIf { it.isNotBlank() },
                            )
                        )
                    },
                    modifier = Modifier.weight(2f).height(FieldHeight), shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Teal),
                ) { Text("Готово", color = Color.White) }
            }
        }
    }
}
