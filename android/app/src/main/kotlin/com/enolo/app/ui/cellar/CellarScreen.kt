package com.enolo.app.ui.cellar

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.enolo.app.data.dto.CellarItemDto
import com.enolo.app.ui.components.FilterChipGroup
import com.enolo.app.ui.components.MerloticSearchBar
import com.enolo.app.ui.components.MerloticTopBar
import com.enolo.app.ui.components.MerloticSheet
import com.enolo.app.ui.components.SearchBarActionButton
import com.enolo.app.ui.components.SheetDragHandle
import com.enolo.app.ui.theme.TokenFill as Fill
import com.enolo.app.ui.theme.TokenGreenDot as GreenDot
import com.enolo.app.ui.theme.TokenInk as Ink
import com.enolo.app.ui.theme.TokenInk2 as Ink2
import com.enolo.app.ui.theme.TokenInk3 as Ink3
import com.enolo.app.ui.theme.TokenLine as Line
import com.enolo.app.ui.theme.TokenRed as Red
import com.enolo.app.ui.theme.TokenRedWash as RedBg
import com.enolo.app.ui.theme.TokenTeal as Teal
import com.enolo.app.ui.theme.TokenTealWash as TealWash
import com.enolo.app.ui.theme.TokenYellow as Gold
import com.enolo.app.util.Formatters
import java.io.File

