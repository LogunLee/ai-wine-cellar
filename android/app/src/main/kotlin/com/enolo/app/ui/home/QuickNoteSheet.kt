package com.enolo.app.ui.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.enolo.app.data.dto.CellarItemDto
import com.enolo.app.ui.theme.TokenInk2
import com.enolo.app.ui.theme.TokenInk3
import com.enolo.app.ui.theme.TokenTeal

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuickNoteSheet(
    cellarItems: List<CellarItemDto>,
    onSave: (text: String, cellarItemId: String?) -> Unit,
    onDismiss: () -> Unit
) {
    var text by remember { mutableStateOf("") }
    var selectedItemId by remember { mutableStateOf<String?>(null) }
    var showItemPicker by remember { mutableStateOf(false) }

    val selectedItem = cellarItems.find { it.id == selectedItemId }

    ModalBottomSheet(
        onDismissRequest = onDismiss
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 18.dp)
                .padding(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text("Быстрая заметка", style = MaterialTheme.typography.titleMedium)

            OutlinedTextField(
                value         = text,
                onValueChange = { text = it },
                label         = { Text("Ваши впечатления…") },
                modifier      = Modifier.fillMaxWidth().height(120.dp),
                maxLines      = 6
            )

            // Cellar bottle link
            if (cellarItems.isNotEmpty()) {
                if (selectedItem != null) {
                    AssistChip(
                        onClick = { showItemPicker = true },
                        label   = { Text("${selectedItem.producer} ${selectedItem.name}") },
                        leadingIcon = {
                            Icon(Icons.Default.Check, contentDescription = null,
                                modifier = Modifier.size(16.dp))
                        }
                    )
                } else {
                    OutlinedButton(
                        onClick  = { showItemPicker = true },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Привязать к бутылке (необязательно)") }
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick  = onDismiss,
                    modifier = Modifier.weight(1f)
                ) { Text("Отмена") }
                Button(
                    onClick  = { if (text.isNotBlank()) onSave(text, selectedItemId) },
                    enabled  = text.isNotBlank(),
                    modifier = Modifier.weight(1f),
                    colors   = ButtonDefaults.buttonColors(containerColor = TokenTeal)
                ) { Text("Сохранить") }
            }
        }
    }

    if (showItemPicker) {
        ModalBottomSheet(onDismissRequest = { showItemPicker = false }) {
            Column(
                modifier = Modifier.padding(horizontal = 18.dp).padding(bottom = 32.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text("Выберите бутылку", style = MaterialTheme.typography.titleMedium)
                LazyColumn(
                    modifier = Modifier.heightIn(max = 360.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    items(cellarItems) { item ->
                        ListItem(
                            headlineContent  = { Text("${item.producer} ${item.name}") },
                            supportingContent = {
                                val info = listOfNotNull(
                                    item.vintageYear?.toString(),
                                    "${item.quantity} бут."
                                ).joinToString(" · ")
                                Text(info, color = TokenInk2)
                            },
                            trailingContent  = if (item.id == selectedItemId) ({
                                Icon(Icons.Default.Check, contentDescription = null,
                                    tint = TokenTeal)
                            }) else null,
                            modifier = Modifier.clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null
                            ) {
                                selectedItemId = item.id
                                showItemPicker = false
                            }
                        )
                    }
                }
            }
        }
    }
}

