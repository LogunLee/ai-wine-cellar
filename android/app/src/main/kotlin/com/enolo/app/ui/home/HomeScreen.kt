package com.enolo.app.ui.home

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.isSpecified
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import coil.compose.rememberAsyncImagePainter
import com.enolo.app.R
import com.enolo.app.data.dto.CellarItemDto
import com.enolo.app.data.dto.DiscountOfferDto
import com.enolo.app.data.dto.WineRecognitionResult
import com.enolo.app.ui.components.MerloticSearchBar
import com.enolo.app.ui.components.MerloticTopBar
import com.enolo.app.ui.components.SearchBarActionButton
import com.enolo.app.ui.theme.*
import com.enolo.app.util.Formatters

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onNavigateToDiscounts:   () -> Unit = {},
    onNavigateToCellar:      () -> Unit = {},
    onNavigateToNotes:       () -> Unit = {},
    onNavigateToSmartSearch: () -> Unit = {},
    startAction: String? = null,
    onConsumeStartAction: () -> Unit = {},
    viewModel: HomeViewModel = hiltViewModel()
) {
    val query         by viewModel.query.collectAsState()
    val uiState       by viewModel.uiState.collectAsState()
    val researchState by viewModel.researchState.collectAsState()
    val imageLoading  by viewModel.imageLoading.collectAsState()
    val topDeals      by viewModel.topDeals.collectAsState()
    val dealsLoading  by viewModel.dealsLoading.collectAsState()
    val facts         by viewModel.facts.collectAsState()
    val cellarCount   by viewModel.cellarCount.collectAsState()
    val notesCount    by viewModel.notesCount.collectAsState()
    val extras        by viewModel.extras.collectAsState()
    val photoCandidates by viewModel.photoCandidates.collectAsState()
    val clipboardText by viewModel.clipboardText.collectAsState()
    val recognitionPhotoUri by viewModel.recognitionPhotoUri.collectAsState()
    val refreshing    by viewModel.refreshing.collectAsState()

    val context = LocalContext.current
    val clipboard = androidx.compose.ui.platform.LocalClipboardManager.current

    var showQuickNote   by remember { mutableStateOf(false) }
    var showScanCamera  by remember { mutableStateOf(false) }
    var showPermDialog  by remember { mutableStateOf(false) }
    var cellarItemsList by remember { mutableStateOf<List<CellarItemDto>>(emptyList()) }
    var pendingAddWine  by remember { mutableStateOf<WineRecognitionResult?>(null) }
    var editWine        by remember { mutableStateOf<WineRecognitionResult?>(null) }

    // Gallery
    val galleryLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri: Uri? -> uri?.let { viewModel.onImagePicked(it) } }

    // Разрешение камеры → встроенная камера CameraX (без подтверждения снимка)
    val cameraPermLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) showScanCamera = true else showPermDialog = true
    }

    fun launchCamera() {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED) {
            showScanCamera = true
        } else cameraPermLauncher.launch(Manifest.permission.CAMERA)
    }

    // Запуск распознавания, инициированный из другого раздела (например, погреба).
    LaunchedEffect(startAction) {
        when (startAction) {
            "scan"    -> launchCamera()
            "gallery" -> galleryLauncher.launch("image/*")
        }
        if (startAction != null) onConsumeStartAction()
    }

    // Копирование «внешнего исследования» в буфер
    LaunchedEffect(clipboardText) {
        clipboardText?.let { text ->
            clipboard.setText(androidx.compose.ui.text.AnnotatedString(text))
            viewModel.clearClipboardText()
            android.widget.Toast.makeText(
                context,
                "Описание для поиска информации о вине скопировано в буфер обмена",
                android.widget.Toast.LENGTH_LONG,
            ).show()
        }
    }

    if (showScanCamera) {
        ScanCameraSheet(
            onCaptured = { uri ->
                showScanCamera = false
                viewModel.onImagePicked(uri)
            },
            onDismiss = { showScanCamera = false },
        )
    }

    pendingAddWine?.let { wine ->
        AddToCellarDialog(
            wine      = wine,
            onConfirm = { qty -> viewModel.addToCellar(wine, qty); pendingAddWine = null },
            onDismiss = { pendingAddWine = null },
        )
    }

    editWine?.let { wine ->
        EditRecognizedWineDialog(
            wine      = wine,
            onConfirm = { updated -> viewModel.editWine(wine, updated); editWine = null },
            onDismiss = { editWine = null },
        )
    }

    when (val pc = photoCandidates) {
        is PhotoCandidatesState.Loading, is PhotoCandidatesState.Loaded -> {
            PhotoCandidatesDialog(
                state    = pc,
                onSelect = { wine, url -> viewModel.selectPhotoCandidate(wine, url) },
                onDismiss = { viewModel.closePhotoCandidates() },
            )
        }
        else -> {}
    }

    if (showPermDialog) {
        AlertDialog(
            onDismissRequest = { showPermDialog = false },
            title   = { Text("Нет доступа к камере") },
            text    = { Text("Разрешите доступ к камере в настройках.") },
            confirmButton = { TextButton(onClick = { showPermDialog = false }) { Text("OK") } }
        )
    }

    if (researchState is ResearchUiState.Loading ||
        researchState is ResearchUiState.Result  ||
        researchState is ResearchUiState.Error) {
        ResearchDialog(state = researchState, onDismiss = { viewModel.clearResearch() })
    }

    if (showQuickNote) {
        QuickNoteSheet(
            cellarItems = cellarItemsList,
            onSave      = { text, itemId ->
                if (itemId != null) {
                    // TODO: wire to CellarViewModel.saveNote
                }
                viewModel.onNoteSaved()
                showQuickNote = false
            },
            onDismiss = { showQuickNote = false }
        )
    }

    Column(modifier = Modifier
        .fillMaxSize()
        .background(TokenBg)) {

        // ── Top bar ──────────────────────────────────────────────────────────
        HomeTopBar()

        // ── Content ──────────────────────────────────────────────────────────
        val isIdle = query.isBlank() && uiState is HomeUiState.Idle

        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh    = { viewModel.refresh() },
            modifier     = Modifier.weight(1f),
        ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 24.dp)
        ) {
            // Search field — always at top
            item {
                SearchField(
                    query        = query,
                    imageLoading = imageLoading,
                    onQueryChange  = viewModel::onQueryChange,
                    onClearQuery   = viewModel::clearResults,
                    onSubmit       = viewModel::submitSearch,
                    onGalleryClick = { galleryLauncher.launch("image/*") },
                    onCameraClick  = { launchCamera() },
                    modifier = Modifier.padding(top = 3.5.dp, bottom = 10.dp)
                )
            }

            if (isIdle) {
                // ── CELLAR + QUICK NOTE (сразу под поиском) ───────────────────
                item {
                    Row(
                        modifier = Modifier
                            .padding(horizontal = 18.dp)
                            .fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        CellarWidget(
                            count    = cellarCount,
                            onClick  = onNavigateToCellar,
                            modifier = Modifier.weight(1f)
                        )
                        QuickNoteWidget(
                            count    = notesCount,
                            onClick  = onNavigateToNotes,
                            modifier = Modifier.weight(1f)
                        )
                    }
                    Spacer(Modifier.height(20.dp))
                }

                // ── WHAT TO OPEN ─────────────────────────────────────────────
                item {
                    WhatToOpenButton(
                        onClick  = onNavigateToSmartSearch,
                        modifier = Modifier.padding(horizontal = 18.dp)
                    )
                    Spacer(Modifier.height(4.5.dp))
                }

                // ── TOP DEALS (в самом низу) ──────────────────────────────────
                item {
                    SectionHeader(
                        label     = "ТОП СКИДОК ДНЯ",
                        actionLabel = "Все скидки",
                        onAction  = onNavigateToDiscounts,
                        modifier  = Modifier.padding(horizontal = 18.dp)
                    )
                    Spacer(Modifier.height(0.75.dp))
                }
                item {
                    if (dealsLoading) {
                        Box(Modifier.fillMaxWidth().height(200.dp),
                            contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = TokenTeal, modifier = Modifier.size(28.dp))
                        }
                    } else if (topDeals.isNotEmpty()) {
                        LazyRow(
                            contentPadding = PaddingValues(horizontal = 18.dp),
                            horizontalArrangement = Arrangement.spacedBy(13.dp)
                        ) {
                            items(topDeals) { deal -> DealCard(deal) }
                        }
                    }
                }

                // ── INTERESTING FACTS (под каруселью скидок) ──────────────────
                if (facts.isNotEmpty()) {
                    item {
                        Spacer(Modifier.height(20.dp))
                        SectionHeader(
                            label    = "ИНТЕРЕСНЫЕ ФАКТЫ",
                            modifier = Modifier.padding(horizontal = 18.dp)
                        )
                        Spacer(Modifier.height(0.75.dp))
                    }
                    item {
                        LazyRow(
                            contentPadding = PaddingValues(horizontal = 18.dp),
                            horizontalArrangement = Arrangement.spacedBy(13.dp)
                        ) {
                            items(facts) { fact -> FactCard(fact) }
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                }

            } else {
                // ── SEARCH / RECOGNITION RESULTS ─────────────────────────────
                when (uiState) {
                    is HomeUiState.Loading -> item {
                        Box(Modifier.fillMaxWidth().padding(48.dp),
                            contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = TokenTeal)
                        }
                    }
                    is HomeUiState.Error   -> item {
                        Text(
                            (uiState as HomeUiState.Error).message,
                            color    = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(horizontal = 18.dp, vertical = 24.dp)
                        )
                    }
                    is HomeUiState.Results -> {
                        val wines = (uiState as HomeUiState.Results).wines
                        items(wines) { wine ->
                            WineResultCard(
                                wine          = wine,
                                extras        = extras[wineKey(wine)] ?: WineExtras(),
                                photoUri      = recognitionPhotoUri,
                                onResearch    = { viewModel.researchWine(wine) },
                                onAddToCellar = { pendingAddWine = wine },
                                onEdit        = { editWine = wine },
                                onPickPhoto   = { viewModel.openPhotoCandidates(wine) },
                                onExternal    = { viewModel.externalResearch(wine) },
                                onOpenUrl     = { url ->
                                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                                },
                                modifier      = Modifier.padding(horizontal = 18.dp, vertical = 4.dp)
                            )
                        }
                    }
                    else -> {}
                }
            }
        }
        }
    }
}