// ─── Screen ──────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CellarScreen(
    onNavigateToSmartSearch: () -> Unit = {},
    onRequestScan: () -> Unit = {},
    onRequestGallery: () -> Unit = {},
    viewModel: CellarViewModel = hiltViewModel(),
) {
    val uiState            by viewModel.uiState.collectAsState()
    val filters            by viewModel.filters.collectAsState()
    val filteredItems      by viewModel.filteredItems.collectAsState()
    val noteState          by viewModel.noteState.collectAsState()
    val actionError        by viewModel.actionError.collectAsState()
    val availableCountries by viewModel.availableCountries.collectAsState()
    val availableGrapes    by viewModel.availableGrapes.collectAsState()
    val refreshing         by viewModel.refreshing.collectAsState()
    val syncing            by viewModel.syncing.collectAsState()
    val clipboardText      by viewModel.clipboardText.collectAsState()
    val context            = LocalContext.current
    val clipboard          = androidx.compose.ui.platform.LocalClipboardManager.current

    LaunchedEffect(clipboardText) {
        clipboardText?.let { text ->
            clipboard.setText(androidx.compose.ui.text.AnnotatedString(text))
            viewModel.clearClipboardText()
            android.widget.Toast.makeText(context, "Описание для поиска информации о вине скопировано в буфер обмена", android.widget.Toast.LENGTH_LONG).show()
        }
    }

    // ── Sheet / dialog state ──────────────────────────────────────────────
    // sheet values: null | "add" | "actions" | "filters"
    var activeSheet  by remember { mutableStateOf<String?>(null) }
    var actionItem   by remember { mutableStateOf<CellarItemDto?>(null) }

    // Dialogs triggered from sheets
    var showManualAdd  by remember { mutableStateOf(false) }
    var editItem       by remember { mutableStateOf<CellarItemDto?>(null) }
    var noteItem       by remember { mutableStateOf<CellarItemDto?>(null) }
    var deleteItem     by remember { mutableStateOf<CellarItemDto?>(null) }

    // Photo
    var photoItem        by remember { mutableStateOf<CellarItemDto?>(null) }
    var cameraUri        by remember { mutableStateOf<Uri?>(null) }
    var showPhotoOptions by remember { mutableStateOf(false) }

    // Vivino link
    var vivinoLinkItem        by remember { mutableStateOf<CellarItemDto?>(null) }
    var wineSearcherLinkItem  by remember { mutableStateOf<CellarItemDto?>(null) }

    // Search in header (постоянная строка)
    var searchText      by remember { mutableStateOf(filters.search) }
    var showSortSheet   by remember { mutableStateOf(false) }

    // Кнопки добавления: видны при скролле, прячутся через 2с бездействия.
    val listState   = rememberLazyListState()
    var addFabsVisible by remember { mutableStateOf(true) }
    val scrollSignal = remember { derivedStateOf { listState.firstVisibleItemIndex to listState.firstVisibleItemScrollOffset } }
    LaunchedEffect(scrollSignal.value, listState.isScrollInProgress) {
        addFabsVisible = true
        kotlinx.coroutines.delay(2000)
        addFabsVisible = false
    }

    // Photo launchers
    val galleryLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { photoItem?.let { item -> viewModel.uploadPhoto(item.id, uri) } }
        photoItem = null
    }
    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { success ->
        if (success) cameraUri?.let { uri -> photoItem?.let { item -> viewModel.uploadPhoto(item.id, uri) } }
        photoItem = null
    }
    val cameraPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            cameraUri = createCellarTempUri(context)
            cameraUri?.let { cameraLauncher.launch(it) }
        }
    }

    // Error snackbar
    actionError?.let { LaunchedEffect(it) { viewModel.clearActionError() } }

    // ── Dialogs ───────────────────────────────────────────────────────────

    editItem?.let { item ->
        EditWineDialog(
            item      = item,
            onConfirm = { req -> viewModel.updateWine(item.id, req) { editItem = null } },
            onDismiss = { editItem = null },
            error     = actionError,
        )
    }
    noteItem?.let { item ->
        NoteDialog(
            initialText = noteState?.text ?: "",
            onSave      = { text -> viewModel.saveNote(item.id, text) { noteItem = null } },
            onDismiss   = { noteItem = null },
        )
    }
    deleteItem?.let { item ->
        AlertDialog(
            onDismissRequest = { deleteItem = null },
            title = { Text("Удалить вино?") },
            text  = { Text("${item.producer} ${item.name} будет удалено из погреба.") },
            confirmButton = {
                TextButton(onClick = { viewModel.deleteWine(item.id) { deleteItem = null } }) {
                    Text("Удалить", color = Red)
                }
            },
            dismissButton = {
                TextButton(onClick = { deleteItem = null }) { Text("Отмена") }
            },
        )
    }

    // ── Bottom sheets ─────────────────────────────────────────────────────

    if (activeSheet == "add") {
        CellarAddSheet(
            onScan    = { activeSheet = null; onRequestScan() },
            onGallery = { activeSheet = null; onRequestGallery() },
            onManual  = { activeSheet = null; showManualAdd = true },
            onDismiss = { activeSheet = null },
        )
    }
    if (activeSheet == "actions" && actionItem != null) {
        CellarActionSheet(
            item           = actionItem!!,
            photoUrl       = viewModel.photoUri(actionItem!!.photoPath),
            onEdit         = { activeSheet = null; editItem = actionItem },
            onNote         = { activeSheet = null; viewModel.loadNote(actionItem!!.id); noteItem = actionItem },
            onConsume      = { viewModel.consumeOne(actionItem!!) { activeSheet = null } },
            onDelete       = { activeSheet = null; deleteItem = actionItem },
            onPhoto        = { photoItem = actionItem; activeSheet = null; showPhotoOptions = true },
            onVivino       = { url ->
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                context.startActivity(intent)
                activeSheet = null
            },
            onWineSearcher = { url ->
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                context.startActivity(intent)
            },
            onLinkVivino        = { vivinoLinkItem = actionItem; activeSheet = null },
            onLinkWineSearcher  = { wineSearcherLinkItem = actionItem; activeSheet = null },
            onExternalResearch  = { viewModel.externalResearch(actionItem!!) },
            onDismiss           = { activeSheet = null },
        )
    }
    vivinoLinkItem?.let { item ->
        val initialQuery = "${item.producer} ${item.name}".trim()
        VivinoSearchSheet(
            initialQuery = initialQuery,
            onSelect     = { url ->
                viewModel.saveVivinoUrl(item.id, url)
                vivinoLinkItem = null
            },
            onDismiss    = { vivinoLinkItem = null },
        )
    }
    wineSearcherLinkItem?.let { item ->
        val initialQuery = "${item.producer} ${item.name}".trim()
        WineSearcherSearchSheet(
            initialQuery = initialQuery,
            onSelect     = { url ->
                viewModel.saveWineSearcherUrl(item.id, url)
                wineSearcherLinkItem = null
            },
            onDismiss    = { wineSearcherLinkItem = null },
        )
    }

    if (showPhotoOptions) {
        AlertDialog(
            onDismissRequest = { showPhotoOptions = false },
            title = { Text(if (photoItem?.photoPath != null) "Сменить фото" else "Прикрепить фото") },
            text  = { Text("Выберите источник") },
            confirmButton = {
                Button(
                    onClick = {
                        showPhotoOptions = false
                        cameraUri = createCellarTempUri(context)
                        cameraUri?.let { cameraLauncher.launch(it) }
                            ?: run {
                                if (ContextCompat.checkSelfPermission(context, android.Manifest.permission.CAMERA)
                                    != PackageManager.PERMISSION_GRANTED
                                ) {
                                    cameraPermissionLauncher.launch(android.Manifest.permission.CAMERA)
                                } else {
                                    cameraUri = createCellarTempUri(context)
                                    cameraUri?.let { cameraLauncher.launch(it) }
                                }
                            }
                    },
                    shape  = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Teal)
                ) { Text("Камера", color = Color.White) }
            },
            dismissButton = {
                TextButton(onClick = {
                    showPhotoOptions = false
                    galleryLauncher.launch("image/*")
                }) { Text("Галерея") }
            },
        )
    }
    if (activeSheet == "filters") {
        CellarFiltersSheet(
            currentWineType     = filters.wineType,
            currentStatusPreset = filters.statusPreset,
            currentCountry      = filters.country,
            currentGrapes       = filters.grapes,
            availableCountries  = availableCountries,
            availableGrapes     = availableGrapes,
            onApply   = { wt, sp, co, gr -> viewModel.applyFiltersFromSheet(wt, sp, co, gr); activeSheet = null },
            onDismiss = { activeSheet = null },
        )
    }
    if (showSortSheet) {
        CellarSortBottomSheet(
            currentSort    = filters.sort,
            onSortSelected = { viewModel.setSort(it); showSortSheet = false },
            onDismiss      = { showSortSheet = false },
        )
    }
    // ── Main layout ───────────────────────────────────────────────────────

    Box(modifier = Modifier.fillMaxSize().background(Color.White)) {
        Column(modifier = Modifier.fillMaxSize().background(Color.White)) {
            // White block: top bar + search + quick filters
            Column {
                CellarTopBar(totalBottles = uiState.totalBottles, syncing = syncing, onSync = { viewModel.sync() })
                CellarSearchBar(
                    value         = searchText,
                    onValueChange = { v -> searchText = v; viewModel.onSearchChange(v) },
                    onClear       = { searchText = ""; viewModel.onSearchChange("") },
                    onAiClick     = onNavigateToSmartSearch,
                )
                CellarQuickFiltersRow(
                    activePresets  = remember(filters) { filters.activePresetKeys() },
                    filterCount    = remember(filters) { filters.activeFilterCount() },
                    currentSort    = filters.sort,
                    onSortClick    = { showSortSheet = true },
                    onFilterClick  = { activeSheet = "filters" },
                    onPresetToggle = { viewModel.togglePreset(it) },
                )
            }

            // Content
            androidx.compose.material3.pulltorefresh.PullToRefreshBox(
                isRefreshing = refreshing,
                onRefresh    = { viewModel.refresh() },
                modifier     = Modifier.weight(1f),
            ) {
                when {
                    uiState.isLoading -> {
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = Teal, modifier = Modifier.size(36.dp))
                        }
                    }
                    uiState.error != null -> {
                        Column(
                            Modifier.fillMaxSize().padding(32.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                        ) {
                            Text(uiState.error!!, color = Red)
                            Spacer(Modifier.height(16.dp))
                            Button(
                                onClick = { viewModel.load() },
                                colors  = ButtonDefaults.buttonColors(containerColor = Teal),
                                shape   = RoundedCornerShape(12.dp),
                            ) { Text("Повторить", color = Color.White) }
                        }
                    }
                    filteredItems.isEmpty() && !uiState.isLoading -> {
                        CellarEmptyState(
                            hasFilters = filters.search.isNotBlank() || filters.wineType.isNotBlank() || filters.statusPreset.isNotBlank() || filters.country.isNotBlank() || filters.grapes.isNotEmpty(),
                            onAddClick = { activeSheet = "add" },
                        )
                    }
                    else -> {
                        LazyColumn(
                            state = listState,
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(top = 8.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            items(filteredItems, key = { it.id }) { item ->
                                CellarWineCard(
                                    item     = item,
                                    photoUrl = viewModel.photoUri(item.photoPath),
                                    onClick  = { actionItem = item; activeSheet = "actions" },
                                    onMenu   = { actionItem = item; activeSheet = "actions" },
                                )
                            }
                            item { Spacer(Modifier.height(80.dp)) } // FAB clearance
                        }
                    }
                }
            }
        }

        // Три отдельные кнопки добавления (размером с обычный FAB), прячутся при бездействии.
        AnimatedVisibility(
            visible  = addFabsVisible,
            modifier = Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = 16.dp),
        ) {
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                FloatingActionButton(onClick = onRequestScan, containerColor = Teal, contentColor = Color.White) {
                    Icon(Icons.Default.CameraAlt, contentDescription = "Сканировать камерой")
                }
                FloatingActionButton(onClick = onRequestGallery, containerColor = Teal, contentColor = Color.White) {
                    Icon(Icons.Default.PhotoLibrary, contentDescription = "Из галереи")
                }
                FloatingActionButton(onClick = { showManualAdd = true }, containerColor = Teal, contentColor = Color.White) {
                    Icon(Icons.Default.Edit, contentDescription = "Ввести вручную")
                }
            }
        }

        // Полноэкранная форма добавления вина (поверх всего)
        if (showManualAdd) {
            AddWineScreen(
                onSave    = { req, photoUri -> viewModel.addWine(req, photoUri) { showManualAdd = false } },
                onDismiss = { showManualAdd = false },
                error     = actionError,
            )
        }
    }
}

