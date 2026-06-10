package com.enolo.app.ui.discounts

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.enolo.app.data.dto.StoreDto
import com.enolo.app.data.repository.DiscountFilters

// ─── Design tokens (updated for better contrast) ─────────────────────────────
private val Ink      = Color(0xFF1A1A1D)
private val Ink3     = Color(0xFF787880)
private val Fill     = Color(0xFFEEECE9)
private val Line     = Color(0xFFD6D4CF)
private val Teal     = Color(0xFF1C6F5E)
private val TealWash = Color(0xFFE9F3EE)
private val MintBorder = Color(0xFFD8EAE0)

// ─── Sheet ───────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiscountFiltersSheet(
    current            : DiscountFilters,
    stores             : List<StoreDto>,
    total              : Int,
    availableGrapes    : List<String>,
    availableCountries : List<String>,
    onApply   : (DiscountFilters) -> Unit,
    onDismiss : () -> Unit,
) {
    var sort          by remember { mutableStateOf(current.sort) }
    var wineType      by remember { mutableStateOf(current.wineType) }
    var priceBucket   by remember { mutableStateOf(priceToBucket(current.minPrice, current.maxPrice)) }
    var discPreset    by remember { mutableStateOf(discountToPreset(current.minDiscount)) }
    var seller        by remember { mutableStateOf(current.seller) }
    var country       by remember { mutableStateOf(current.country) }
    var selectedGrapes by remember { mutableStateOf(current.grapes.toSet()) }

    val sheetState  = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val screenH     = LocalConfiguration.current.screenHeightDp.dp
    val maxSheetH   = screenH * 0.88f
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
        sheetState       = sheetState,
        containerColor   = Color.White,
        scrimColor       = Color(0x51141419),
        shape            = RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp),
        dragHandle = {
            Box(
                Modifier
                    .padding(top = 8.dp, bottom = 4.dp)
                    .size(width = 36.dp, height = 4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(Color(0xFFD6D6D4)),
            )
        },
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .heightIn(max = maxSheetH),
        ) {
            // ── Header ──────────────────────────────────────────────────────
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Фильтры",
                    fontSize   = 19.sp,
                    fontWeight = FontWeight.SemiBold,
                    color      = Ink,
                    modifier   = Modifier.weight(1f),
                )
                Box(
                    Modifier
                        .size(34.dp)
                        .clip(CircleShape)
                        .background(Fill)
                        .clickable(onClick = onDismiss),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Default.Close, contentDescription = "Закрыть", modifier = Modifier.size(18.dp), tint = Ink)
                }
            }
            HorizontalDivider(color = Line)

            // ── Scrollable content ──────────────────────────────────────────
            Column(
                Modifier
                    .weight(1f, fill = false)
                    .nestedScroll(swipeBlocker)
                    .verticalScroll(scrollState)
                    .padding(horizontal = 20.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                // Тип вина
                FilterGroup(
                    label    = "ТИП ВИНА",
                    options  = listOf(
                        "RED"       to "Красное",
                        "WHITE"     to "Белое",
                        "ROSE"      to "Розе",
                        "SPARKLING" to "Игристое",
                        "FORTIFIED" to "Креплёное",
                    ),
                    selected = if (wineType.isBlank()) emptySet() else setOf(wineType),
                    onToggle = { wineType = if (wineType == it) "" else it },
                )

                // Цена
                FilterGroup(
                    label    = "ЦЕНА",
                    options  = listOf(
                        "U1000" to "до 1000 ₽",
                        "1K2K"  to "1000–2000 ₽",
                        "2K5K"  to "2000–5000 ₽",
                        "5KP"   to "5000 ₽+",
                    ),
                    selected = if (priceBucket.isEmpty()) emptySet() else setOf(priceBucket),
                    onToggle = { priceBucket = if (priceBucket == it) "" else it },
                )

                // Размер скидки
                FilterGroup(
                    label    = "РАЗМЕР СКИДКИ",
                    options  = listOf("20" to "20%+", "30" to "30%+", "40" to "40%+", "50" to "50%+"),
                    selected = if (discPreset.isEmpty()) emptySet() else setOf(discPreset),
                    onToggle = { discPreset = if (discPreset == it) "" else it },
                )

                // Страна (single-select)
                if (availableCountries.isNotEmpty()) {
                    FilterGroup(
                        label    = "СТРАНА",
                        options  = availableCountries.map { it to it },
                        selected = if (country.isBlank()) emptySet() else setOf(country),
                        onToggle = { country = if (country == it) "" else it },
                    )
                }

                // Сорта винограда (multi-select)
                if (availableGrapes.isNotEmpty()) {
                    FilterGroup(
                        label     = "СОРТА ВИНОГРАДА",
                        options   = availableGrapes.map { it to it },
                        selected  = selectedGrapes,
                        onToggle  = { grape ->
                            selectedGrapes = if (grape in selectedGrapes)
                                selectedGrapes - grape
                            else
                                selectedGrapes + grape
                        },
                    )
                }

                // Магазин
                if (stores.isNotEmpty()) {
                    FilterGroup(
                        label    = "МАГАЗИН",
                        options  = stores.map { it.code to it.name },
                        selected = if (seller.isBlank()) emptySet() else setOf(seller),
                        onToggle = { seller = if (seller == it) "" else it },
                    )
                }
            }

            // ── Sticky footer ───────────────────────────────────────────────
            HorizontalDivider(color = Line)
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp)
                    .navigationBarsPadding(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedButton(
                    onClick  = {
                        wineType       = ""
                        priceBucket    = ""
                        discPreset     = ""
                        seller         = ""
                        country        = ""
                        selectedGrapes = emptySet()
                    },
                    modifier = Modifier.weight(1f),
                    shape    = RoundedCornerShape(12.dp),
                    border   = BorderStroke(1.dp, Line),
                    colors   = ButtonDefaults.outlinedButtonColors(contentColor = Ink),
                ) {
                    Text("Сбросить", fontSize = 14.sp)
                }

                Button(
                    onClick = {
                        val (minP, maxP) = bucketToPrice(priceBucket)
                        onApply(
                            current.copy(
                                wineType    = wineType,
                                minPrice    = minP,
                                maxPrice    = maxP,
                                minDiscount = discPreset.toIntOrNull(),
                                seller      = seller,
                                country     = country,
                                grapes      = selectedGrapes.toList(),
                                page        = 1,
                            )
                        )
                    },
                    modifier = Modifier.weight(2f),
                    shape    = RoundedCornerShape(12.dp),
                    colors   = ButtonDefaults.buttonColors(containerColor = Teal),
                ) {
                    Text(
                        text     = if (total > 0) "Показать $total ${pluralOffersShort(total)}" else "Применить",
                        color    = Color.White,
                        fontSize = 14.sp,
                    )
                }
            }
        }
    }
}