// ── Top bar ──────────────────────────────────────────────────────────────────
@Composable
private fun HomeTopBar() {
    MerloticTopBar(title = "Merlotic") {
        // Server status dot
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(TokenGreenDot)
        )
        Spacer(Modifier.width(5.dp))
        Text(
            text  = "локальный",
            style = MaterialTheme.typography.labelSmall,
            color = TokenInk2
        )
        Spacer(Modifier.width(12.dp))

        // Avatar
        Box(
            modifier = Modifier
                .size(34.dp)
                .clip(CircleShape)
                .background(TokenInk),
            contentAlignment = Alignment.Center
        ) {
            Text("E", color = Color.White,
                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold))
        }
    }
}

// ── Search field ─────────────────────────────────────────────────────────────
@Composable
private fun SearchField(
    query:         String,
    imageLoading:  Boolean,
    onQueryChange: (String) -> Unit,
    onClearQuery:  () -> Unit,
    onSubmit:      () -> Unit,
    onGalleryClick: () -> Unit,
    onCameraClick:  () -> Unit,
    modifier:       Modifier = Modifier
) {
    MerloticSearchBar(
        value         = query,
        onValueChange = onQueryChange,
        onClear       = onClearQuery,
        placeholder   = "Вино, производитель, регион…",
        modifier      = modifier,
        onSubmit      = onSubmit,
    ) {
        when {
            imageLoading -> CircularProgressIndicator(
                modifier = Modifier.size(38.dp).padding(9.dp), color = TokenTeal, strokeWidth = 2.dp,
            )
            // Идёт ввод текста — показываем кнопку поиска
            query.isNotBlank() ->
                SearchBarActionButton(Icons.AutoMirrored.Filled.ArrowForward, "Искать", onSubmit)
            else -> {
                SearchBarActionButton(Icons.Default.PhotoLibrary, "Галерея", onGalleryClick)
                SearchBarActionButton(Icons.Default.PhotoCamera, "Камера", onCameraClick)
            }
        }
    }
}

