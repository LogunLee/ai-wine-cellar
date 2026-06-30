package com.enolo.app.ui.notes

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.WineBar
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.enolo.app.data.dto.TastingNoteDto
import com.enolo.app.ui.components.FilterChipGroup
import com.enolo.app.ui.components.MerloticSearchBar
import com.enolo.app.ui.components.MerloticSheet
import com.enolo.app.ui.components.MerloticTopBar
import com.enolo.app.ui.components.SheetDragHandle
import com.enolo.app.ui.theme.TokenFill as Fill
import com.enolo.app.ui.theme.TokenInk as Ink
import com.enolo.app.ui.theme.TokenInk2 as Ink2
import com.enolo.app.ui.theme.TokenInk3 as Ink3
import com.enolo.app.ui.theme.TokenLine as Line
import com.enolo.app.ui.theme.TokenTeal as Teal
import com.enolo.app.ui.theme.TokenTealWash as TealWash

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotesScreen(
    onOpenWine: () -> Unit = {},
    viewModel: NotesViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val filters by viewModel.filters.collectAsState()
    val refreshing by viewModel.refreshing.collectAsState()
    val syncing by viewModel.syncing.collectAsState()
    val cellarItems by viewModel.cellarItems.collectAsState()
    val actionError by viewModel.actionError.collectAsState()
    val context = LocalContext.current

    var searchText by remember { mutableStateOf(filters.search) }
    var showForm by remember { mutableStateOf(false) }
    var editNote by remember { mutableStateOf<TastingNoteDto?>(null) }
    var detailNote by remember { mutableStateOf<TastingNoteDto?>(null) }
    var vivinoNote by remember { mutableStateOf<TastingNoteDto?>(null) }
    var deleteNote by remember { mutableStateOf<TastingNoteDto?>(null) }
    var showFilters by remember { mutableStateOf(false) }
    var showSort by remember { mutableStateOf(false) }

    actionError?.let {
        LaunchedEffect(it) {
            android.widget.Toast.makeText(context, it, android.widget.Toast.LENGTH_LONG).show()
            viewModel.clearActionError()
        }
    }

    // Подгрузка погреба для выбора вина — нужна только в форме создания.
    LaunchedEffect(showForm) { if (showForm && editNote == null) viewModel.loadCellarItems() }

    val listState = rememberLazyListState()
    val nearEnd by remember {
        derivedStateOf {
            val last = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            last >= uiState.items.size - 3
        }
    }
    LaunchedEffect(nearEnd, uiState.items.size) {
        if (nearEnd && uiState.canLoadMore && !uiState.isLoadingMore) viewModel.loadMore()
    }

    Box(Modifier.fillMaxSize().background(Color.White)) {
        Column(Modifier.fillMaxSize()) {
            Column {
                MerloticTopBar(title = "Заметки") {
                    if (uiState.total > 0) {
                        Column(horizontalAlignment = Alignment.End) {
                            Text("Заметок:", fontSize = 12.5.sp, lineHeight = 15.sp, color = Ink3)
                            Text("${uiState.total}", fontSize = 12.5.sp, lineHeight = 15.sp, color = Ink2)
                        }
                    }
                    Spacer(Modifier.width(8.dp))
                    com.enolo.app.ui.components.SyncIconButton(syncing = syncing, onClick = { viewModel.sync() })
                }
                MerloticSearchBar(
                    value = searchText,
                    onValueChange = { v -> searchText = v; viewModel.onSearchChange(v) },
                    onClear = { searchText = ""; viewModel.onSearchChange("") },
                    placeholder = "Поиск по названию вина",
                    modifier = Modifier.padding(top = 3.5.dp, bottom = 10.dp),
                )
                // Фильтры + быстрые чипы (цвет + последние 3 года по дате создания)
                val years = remember {
                    val y = java.util.Calendar.getInstance().get(java.util.Calendar.YEAR)
                    listOf(y, y - 1, y - 2)
                }
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())
                        .padding(start = 16.dp, end = 16.dp, bottom = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    // Сортировка (как в погребе): иконка слева, активна если не «новые».
                    val sortActive = filters.sort != "tasting_date_desc"
                    Box(
                        modifier = Modifier.size(36.dp).clip(RoundedCornerShape(10.dp))
                            .background(if (sortActive) TealWash else Fill)
                            .clickable { showSort = true },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.AutoMirrored.Filled.Sort, "Сортировка", tint = if (sortActive) Teal else Ink2, modifier = Modifier.size(18.dp))
                    }
                    val count = filters.activeCount()
                    Surface(
                        onClick = { showFilters = true },
                        shape = RoundedCornerShape(18.dp),
                        color = if (count > 0) Teal else Fill,
                        modifier = Modifier.height(36.dp),
                    ) {
                        Row(Modifier.padding(horizontal = 12.dp).fillMaxHeight(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Icon(Icons.Default.Tune, null, Modifier.size(14.dp), tint = if (count > 0) Color.White else Ink2)
                            Text(if (count > 0) "Фильтры ($count)" else "Фильтры", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = if (count > 0) Color.White else Ink2)
                        }
                    }
                    NotesQuickChip("Красное", filters.wineType == "RED") { viewModel.toggleColor("RED") }
                    NotesQuickChip("Белое", filters.wineType == "WHITE") { viewModel.toggleColor("WHITE") }
                    NotesQuickChip("Розе", filters.wineType == "ROSE") { viewModel.toggleColor("ROSE") }
                    years.forEach { y ->
                        NotesQuickChip(y.toString(), filters.createdYear == y) { viewModel.toggleYear(y) }
                    }
                }
            }

            PullToRefreshBox(
                isRefreshing = refreshing,
                onRefresh = { viewModel.refresh() },
                modifier = Modifier.weight(1f),
            ) {
                when {
                    uiState.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Teal, modifier = Modifier.size(36.dp))
                    }
                    uiState.error != null -> Column(
                        Modifier.fillMaxSize().padding(32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
                    ) {
                        Text(uiState.error!!, color = Ink2)
                        Spacer(Modifier.height(16.dp))
                        Button(onClick = { viewModel.load() }, colors = ButtonDefaults.buttonColors(containerColor = Teal), shape = RoundedCornerShape(12.dp)) {
                            Text("Повторить", color = Color.White)
                        }
                    }
                    uiState.items.isEmpty() -> NotesEmptyState(
                        hasFilters = filters.search.isNotBlank() || filters.activeCount() > 0,
                        onAdd = { editNote = null; showForm = true },
                    )
                    else -> LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(top = 8.dp, bottom = 88.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        items(uiState.items, key = { it.id }) { note ->
                            NoteCard(
                                note = note,
                                photoUrl = viewModel.photoUri(note.wine.photoPath),
                                onClick = { detailNote = note },
                                onEdit = { editNote = note; showForm = true },
                                onPrepareVivino = { vivinoNote = note },
                                onDelete = { deleteNote = note },
                            )
                        }
                        if (uiState.isLoadingMore) {
                            item { Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(Modifier.size(24.dp), color = Teal, strokeWidth = 2.dp) } }
                        }
                    }
                }
            }
        }

        FloatingActionButton(
            onClick = { editNote = null; showForm = true },
            modifier = Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = 16.dp),
            containerColor = Teal, contentColor = Color.White,
        ) { Icon(Icons.Default.Add, "Новая заметка") }
    }

    // ── Sheets / dialogs ──
    if (showForm) {
        NoteFormSheet(
            editNote = editNote,
            cellarItems = cellarItems,
            onCreate = { req -> viewModel.create(req) { showForm = false } },
            onUpdate = { req -> editNote?.let { e -> viewModel.update(e.id, req) { updated -> showForm = false; if (detailNote?.id == updated.id) detailNote = updated } } },
            onDismiss = { showForm = false },
        )
    }

    detailNote?.let { note ->
        NoteDetailSheet(
            note = note,
            photoUrl = viewModel.photoUri(note.wine.photoPath),
            onEdit = { editNote = note; detailNote = null; showForm = true },
            onPrepareVivino = { vivinoNote = note },
            onDelete = { deleteNote = note },
            onSaveVivino = { text -> viewModel.saveVivinoAppend(note.id, text) { updated -> detailNote = updated } },
            onDeleteVivino = { viewModel.deleteVivino(note.id) { updated -> detailNote = updated } },
            onDismiss = { detailNote = null },
        )
    }

    vivinoNote?.let { note ->
        VivinoNoteSheet(
            note = note,
            generate = { id -> viewModel.generateVivino(id) },
            onReplace = { text -> viewModel.saveVivinoReplace(note.id, text) { updated -> vivinoNote = null; if (detailNote?.id == updated.id) detailNote = updated } },
            onAppend = { text -> viewModel.saveVivinoAppend(note.id, text) { updated -> vivinoNote = null; if (detailNote?.id == updated.id) detailNote = updated } },
            onDismiss = { vivinoNote = null },
        )
    }

    deleteNote?.let { note ->
        AlertDialog(
            onDismissRequest = { deleteNote = null },
            title = { Text("Удалить заметку?") },
            text = { Text("Заметка по «${listOfNotNull(note.wine.producer, note.wine.name).joinToString(" ")}» будет удалена.") },
            confirmButton = {
                TextButton(onClick = { viewModel.delete(note.id) { deleteNote = null; detailNote = null } }) { Text("Удалить", color = com.enolo.app.ui.theme.TokenRed) }
            },
            dismissButton = { TextButton(onClick = { deleteNote = null }) { Text("Отмена") } },
        )
    }

    if (showFilters) {
        NotesFiltersSheet(
            current = filters,
            onApply = { rMin, wt, co, re -> viewModel.applyFilters(rMin, wt, co, re); showFilters = false },
            onReset = { viewModel.clearFilters(); showFilters = false },
            onDismiss = { showFilters = false },
        )
    }

    if (showSort) {
        NotesSortBottomSheet(
            current = filters.sort,
            onSelect = { viewModel.setSort(it); showSort = false },
            onDismiss = { showSort = false },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NotesSortBottomSheet(
    current: String,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val options = listOf(
        "tasting_date_desc" to "Сначала новые",
        "tasting_date_asc" to "Сначала старые",
        "rating_desc" to "Сначала с высоким рейтингом",
        "rating_asc" to "Сначала с низким рейтингом",
    )
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Color.White,
        scrimColor = MerloticSheet.ScrimColor,
        shape = MerloticSheet.Shape,
        dragHandle = { SheetDragHandle() },
    ) {
        Column(Modifier.fillMaxWidth().padding(bottom = 24.dp).navigationBarsPadding()) {
            Text(
                "Сортировка", fontSize = 19.sp, fontWeight = FontWeight.SemiBold, color = Ink,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 16.dp),
            )
            options.forEach { (key, label) ->
                val selected = key == current
                Row(
                    Modifier.fillMaxWidth().clickable { onSelect(key) }.padding(horizontal = 20.dp, vertical = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(label, fontSize = 15.sp, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal, color = if (selected) Teal else Ink)
                    if (selected) Icon(Icons.Default.Check, null, tint = Teal, modifier = Modifier.size(18.dp))
                }
            }
        }
    }
}

@Composable
private fun NoteCard(
    note: TastingNoteDto,
    photoUrl: String?,
    onClick: () -> Unit,
    onEdit: () -> Unit,
    onPrepareVivino: () -> Unit,
    onDelete: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).clickable(onClick = onClick),
        shape = RoundedCornerShape(18.dp), color = Color.White, border = BorderStroke(1.dp, Line), shadowElevation = 1.dp,
    ) {
        Row(Modifier.height(IntrinsicSize.Min).heightIn(min = 150.dp)) {
            // ── Фото (слева, высокое, вписано по высоте с обрезкой по ширине) ──
            Box(Modifier.width(84.dp).fillMaxHeight().background(Color.White), contentAlignment = Alignment.Center) {
                if (!photoUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = photoUrl, contentDescription = null,
                        // Фото целиком по ВЫСОТЕ карточки; по ширине — по центру.
                        contentScale = ContentScale.FillHeight, alignment = Alignment.Center,
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    Box(Modifier.fillMaxSize().background(Fill), contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.WineBar, null, tint = Ink3, modifier = Modifier.size(34.dp))
                    }
                }
            }

            // ── Контент (справа) ──
            Column(Modifier.weight(1f).padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                // Страна + флаг + меню-троеточие
                Row(verticalAlignment = Alignment.CenterVertically) {
                    noteIso2ToFlag(note.wine.countryIso2)?.let { flag ->
                        Text(flag, fontSize = 15.sp); Spacer(Modifier.width(6.dp))
                    }
                    Text(
                        note.wine.country ?: "", fontSize = 12.5.sp, color = Ink3,
                        maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
                    )
                    NoteCardMenu(onEdit = onEdit, onPrepareVivino = onPrepareVivino, onDelete = onDelete)
                }

                // Название — строго одна строка
                val title = listOfNotNull(note.wine.producer, note.wine.name).joinToString(" ").ifBlank { "Вино" }
                val vy = note.vintage ?: note.wine.vintageYear
                Text(
                    title + (vy?.let { " • $it" } ?: ""),
                    fontSize = 16.5.sp, fontWeight = FontWeight.SemiBold, color = Ink,
                    lineHeight = 20.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )

                // Оценка чёткой цифрой + дата
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Default.Star, null, Modifier.size(16.dp), tint = com.enolo.app.ui.theme.TokenYellow)
                    Text("%.1f".format(note.rating), fontSize = 15.sp, fontWeight = FontWeight.Bold, color = Ink)
                    Text("· ${note.tastingDate}", fontSize = 12.sp, color = Ink3)
                }

                // Текст заметки — на всё оставшееся пространство
                note.noteExcerpt?.takeIf { it.isNotBlank() }?.let {
                    Text(it, fontSize = 13.sp, color = Ink2, lineHeight = 18.sp, maxLines = 5, overflow = TextOverflow.Ellipsis)
                }
                if (note.hasVivinoNote) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Icon(Icons.Default.AutoAwesome, null, Modifier.size(13.dp), tint = Teal)
                        Text("Есть версия для Vivino", fontSize = 11.5.sp, color = Teal)
                    }
                }
            }
        }
    }
}

