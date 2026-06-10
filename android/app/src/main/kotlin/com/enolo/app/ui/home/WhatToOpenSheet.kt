package com.enolo.app.ui.home

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.enolo.app.data.dto.CellarItemDto
import com.enolo.app.ui.theme.*
import com.enolo.app.util.Formatters

private data class MoodOption(val label: String, val type: String?, val emoji: String)

private val moods = listOf(
    MoodOption("Любое",       null,         "🍷"),
    MoodOption("Лёгкое",      "WHITE",      "🥂"),
    MoodOption("Насыщенное",  "RED",        "🍷"),
    MoodOption("Игристое",    "SPARKLING",  "✨"),
    MoodOption("Розовое",     "ROSE",       "🌸"),
    MoodOption("Десертное",   "SWEET",      "🍯"),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WhatToOpenSheet(
    state: WhatToOpenState,
    photoUrl: (String?) -> String?,
    onGetRecommendation: (moodType: String?, food: String?) -> Unit,
    onDismiss: () -> Unit
) {
    var selectedMood by remember { mutableStateOf(moods[0]) }
    var food by remember { mutableStateOf("") }
    val focusManager = LocalFocusManager.current

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor   = TokenBg
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 18.dp)
                .padding(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            Text("Что открыть?", style = MaterialTheme.typography.titleMedium)

            // Mood chips
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Настроение", style = MaterialTheme.typography.labelMedium,
                    color = TokenInk3)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    moods.forEach { mood ->
                        FilterChip(
                            selected = selectedMood == mood,
                            onClick  = { selectedMood = mood },
                            label    = { Text("${mood.emoji} ${mood.label}") },
                            colors   = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = TokenTealWash,
                                selectedLabelColor     = TokenTeal
                            ),
                            border = FilterChipDefaults.filterChipBorder(
                                enabled          = true,
                                selected         = selectedMood == mood,
                                selectedBorderColor = TokenMintBorder,
                                borderColor      = TokenLine
                            )
                        )
                    }
                }
            }

            // Food pairing
            OutlinedTextField(
                value           = food,
                onValueChange   = { food = it },
                label           = { Text("К какому блюду? (необязательно)") },
                placeholder     = { Text("Стейк, паста, сыр…") },
                singleLine      = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = {
                    focusManager.clearFocus()
                    onGetRecommendation(selectedMood.type, food.trim().takeIf { it.isNotBlank() })
                }),
                modifier = Modifier.fillMaxWidth()
            )

            // Result area
            when (state) {
                is WhatToOpenState.Loading -> {
                    Box(modifier = Modifier.fillMaxWidth().height(120.dp),
                        contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            CircularProgressIndicator(color = TokenTeal)
                            Text("Подбираю из погреба…",
                                style = MaterialTheme.typography.bodySmall,
                                color = TokenInk2)
                        }
                    }
                }
                is WhatToOpenState.Result -> {
                    RecommendationCard(
                        item        = state.item,
                        explanation = state.explanation,
                        photoUrl    = photoUrl(state.item.photoPath)
                    )
                }
                is WhatToOpenState.Empty -> {
                    Text(state.message, style = MaterialTheme.typography.bodyMedium,
                        color = TokenInk2)
                }
                is WhatToOpenState.Error -> {
                    Text(state.message, style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error)
                }
                else -> {}
            }

            // Action button
            Button(
                onClick = {
                    focusManager.clearFocus()
                    onGetRecommendation(
                        selectedMood.type,
                        food.trim().takeIf { it.isNotBlank() }
                    )
                },
                modifier = Modifier.fillMaxWidth(),
                colors   = ButtonDefaults.buttonColors(containerColor = TokenTeal)
            ) {
                Icon(Icons.Default.AutoAwesome, contentDescription = null,
                    modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text("Подобрать")
            }
        }
    }
}

@Composable
private fun RecommendationCard(
    item: CellarItemDto,
    explanation: String,
    photoUrl: String?
) {
    Surface(
        color  = TokenTealWash,
        shape  = MaterialTheme.shapes.medium,
        border = androidx.compose.foundation.BorderStroke(1.dp, TokenMintBorder)
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Photo
            Surface(
                modifier = Modifier.size(72.dp),
                shape    = MaterialTheme.shapes.small,
                color    = TokenFill
            ) {
                if (photoUrl != null) {
                    AsyncImage(model = photoUrl, contentDescription = null,
                        modifier = Modifier.fillMaxSize())
                } else {
                    Box(contentAlignment = Alignment.Center,
                        modifier = Modifier.fillMaxSize()) {
                        Text("🍷", fontSize = 28.sp)
                    }
                }
            }

            Column(modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(item.producer, style = MaterialTheme.typography.labelSmall,
                    color = TokenInk2)
                Text(item.name, style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold, color = TokenTealInk)

                val details = listOfNotNull(
                    item.vintageYear?.toString(),
                    item.wineType?.let { Formatters.wineTypeRu(it) },
                    item.quantity.let { "${it} бут." }
                )
                Text(details.joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall, color = TokenInk2)

                if (explanation.isNotBlank()) {
                    Spacer(Modifier.height(4.dp))
                    Text(explanation,
                        style = MaterialTheme.typography.bodySmall, color = TokenInk2,
                        maxLines = 3,
                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                }
            }
        }
    }
}