// ── Section header ────────────────────────────────────────────────────────────
@Composable
private fun SectionHeader(
    label: String, actionLabel: String? = null,
    onAction: (() -> Unit)? = null, modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text  = label,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            letterSpacing = 0.8.sp,
            color = TokenInk
        )
        if (actionLabel != null && onAction != null) {
            TextButton(onClick = onAction, contentPadding = PaddingValues(0.dp)) {
                Text(actionLabel, fontSize = 13.sp, fontWeight = FontWeight.Medium,
                    color = TokenTeal)
            }
        }
    }
}

// ── Fact card ──────────────────────────────────────────────────────────────────
@Composable
private fun FactCard(fact: com.enolo.app.data.dto.DailyFactDto) {
    Surface(
        modifier = Modifier.width(260.dp),
        shape    = RoundedCornerShape(16.dp),
        color    = TokenCard,
        border   = BorderStroke(1.dp, TokenLine),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                fact.text,
                fontSize = 13.sp,
                lineHeight = 18.sp,
                color = TokenInk,
                maxLines = 6,
                overflow = TextOverflow.Ellipsis,
            )
            if (fact.source.isNotBlank()) {
                Text(
                    fact.source,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    color = TokenInk3,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

// ── Deal card ─────────────────────────────────────────────────────────────────
@Composable
private fun DealCard(offer: DiscountOfferDto) {
    val uriHandler = LocalUriHandler.current
    Surface(
        modifier = Modifier.width(124.dp),
        shape    = RoundedCornerShape(16.dp),
        color    = TokenCard,
        border   = BorderStroke(1.dp, TokenLine),
        onClick  = { if (offer.url.isNotBlank()) runCatching { uriHandler.openUri(offer.url) } }
    ) {
        Column {
            // Photo zone — вытянута по вертикали (2:3 к ширине карточки), белый фон,
            // чтобы прозрачные PNG не давали чёрный.
            BoxWithConstraints(
                modifier = Modifier.fillMaxWidth().height(186.dp).background(Color.White)
            ) {
                if (offer.imageUrl != null) {
                    val painter = rememberAsyncImagePainter(offer.imageUrl)
                    val intrinsic = painter.intrinsicSize
                    val boxWpx = constraints.maxWidth.toFloat()
                    val boxHpx = constraints.maxHeight.toFloat()
                    // Кроп заполняет ширину. Для длинных фото якорим по вертикали так,
                    // чтобы точка на 40% от низа масштабированной картинки попала в центр карточки.
                    val vBias = if (intrinsic.isSpecified && intrinsic.width > 0f && intrinsic.height > 0f) {
                        val h = intrinsic.height * (boxWpx / intrinsic.width) // высота после масштаба под ширину
                        if (h <= boxHpx) 0f else (0.2f * h / (h - boxHpx)).coerceIn(-1f, 1f)
                    } else 1f
                    Image(
                        painter            = painter,
                        contentDescription = null,
                        contentScale       = ContentScale.Crop,
                        alignment          = BiasAlignment(0f, vBias),
                        modifier           = Modifier.fillMaxSize()
                    )
                } else {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("🍷", fontSize = 36.sp)
                    }
                }
                // Discount badge top-left
                offer.discountPercent?.let { pct ->
                    Surface(
                        color  = TokenRed,
                        shape  = RoundedCornerShape(8.dp),
                        modifier = Modifier.padding(8.dp).align(Alignment.TopStart)
                    ) {
                        Text(
                            text  = "−$pct%",
                            fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                            color = Color.White,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
                        )
                    }
                }
            }

            // Body — уплотнён: миниатюра выросла, текст компактный (минимальные отступы
            // между «цветом вина» → ценой → магазином), чтобы высота карточки не росла.
            Column(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                Text(
                    text     = offer.wineName ?: offer.wineNameRaw ?: "—",
                    style    = MaterialTheme.typography.titleSmall.copy(fontSize = 14.sp, lineHeight = 18.sp),
                    minLines = 2,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    color    = TokenInk
                )
                val detail = listOfNotNull(offer.country, offer.region)
                    .joinToString(", ").ifBlank { offer.wineType?.let { Formatters.wineTypeRu(it) } ?: "" }
                if (detail.isNotBlank()) {
                    Text(detail, fontSize = 12.sp,
                        color = TokenInk3, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }

                Text(
                    text  = "${Formatters.price(offer.currentPrice)} ₽",
                    fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                    color = TokenMaroon
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(offer.sellerName,
                        fontSize = 12.sp, color = TokenInk3,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f))
                    Icon(Icons.Default.ChevronRight, contentDescription = null,
                        tint = TokenInk3, modifier = Modifier.size(14.dp))
                }
            }
        }
    }
}

// ── "What to open?" hero card ───────────────────────────────────────────────────
@Composable
private fun WhatToOpenButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier.fillMaxWidth().height(152.dp),
        shape    = RoundedCornerShape(18.dp),
        color    = TokenTealWash,
        onClick  = onClick
    ) {
        Box(Modifier.fillMaxSize()) {
            // Иллюстрация: увеличена (182dp по высоте, отцентрована и обрезается картой),
            // чтобы бутылка шла от верха текста до низа кнопки. Мятный фон встроен в картинку.
            Image(
                painter = painterResource(R.drawable.what_to_open),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                alignment = Alignment.CenterEnd,
                modifier = Modifier.align(Alignment.Center).fillMaxWidth().height(182.dp)
            )
            // Текст + кнопка слева, в пределах ~60% ширины (не залезают на иллюстрацию)
            Column(
                modifier = Modifier.fillMaxHeight().fillMaxWidth(0.62f).padding(18.dp),
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("AI-сомелье", fontSize = 19.sp, fontWeight = FontWeight.SemiBold, color = TokenInk)
                    Text("Подбор вин из погреба и консультации",
                        fontSize = 13.sp, lineHeight = 17.sp, color = TokenInk2)
                }
                Surface(shape = RoundedCornerShape(12.dp), color = TokenTeal) {
                    Row(
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 9.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text("Спросить", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        Icon(Icons.Default.ChevronRight, contentDescription = null,
                            tint = Color.White, modifier = Modifier.size(17.dp))
                    }
                }
            }
        }
    }
}