// ─── Header ──────────────────────────────────────────────────────────────────

@Composable
private fun CellarTopBar(totalBottles: Int, syncing: Boolean, onSync: () -> Unit) {
    MerloticTopBar(title = "Погреб") {
        if (totalBottles > 0) {
            Column(horizontalAlignment = Alignment.End) {
                Text("Бутылки:", fontSize = 12.5.sp, lineHeight = 15.sp, color = Ink3)
                Text("$totalBottles шт", fontSize = 12.5.sp, lineHeight = 15.sp, color = Ink2)
            }
        }
        Spacer(Modifier.width(8.dp))
        com.enolo.app.ui.components.SyncIconButton(syncing = syncing, onClick = onSync)
    }
}

@Composable
private fun CellarSearchBar(
    value         : String,
    onValueChange : (String) -> Unit,
    onClear       : () -> Unit,
    onAiClick     : () -> Unit,
) {
    MerloticSearchBar(
        value         = value,
        onValueChange = onValueChange,
        onClear       = onClear,
        placeholder   = "Поиск в погребе",
        modifier      = Modifier.padding(top = 3.5.dp, bottom = 10.dp),
    ) {
        SearchBarActionButton(Icons.Default.AutoAwesome, "AI-поиск", onAiClick)
    }
}

// ─── Quick filters ───────────────────────────────────────────────────────────

