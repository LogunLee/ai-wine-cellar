package com.enolo.app.ui.home

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.enolo.app.data.dto.CellarItemDto
import com.enolo.app.data.dto.DiscountOfferDto
import com.enolo.app.data.dto.WineRecognitionResult
import com.enolo.app.ui.theme.*
import com.enolo.app.util.Formatters
import java.io.File

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onNavigateToDiscounts: () -> Unit = {},
    onNavigateToCellar:    () -> Unit = {},
    viewModel: HomeViewModel = hiltViewModel()
) {
    val query         by viewModel.query.collectAsState()
    val uiState       by viewModel.uiState.collectAsState()
    val researchState by viewModel.researchState.collectAsState()
    val imageLoading  by viewModel.imageLoading.collectAsState()
    val topDeals      by viewModel.topDeals.collectAsState()
    val dealsLoading  by viewModel.dealsLoading.collectAsState()
    val cellarCount   by viewModel.cellarCount.collectAsState()
    val whatToOpen    by viewModel.whatToOpen.collectAsState()

    val context = LocalContext.current

    val addToCellarSuccess by viewModel.addToCellarSuccess.collectAsState()

    var showWhatToOpen  by remember { mutableStateOf(false) }
    var showQuickNote   by remember { mutableStateOf(false) }
    var cameraUri       by remember { mutableStateOf<Uri?>(null) }
    var showPermDialog  by remember { mutableStateOf(false) }
    var cellarItemsList by remember { mutableStateOf<List<CellarItemDto>>(emptyList()) }
    var pendingAddWine  by remember { mutableStateOf<WineRecognitionResult?>(null) }

    // Gallery
    val galleryLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri: Uri? -> uri?.let { viewModel.onImagePicked(it) } }

    // Camera
    val cameraLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicture()
    ) { ok -> if (ok) cameraUri?.let { viewModel.onImagePicked(it) } }

    val cameraPermLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            cameraUri = createTempUri(context)
            cameraUri?.let { cameraLauncher.launch(it) }
        } else showPermDialog = true
    }

    fun launchCamera() {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED) {
            cameraUri = createTempUri(context)
            cameraUri?.let { cameraLauncher.launch(it) }
        } else cameraPermLauncher.launch(Manifest.permission.CAMERA)
    }

    // Dialogs
    if (addToCellarSuccess) {
        LaunchedEffect(Unit) { viewModel.clearAddToCellarSuccess() }
    }

    pendingAddWine?.let { wine ->
        AddToCellarDialog(
            wine      = wine,
            onConfirm = { qty -> viewModel.addToCellar(wine, qty); pendingAddWine = null },
            onDismiss = { pendingAddWine = null },
        )
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

    if (showWhatToOpen) {
        WhatToOpenSheet(
            state               = whatToOpen,
            photoUrl            = { path -> viewModel.absolutePhotoUrl(path) },
            onGetRecommendation = { mood, food -> viewModel.getRecommendation(mood, food) },
            onDismiss           = { showWhatToOpen = false; viewModel.clearWhatToOpen() }
        )
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

        LazyColumn(
            contentPadding = PaddingValues(bottom = 24.dp)
        ) {
            // Search field — always at top
            item {
                SearchField(
                    query        = query,
                    imageLoading = imageLoading,
                    onQueryChange  = viewModel::onQueryChange,
                    onClearQuery   = viewModel::clearResults,
                    onGalleryClick = { galleryLauncher.launch("image/*") },
                    onCameraClick  = { launchCamera() },
                    modifier = Modifier.padding(horizontal = 18.dp, vertical = 14.dp)
                )
            }

            if (isIdle) {
                // ── TOP DEALS ────────────────────────────────────────────────
                item {
                    SectionHeader(
                        label     = "ТОП СКИДОК ДНЯ",
                        actionLabel = "Все скидки",
                        onAction  = onNavigateToDiscounts,
                        modifier  = Modifier.padding(horizontal = 18.dp)
                    )
                    Spacer(Modifier.height(12.dp))
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
                    Spacer(Modifier.height(24.dp))
                }

                // ── WHAT TO OPEN ─────────────────────────────────────────────
                item {
                    WhatToOpenButton(
                        onClick  = { showWhatToOpen = true },
                        modifier = Modifier.padding(horizontal = 18.dp)
                    )
                    Spacer(Modifier.height(24.dp))
                }

                // ── CELLAR + QUICK NOTE ──────────────────────────────────────
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
                            onClick  = { showQuickNote = true },
                            modifier = Modifier.weight(1f)
                        )
                    }
                    Spacer(Modifier.height(16.dp))
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
                                wine         = wine,
                                onResearch   = { viewModel.researchWine(wine) },
                                onAddToCellar = { pendingAddWine = wine },
                                justAdded    = addToCellarSuccess,
                                modifier     = Modifier.padding(horizontal = 18.dp, vertical = 4.dp)
                            )
                        }
                    }
                    else -> {}
                }
            }
        }
    }
}