// ── Cellar widget (фотофон) ────────────────────────────────────────────────────
@Composable
private fun CellarWidget(count: Int, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier.height(158.dp),
        shape    = RoundedCornerShape(18.dp),
        color    = TokenInk,
        onClick  = onClick
    ) {
        Box(Modifier.fillMaxSize()) {
            Image(
                painter = painterResource(R.drawable.my_cellar),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
            Box(Modifier.fillMaxSize().background(
                Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.5f), Color.Black.copy(alpha = 0.15f), Color.Black.copy(alpha = 0.35f)))
            ))
            Column(
                modifier = Modifier.fillMaxSize().padding(14.dp),
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text("ПОГРЕБ", fontSize = 12.sp, fontWeight = FontWeight.Medium,
                        letterSpacing = 0.8.sp, color = Color.White.copy(alpha = 0.85f))
                    Text("$count", fontSize = 34.sp, fontWeight = FontWeight.SemiBold,
                        color = Color.White, lineHeight = 38.sp)
                }
                CardPillButton(
                    leading = { BottleStackIcon(tint = TokenInk, modifier = Modifier.size(15.dp)) },
                    text = "Открыть",
                )
            }
        }
    }
}

// ── Notes widget (фотофон) ─────────────────────────────────────────────────────
@Composable
private fun QuickNoteWidget(count: Int, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier.height(158.dp),
        shape    = RoundedCornerShape(18.dp),
        color    = TokenInk,
        onClick  = onClick
    ) {
        Box(Modifier.fillMaxSize()) {
            Image(
                painter = painterResource(R.drawable.wine_notes),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
            Box(Modifier.fillMaxSize().background(
                Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.55f), Color.Black.copy(alpha = 0.2f), Color.Black.copy(alpha = 0.25f)))
            ))
            Column(
                modifier = Modifier.fillMaxSize().padding(14.dp),
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text("ЗАМЕТКИ", fontSize = 12.sp, fontWeight = FontWeight.Medium,
                        letterSpacing = 0.8.sp, color = Color.White.copy(alpha = 0.85f))
                    Text("$count", fontSize = 34.sp, fontWeight = FontWeight.SemiBold,
                        color = Color.White, lineHeight = 38.sp)
                }
                CardPillButton(
                    leading = { Icon(Icons.Default.Edit, contentDescription = null, tint = TokenTeal, modifier = Modifier.size(15.dp)) },
                    text = "Создать",
                )
            }
        }
    }
}