@Composable
private fun CellarQuickFiltersRow(
    activePresets  : Set<String>,
    filterCount    : Int,
    currentSort    : String,
    onSortClick    : () -> Unit,
    onFilterClick  : () -> Unit,
    onPresetToggle : (String) -> Unit,
) {
    val hasActive = filterCount > 0
    val sortIsDefault = currentSort == "due_first"
    // Ничего не закреплено: сортировка, фильтры и пресеты — единая прокручиваемая лента.
    LazyRow(
        modifier              = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 12.dp),
        verticalAlignment     = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // Sort icon button
        item(key = "sort") {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(if (!sortIsDefault) TealWash else Fill)
                    .clickable(onClick = onSortClick),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector        = Icons.AutoMirrored.Filled.Sort,
                    contentDescription = "Сортировка",
                    tint               = if (!sortIsDefault) Teal else Ink2,
                    modifier           = Modifier.size(18.dp),
                )
            }
        }

        // "Фильтры" — активный сплошной зелёный
        item(key = "filters") {
            Surface(
                onClick  = onFilterClick,
                shape    = RoundedCornerShape(18.dp),
                color    = if (hasActive) Teal else Fill,
                modifier = Modifier.height(36.dp),
            ) {
                Row(
                    modifier              = Modifier.padding(horizontal = 12.dp),
                    verticalAlignment     = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Icon(
                        Icons.Default.Tune,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint     = if (hasActive) Color.White else Ink2,
                    )
                    Text(
                        text       = if (hasActive) "Фильтры ($filterCount)" else "Фильтры",
                        fontSize   = 13.sp,
                        fontWeight = FontWeight.Medium,
                        color      = if (hasActive) Color.White else Ink2,
                    )
                }
            }
        }

        items(CELLAR_QUICK_PRESETS, key = { it.first }) { (key, label) ->
            val active = key in activePresets
            val dot    = cellarPresetDotColor(key)
            Surface(
                onClick  = { onPresetToggle(key) },
                shape    = RoundedCornerShape(18.dp),
                color    = if (active) Color.White else Fill,
                border   = if (active) BorderStroke(1.5.dp, dot ?: Teal) else null,
                modifier = Modifier.height(36.dp),
            ) {
                Row(
                    modifier              = Modifier.padding(horizontal = 12.dp),
                    verticalAlignment     = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    if (dot != null) {
                        Box(Modifier.size(8.dp).clip(CircleShape).background(dot))
                    }
                    Text(
                        text       = label,
                        fontSize   = 13.sp,
                        fontWeight = FontWeight.Medium,
                        color      = Ink2,
                    )
                }
            }
        }
    }
}

/** Цвет точки у пресет-чипа типа вина. */
private fun cellarPresetDotColor(key: String): Color? = when (key) {
    "RED"       -> Color(0xFF8B1A2A)
    "WHITE"     -> Gold
    "SPARKLING" -> GreenDot
    "ROSE"      -> Color(0xFFC2185B)
    else        -> null
}

// ─── Sort bottom sheet ────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CellarSortBottomSheet(
    currentSort    : String,
    onSortSelected : (String) -> Unit,
    onDismiss      : () -> Unit,
) {
    val sortOptions = listOf(
        "due_first"  to "Сначала «пора открыть»",
        "date_added" to "Дата добавления",
        "name"       to "Название",
        "quantity"   to "Количество",
    )
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor   = Color.White,
        scrimColor       = MerloticSheet.ScrimColor,
        shape            = MerloticSheet.Shape,
        dragHandle       = { SheetDragHandle() },
    ) {
        Column(Modifier.fillMaxWidth().padding(bottom = 24.dp).navigationBarsPadding()) {
            Text(
                text       = "Сортировка",
                fontSize   = 19.sp,
                fontWeight = FontWeight.SemiBold,
                color      = Ink,
                modifier   = Modifier.padding(horizontal = 20.dp, vertical = 16.dp),
            )
            HorizontalDivider(color = Line)
            sortOptions.forEach { (key, label) ->
                val selected = key == currentSort
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSortSelected(key) }
                        .padding(horizontal = 20.dp, vertical = 16.dp),
                    verticalAlignment     = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text       = label,
                        fontSize   = 15.sp,
                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                        color      = if (selected) Teal else Ink,
                    )
                    if (selected) {
                        Icon(Icons.Default.Check, contentDescription = null, tint = Teal, modifier = Modifier.size(18.dp))
                    }
                }
                HorizontalDivider(color = Line, modifier = Modifier.padding(horizontal = 20.dp))
            }
        }
    }
}

