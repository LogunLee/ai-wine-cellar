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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.enolo.app.data.dto.CellarItemDto
import com.enolo.app.util.Formatters
import kotlinx.coroutines.delay
import java.io.File

// ─── Design tokens (updated for better contrast) ─────────────────────────────
private val Ink      = Color(0xFF1A1A1D)
private val Ink2     = Color(0xFF4A4A53)
private val Ink3     = Color(0xFF787880)
private val Fill     = Color(0xFFEEECE9)
private val Line     = Color(0xFFD6D4CF)
private val Teal     = Color(0xFF1C6F5E)
private val TealWash = Color(0xFFE9F3EE)
private val GoldBg   = Color(0xFFFBF1DC)
private val GoldText = Color(0xFF8A6411)
private val Gold     = Color(0xFFE2A21F)
private val Red      = Color(0xFFC23B36)
private val RedBg    = Color(0xFFFBECEB)

// ─── Screen ──────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CellarScreen(viewModel: CellarViewModel = hiltViewModel()) {
    val uiState            by viewModel.uiState.collectAsState()
    val filters            by viewModel.filters.collectAsState()
    val filteredItems      by viewModel.filteredItems.collectAsState()
    val noteState          by viewModel.noteState.collectAsState()
    val actionError        by viewModel.actionError.collectAsState()
    val availableCountries by viewModel.availableCountries.collectAsState()
    val availableGrapes    by viewModel.availableGrapes.collectAsState()
    val context            = LocalContext.current

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

    // Search in header
    var searchActive  by remember { mutableStateOf(false) }
    var searchText    by remember { mutableStateOf("") }
    val focusRequester = remember { FocusRequester() }
    var showSortSheet by remember { mutableStateOf(false) }

    LaunchedEffect(searchActive) {
        if (searchActive) { delay(80); focusRequester.requestFocus() }
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

    if (showManualAdd) {
        EditWineDialog(
            item      = null,
            onConfirm = { req -> viewModel.addWine(req) { showManualAdd = false } },
            onDismiss = { showManualAdd = false },
            error     = actionError,
        )
    }
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
            onManual  = { activeSheet = null; showManualAdd = true },
            onDismiss = { activeSheet = null },
        )
    }
    if (activeSheet == "actions" && actionItem != null) {
        CellarActionSheet(
            item           = actionItem!!,
            photoUrl       = viewModel.absolutePhotoUrl(actionItem!!.photoPath),
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
            // White block: header + AI search + quick filters
            Surface(color = Color.White, shadowElevation = 1.dp) {
                Column {
                    if (searchActive) {
                        CellarSearchHeader(
                            value          = searchText,
                            onValueChange  = { v -> searchText = v; viewModel.onSearchChange(v) },
                            onBack         = { searchActive = false; searchText = ""; viewModel.onSearchChange("") },
                            focusRequester = focusRequester,
                        )
                    } else {
                        CellarHeader(
                            totalBottles   = uiState.totalBottles,
                            dueBottles     = uiState.dueBottles,
                            totalPositions = uiState.totalPositions,
                        )
                        CellarAiSearchBar(
                            onSearchClick = { searchActive = true },
                            onAiClick     = { /* AI stub — coming soon */ },
                        )
                    }
                    CellarQuickFiltersRow(
                        activePresets  = remember(filters) { filters.activePresetKeys() },
                        filterCount    = remember(filters) { filters.activeFilterCount() },
                        currentSort    = filters.sort,
                        onSortClick    = { showSortSheet = true },
                        onFilterClick  = { activeSheet = "filters" },
                        onPresetToggle = { viewModel.togglePreset(it) },
                    )
                }
            }

            // Content
            Box(modifier = Modifier.weight(1f)) {
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
                        LazyColumn(modifier = Modifier.fillMaxSize()) {
                            items(filteredItems, key = { it.id }) { item ->
                                CellarBottleRow(
                                    item     = item,
                                    photoUrl = viewModel.absolutePhotoUrl(item.photoPath),
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

        FloatingActionButton(
            onClick        = { activeSheet = "add" },
            modifier       = Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = 16.dp),
            containerColor = Teal,
            contentColor   = Color.White,
        ) {
            Icon(Icons.Default.Add, contentDescription = "Добавить")
        }
    }
}

// ─── Header ──────────────────────────────────────────────────────────────────

@Composable
private fun CellarHeader(totalBottles: Int, dueBottles: Int, totalPositions: Int) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 8.dp),
    ) {
        Text(
            text          = "Погреб",
            fontSize      = 26.sp,
            fontWeight    = FontWeight.SemiBold,
            letterSpacing = (-0.02).em,
            color         = Ink,
        )
        if (totalBottles > 0 || totalPositions > 0) {
            Spacer(Modifier.height(3.dp))
            Row(
                verticalAlignment     = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    text       = "${totalBottles} ${pluralBottles(totalBottles)}",
                    fontFamily = FontFamily.Monospace,
                    fontSize   = 12.5.sp,
                    color      = Ink3,
                )
                if (dueBottles > 0) {
                    Text("·", fontSize = 12.5.sp, color = Ink3)
                    Box(
                        modifier             = Modifier.size(7.dp).clip(CircleShape).background(Gold),
                    )
                    Text(
                        text       = "$dueBottles пора открыть",
                        fontFamily = FontFamily.Monospace,
                        fontSize   = 12.5.sp,
                        color      = Ink3,
                    )
                }
                if (totalPositions > 0) {
                    Text("·", fontSize = 12.5.sp, color = Ink3)
                    Text(
                        text       = "$totalPositions ${pluralPositions(totalPositions)}",
                        fontFamily = FontFamily.Monospace,
                        fontSize   = 12.5.sp,
                        color      = Ink3,
                    )
                }
            }
        }
    }
}