/** Иконка-горка из бутылок: 6 кружков пирамидой (1-2-3). */
@Composable
private fun BottleStackIcon(tint: Color, modifier: Modifier = Modifier) {
    androidx.compose.foundation.Canvas(modifier = modifier) {
        val w = size.width
        val r = w * 0.135f
        val cols = listOf(
            0.5f to 0.21f,                          // верх
            0.34f to 0.5f, 0.66f to 0.5f,           // середина
            0.18f to 0.79f, 0.5f to 0.79f, 0.82f to 0.79f, // низ
        )
        cols.forEach { (cx, cy) ->
            drawCircle(color = tint, radius = r, center = androidx.compose.ui.geometry.Offset(cx * w, cy * size.height))
        }
    }
}

/** Белая «таблетка» внизу карточек: иконка + текст слева, шеврон справа, на всю ширину. */
@Composable
private fun CardPillButton(leading: @Composable () -> Unit, text: String) {
    Surface(shape = RoundedCornerShape(12.dp), color = Color.White, modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            leading()
            Spacer(Modifier.width(8.dp))
            Text(text, fontSize = 13.sp, fontWeight = FontWeight.Medium, color = TokenInk, modifier = Modifier.weight(1f))
            Icon(Icons.Default.ChevronRight, contentDescription = null, tint = TokenInk3, modifier = Modifier.size(15.dp))
        }
    }
}

