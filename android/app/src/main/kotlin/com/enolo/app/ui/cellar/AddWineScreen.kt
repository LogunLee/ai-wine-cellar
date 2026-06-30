package com.enolo.app.ui.cellar

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AddAPhoto
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import coil.compose.AsyncImage
import com.enolo.app.data.dto.AddWineRequest
import com.enolo.app.ui.theme.TokenFill as Fill
import com.enolo.app.ui.theme.TokenInk as Ink
import com.enolo.app.ui.theme.TokenInk2 as Ink2
import com.enolo.app.ui.theme.TokenInk3 as Ink3
import com.enolo.app.ui.theme.TokenLine as Line
import com.enolo.app.ui.theme.TokenTeal as Teal
import java.io.File

private val WINE_TYPES = listOf(
    "" to "Не указан", "RED" to "Красное", "WHITE" to "Белое", "ROSE" to "Розовое",
    "SPARKLING" to "Игристое", "SWEET" to "Десертное", "FORTIFIED" to "Креплёное",
)

/** Полноэкранная форма добавления вина (заменяет тесную модалку «Ввести вручную»). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddWineScreen(
    onSave: (AddWineRequest, Uri?) -> Unit,
    onDismiss: () -> Unit,
    error: String? = null,
) {
    val context = LocalContext.current

    var producer by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var vintage by remember { mutableStateOf("") }
    var quantity by remember { mutableStateOf("1") }
    var country by remember { mutableStateOf("") }
    var region by remember { mutableStateOf("") }
    var appellation by remember { mutableStateOf("") }
    var wineType by remember { mutableStateOf("") }
    var windowFrom by remember { mutableStateOf("") }
    var windowTo by remember { mutableStateOf("") }
    var price by remember { mutableStateOf("") }
    var currency by remember { mutableStateOf("RUB") }
    var storage by remember { mutableStateOf("") }
    var myDescription by remember { mutableStateOf("") }
    var producerDescription by remember { mutableStateOf("") }
    var sellerDescription by remember { mutableStateOf("") }
    var grapes by remember { mutableStateOf(listOf<String>()) }
    var grapeInput by remember { mutableStateOf("") }
    var photoUri by remember { mutableStateOf<Uri?>(null) }
    var validationError by remember { mutableStateOf<String?>(null) }
    var showPhotoChooser by remember { mutableStateOf(false) }
    var cameraUri by remember { mutableStateOf<Uri?>(null) }

    val galleryLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { photoUri = copyPickedToCache(context, it) ?: it }
    }
    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        if (ok) photoUri = cameraUri
    }
    val cameraPermLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) { val u = createAddTempUri(context); cameraUri = u; cameraLauncher.launch(u) }
    }
    fun launchCamera() {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            val u = createAddTempUri(context); cameraUri = u; cameraLauncher.launch(u)
        } else cameraPermLauncher.launch(Manifest.permission.CAMERA)
    }

    BackHandler { onDismiss() }

    Surface(Modifier.fillMaxSize(), color = Color.White) {
        Column(Modifier.fillMaxSize()) {
            // Top bar
            Row(
                Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onDismiss) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Назад", tint = Ink) }
                Spacer(Modifier.width(4.dp))
                Column {
                    Text("Добавить вино", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Ink)
                    Text("Заполните основную информацию", fontSize = 13.sp, color = Ink3)
                }
            }

            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // Photo + producer/name
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(
                        Modifier.size(width = 96.dp, height = 128.dp).clip(RoundedCornerShape(14.dp))
                            .background(Fill).clickable { showPhotoChooser = true },
                        contentAlignment = Alignment.Center,
                    ) {
                        if (photoUri != null) {
                            AsyncImage(model = photoUri, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                        } else {
                            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Icon(Icons.Default.AddAPhoto, contentDescription = null, tint = Ink3, modifier = Modifier.size(30.dp))
                                Text("Фото", fontSize = 12.sp, color = Ink3)
                            }
                        }
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Field(producer, { producer = it }, "Производитель *")
                        Field(name, { name = it }, "Название *")
                    }
                }

                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Field(vintage, { vintage = it.filter { c -> c.isDigit() }.take(4) }, "Год урожая", Modifier.weight(1f), KeyboardType.Number)
                    Field(quantity, { quantity = it.filter { c -> c.isDigit() }.take(3) }, "Количество", Modifier.weight(1f), KeyboardType.Number)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Field(country, { country = it }, "Страна", Modifier.weight(1f))
                    Field(region, { region = it }, "Регион", Modifier.weight(1f))
                }
                Field(appellation, { appellation = it }, "Апелласьон / субзона")

                // Grapes
                Text("Сорта винограда", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = Ink2)
                if (grapes.isNotEmpty()) {
                    androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        grapes.forEach { g ->
                            Surface(shape = RoundedCornerShape(16.dp), color = Fill) {
                                Row(Modifier.padding(start = 10.dp, end = 6.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Text(g, fontSize = 13.sp, color = Ink)
                                    Spacer(Modifier.width(4.dp))
                                    Icon(Icons.Default.Close, contentDescription = "Удалить", tint = Ink3,
                                        modifier = Modifier.size(15.dp).clickable { grapes = grapes - g })
                                }
                            }
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Field(grapeInput, { grapeInput = it }, "Добавить сорт", Modifier.weight(1f))
                    Button(
                        onClick = {
                            val g = grapeInput.trim()
                            if (g.isNotBlank() && g !in grapes) { grapes = grapes + g; grapeInput = "" }
                        },
                        shape = RoundedCornerShape(10.dp), colors = ButtonDefaults.buttonColors(containerColor = Teal),
                    ) { Text("Добавить", color = Color.White) }
                }

                // Wine type
                Text("Тип вина", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = Ink2)
                androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    WINE_TYPES.forEach { (value, label) ->
                        FilterChip(selected = wineType == value, onClick = { wineType = value }, label = { Text(label, fontSize = 13.sp) })
                    }
                }

                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Field(windowFrom, { windowFrom = it.filter { c -> c.isDigit() }.take(4) }, "Открывать с", Modifier.weight(1f), KeyboardType.Number)
                    Field(windowTo, { windowTo = it.filter { c -> c.isDigit() }.take(4) }, "Открывать до", Modifier.weight(1f), KeyboardType.Number)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Field(price, { price = it.filter { c -> c.isDigit() || c == '.' } }, "Цена покупки", Modifier.weight(2f), KeyboardType.Decimal)
                    Field(currency, { currency = it.take(3).uppercase() }, "Валюта", Modifier.weight(1f))
                }
                Field(storage, { storage = it }, "Место хранения")

                Field(myDescription, { myDescription = it }, "Моё описание (для ИИ-поиска)", singleLine = false)
                Field(producerDescription, { producerDescription = it }, "Описание производителя", singleLine = false)
                Field(sellerDescription, { sellerDescription = it }, "Описание продавца", singleLine = false)

                (validationError ?: error)?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
                }
                Spacer(Modifier.height(4.dp))
            }

            // Bottom actions
            HorizontalDivider(color = Line)
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp).navigationBarsPadding(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp), border = BorderStroke(1.dp, Line)) {
                    Text("Отмена", color = Ink)
                }
                Button(
                    onClick = {
                        if (producer.isBlank()) { validationError = "Укажите производителя"; return@Button }
                        if (name.isBlank()) { validationError = "Укажите название"; return@Button }
                        validationError = null
                        onSave(
                            AddWineRequest(
                                producer = producer.trim(),
                                name = name.trim(),
                                vintageYear = vintage.toIntOrNull(),
                                region = region.trim().takeIf { it.isNotBlank() },
                                appellation = appellation.trim().takeIf { it.isNotBlank() },
                                country = country.trim().takeIf { it.isNotBlank() },
                                wineType = wineType.takeIf { it.isNotBlank() },
                                quantity = quantity.toIntOrNull() ?: 1,
                                grapes = grapes.takeIf { it.isNotEmpty() },
                                drinkWindowFrom = windowFrom.toIntOrNull(),
                                drinkWindowTo = windowTo.toIntOrNull(),
                                userDescription = myDescription.trim().takeIf { it.isNotBlank() },
                                producerDescription = producerDescription.trim().takeIf { it.isNotBlank() },
                                sellerDescription = sellerDescription.trim().takeIf { it.isNotBlank() },
                                purchasePrice = price.toDoubleOrNull(),
                                currency = currency.trim().takeIf { it.isNotBlank() },
                                storageLocation = storage.trim().takeIf { it.isNotBlank() },
                            ),
                            photoUri,
                        )
                    },
                    modifier = Modifier.weight(2f), shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Teal),
                ) { Text("Сохранить", color = Color.White) }
            }
        }
    }

    if (showPhotoChooser) {
        AlertDialog(
            onDismissRequest = { showPhotoChooser = false },
            title = { Text("Фото вина") },
            text = { Text("Выберите источник") },
            confirmButton = {
                Button(onClick = { showPhotoChooser = false; launchCamera() }, shape = RoundedCornerShape(10.dp), colors = ButtonDefaults.buttonColors(containerColor = Teal)) {
                    Text("Камера", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { showPhotoChooser = false; galleryLauncher.launch("image/*") }) { Text("Галерея") }
            },
        )
    }
}

@Composable
private fun Field(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier.fillMaxWidth(),
    keyboardType: KeyboardType = KeyboardType.Text,
    singleLine: Boolean = true,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = singleLine,
        minLines = if (singleLine) 1 else 3,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        modifier = modifier,
    )
}

private fun createAddTempUri(context: Context): Uri {
    val file = File(context.cacheDir, "cellar_photo_${System.currentTimeMillis()}.jpg")
    return FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
}

/** Копируем выбранную из галереи картинку в кэш сразу (content:// может потерять доступ). */
private fun copyPickedToCache(context: Context, uri: Uri): Uri? = try {
    context.contentResolver.openInputStream(uri)?.use { input ->
        val f = File(context.cacheDir, "gallery_${System.currentTimeMillis()}.jpg")
        f.outputStream().use { out -> input.copyTo(out) }
        Uri.fromFile(f)
    }
} catch (_: Exception) { null }
