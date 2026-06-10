package com.enolo.app.ui.cellar

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.enolo.app.data.dto.AddWineRequest
import com.enolo.app.data.dto.CellarItemDto

@Composable
fun EditWineDialog(
    item: CellarItemDto? = null,           // null = add new
    onConfirm: (AddWineRequest) -> Unit,
    onDismiss: () -> Unit,
    error: String? = null
) {
    val isEdit = item != null
    var producer     by remember { mutableStateOf(item?.producer ?: "") }
    var name         by remember { mutableStateOf(item?.name ?: "") }
    var vintage      by remember { mutableStateOf(item?.vintageYear?.toString() ?: "") }
    var region       by remember { mutableStateOf(item?.region ?: "") }
    var country      by remember { mutableStateOf(item?.country ?: "") }
    var wineType     by remember { mutableStateOf(item?.wineType ?: "") }
    var quantity     by remember { mutableStateOf(item?.quantity?.toString() ?: "1") }
    var windowFrom   by remember { mutableStateOf(item?.drinkWindowFrom?.toString() ?: "") }
    var windowTo     by remember { mutableStateOf(item?.drinkWindowTo?.toString() ?: "") }
    var validationError by remember { mutableStateOf<String?>(null) }

    val wineTypes = listOf("" to "Не указан", "RED" to "Красное", "WHITE" to "Белое",
        "ROSE" to "Розовое", "SPARKLING" to "Игристое", "SWEET" to "Десертное", "FORTIFIED" to "Креплёное")

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (isEdit) "Редактировать вино" else "Добавить вино") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedTextField(
                    value = producer,
                    onValueChange = { producer = it },
                    label = { Text("Производитель *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Название *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = vintage,
                    onValueChange = { vintage = it.filter { c -> c.isDigit() }.take(4) },
                    label = { Text("Год урожая") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = region,
                    onValueChange = { region = it },
                    label = { Text("Регион") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = country,
                    onValueChange = { country = it },
                    label = { Text("Страна") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                // Wine type chips
                Text("Тип вина", style = MaterialTheme.typography.labelMedium)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    wineTypes.forEach { (value, label) ->
                        FilterChip(
                            selected = wineType == value,
                            onClick = { wineType = value },
                            label = { Text(label, style = MaterialTheme.typography.labelSmall) }
                        )
                    }
                }

                OutlinedTextField(
                    value = quantity,
                    onValueChange = { quantity = it.filter { c -> c.isDigit() }.take(3) },
                    label = { Text("Количество") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                // Drink window
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = windowFrom,
                        onValueChange = { windowFrom = it.filter { c -> c.isDigit() }.take(4) },
                        label = { Text("Открывать с") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                    OutlinedTextField(
                        value = windowTo,
                        onValueChange = { windowTo = it.filter { c -> c.isDigit() }.take(4) },
                        label = { Text("Открывать до") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                }

                val displayError = validationError ?: error
                displayError?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                if (producer.isBlank()) { validationError = "Укажите производителя"; return@TextButton }
                if (name.isBlank()) { validationError = "Укажите название"; return@TextButton }
                validationError = null
                onConfirm(
                    AddWineRequest(
                        producer        = producer.trim(),
                        name            = name.trim(),
                        vintageYear     = vintage.toIntOrNull(),
                        region          = region.trim().takeIf { it.isNotBlank() },
                        country         = country.trim().takeIf { it.isNotBlank() },
                        wineType        = wineType.takeIf { it.isNotBlank() },
                        quantity        = quantity.toIntOrNull() ?: 1,
                        drinkWindowFrom = windowFrom.toIntOrNull(),
                        drinkWindowTo   = windowTo.toIntOrNull(),
                    )
                )
            }) { Text("Сохранить") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Отмена") }
        }
    )
}