// ─── Bottle row ──────────────────────────────────────────────────────────────

@Composable
internal fun CellarWineCard(
    item     : CellarItemDto,
    photoUrl : String?,
    onClick  : () -> Unit,
    onMenu   : () -> Unit,
    showMenu : Boolean = true,
) {
    val uriHandler = LocalUriHandler.current
    Surface(
        modifier        = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .clickable(onClick = onClick),
        shape           = RoundedCornerShape(18.dp),
        color           = Color.White,
        border          = BorderStroke(1.dp, Line),
        shadowElevation = 1.dp,
    ) {
        Row(Modifier.height(IntrinsicSize.Min)) {
            // ── Photo panel (left) — бутылка целиком, впритык по высоте карточки ──
            Box(
                modifier = Modifier.width(84.dp).fillMaxHeight().background(Color.White),
                contentAlignment = Alignment.Center,
            ) {
                if (!photoUrl.isNullOrBlank()) {
                    AsyncImage(
                        model              = photoUrl,
                        contentDescription = null,
                        // Бутылка целиком по ВЫСОТЕ карточки (ничего не режем по вертикали),
                        // по ширине — по центру (узкие фото с полями, широкие подрежутся по бокам).
                        contentScale       = ContentScale.FillHeight,
                        alignment          = Alignment.Center,
                        modifier           = Modifier.fillMaxSize(),
                    )
                } else {
                    Box(Modifier.fillMaxSize().background(Fill), contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.WineBar, contentDescription = null, tint = Ink3, modifier = Modifier.size(34.dp))
                    }
                }
            }

            // ── Content (right) ──────────────────────────────────────────────
            Column(
                modifier            = Modifier.weight(1f).padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                // Country flag + name + kebab
                Row(verticalAlignment = Alignment.CenterVertically) {
                    iso2ToFlagEmoji(item.countryIso2)?.let { flag ->
                        Text(flag, fontSize = 15.sp)
                        Spacer(Modifier.width(6.dp))
                    }
                    Text(
                        text     = item.country ?: "",
                        fontSize = 12.5.sp,
                        color    = Ink3,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    if (showMenu) {
                        Icon(
                            Icons.Default.MoreVert, contentDescription = "Действия", tint = Ink3,
                            modifier = Modifier.size(18.dp).clickable(onClick = onMenu),
                        )
                    }
                }

                Text(
                    // Год урожая — в конце наименования через булит (NV не дописываем)
                    text       = item.vintageYear?.let { "${item.name} • $it" } ?: item.name,
                    fontSize   = 16.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    color      = Ink,
                    lineHeight = 20.sp,
                    maxLines   = 1,
                    overflow   = TextOverflow.Ellipsis,
                )
                if (item.producer.isNotBlank()) {
                    Text(item.producer, fontSize = 13.5.sp, color = Ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }

                // На месте бывшего года — география: регион · апелласьон
                val meta = listOfNotNull(
                    item.region?.takeIf { it.isNotBlank() },
                    item.appellation?.takeIf { it.isNotBlank() },
                ).joinToString(" · ")
                if (meta.isNotBlank()) {
                    Text(meta, fontSize = 12.5.sp, color = Ink3, lineHeight = 16.sp)
                }

                item.grapes?.takeIf { it.isNotEmpty() }?.let { grapes ->
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Top) {
                        GrapeIcon(tint = Ink3, modifier = Modifier.size(14.dp).padding(top = 2.dp))
                        Text(grapes.joinToString(", "), fontSize = 12.5.sp, color = Ink3, lineHeight = 16.sp)
                    }
                }

                Spacer(Modifier.height(2.dp))

                // Stat blocks: Тип / Оценка / Погреб
                Row(
                    modifier              = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment     = Alignment.CenterVertically,
                ) {
                    StatBlock(
                        circleColor = Color(0xFFFBECEF),
                        icon        = { Icon(Icons.Default.WineBar, null, tint = Red, modifier = Modifier.size(16.dp)) },
                        label       = "Тип",
                        value       = Formatters.wineTypeRu(item.wineType).ifBlank { "—" },
                    )
                    if (item.vivinoUrl != null || item.vivinoRating != null) {
                        StatBlock(
                            circleColor = TealWash,
                            icon        = { Icon(Icons.Default.StarBorder, null, tint = Teal, modifier = Modifier.size(16.dp)) },
                            label       = "Vivino",
                            value       = item.vivinoRating?.let { String.format(java.util.Locale.US, "%.1f", it) } ?: "—",
                            modifier    = item.vivinoUrl?.let { url ->
                                Modifier.clickable { runCatching { uriHandler.openUri(url) } }
                            } ?: Modifier,
                        )
                    }
                    StatBlock(
                        circleColor = TealWash,
                        icon        = { Icon(Icons.Default.Liquor, null, tint = Teal, modifier = Modifier.size(16.dp)) },
                        label       = "Погреб",
                        value       = "× ${item.quantity}",
                    )
                }
            }
        }
    }
}