@Composable
private fun NoteCardMenu(onEdit: () -> Unit, onPrepareVivino: () -> Unit, onDelete: () -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        Icon(
            Icons.Default.MoreVert, contentDescription = "Действия", tint = Ink3,
            modifier = Modifier.size(18.dp).clickable { expanded = true },
        )
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(text = { Text("Изменить") }, onClick = { expanded = false; onEdit() },
                leadingIcon = { Icon(Icons.Default.Edit, null, Modifier.size(18.dp)) })
            DropdownMenuItem(text = { Text("Подготовить для Vivino") }, onClick = { expanded = false; onPrepareVivino() },
                leadingIcon = { Icon(Icons.Default.AutoAwesome, null, Modifier.size(18.dp)) })
            DropdownMenuItem(text = { Text("Удалить", color = com.enolo.app.ui.theme.TokenRed) }, onClick = { expanded = false; onDelete() },
                leadingIcon = { Icon(Icons.Default.Delete, null, Modifier.size(18.dp), tint = com.enolo.app.ui.theme.TokenRed) })
        }
    }
}

/** ISO2 → эмодзи-флаг. */
private fun noteIso2ToFlag(iso2: String?): String? {
    val cc = iso2?.uppercase() ?: return null
    if (cc.length != 2 || !cc.all { it in 'A'..'Z' }) return null
    val a = 0x1F1E6 + (cc[0] - 'A'); val b = 0x1F1E6 + (cc[1] - 'A')
    return String(Character.toChars(a)) + String(Character.toChars(b))
}