// ── Search result card ────────────────────────────────────────────────────────
private fun abbreviateCriticHome(name: String): String = when {
    name.contains("Searcher",  ignoreCase = true) -> "W-S"
    name.contains("Advocate",  ignoreCase = true) -> "WA"
    name.contains("Spectator", ignoreCase = true) -> "WS"
    name.contains("Suckling",  ignoreCase = true) -> "JS"
    name.contains("Vinous",    ignoreCase = true) -> "Vinous"
    name.contains("Robinson",  ignoreCase = true) -> "JR"
    name.contains("Decanter",  ignoreCase = true) -> "DC"
    else -> name.take(4)
}

@Composable
private fun WineResultCard(
    wine:          WineRecognitionResult,
    extras:        WineExtras,
    photoUri:      Uri?,
    onResearch:    () -> Unit,
    onAddToCellar: () -> Unit,
    onEdit:        () -> Unit,
    onPickPhoto:   () -> Unit,
    onExternal:    () -> Unit,
    onOpenUrl:     (String) -> Unit,
    modifier:      Modifier = Modifier,
) {
    val justAdded = extras.added
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape    = RoundedCornerShape(16.dp),
        color    = TokenCard,
        border   = BorderStroke(1.dp, TokenLine)
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                // Фото: выбранный кандидат > исходный снимок
                val photoModel: Any? = extras.selectedPhotoUrl ?: photoUri
                if (photoModel != null) {
                    AsyncImage(
                        model              = photoModel,
                        contentDescription = null,
                        contentScale       = ContentScale.Crop,
                        modifier           = Modifier
                            .size(width = 64.dp, height = 84.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(Color.White)
                    )
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    if (wine.producer.isNotBlank()) {
                        Text(wine.producer, style = MaterialTheme.typography.labelSmall, color = TokenInk2)
                    }
                    Text(wine.name.ifBlank { "Неизвестное вино" },
                        style    = MaterialTheme.typography.titleSmall,
                        color    = TokenInk,
                        fontWeight = FontWeight.SemiBold)

                    val details = listOfNotNull(
                        wine.vintageYear?.toString(),
                        wine.wineType?.let { Formatters.wineTypeRu(it) },
                        wine.country,
                        wine.region,
                    )
                    if (details.isNotEmpty()) {
                        Text(details.joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall, color = TokenInk3)
                    }
                    wine.grapes?.takeIf { it.isNotEmpty() }?.let { grapes ->
                        Text(grapes.joinToString(", "),
                            style = MaterialTheme.typography.bodySmall, color = TokenInk3)
                    }

                    // В погребе / заметка
                    if (extras.inCellarCount > 0) {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Surface(shape = RoundedCornerShape(7.dp), color = TokenTealWash) {
                                Text("В погребе ×${extras.inCellarCount}",
                                    fontSize = 11.sp, color = TokenTeal, fontWeight = FontWeight.Medium,
                                    modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp))
                            }
                            if (extras.hasNote) {
                                Surface(shape = RoundedCornerShape(7.dp), color = TokenGoldWash) {
                                    Text("Есть заметка",
                                        fontSize = 11.sp, color = TokenGoldInk, fontWeight = FontWeight.Medium,
                                        modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp))
                                }
                            }
                        }
                    }
                }
                IconButton(onClick = onEdit, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Default.Edit, contentDescription = "Изменить", tint = TokenInk3, modifier = Modifier.size(17.dp))
                }
            }

            // Обогащение: Vivino / Wine-Searcher / оценки
            if (extras.enrichLoading) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    CircularProgressIndicator(color = TokenTeal, modifier = Modifier.size(13.dp), strokeWidth = 2.dp)
                    Text("Ищем на Vivino и Wine-Searcher…", fontSize = 11.5.sp, color = TokenInk3)
                }
            } else extras.enrich?.let { e ->
                val scoreText = e.criticScores?.entries
                    ?.sortedByDescending { it.value }
                    ?.take(3)
                    ?.joinToString(" · ") { "${abbreviateCriticHome(it.key)} ${it.value}" }
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    e.vivinoUrl?.let { url ->
                        Surface(shape = RoundedCornerShape(7.dp), color = TokenTealWash,
                            modifier = Modifier.clip(RoundedCornerShape(7.dp)).clickable { onOpenUrl(url) }) {
                            Text("Vivino ↗", fontSize = 11.sp, color = TokenTeal, fontWeight = FontWeight.Medium,
                                modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp))
                        }
                    }
                    e.wineSearcherUrl?.let { url ->
                        Surface(shape = RoundedCornerShape(7.dp), color = TokenTealWash,
                            modifier = Modifier.clip(RoundedCornerShape(7.dp)).clickable { onOpenUrl(url) }) {
                            Text("Wine-Searcher ↗", fontSize = 11.sp, color = TokenTeal, fontWeight = FontWeight.Medium,
                                modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp))
                        }
                    }
                    scoreText?.let {
                        Text(it, fontSize = 11.sp, color = TokenTeal,
                            style = MaterialTheme.typography.labelSmall.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace))
                    }
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick  = onResearch,
                    modifier = Modifier.weight(1f),
                    shape    = RoundedCornerShape(12.dp),
                    colors   = ButtonDefaults.buttonColors(containerColor = TokenTeal)
                ) {
                    Icon(Icons.Default.AutoAwesome, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Исследовать", maxLines = 1)
                }
                OutlinedButton(
                    onClick  = onAddToCellar,
                    modifier = Modifier.weight(1f),
                    shape    = RoundedCornerShape(12.dp),
                    border   = BorderStroke(1.dp, if (justAdded) TokenTeal else TokenLine),
                    colors   = ButtonDefaults.outlinedButtonColors(contentColor = if (justAdded) TokenTeal else TokenInk)
                ) {
                    Icon(
                        if (justAdded) Icons.Default.Check else Icons.Default.Add,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(if (justAdded) "Добавлено" else "В погреб", maxLines = 1)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = onPickPhoto, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Default.Image, contentDescription = null, tint = TokenInk3, modifier = Modifier.size(15.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Подобрать фото", fontSize = 12.5.sp, color = TokenInk2, maxLines = 1)
                }
                TextButton(onClick = onExternal, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Default.ContentCopy, contentDescription = null, tint = TokenInk3, modifier = Modifier.size(15.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Внешнее исследование", fontSize = 12.5.sp, color = TokenInk2, maxLines = 1)
                }
            }
        }
    }
}