@Composable
private fun StatBlock(
    circleColor : Color,
    icon        : @Composable () -> Unit,
    label       : String,
    value       : String,
    modifier    : Modifier = Modifier,
) {
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        Box(Modifier.size(34.dp).clip(CircleShape).background(circleColor), contentAlignment = Alignment.Center) { icon() }
        Column {
            Text(label, fontSize = 10.5.sp, color = Ink3, maxLines = 1)
            Text(value, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Ink, maxLines = 1)
        }
    }
}

/** Маленькая иконка-гроздь винограда (кружки «горкой» + сужение книзу). */
@Composable
private fun GrapeIcon(tint: Color, modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val w = size.width; val h = size.height; val r = w * 0.16f
        val pts = listOf(
            0.5f to 0.30f,
            0.33f to 0.45f, 0.67f to 0.45f,
            0.5f to 0.52f,
            0.41f to 0.66f, 0.59f to 0.66f,
            0.5f to 0.82f,
        )
        pts.forEach { (x, y) -> drawCircle(tint, r, Offset(x * w, y * h)) }
    }
}

/** ISO2 → эмодзи-флаг (региональные индикаторы). */
private fun iso2ToFlagEmoji(iso2: String?): String? {
    val cc = iso2?.uppercase() ?: return null
    if (cc.length != 2 || !cc.all { it in 'A'..'Z' }) return null
    val a = 0x1F1E6 + (cc[0] - 'A')
    val b = 0x1F1E6 + (cc[1] - 'A')
    return String(Character.toChars(a)) + String(Character.toChars(b))
}

// ─── Empty state ─────────────────────────────────────────────────────────────

@Composable
private fun CellarEmptyState(hasFilters: Boolean, onAddClick: () -> Unit) {
    Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(Icons.Default.WineBar, contentDescription = null, modifier = Modifier.size(56.dp), tint = Line)
            Text(
                text     = if (hasFilters) "Ничего не найдено" else "Погреб пуст",
                fontSize = 17.sp,
                fontWeight = FontWeight.Medium,
                color    = Ink2,
            )
            Text(
                text     = if (hasFilters) "Попробуйте изменить фильтры" else "Нажмите «Добавить», чтобы начать",
                fontSize = 13.sp,
                color    = Ink3,
            )
            if (!hasFilters) {
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = onAddClick,
                    colors  = ButtonDefaults.buttonColors(containerColor = Teal),
                    shape   = RoundedCornerShape(12.dp),
                ) { Text("＋ Добавить вино", color = Color.White) }
            }
        }
    }
}

// ─── Add sheet ───────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CellarAddSheet(
    onScan    : () -> Unit,
    onGallery : () -> Unit,
    onManual  : () -> Unit,
    onDismiss : () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor   = Color.White,
        shape            = MerloticSheet.Shape,
        scrimColor       = MerloticSheet.ScrimColor,
        dragHandle       = { SheetDragHandle() },
    ) {
        Column(Modifier.fillMaxWidth()) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Добавить в погреб", fontSize = 19.sp, fontWeight = FontWeight.SemiBold, color = Ink, modifier = Modifier.weight(1f))
                Box(
                    Modifier.size(34.dp).clip(CircleShape).background(Fill).clickable(onClick = onDismiss),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(18.dp), tint = Ink) }
            }
            HorizontalDivider(color = Line)

            AddSheetAction(
                icon     = Icons.Default.CameraAlt,
                title    = "Сканировать этикетку",
                subtitle = "Камера распознаёт вино автоматически",
                onClick  = onScan,
            )
            AddSheetAction(
                icon     = Icons.Default.PhotoLibrary,
                title    = "Выбрать фото из галереи",
                subtitle = "Распознать вино по фото этикетки",
                onClick  = onGallery,
            )
            AddSheetAction(
                icon     = Icons.Default.Edit,
                title    = "Ввести вручную",
                subtitle = "Название, регион, год, количество",
                onClick  = onManual,
            )
            Spacer(Modifier.navigationBarsPadding().height(8.dp))
        }
    }
}

@Composable
private fun AddSheetAction(
    icon     : androidx.compose.ui.graphics.vector.ImageVector,
    title    : String,
    subtitle : String,
    onClick  : () -> Unit,
) {
    Row(
        modifier          = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 20.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            modifier         = Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(TealWash),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, contentDescription = null, tint = Teal, modifier = Modifier.size(22.dp)) }
        Column {
            Text(title, fontSize = 15.sp, fontWeight = FontWeight.Medium, color = Ink)
            Text(subtitle, fontSize = 12.5.sp, color = Ink3)
        }
    }
}

