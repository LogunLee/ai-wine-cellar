package com.enolo.app.ui.home

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.enolo.app.data.dto.WineInfo
import com.enolo.app.data.dto.WineResearchResult
import com.enolo.app.util.Formatters

@Composable
fun ResearchDialog(
    state: ResearchUiState,
    onDismiss: () -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .fillMaxHeight(0.85f),
            shape = MaterialTheme.shapes.large,
            tonalElevation = 6.dp
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // Toolbar
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Исследование вина",
                        style = MaterialTheme.typography.titleLarge,
                        modifier = Modifier.weight(1f)
                    )
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = "Закрыть")
                    }
                }

                HorizontalDivider()

                when (state) {
                    is ResearchUiState.Loading -> {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(16.dp)
                            ) {
                                CircularProgressIndicator()
                                Text(
                                    text = "Исследую вино…",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Text(
                                    text = "Это может занять до минуты",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                    is ResearchUiState.Error -> {
                        Box(
                            modifier = Modifier.fillMaxSize().padding(24.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = state.message,
                                color = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                    is ResearchUiState.Result -> {
                        ResearchContent(
                            result = state.data,
                            modifier = Modifier
                                .fillMaxSize()
                                .verticalScroll(rememberScrollState())
                                .padding(16.dp)
                        )
                    }
                    else -> {}
                }
            }
        }
    }
}

@Composable
private fun ResearchContent(result: WineResearchResult, modifier: Modifier = Modifier) {
    val w = result.wine
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        // Header
        w.fullName?.let {
            Text(it, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        }

        // Confidence badge
        val (confText, confColor) = when (result.confidence.lowercase()) {
            "high" -> "Высокая точность" to MaterialTheme.colorScheme.primary
            "medium" -> "Средняя точность" to MaterialTheme.colorScheme.secondary
            else -> "Низкая точность" to MaterialTheme.colorScheme.error
        }
        Text(confText, style = MaterialTheme.typography.labelMedium, color = confColor)

        HorizontalDivider()

        // Main info
        WineInfoSection(w)

        // Notes
        if (result.notes.isNotEmpty()) {
            SectionTitle("Примечания")
            result.notes.forEach { note ->
                Text("• $note", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun WineInfoSection(w: WineInfo) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        w.producer?.let { InfoRow("Производитель", it) }
        w.country?.let { InfoRow("Страна", it) }
        w.region?.let { InfoRow("Регион", it) }
        w.appellation?.let { InfoRow("Апелласьон", it) }
        w.vintage?.let { InfoRow("Урожай", it) }
        w.wineType?.let { InfoRow("Тип", Formatters.wineTypeRu(it)) }
        w.grapes?.takeIf { it.isNotEmpty() }?.let { InfoRow("Сорта", it.joinToString(", ")) }
        w.alcohol?.let { InfoRow("Алкоголь", "$it%") }
        w.sugar?.let { InfoRow("Сахар", it) }
        w.acidity?.let { InfoRow("Кислотность", it) }
        w.style?.let { InfoRow("Стиль", it) }
        w.aging?.let { InfoRow("Выдержка", it) }
        w.servingTemperature?.let { InfoRow("Температура подачи", it) }
        w.storagePotential?.let { InfoRow("Потенциал хранения", it) }
        w.tastingProfile?.let {
            SectionTitle("Вкусовой профиль")
            Text(it, style = MaterialTheme.typography.bodySmall)
        }
        w.foodPairing?.takeIf { it.isNotEmpty() }?.let {
            InfoRow("Гастрономия", it.joinToString(", "))
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = "$label:",
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(140.dp)
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(top = 4.dp)
    )
}