// ── Edit recognized wine ──────────────────────────────────────────────────────
@Composable
private fun EditRecognizedWineDialog(
    wine:      WineRecognitionResult,
    onConfirm: (WineRecognitionResult) -> Unit,
    onDismiss: () -> Unit,
) {
    var producer by remember { mutableStateOf(wine.producer) }
    var name     by remember { mutableStateOf(wine.name) }
    var vintage  by remember { mutableStateOf(wine.vintageYear?.toString() ?: "") }
    var region   by remember { mutableStateOf(wine.region ?: "") }
    var country  by remember { mutableStateOf(wine.country ?: "") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Исправить распознавание") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(value = producer, onValueChange = { producer = it },
                    label = { Text("Производитель") }, singleLine = true)
                OutlinedTextField(value = name, onValueChange = { name = it },
                    label = { Text("Название") }, singleLine = true)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(value = vintage, onValueChange = { vintage = it.filter { c -> c.isDigit() }.take(4) },
                        label = { Text("Год") }, singleLine = true, modifier = Modifier.weight(1f))
                    OutlinedTextField(value = country, onValueChange = { country = it },
                        label = { Text("Страна") }, singleLine = true, modifier = Modifier.weight(1f))
                }
                OutlinedTextField(value = region, onValueChange = { region = it },
                    label = { Text("Регион") }, singleLine = true)
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onConfirm(wine.copy(
                        producer    = producer.trim(),
                        name        = name.trim(),
                        vintageYear = vintage.toIntOrNull(),
                        region      = region.trim().ifBlank { null },
                        country     = country.trim().ifBlank { null },
                    ))
                },
                shape  = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(containerColor = TokenTeal),
            ) { Text("Сохранить", color = Color.White) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Отмена") } },
    )
}