// ─── Action sheet ─────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CellarActionSheet(
    item                : CellarItemDto,
    photoUrl            : String?,
    onEdit              : () -> Unit,
    onNote              : () -> Unit,
    onConsume           : () -> Unit,
    onDelete            : () -> Unit,
    onPhoto             : () -> Unit,
    onVivino            : (String) -> Unit,
    onWineSearcher      : (String) -> Unit,
    onLinkVivino        : () -> Unit,
    onLinkWineSearcher  : () -> Unit,
    onExternalResearch  : () -> Unit,
    onDismiss           : () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor   = Color.White,
        shape            = MerloticSheet.Shape,
        scrimColor       = MerloticSheet.ScrimColor,
        dragHandle       = { SheetDragHandle() },
    ) {
        Column(Modifier.fillMaxWidth()) {
            // Sheet header
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // Mini thumbnail
                Box(Modifier.size(width = 38.dp, height = 48.dp)) {
                    if (!photoUrl.isNullOrBlank()) {
                        AsyncImage(model = photoUrl, contentDescription = null, modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(8.dp)).background(Color.White), contentScale = ContentScale.Fit)
                    } else {
                        Box(Modifier.fillMaxSize().clip(RoundedCornerShape(8.dp)).background(Fill))
                    }
                }
                Column(Modifier.weight(1f)) {
                    Text("${item.producer} ${item.name}".trim(), fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    val sub = listOfNotNull(
                        Formatters.wineTypeRu(item.wineType).takeIf { it.isNotBlank() },
                        item.country,
                    ).joinToString(" · ") + " · ×${item.quantity}"
                    Text(sub, fontSize = 12.sp, color = Ink3, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Box(
                    Modifier.size(34.dp).clip(CircleShape).background(Fill).clickable(onClick = onDismiss),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(18.dp), tint = Ink) }
            }
            HorizontalDivider(color = Line)

            // Actions
            ActionRow(Icons.Default.AutoAwesome,  TealWash, Teal,  "Открыть карточку",    "AI-исследование и детали вина",     onClick = { /* stub */ })
            if (!item.vivinoUrl.isNullOrBlank()) {
                HorizontalDivider(color = Line, modifier = Modifier.padding(start = 72.dp))
                ActionRow(Icons.Default.OpenInBrowser, TealWash, Teal, "Открыть в Vivino", "Рейтинг, отзывы, цены на vivino.com", onClick = { onVivino(item.vivinoUrl!!) })
            }
            if (!item.wineSearcherUrl.isNullOrBlank()) {
                HorizontalDivider(color = Line, modifier = Modifier.padding(start = 72.dp))
                ActionRow(Icons.Default.TravelExplore, TealWash, Teal, "Открыть в Wine-Searcher", "Цены и оценки критиков", onClick = { onWineSearcher(item.wineSearcherUrl!!); onDismiss() })
            }
            HorizontalDivider(color = Line, modifier = Modifier.padding(start = 72.dp))
            ActionRow(Icons.Default.Link, Fill, Ink2, "Привязать к Vivino", "Найти и выбрать вино на Vivino", onClick = { onLinkVivino(); onDismiss() })
            HorizontalDivider(color = Line, modifier = Modifier.padding(start = 72.dp))
            ActionRow(Icons.Default.TravelExplore, Fill, Ink2, "Привязать к Wine-Searcher", "Найти вино и обновить оценки критиков", onClick = { onLinkWineSearcher(); onDismiss() })
            ActionRow(Icons.Default.ContentCopy, Fill, Ink2, "Внешнее исследование", "Скопировать готовый запрос для любой LLM", onClick = { onExternalResearch(); onDismiss() })
            ActionRow(Icons.Default.RateReview,   TealWash, Teal,  "Написать отзыв",      "Оценка и заметка",                   onClick = { onNote();    onDismiss() })
            ActionRow(Icons.Default.Edit,         TealWash, Teal,  "Редактировать",       "Количество, год, окно употребления",  onClick = { onEdit();    onDismiss() })
            ActionRow(
                icon     = Icons.Default.PhotoCamera,
                iconBg   = Fill,
                iconTint = Ink2,
                title    = if (!photoUrl.isNullOrBlank()) "Сменить фото" else "Прикрепить фото",
                subtitle = "Камера или галерея",
                onClick  = { onPhoto() },
            )
            ActionRow(
                icon     = Icons.Default.Remove,
                iconBg   = Fill,
                iconTint = Ink2,
                title    = "Списать бутылку",
                subtitle = if (item.quantity > 1) "Останется ${item.quantity - 1} бут." else "Удалит запись",
                onClick  = { onConsume() },
            )
            HorizontalDivider(color = Line)
            ActionRow(Icons.Default.Delete, RedBg, Red, "Удалить из погреба", "Удалить вино из коллекции", onClick = { onDelete() })

            Spacer(Modifier.navigationBarsPadding().height(8.dp))
        }
    }
}