@Composable
private fun NotesQuickChip(label: String, active: Boolean, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(18.dp),
        color = if (active) Teal else Fill,
        modifier = Modifier.height(36.dp),
    ) {
        Row(Modifier.padding(horizontal = 12.dp).fillMaxHeight(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                label,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                color = if (active) Color.White else Ink2,
            )
        }
    }
}

@Composable
private fun NotesEmptyState(hasFilters: Boolean, onAdd: () -> Unit) {
    Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Default.EditNote, null, Modifier.size(56.dp), tint = Line)
            Text(if (hasFilters) "Ничего не найдено" else "Заметок пока нет", fontSize = 17.sp, fontWeight = FontWeight.Medium, color = Ink2)
            Text(
                if (hasFilters) "Попробуйте изменить фильтры" else "Создайте первую дегустационную заметку",
                fontSize = 13.sp, color = Ink3,
            )
            if (!hasFilters) {
                Spacer(Modifier.height(8.dp))
                Button(onClick = onAdd, colors = ButtonDefaults.buttonColors(containerColor = Teal), shape = RoundedCornerShape(12.dp)) {
                    Text("＋ Новая заметка", color = Color.White)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NotesFiltersSheet(
    current: NotesFilters,
    onApply: (ratingMin: Double?, wineType: String, country: String, region: String) -> Unit,
    onReset: () -> Unit,
    onDismiss: () -> Unit,
) {
    var ratingMin by remember { mutableStateOf(current.ratingMin) }
    var wineType by remember { mutableStateOf(current.wineType) }
    var country by remember { mutableStateOf(current.country) }
    var region by remember { mutableStateOf(current.region) }
    val scroll = rememberScrollState()
    val screenH = androidx.compose.ui.platform.LocalConfiguration.current.screenHeightDp.dp

    val ratingOptions = listOf(3.0 to "3+", 3.5 to "3.5+", 4.0 to "4+", 4.5 to "4.5+")

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Color.White, shape = MerloticSheet.Shape, scrimColor = MerloticSheet.ScrimColor,
        dragHandle = { SheetDragHandle() },
    ) {
        Column(Modifier.fillMaxWidth().heightIn(max = screenH * 0.9f)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Фильтры", fontSize = 24.sp, fontWeight = FontWeight.SemiBold, color = Ink, modifier = Modifier.weight(1f))
                Box(Modifier.size(34.dp).clip(CircleShape).background(Fill).clickable(onClick = onDismiss), contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.Close, null, Modifier.size(18.dp), tint = Ink)
                }
            }
            HorizontalDivider(color = Line)
            Column(
                Modifier.weight(1f, fill = false).verticalScroll(scroll).padding(horizontal = 20.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                FilterChipGroup(
                    label = "Оценка от",
                    options = ratingOptions.map { it.first.toString() to it.second },
                    selected = ratingMin?.let { setOf(it.toString()) } ?: emptySet(),
                    onToggle = { v -> val d = v.toDouble(); ratingMin = if (ratingMin == d) null else d },
                )
                FilterChipGroup(
                    label = "Тип вина",
                    options = listOf("RED" to "Красное", "WHITE" to "Белое", "ROSE" to "Розе", "SPARKLING" to "Игристое", "SWEET" to "Десертное", "FORTIFIED" to "Креплёное"),
                    selected = if (wineType.isBlank()) emptySet() else setOf(wineType),
                    onToggle = { wineType = if (wineType == it) "" else it },
                )
                OutlinedTextField(value = country, onValueChange = { country = it }, label = { Text("Страна") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = region, onValueChange = { region = it }, label = { Text("Регион") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            }
            HorizontalDivider(color = Line)
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp).navigationBarsPadding(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = onReset, modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp)) { Text("Сбросить") }
                Button(
                    onClick = { onApply(ratingMin, wineType, country, region) },
                    modifier = Modifier.weight(2f), shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Teal),
                ) { Text("Применить", color = Color.White) }
            }
        }
    }
}