// ── Top bar ──────────────────────────────────────────────────────────────────
@Composable
private fun HomeTopBar() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(TokenBg)
            .padding(horizontal = 18.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Logo + wordmark
        AsyncImage(
            model             = "file:///android_asset/logo.png",
            contentDescription = "Merlotic",
            contentScale       = ContentScale.Crop,
            modifier           = Modifier
                .size(30.dp)
                .clip(RoundedCornerShape(9.dp))
        )
        Spacer(Modifier.width(8.dp))
        Text(
            text  = "Merlotic",
            style = MaterialTheme.typography.titleLarge.copy(
                fontWeight    = FontWeight.SemiBold,
                fontSize      = 21.sp,
                letterSpacing = (-0.42).sp
            ),
            color = TokenInk
        )
        Spacer(Modifier.weight(1f))

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
    onGalleryClick: () -> Unit,
    onCameraClick:  () -> Unit,
    modifier:       Modifier = Modifier
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape    = RoundedCornerShape(16.dp),
        color    = TokenCard,
        border   = BorderStroke(1.dp, TokenLine),
        shadowElevation = 1.dp
    ) {
        Row(
            modifier = Modifier.padding(9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(Icons.Default.Search, contentDescription = null,
                tint = TokenInk3, modifier = Modifier.size(20.dp))

            BasicSearchInput(
                query         = query,
                onQueryChange = onQueryChange,
                onClear       = onClearQuery,
                modifier      = Modifier.weight(1f)
            )

            if (imageLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(42.dp).padding(9.dp),
                    color    = TokenTeal,
                    strokeWidth = 2.dp
                )
            } else {
                // Gallery button
                IconButton(
                    onClick   = onGalleryClick,
                    modifier  = Modifier
                        .size(42.dp)
                        .clip(RoundedCornerShape(11.dp))
                        .background(TokenFill)
                ) {
                    Icon(Icons.Default.PhotoLibrary, contentDescription = "Галерея",
                        tint = TokenInk2, modifier = Modifier.size(20.dp))
                }
                // Camera button
                IconButton(
                    onClick  = onCameraClick,
                    modifier = Modifier
                        .size(42.dp)
                        .clip(RoundedCornerShape(11.dp))
                        .background(TokenTeal)
                ) {
                    Icon(Icons.Default.PhotoCamera, contentDescription = "Камера",
                        tint = Color.White, modifier = Modifier.size(20.dp))
                }
            }
        }
    }
}

@Composable
private fun BasicSearchInput(
    query:         String,
    onQueryChange: (String) -> Unit,
    onClear:       () -> Unit,
    modifier:      Modifier = Modifier
) {
    androidx.compose.foundation.text.BasicTextField(
        value       = query,
        onValueChange = onQueryChange,
        singleLine  = true,
        textStyle   = MaterialTheme.typography.bodyMedium.copy(color = TokenInk),
        modifier    = modifier,
        decorationBox = { inner ->
            Box {
                if (query.isEmpty()) {
                    Text("Вино, производитель, регион…",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TokenInk3)
                }
                inner()
            }
        }
    )
}

// ── Section header ────────────────────────────────────────────────────────────
@Composable
private fun SectionHeader(
    label: String, actionLabel: String,
    onAction: () -> Unit, modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text  = label,
            style = MaterialTheme.typography.labelMedium.copy(
                fontWeight    = FontWeight.Medium,
                letterSpacing = 0.16.sp
            ),
            color = TokenInk3
        )
        TextButton(onClick = onAction, contentPadding = PaddingValues(0.dp)) {
            Text(actionLabel, style = MaterialTheme.typography.labelLarge,
                color = TokenTeal)
        }
    }
}

// ── Deal card ─────────────────────────────────────────────────────────────────
@Composable
private fun DealCard(offer: DiscountOfferDto) {
    val uriHandler = LocalUriHandler.current
    Surface(
        modifier = Modifier.width(165.dp),
        shape    = RoundedCornerShape(16.dp),
        color    = TokenCard,
        border   = BorderStroke(1.dp, TokenLine),
        onClick  = { if (offer.url.isNotBlank()) runCatching { uriHandler.openUri(offer.url) } }
    ) {
        Column {
            // Photo zone 118dp
            Box(
                modifier = Modifier.fillMaxWidth().height(118.dp).background(TokenFill)
            ) {
                if (offer.imageUrl != null) {
                    AsyncImage(
                        model             = offer.imageUrl,
                        contentDescription = null,
                        contentScale       = ContentScale.Fit,
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
                            style = MaterialTheme.typography.labelMedium.copy(
                                fontWeight = FontWeight.SemiBold),
                            color = Color.White,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
                        )
                    }
                }
            }

            // Body
            Column(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 11.dp),
                verticalArrangement = Arrangement.spacedBy(3.dp)
            ) {
                Text(
                    text     = offer.wineName ?: offer.wineNameRaw ?: "—",
                    style    = MaterialTheme.typography.titleSmall.copy(fontSize = 13.5.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    color    = TokenInk
                )
                val detail = listOfNotNull(offer.country, offer.region)
                    .joinToString(", ").ifBlank { offer.wineType?.let { Formatters.wineTypeRu(it) } ?: "" }
                if (detail.isNotBlank()) {
                    Text(detail, style = MaterialTheme.typography.labelSmall,
                        color = TokenInk3, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }

                Spacer(Modifier.height(2.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        text  = "${Formatters.price(offer.currentPrice)} ₽",
                        style = MaterialTheme.typography.labelMedium.copy(
                            fontWeight = FontWeight.SemiBold, fontSize = 15.sp),
                        color = TokenMaroon
                    )
                    offer.oldPrice?.let { old ->
                        Text(
                            text  = "${Formatters.price(old)} ₽",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 12.sp),
                            color = TokenInk3,
                            textDecoration = TextDecoration.LineThrough
                        )
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(offer.sellerName,
                        style = MaterialTheme.typography.labelSmall, color = TokenInk3,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f))
                    Icon(Icons.Default.ChevronRight, contentDescription = null,
                        tint = TokenInk3, modifier = Modifier.size(14.dp))
                }
            }
        }
    }
}