@Composable
private fun ActionRow(
    icon     : androidx.compose.ui.graphics.vector.ImageVector,
    iconBg   : Color,
    iconTint : Color,
    title    : String,
    subtitle : String,
    onClick  : () -> Unit,
) {
    Row(
        modifier          = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 20.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            modifier         = Modifier.size(40.dp).clip(RoundedCornerShape(11.dp)).background(iconBg),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, contentDescription = null, tint = iconTint, modifier = Modifier.size(20.dp)) }
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 14.5.sp, fontWeight = FontWeight.Medium, color = iconTint.takeIf { it == Red } ?: Ink)
            Text(subtitle, fontSize = 12.sp, color = Ink3)
        }
    }
}

// ─── Filters sheet ────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CellarFiltersSheet(
    currentWineType     : String,
    currentStatusPreset : String,
    currentCountry      : String,
    currentGrapes       : List<String>,
    availableCountries  : List<String>,
    availableGrapes     : List<String>,
    onApply   : (wineType: String, statusPreset: String, country: String, grapes: List<String>) -> Unit,
    onDismiss : () -> Unit,
) {
    var wineType       by remember { mutableStateOf(currentWineType) }
    var statusPreset   by remember { mutableStateOf(currentStatusPreset) }
    var country        by remember { mutableStateOf(currentCountry) }
    var selectedGrapes by remember { mutableStateOf(currentGrapes.toSet()) }

    val screenH    = androidx.compose.ui.platform.LocalConfiguration.current.screenHeightDp.dp
    val maxSheetH  = screenH * 0.88f
    val scrollState = rememberScrollState()
    val swipeBlocker = remember {
        object : NestedScrollConnection {
            override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
                return if (available.y > 0) available.copy(x = 0f) else Offset.Zero
            }
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor   = Color.White,
        shape            = MerloticSheet.Shape,
        scrimColor       = MerloticSheet.ScrimColor,
        dragHandle       = { SheetDragHandle() },
    ) {
        Column(Modifier.fillMaxWidth().heightIn(max = maxSheetH)) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Фильтры", fontSize = 24.sp, fontWeight = FontWeight.SemiBold, color = Ink, modifier = Modifier.weight(1f))
                Box(
                    Modifier.size(34.dp).clip(CircleShape).background(Fill).clickable(onClick = onDismiss),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(18.dp), tint = Ink) }
            }
            HorizontalDivider(color = Line)

            Column(
                Modifier
                    .weight(1f, fill = false)
                    .nestedScroll(swipeBlocker)
                    .verticalScroll(scrollState)
                    .padding(horizontal = 20.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                // Тип вина
                FilterChipGroup(
                    label    = "Тип вина",
                    options  = listOf("RED" to "Красное", "WHITE" to "Белое", "ROSE" to "Розе", "SPARKLING" to "Игристое", "FORTIFIED" to "Креплёное"),
                    selected = if (wineType.isBlank()) emptySet() else setOf(wineType),
                    onToggle = { wineType = if (wineType == it) "" else it },
                )
                // Статус хранения
                FilterChipGroup(
                    label    = "Статус хранения",
                    options  = listOf("DUE" to "Пора открыть", "READY" to "В самый раз", "HOLD" to "Хранить"),
                    selected = if (statusPreset.isBlank()) emptySet() else setOf(statusPreset),
                    onToggle = { statusPreset = if (statusPreset == it) "" else it },
                )
                // Страна
                if (availableCountries.isNotEmpty()) {
                    FilterChipGroup(
                        label    = "Страна",
                        options  = availableCountries.map { it to it },
                        selected = if (country.isBlank()) emptySet() else setOf(country),
                        onToggle = { country = if (country == it) "" else it },
                    )
                }
                // Сорта винограда
                if (availableGrapes.isNotEmpty()) {
                    FilterChipGroup(
                        label    = "Сорта винограда",
                        options  = availableGrapes.map { it to it },
                        selected = selectedGrapes,
                        onToggle = { grape ->
                            selectedGrapes = if (grape in selectedGrapes) selectedGrapes - grape else selectedGrapes + grape
                        },
                    )
                }
            }

            HorizontalDivider(color = Line)
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp).navigationBarsPadding(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedButton(
                    onClick  = { wineType = ""; statusPreset = ""; country = ""; selectedGrapes = emptySet() },
                    modifier = Modifier.weight(1f),
                    shape    = RoundedCornerShape(12.dp),
                    border   = BorderStroke(1.dp, Line),
                    colors   = ButtonDefaults.outlinedButtonColors(contentColor = Ink),
                ) { Text("Сбросить") }
                Button(
                    onClick  = { onApply(wineType, statusPreset, country, selectedGrapes.toList()) },
                    modifier = Modifier.weight(2f),
                    shape    = RoundedCornerShape(12.dp),
                    colors   = ButtonDefaults.buttonColors(containerColor = Teal),
                ) { Text("Применить", color = Color.White) }
            }
        }
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

private fun createCellarTempUri(context: Context): Uri {
    val file = File(context.cacheDir, "cellar_photo_${System.currentTimeMillis()}.jpg")
    return FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
}
