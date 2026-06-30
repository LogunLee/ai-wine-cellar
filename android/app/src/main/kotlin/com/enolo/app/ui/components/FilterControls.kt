package com.enolo.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.enolo.app.ui.theme.TokenInk as Ink
import com.enolo.app.ui.theme.TokenLine as Line
import com.enolo.app.ui.theme.TokenTeal as Teal

/** Заголовок секции в листе фильтров (тёмный, полужирный). */
@Composable
fun FilterSectionLabel(text: String) {
    Text(text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Ink)
}

/** Чип фильтра: выбранный — сплошной зелёный с белой галочкой; невыбранный — белый с обводкой. */
@Composable
fun FilterPillChip(
    label    : String,
    selected : Boolean,
    onClick  : () -> Unit,
) {
    Surface(
        onClick  = onClick,
        shape    = RoundedCornerShape(22.dp),
        color    = if (selected) Teal else Color.White,
        border   = if (selected) null else BorderStroke(1.dp, Line),
        modifier = Modifier.height(42.dp),
    ) {
        Row(
            modifier              = Modifier.padding(horizontal = 16.dp),
            verticalAlignment     = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            if (selected) {
                Icon(Icons.Default.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
            }
            Text(
                text       = label,
                fontSize   = 14.sp,
                fontWeight = FontWeight.Medium,
                color      = if (selected) Color.White else Ink,
            )
        }
    }
}

/** Секция «заголовок + чипы» (FlowRow). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FilterChipGroup(
    label    : String,
    options  : List<Pair<String, String>>,
    selected : Set<String>,
    onToggle : (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        FilterSectionLabel(label)
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement   = Arrangement.spacedBy(10.dp),
        ) {
            options.forEach { (key, optLabel) ->
                FilterPillChip(label = optLabel, selected = key in selected) { onToggle(key) }
            }
        }
    }
}