@Composable
private fun CellarAiSearchBar(onSearchClick: () -> Unit, onAiClick: () -> Unit) {
    Surface(
        modifier        = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .padding(bottom = 8.dp),
        shape           = RoundedCornerShape(16.dp),
        color           = Color.White,
        border          = BorderStroke(1.dp, Line),
        shadowElevation = 1.dp,
        onClick         = onSearchClick,
    ) {
        Row(
            modifier              = Modifier.padding(9.dp),
            verticalAlignment     = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(Icons.Default.Search, contentDescription = null, tint = Ink3, modifier = Modifier.size(20.dp))
            Text(
                text     = "Поиск или «что открыть к рыбе»",
                fontSize = 14.sp,
                color    = Ink3,
                modifier = Modifier.weight(1f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            IconButton(
                onClick  = onAiClick,
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(11.dp))
                    .background(Teal),
            ) {
                Icon(Icons.Default.AutoAwesome, contentDescription = "AI", tint = Color.White, modifier = Modifier.size(20.dp))
            }
        }
    }
}

@Composable
private fun CellarSearchHeader(
    value          : String,
    onValueChange  : (String) -> Unit,
    onBack         : () -> Unit,
    focusRequester : FocusRequester,
) {
    Row(
        modifier          = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(Icons.Default.ArrowBack, contentDescription = "Назад", tint = Ink)
        }
        BasicTextField(
            value         = value,
            onValueChange = onValueChange,
            modifier      = Modifier.weight(1f).focusRequester(focusRequester),
            singleLine    = true,
            textStyle     = TextStyle(fontSize = 16.sp, color = Ink),
            cursorBrush   = SolidColor(Teal),
            decorationBox = { inner ->
                if (value.isEmpty()) Text("Поиск по погребу…", fontSize = 16.sp, color = Ink3)
                inner()
            },
        )
        if (value.isNotEmpty()) {
            IconButton(onClick = { onValueChange("") }) {
                Icon(Icons.Default.Close, contentDescription = "Очистить", tint = Ink3)
            }
        }
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
    Row(
        modifier          = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // Sort icon button
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(if (!sortIsDefault) TealWash else Fill)
                .clickable(onClick = onSortClick),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector        = Icons.Default.SwapVert,
                contentDescription = "Сортировка",
                tint               = if (!sortIsDefault) Teal else Ink2,
                modifier           = Modifier.size(18.dp),
            )
        }

        Surface(
            onClick  = onFilterClick,
            shape    = RoundedCornerShape(18.dp),
            color    = if (hasActive) TealWash else Fill,
            border   = if (hasActive) BorderStroke(1.dp, Teal) else null,
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
                    tint     = if (hasActive) Teal else Ink,
                )
                Text(
                    text       = if (hasActive) "Фильтры $filterCount" else "Фильтры",
                    fontSize   = 13.sp,
                    fontWeight = FontWeight.Medium,
                    color      = if (hasActive) Teal else Ink,
                )
            }
        }
        LazyRow(
            modifier              = Modifier.weight(1f),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            items(CELLAR_QUICK_PRESETS, key = { it.first }) { (key, label) ->
                val active = key in activePresets
                Surface(
                    onClick  = { onPresetToggle(key) },
                    shape    = RoundedCornerShape(18.dp),
                    color    = if (active) Ink else Fill,
                    modifier = Modifier.height(36.dp),
                ) {
                    Text(
                        text       = label,
                        modifier   = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        fontSize   = 13.sp,
                        fontWeight = FontWeight.Medium,
                        color      = if (active) Color.White else Ink,
                    )
                }
            }
        }
    }
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
        scrimColor       = Color(0x51141419),
        shape            = RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp),
        dragHandle = {
            Box(
                Modifier.padding(top = 8.dp, bottom = 4.dp)
                    .size(width = 36.dp, height = 4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(Color(0xFFD6D6D4)),
            )
        },
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
private fun CellarBottleRow(
    item     : CellarItemDto,
    photoUrl : String?,
    onClick  : () -> Unit,
    onMenu   : () -> Unit,
) {
    val status = remember(item) { item.drinkWindowStatus() }
    Column(modifier = Modifier.background(Color.White)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .padding(horizontal = 18.dp, vertical = 13.dp),
            verticalAlignment = Alignment.Top,
        ) {
            // Thumbnail + qty badge
            Box(modifier = Modifier.size(width = 54.dp, height = 70.dp)) {
                if (!photoUrl.isNullOrBlank()) {
                    AsyncImage(
                        model            = photoUrl,
                        contentDescription = null,
                        modifier         = Modifier.fillMaxSize().clip(RoundedCornerShape(11.dp)),
                        contentScale     = ContentScale.Fit,
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .clip(RoundedCornerShape(11.dp))
                            .background(Fill)
                            .drawBehind {
                                val step = 12.dp.toPx(); val sw = 1.dp.toPx()
                                val col  = Color(0xFFDEDEDA)
                                var x = -size.height
                                while (x < size.width + size.height) {
                                    drawLine(col, Offset(x, 0f), Offset(x + size.height, size.height), sw)
                                    x += step
                                }
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Default.WineBar, contentDescription = null, tint = Ink3, modifier = Modifier.size(24.dp))
                    }
                }
                // Quantity badge
                Surface(
                    modifier        = Modifier.align(Alignment.TopStart).padding(3.dp),
                    color           = Teal,
                    shape           = RoundedCornerShape(6.dp),
                    shadowElevation = 1.dp,
                ) {
                    Text(
                        text       = "×${item.quantity}",
                        modifier   = Modifier.padding(horizontal = 5.dp, vertical = 1.dp),
                        fontFamily = FontFamily.Monospace,
                        fontSize   = 10.sp,
                        fontWeight = FontWeight.SemiBold,
                        color      = Color.White,
                    )
                }
            }

            Spacer(Modifier.width(12.dp))

            // Info column
            Column(modifier = Modifier.weight(1f)) {
                val displayName = "${item.producer} ${item.name}".trim()
                Text(
                    text       = displayName,
                    fontSize   = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines   = 1,
                    overflow   = TextOverflow.Ellipsis,
                    color      = Ink,
                )
                val sub = listOfNotNull(
                    Formatters.wineTypeRu(item.wineType).takeIf { it.isNotBlank() },
                    item.region ?: item.country,
                ).joinToString(" · ")
                if (sub.isNotBlank()) {
                    Text(
                        text     = sub,
                        fontSize = 12.sp,
                        color    = Ink3,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }

                // Critic scores
                val scoreText = item.criticScores
                    ?.entries
                    ?.sortedByDescending { it.value }
                    ?.take(3)
                    ?.joinToString(" · ") { "${abbreviateCritic(it.key)} ${it.value}" }
                if (!scoreText.isNullOrBlank()) {
                    Text(
                        text       = scoreText,
                        fontSize   = 11.sp,
                        fontFamily = FontFamily.Monospace,
                        color      = Teal,
                        modifier   = Modifier.padding(top = 3.dp),
                    )
                }

                // Meta pills row
                Row(
                    modifier              = Modifier.padding(top = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment     = Alignment.CenterVertically,
                ) {
                    // Added date plain text
                    if (item.createdAt.isNotBlank()) {
                        Text(
                            text       = "Добавлено ${formatAddedDate(item.createdAt)}",
                            fontFamily = FontFamily.Monospace,
                            fontSize   = 10.5.sp,
                            color      = Ink3,
                        )
                    }
                    // Drink window pill
                    if (item.drinkWindowFrom != null && item.drinkWindowTo != null) {
                        DrinkWindowPill(
                            from   = item.drinkWindowFrom,
                            to     = item.drinkWindowTo,
                            status = status,
                        )
                    }
                }
            }

            // Kebab menu
            IconButton(onClick = onMenu, modifier = Modifier.size(36.dp)) {
                Icon(Icons.Default.MoreVert, contentDescription = "Действия", tint = Ink3, modifier = Modifier.size(18.dp))
            }
        }
        HorizontalDivider(color = Line, modifier = Modifier.padding(start = 84.dp))
    }
}

@Composable
private fun DrinkWindowPill(from: Int, to: Int, status: DrinkWindowStatus?) {
    val bgColor     : Color
    val textColor   : Color
    val dotColor    : Color
    val statusLabel : String
    when (status) {
        DrinkWindowStatus.DUE   -> { bgColor = GoldBg;  textColor = GoldText; dotColor = Gold;  statusLabel = "Пора открыть" }
        DrinkWindowStatus.READY -> { bgColor = TealWash; textColor = Teal;    dotColor = Teal;  statusLabel = "В самый раз" }
        DrinkWindowStatus.HOLD  -> { bgColor = Fill;     textColor = Ink2;    dotColor = Ink3;  statusLabel = "Хранить" }
        null                    -> { bgColor = Fill;     textColor = Ink2;    dotColor = Ink3;  statusLabel = "" }
    }
    Surface(shape = RoundedCornerShape(6.dp), color = bgColor) {
        Row(
            modifier          = Modifier.padding(horizontal = 7.dp, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Box(Modifier.size(5.dp).clip(CircleShape).background(dotColor))
            Text(
                text       = "$from–$to${if (statusLabel.isNotBlank()) " · $statusLabel" else ""}",
                fontFamily = FontFamily.Monospace,
                fontSize   = 10.5.sp,
                color      = textColor,
            )
        }
    }
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
    onManual  : () -> Unit,
    onDismiss : () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor   = Color.White,
        shape            = RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp),
        scrimColor       = Color(0x51141419),
        dragHandle = {
            Box(
                Modifier.padding(top = 8.dp, bottom = 4.dp)
                    .size(width = 36.dp, height = 4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(Color(0xFFD6D6D4)),
            )
        },
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
                onClick  = { /* stub */ },
            )
            HorizontalDivider(color = Line, modifier = Modifier.padding(start = 72.dp))
            AddSheetAction(
                icon     = Icons.Default.Search,
                title    = "Найти по названию",
                subtitle = "Поиск по базе и магазинам",
                onClick  = { /* stub */ },
            )
            HorizontalDivider(color = Line, modifier = Modifier.padding(start = 72.dp))
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
    onDismiss           : () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor   = Color.White,
        shape            = RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp),
        scrimColor       = Color(0x51141419),
        dragHandle = {
            Box(
                Modifier.padding(top = 8.dp, bottom = 4.dp)
                    .size(width = 36.dp, height = 4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(Color(0xFFD6D6D4)),
            )
        },
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
                        AsyncImage(model = photoUrl, contentDescription = null, modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(8.dp)), contentScale = ContentScale.Fit)
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

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
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
        shape            = RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp),
        scrimColor       = Color(0x51141419),
        dragHandle = {
            Box(
                Modifier.padding(top = 8.dp, bottom = 4.dp)
                    .size(width = 36.dp, height = 4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(Color(0xFFD6D6D4)),
            )
        },
    ) {
        Column(Modifier.fillMaxWidth().heightIn(max = maxSheetH)) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Фильтры", fontSize = 19.sp, fontWeight = FontWeight.SemiBold, color = Ink, modifier = Modifier.weight(1f))
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
                CellarFilterGroup(
                    label    = "ТИП ВИНА",
                    options  = listOf("RED" to "Красное", "WHITE" to "Белое", "ROSE" to "Розе", "SPARKLING" to "Игристое", "FORTIFIED" to "Креплёное"),
                    selected = if (wineType.isBlank()) emptySet() else setOf(wineType),
                    onToggle = { wineType = if (wineType == it) "" else it },
                )
                // Статус хранения
                CellarFilterGroup(
                    label    = "СТАТУС ХРАНЕНИЯ",
                    options  = listOf("DUE" to "Пора открыть", "READY" to "В самый раз", "HOLD" to "Хранить"),
                    selected = if (statusPreset.isBlank()) emptySet() else setOf(statusPreset),
                    onToggle = { statusPreset = if (statusPreset == it) "" else it },
                )
                // Страна
                if (availableCountries.isNotEmpty()) {
                    CellarFilterGroup(
                        label    = "СТРАНА",
                        options  = availableCountries.map { it to it },
                        selected = if (country.isBlank()) emptySet() else setOf(country),
                        onToggle = { country = if (country == it) "" else it },
                    )
                }
                // Сорта винограда
                if (availableGrapes.isNotEmpty()) {
                    CellarFilterGroup(
                        label    = "СОРТА ВИНОГРАДА",
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

@Composable
private fun CellarFilterGroup(
    label    : String,
    options  : List<Pair<String, String>>,
    selected : Set<String>,
    onToggle : (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(label, fontFamily = FontFamily.Monospace, fontSize = 11.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.06.em, color = Ink3)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            options.forEach { (key, optLabel) ->
                val isSelected = key in selected
                Surface(
                    onClick  = { onToggle(key) },
                    shape    = RoundedCornerShape(20.dp),
                    color    = if (isSelected) TealWash else Fill,
                    border   = BorderStroke(1.dp, if (isSelected) Color(0xFFD8EAE0) else Color.Transparent),
                    modifier = Modifier.height(36.dp),
                ) {
                    Text(
                        optLabel,
                        modifier   = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                        fontSize   = 13.5.sp,
                        fontWeight = if (isSelected) FontWeight.Medium else FontWeight.Normal,
                        color      = if (isSelected) Teal else Ink,
                    )
                }
            }
        }
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

private fun pluralBottles(n: Int): String {
    val mod10 = n % 10; val mod100 = n % 100
    return when {
        mod100 in 11..19 -> "бутылок"
        mod10 == 1       -> "бутылка"
        mod10 in 2..4    -> "бутылки"
        else             -> "бутылок"
    }
}

private fun pluralPositions(n: Int): String {
    val mod10 = n % 10; val mod100 = n % 100
    return when {
        mod100 in 11..19 -> "позиций"
        mod10 == 1       -> "позиция"
        mod10 in 2..4    -> "позиции"
        else             -> "позиций"
    }
}

private fun abbreviateCritic(name: String): String = when {
    name.contains("Advocate",  ignoreCase = true) -> "WA"
    name.contains("Spectator", ignoreCase = true) -> "WS"
    name.contains("Suckling",  ignoreCase = true) -> "JS"
    name.contains("Vinous",    ignoreCase = true) -> "Vinous"
    name.contains("Robinson",  ignoreCase = true) -> "JR"
    name.contains("Decanter",  ignoreCase = true) -> "DC"
    name.contains("Burghound", ignoreCase = true) -> "BH"
    name.contains("Falstaff",  ignoreCase = true) -> "FS"
    else -> name.take(4)
}

private fun formatAddedDate(createdAt: String): String = try {
    val date = if (createdAt.length >= 10) createdAt.substring(0, 10) else ""
    if (date.length == 10) {
        val p = date.split("-")
        "${p[2]}.${p[1]}.${p[0].substring(2)}"
    } else createdAt
} catch (_: Exception) { createdAt }

private fun createCellarTempUri(context: Context): Uri {
    val file = File(context.cacheDir, "cellar_photo_${System.currentTimeMillis()}.jpg")
    return FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
}
