package com.enolo.app.ui.discounts

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.isSpecified
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import coil.compose.rememberAsyncImagePainter
import com.enolo.app.data.dto.DiscountOfferDto
import com.enolo.app.ui.components.MerloticSearchBar
import com.enolo.app.ui.components.MerloticSheet
import com.enolo.app.ui.components.MerloticTopBar
import com.enolo.app.ui.components.SheetDragHandle
import com.enolo.app.ui.theme.TokenFill as Fill
import com.enolo.app.ui.theme.TokenGreenDot as GreenDot
import com.enolo.app.ui.theme.TokenInk as Ink
import com.enolo.app.ui.theme.TokenInk2 as Ink2
import com.enolo.app.ui.theme.TokenInk3 as Ink3
import com.enolo.app.ui.theme.TokenLine as Line
import com.enolo.app.ui.theme.TokenMaroon as Maroon
import com.enolo.app.ui.theme.TokenRed as Red
import com.enolo.app.ui.theme.TokenTeal as Teal
import com.enolo.app.ui.theme.TokenTealWash as TealWash
import com.enolo.app.ui.theme.TokenYellow as Yellow
import com.enolo.app.util.Formatters

// ─── Screen ──────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiscountsScreen(viewModel: DiscountsViewModel = hiltViewModel()) {
    val uiState      by viewModel.uiState.collectAsState()
    val filters      by viewModel.filters.collectAsState()
    val stores       by viewModel.stores.collectAsState()
    val filterOptions by viewModel.filterOptions.collectAsState()

    val listState      = rememberLazyListState()
    var showFilters    by remember { mutableStateOf(false) }
    var showSortSheet  by remember { mutableStateOf(false) }
    var searchText     by remember { mutableStateOf(filters.search) }

    val activePresets = remember(filters) { filters.activePresetKeys() }
    val filterCount   = remember(filters) { filters.activeFilterCount() }

    // Infinite scroll
    val shouldLoadMore by remember {
        derivedStateOf {
            val info  = listState.layoutInfo
            val total = info.totalItemsCount
            if (total == 0) false
            else info.visibleItemsInfo.lastOrNull()?.index?.let { it >= total - 5 } ?: false
        }
    }
    LaunchedEffect(shouldLoadMore) {
        if (shouldLoadMore && !uiState.isLoading && !uiState.isLoadingMore && uiState.hasMore) {
            viewModel.loadMore()
        }
    }

    // Filter sheet
    if (showFilters) {
        DiscountFiltersSheet(
            current          = filters,
            stores           = stores,
            total            = uiState.total,
            availableGrapes  = filterOptions.grapes,
            availableCountries = filterOptions.countries,
            onApply   = { newFilters -> viewModel.applyFilters(newFilters); showFilters = false },
            onDismiss = { showFilters = false },
        )
    }

    // Sort bottom sheet
    if (showSortSheet) {
        SortBottomSheet(
            currentSort     = filters.sort,
            onSortSelected  = { viewModel.setSort(it); showSortSheet = false },
            onDismiss       = { showSortSheet = false },
        )
    }

    Column(modifier = Modifier.fillMaxSize().background(Color.White)) {

        // ── White block: top bar + search + quick-filters ────────────────────
        Column {
            DiscountsTopBar(
                total       = uiState.total,
                lastUpdated = uiState.lastUpdated,
            )
            DiscountSearchBar(
                value         = searchText,
                onValueChange = { v -> searchText = v; viewModel.onSearchChange(v) },
                onClear       = { searchText = ""; viewModel.onSearchChange("") },
            )
            QuickFiltersRow(
                activePresets    = activePresets,
                filterCount      = filterCount,
                currentSort      = filters.sort,
                onSortClick      = { showSortSheet = true },
                onFilterClick    = { showFilters = true },
                onPresetToggle   = { viewModel.togglePreset(it) },
            )
        }

        // ── Content ──────────────────────────────────────────────────────────
        androidx.compose.material3.pulltorefresh.PullToRefreshBox(
            isRefreshing = uiState.isLoading && uiState.items.isNotEmpty(),
            onRefresh    = { viewModel.refresh() },
            modifier     = Modifier.weight(1f),
        ) {
            when {
                uiState.isLoading && uiState.items.isEmpty() -> {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Teal, modifier = Modifier.size(36.dp))
                    }
                }
                uiState.error != null && uiState.items.isEmpty() -> {
                    Column(
                        Modifier.fillMaxSize().padding(32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Text(uiState.error!!, color = Red, fontSize = 14.sp)
                        Spacer(Modifier.height(16.dp))
                        Button(
                            onClick = { viewModel.refresh() },
                            colors  = ButtonDefaults.buttonColors(containerColor = Teal),
                            shape   = RoundedCornerShape(12.dp),
                        ) { Text("Повторить", color = Color.White) }
                    }
                }
                else -> {
                    LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                        items(uiState.items, key = { it.id }) { offer ->
                            DiscountOfferRow(offer = offer)
                        }
                        if (uiState.isLoadingMore) {
                            item {
                                Box(
                                    Modifier.fillMaxWidth().padding(16.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    CircularProgressIndicator(
                                        color       = Teal,
                                        modifier    = Modifier.size(24.dp),
                                        strokeWidth = 2.dp,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// ─── Header ──────────────────────────────────────────────────────────────────

@Composable
private fun DiscountsTopBar(total: Int, lastUpdated: String?) {
    MerloticTopBar(title = "Скидки") {
        Column(horizontalAlignment = Alignment.End) {
            if (lastUpdated != null) {
                Text("Последнее обновление", fontSize = 12.5.sp, lineHeight = 15.sp, color = Ink3)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                    modifier = Modifier.padding(top = 1.dp),
                ) {
                    Box(Modifier.size(7.dp).clip(CircleShape).background(GreenDot))
                    Text(formatLastUpdated(lastUpdated), fontSize = 12.5.sp, lineHeight = 15.sp, color = Ink2)
                }
            } else if (total > 0) {
                Text("$total ${pluralOffers(total)}", fontSize = 12.5.sp, lineHeight = 15.sp, color = Ink3)
            }
        }
    }
}

@Composable
private fun DiscountSearchBar(
    value         : String,
    onValueChange : (String) -> Unit,
    onClear       : () -> Unit,
) {
    MerloticSearchBar(
        value         = value,
        onValueChange = onValueChange,
        onClear       = onClear,
        placeholder   = "Поиск по названию или производителю",
        modifier      = Modifier.padding(top = 3.5.dp, bottom = 10.dp),
    )
}

// ─── Quick-filter row (with sort button) ─────────────────────────────────────

@Composable
private fun QuickFiltersRow(
    activePresets  : Set<String>,
    filterCount    : Int,
    currentSort    : String,
    onSortClick    : () -> Unit,
    onFilterClick  : () -> Unit,
    onPresetToggle : (String) -> Unit,
) {
    val hasActive = filterCount > 0
    val sortIsDefault = currentSort == "discountPercent_desc"
    // Ничего не закреплено: сортировка, фильтры и пресеты — единая прокручиваемая лента.
    LazyRow(
        modifier              = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 12.dp),
        verticalAlignment     = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // Sort icon button (active when non-default sort)
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

        // "Фильтры" pill — активный сплошной зелёный
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
                        imageVector        = Icons.Default.Tune,
                        contentDescription = null,
                        modifier           = Modifier.size(14.dp),
                        tint               = if (hasActive) Color.White else Ink2,
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

        // Preset chips — с цветной точкой типа вина
        items(QUICK_PRESETS, key = { it.key }) { preset ->
            val active = preset.key in activePresets
            val dot    = presetDotColor(preset.key)
            Surface(
                onClick  = { onPresetToggle(preset.key) },
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
                        text       = preset.label,
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
private fun presetDotColor(key: String): Color? = when (key) {
    "RED"       -> Color(0xFF8B1A2A)
    "WHITE"     -> Yellow
    "SPARKLING" -> GreenDot
    "ROSE"      -> Color(0xFFC2185B)
    else        -> null
}

// ─── Sort bottom sheet ────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SortBottomSheet(
    currentSort    : String,
    onSortSelected : (String) -> Unit,
    onDismiss      : () -> Unit,
) {
    val sortOptions = listOf(
        "discountPercent_desc" to "По размеру скидки",
        "currentPrice_asc"    to "Сначала дешёвые",
        "currentPrice_desc"   to "Сначала дорогие",
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

// ─── List row ────────────────────────────────────────────────────────────────

@Composable
private fun DiscountOfferRow(offer: DiscountOfferDto) {
    val uriHandler = LocalUriHandler.current
    Column(modifier = Modifier.background(Color.White)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable {
                    if (offer.url.isNotBlank()) runCatching { uriHandler.openUri(offer.url) }
                }
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalAlignment = Alignment.Top,
        ) {
            // ── Thumbnail 64×80dp ────────────────────────────────────────────
            BoxWithConstraints(modifier = Modifier.size(width = 64.dp, height = 80.dp)) {
                if (!offer.imageUrl.isNullOrBlank()) {
                    val painter   = rememberAsyncImagePainter(offer.imageUrl)
                    val intrinsic = painter.intrinsicSize
                    val boxWpx    = constraints.maxWidth.toFloat()
                    val boxHpx    = constraints.maxHeight.toFloat()
                    // Кроп заполняет ширину; для длинных фото точка на 40% от низа — в центр
                    val vBias = if (intrinsic.isSpecified && intrinsic.width > 0f && intrinsic.height > 0f) {
                        val h = intrinsic.height * (boxWpx / intrinsic.width)
                        if (h <= boxHpx) 0f else (0.2f * h / (h - boxHpx)).coerceIn(-1f, 1f)
                    } else 1f
                    Image(
                        painter            = painter,
                        contentDescription = null,
                        contentScale       = ContentScale.Crop,
                        alignment          = BiasAlignment(0f, vBias),
                        modifier           = Modifier.fillMaxSize().clip(RoundedCornerShape(13.dp)).background(Color.White),
                    )
                } else {
                    Box(Modifier.fillMaxSize().clip(RoundedCornerShape(13.dp)).background(Fill))
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            // ── Info column: компактно, цена сразу под типом/страной ──────────
            Column(
                modifier            = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                // Top: name (+ discount chip справа сверху) + type/country
                Column {
                    val displayName = offer.fullName ?: offer.wineName ?: offer.wineNameRaw ?: "—"
                    val pct = offer.discountPercent ?: 0
                    Row(verticalAlignment = Alignment.Top) {
                        Text(
                            text       = displayName,
                            fontSize   = 13.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines   = 2,
                            overflow   = TextOverflow.Ellipsis,
                            color      = Ink,
                            lineHeight = 17.sp,
                            modifier   = Modifier.weight(1f),
                        )
                        if (pct > 0) {
                            Spacer(Modifier.width(8.dp))
                            Surface(
                                color           = Red,
                                shape           = RoundedCornerShape(7.dp),
                                shadowElevation = 2.dp,
                            ) {
                                Text(
                                    text       = "-$pct%",
                                    modifier   = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                    fontSize   = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color      = Color.White,
                                )
                            }
                        }
                    }
                    val sub = listOfNotNull(
                        Formatters.wineTypeRu(offer.wineType).takeIf { it.isNotBlank() },
                        offer.country,
                    ).joinToString(" · ")
                    if (sub.isNotBlank()) {
                        Text(
                            text       = sub,
                            fontSize   = 11.5.sp,
                            maxLines   = 1,
                            overflow   = TextOverflow.Ellipsis,
                            color      = Ink3,
                            lineHeight = 15.sp,
                        )
                    }
                }

                // Bottom: prices + seller
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text       = "${Formatters.price(offer.currentPrice)} ₽",
                        fontFamily = FontFamily.Monospace,
                        fontSize   = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        color      = Maroon,
                    )
                    val oldP = offer.oldPrice
                    if (oldP != null && oldP > offer.currentPrice) {
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text           = "${Formatters.price(oldP)} ₽",
                            fontFamily     = FontFamily.Monospace,
                            fontSize       = 11.sp,
                            color          = Ink3,
                            textDecoration = TextDecoration.LineThrough,
                        )
                    }
                    Spacer(Modifier.weight(1f))
                    Text(
                        text       = offer.sellerName,
                        fontSize   = 11.sp,
                        fontWeight = FontWeight.Medium,
                        color      = Ink2,
                        maxLines   = 1,
                        overflow   = TextOverflow.Ellipsis,
                    )
                    Icon(
                        Icons.Default.ChevronRight,
                        contentDescription = null,
                        tint               = Ink3,
                        modifier           = Modifier.size(14.dp),
                    )
                }
            }
        }
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

private fun pluralOffers(n: Int): String {
    val mod10  = n % 10
    val mod100 = n % 100
    return when {
        mod100 in 11..19 -> "предложений"
        mod10 == 1       -> "предложение"
        mod10 in 2..4    -> "предложения"
        else             -> "предложений"
    }
}

private fun formatLastUpdated(isoString: String): String = try {
    val instant = java.time.Instant.parse(isoString)
    val msk     = instant.atZone(java.time.ZoneId.of("Europe/Moscow"))
    "%02d.%02d.%d в %02d:%02d".format(
        msk.dayOfMonth, msk.monthValue, msk.year, msk.hour, msk.minute,
    )
} catch (_: Exception) { isoString }