// ── Photo candidates picker ───────────────────────────────────────────────────
@Composable
private fun PhotoCandidatesDialog(
    state:     PhotoCandidatesState,
    onSelect:  (WineRecognitionResult, String) -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Выберите фото") },
        text = {
            when (state) {
                is PhotoCandidatesState.Loading -> {
                    Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = TokenTeal)
                    }
                }
                is PhotoCandidatesState.Loaded -> {
                    if (state.images.isEmpty()) {
                        Text("Картинки не найдены", color = TokenInk3)
                    } else {
                        LazyVerticalGrid(
                            columns = GridCells.Fixed(2),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.heightIn(max = 420.dp),
                        ) {
                            items(state.images.size) { i ->
                                AsyncImage(
                                    model              = state.images[i],
                                    contentDescription = null,
                                    contentScale       = ContentScale.Fit,
                                    modifier           = Modifier
                                        .aspectRatio(0.75f)
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(Color.White)
                                        .clickable { onSelect(state.wine, state.images[i]) }
                                )
                            }
                        }
                    }
                }
                else -> {}
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("Отмена") } },
    )
}

@Composable
private fun AddToCellarDialog(
    wine:      WineRecognitionResult,
    onConfirm: (Int) -> Unit,
    onDismiss: () -> Unit,
) {
    var quantity by remember { mutableStateOf(1) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Добавить в погреб") },
        text  = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("${wine.producer} ${wine.name}".trim(),
                    style = MaterialTheme.typography.bodyMedium)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Text("Количество:", style = MaterialTheme.typography.bodyMedium)
                    IconButton(
                        onClick  = { if (quantity > 1) quantity-- },
                        modifier = Modifier.size(36.dp),
                    ) { Icon(Icons.Default.Remove, contentDescription = null) }
                    Text("$quantity", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    IconButton(
                        onClick  = { quantity++ },
                        modifier = Modifier.size(36.dp),
                    ) { Icon(Icons.Default.Add, contentDescription = null) }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(quantity) },
                shape   = RoundedCornerShape(10.dp),
                colors  = ButtonDefaults.buttonColors(containerColor = TokenTeal)
            ) { Text("Добавить", color = Color.White) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Отмена") }
        },
    )
}