// ── "What to open?" button ────────────────────────────────────────────────────
@Composable
private fun WhatToOpenButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape    = RoundedCornerShape(16.dp),
        color    = TokenTealWash,
        border   = BorderStroke(1.dp, TokenMintBorder),
        onClick  = onClick
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 15.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Spark icon in rounded box
            Surface(
                modifier = Modifier.size(40.dp),
                shape    = RoundedCornerShape(11.dp),
                color    = TokenTeal
            ) {
                Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                    Icon(Icons.Default.AutoAwesome, contentDescription = null,
                        tint = Color.White, modifier = Modifier.size(22.dp))
                }
            }

            Column(modifier = Modifier.weight(1f)) {
                Text("Что открыть?",
                    style = MaterialTheme.typography.titleSmall.copy(fontSize = 16.sp),
                    color = TokenTealInk)
                Text("Подбор по настроению и блюду из вашего погреба",
                    style = MaterialTheme.typography.bodySmall,
                    color = TokenInk2,
                    maxLines = 2)
            }

            Icon(Icons.Default.ChevronRight, contentDescription = null, tint = TokenTeal)
        }
    }
}

// ── Cellar widget ─────────────────────────────────────────────────────────────
@Composable
private fun CellarWidget(count: Int, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier.height(108.dp),
        shape    = RoundedCornerShape(16.dp),
        color    = TokenCard,
        border   = BorderStroke(1.dp, TokenLine),
        onClick  = onClick
    ) {
        Column(modifier = Modifier
            .fillMaxSize()
            .padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text  = "ПОГРЕБ",
                    style = MaterialTheme.typography.labelMedium,
                    color = TokenInk3
                )
                Icon(Icons.Default.ChevronRight, contentDescription = null,
                    tint = TokenInk3, modifier = Modifier.size(16.dp))
            }
            Spacer(Modifier.weight(1f))
            Text(
                text  = "$count",
                style = MaterialTheme.typography.displaySmall,
                color = TokenInk
            )
            Text(
                text  = "бутылок",
                style = MaterialTheme.typography.labelSmall,
                color = TokenInk3
            )
        }
    }
}

// ── Quick note widget ─────────────────────────────────────────────────────────
@Composable
private fun QuickNoteWidget(onClick: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier.height(108.dp),
        shape    = RoundedCornerShape(16.dp),
        color    = TokenCard,
        border   = BorderStroke(1.dp, TokenLine),
        onClick  = onClick
    ) {
        Column(
            modifier = Modifier.fillMaxSize().padding(14.dp)
        ) {
            Text(
                text  = "БЫСТРАЯ ЗАМЕТКА",
                style = MaterialTheme.typography.labelMedium,
                color = TokenInk3
            )
            Spacer(Modifier.weight(1f))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Surface(
                    modifier = Modifier.size(36.dp),
                    shape    = RoundedCornerShape(10.dp),
                    color    = TokenTealWash,
                    border   = BorderStroke(1.dp, TokenMintBorder)
                ) {
                    Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                        Icon(Icons.Default.Mic, contentDescription = null,
                            tint = TokenTeal, modifier = Modifier.size(18.dp))
                    }
                }
                Text("текст или голос",
                    style = MaterialTheme.typography.labelSmall, color = TokenInk3)
            }
        }
    }
}

// ── Search result card ────────────────────────────────────────────────────────
@Composable
private fun WineResultCard(
    wine:          WineRecognitionResult,
    onResearch:    () -> Unit,
    onAddToCellar: () -> Unit,
    justAdded:     Boolean = false,
    modifier:      Modifier = Modifier,
) {
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
                wine.country
            )
            if (details.isNotEmpty()) {
                Text(details.joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall, color = TokenInk3)
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
                    Text("Исследовать")
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
                    Text(if (justAdded) "Добавлено" else "В погреб")
                }
            }
        }
    }
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

private fun createTempUri(context: Context): Uri {
    val f = File(context.cacheDir, "cam_${System.currentTimeMillis()}.jpg")
    return FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", f)
}