// ─── Filter group ────────────────────────────────────────────────────────────

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FilterGroup(
    label    : String,
    options  : List<Pair<String, String>>,
    selected : Set<String>,
    onToggle : (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            text          = label,
            fontFamily    = FontFamily.Monospace,
            fontSize      = 11.sp,
            fontWeight    = FontWeight.Medium,
            letterSpacing = 0.06.em,
            color         = Ink3,
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement   = Arrangement.spacedBy(8.dp),
        ) {
            options.forEach { (key, optLabel) ->
                val isSelected = key in selected
                Surface(
                    onClick  = { onToggle(key) },
                    shape    = RoundedCornerShape(20.dp),
                    color    = if (isSelected) TealWash else Fill,
                    border   = BorderStroke(
                        width = 1.dp,
                        color = if (isSelected) MintBorder else Color.Transparent,
                    ),
                    modifier = Modifier.height(36.dp),
                ) {
                    Text(
                        text       = optLabel,
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

// ─── Bucket helpers ───────────────────────────────────────────────────────────

private fun priceToBucket(minPrice: Int?, maxPrice: Int?): String = when {
    minPrice == null && maxPrice == 1000 -> "U1000"
    minPrice == 1000 && maxPrice == 2000 -> "1K2K"
    minPrice == 2000 && maxPrice == 5000 -> "2K5K"
    minPrice == 5000 && maxPrice == null -> "5KP"
    else                                 -> ""
}

private fun bucketToPrice(bucket: String): Pair<Int?, Int?> = when (bucket) {
    "U1000" -> null to 1000
    "1K2K"  -> 1000 to 2000
    "2K5K"  -> 2000 to 5000
    "5KP"   -> 5000 to null
    else    -> null to null
}

private fun discountToPreset(minDiscount: Int?): String = when (minDiscount) {
    20 -> "20"; 30 -> "30"; 40 -> "40"; 50 -> "50"; else -> ""
}

private fun pluralOffersShort(n: Int): String {
    val mod10  = n % 10
    val mod100 = n % 100
    return when {
        mod100 in 11..19 -> "предложений"
        mod10 == 1       -> "предложение"
        mod10 in 2..4    -> "предложения"
        else             -> "предложений"
    }
}
