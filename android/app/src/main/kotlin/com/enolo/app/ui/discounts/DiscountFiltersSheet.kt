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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.enolo.app.data.dto.StoreDto
import com.enolo.app.data.repository.DiscountFilters
import com.enolo.app.ui.components.FilterChipGroup
import com.enolo.app.ui.components.FilterPillChip
import com.enolo.app.ui.components.FilterSectionLabel
import com.enolo.app.ui.components.MerloticSheet
import com.enolo.app.ui.components.SheetDragHandle
import com.enolo.app.ui.theme.TokenFill as Fill
import com.enolo.app.ui.theme.TokenInk as Ink
import com.enolo.app.ui.theme.TokenLine as Line
import com.enolo.app.ui.theme.TokenTeal as Teal

// ─── Sheet ───────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
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
    var monosort      by remember { mutableStateOf(current.monosort) }

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
        scrimColor       = MerloticSheet.ScrimColor,
        shape            = MerloticSheet.Shape,
        dragHandle       = { SheetDragHandle() },
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
                    fontSize   = 24.sp,
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
                FilterChipGroup(
                    label    = "Тип вина",
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
                FilterChipGroup(
                    label    = "Цена",
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
                FilterChipGroup(
                    label    = "Размер скидки",
                    options  = listOf("20" to "20%+", "30" to "30%+", "40" to "40%+", "50" to "50%+"),
                    selected = if (discPreset.isEmpty()) emptySet() else setOf(discPreset),
                    onToggle = { discPreset = if (discPreset == it) "" else it },
                )

                // Страна (single-select)
                if (availableCountries.isNotEmpty()) {
                    FilterChipGroup(
                        label    = "Страна",
                        options  = availableCountries.map { it to it },
                        selected = if (country.isBlank()) emptySet() else setOf(country),
                        onToggle = { country = if (country == it) "" else it },
                    )
                }

                // Сорта винограда + тумблер «только моносортовые» (взаимосвязаны)
                if (availableGrapes.isNotEmpty()) {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        FilterSectionLabel("Сорта винограда")
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment     = Alignment.CenterVertically,
                        ) {
                            Text("Только моносортовые", fontSize = 14.sp, color = Ink)
                            Switch(
                                checked         = monosort,
                                onCheckedChange = { monosort = it },
                                colors = SwitchDefaults.colors(
                                    checkedThumbColor    = Color.White,
                                    checkedTrackColor    = Teal,
                                    uncheckedThumbColor  = Color.White,
                                    uncheckedTrackColor  = Fill,
                                    uncheckedBorderColor = Line,
                                ),
                            )
                        }
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalArrangement   = Arrangement.spacedBy(10.dp),
                        ) {
                            availableGrapes.forEach { grape ->
                                FilterPillChip(label = grape, selected = grape in selectedGrapes) {
                                    selectedGrapes = if (grape in selectedGrapes)
                                        selectedGrapes - grape
                                    else
                                        selectedGrapes + grape
                                }
                            }
                        }
                    }
                }

                // Продавец
                if (stores.isNotEmpty()) {
                    FilterChipGroup(
                        label    = "Продавец",
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
                        monosort       = false
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
                                monosort    = monosort,
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
