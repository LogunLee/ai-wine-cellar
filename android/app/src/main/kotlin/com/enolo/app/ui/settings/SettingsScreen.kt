package com.enolo.app.ui.settings

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.enolo.app.core.network.ApiResult
import com.enolo.app.core.storage.SessionManager
import com.enolo.app.data.dto.AiProviderDto
import com.enolo.app.data.dto.AiProviderKeyDto
import com.enolo.app.data.dto.AiTaskDto
import com.enolo.app.data.repository.AiSettingsRepository
import com.enolo.app.ui.components.MerloticTopBar
import com.enolo.app.ui.theme.TokenFill as Fill
import com.enolo.app.ui.theme.TokenGoldInk as GoldText
import com.enolo.app.ui.theme.TokenGoldWash as GoldBg
import com.enolo.app.ui.theme.TokenInk as Ink
import com.enolo.app.ui.theme.TokenInk2 as Ink2
import com.enolo.app.ui.theme.TokenInk3 as Ink3
import com.enolo.app.ui.theme.TokenLine as Line
import com.enolo.app.ui.theme.TokenRed as Red
import com.enolo.app.ui.theme.TokenRedWash as RedWash
import com.enolo.app.ui.theme.TokenTeal as Teal
import com.enolo.app.ui.theme.TokenTealWash as TealWash
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

// ─── ViewModel ───────────────────────────────────────────────────────────────

data class SettingsUiState(
    val providers: List<AiProviderDto> = emptyList(),
    val keys: List<AiProviderKeyDto> = emptyList(),
    val tasks: List<AiTaskDto> = emptyList(),
    val loading: Boolean = true,
    val busyProvider: String? = null,
    val busyTask: String? = null,
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val repository: AiSettingsRepository,
    private val sessionManager: SessionManager,
    private val externalResearchPrompt: com.enolo.app.util.ExternalResearchPrompt,
) : ViewModel() {

    private val _state = MutableStateFlow(SettingsUiState())
    val state: StateFlow<SettingsUiState> = _state.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true)
            val cat = repository.catalog()
            val set = repository.settings()
            if (cat is ApiResult.Success && set is ApiResult.Success) {
                _state.value = SettingsUiState(
                    providers = cat.data.providers,
                    keys = set.data.providerKeys,
                    tasks = set.data.tasks,
                    loading = false,
                )
            } else {
                _state.value = _state.value.copy(loading = false)
                _message.value = "Не удалось загрузить настройки"
            }
        }
    }

    fun saveKey(providerCode: String, apiKey: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(busyProvider = providerCode)
            when (val r = repository.saveKey(providerCode, apiKey)) {
                is ApiResult.Success -> {
                    when (val t = repository.testKey(providerCode)) {
                        is ApiResult.Success ->
                            _message.value = if (t.data.ok) "Ключ работает ✓" else (t.data.error ?: "Ключ сохранён, но проверка не прошла")
                        else -> _message.value = "Ключ сохранён, проверить не удалось"
                    }
                    load()
                }
                is ApiResult.Error -> { _message.value = r.message ?: "Ошибка сохранения ключа"; _state.value = _state.value.copy(busyProvider = null) }
                is ApiResult.NetworkError -> { _message.value = "Нет соединения"; _state.value = _state.value.copy(busyProvider = null) }
            }
        }
    }

    fun testKey(providerCode: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(busyProvider = providerCode)
            when (val t = repository.testKey(providerCode)) {
                is ApiResult.Success -> _message.value = if (t.data.ok) "Ключ работает ✓" else (t.data.error ?: "Проверка не прошла")
                else -> _message.value = "Не удалось проверить ключ"
            }
            load()
        }
    }

    fun deleteKey(providerCode: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(busyProvider = providerCode)
            when (repository.deleteKey(providerCode)) {
                is ApiResult.Success -> { _message.value = "Ключ удалён"; load() }
                else -> { _message.value = "Не удалось удалить ключ"; _state.value = _state.value.copy(busyProvider = null) }
            }
        }
    }

    fun selectModel(taskCode: String, modelId: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(busyTask = taskCode)
            when (val r = repository.saveTaskSetting(taskCode, modelId, null)) {
                is ApiResult.Success -> { _message.value = "Модель сохранена"; load() }
                is ApiResult.Error -> { _message.value = r.message ?: "Ошибка"; _state.value = _state.value.copy(busyTask = null) }
                is ApiResult.NetworkError -> { _message.value = "Нет соединения"; _state.value = _state.value.copy(busyTask = null) }
            }
        }
    }

    /** Сохранение промпта (для задач без модели промпт — единственная настройка). */
    fun savePrompt(taskCode: String, prompt: String?) {
        viewModelScope.launch {
            _state.value = _state.value.copy(busyTask = taskCode)
            val task = _state.value.tasks.find { it.code == taskCode }
            val modelId = if (task?.requiresModel == true) task.setting?.modelId else null
            when (val r = repository.saveTaskSetting(taskCode, modelId, prompt?.takeIf { it.isNotBlank() })) {
                is ApiResult.Success -> { _message.value = "Промпт сохранён"; externalResearchPrompt.invalidate(); load() }
                is ApiResult.Error -> { _message.value = r.message ?: "Ошибка"; _state.value = _state.value.copy(busyTask = null) }
                is ApiResult.NetworkError -> { _message.value = "Нет соединения"; _state.value = _state.value.copy(busyTask = null) }
            }
        }
    }

    fun resetTask(taskCode: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(busyTask = taskCode)
            when (repository.resetTaskSetting(taskCode)) {
                is ApiResult.Success -> { _message.value = "Сброшено на пробный режим"; load() }
                else -> { _message.value = "Не удалось сбросить"; _state.value = _state.value.copy(busyTask = null) }
            }
        }
    }

    fun logout() {
        viewModelScope.launch { sessionManager.clear() }
    }

    fun clearMessage() { _message.value = null }
}

// ─── Screen ──────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(viewModel: SettingsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsState()
    val message by viewModel.message.collectAsState()
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(message) {
        message?.let {
            snackbar.showSnackbar(it)
            viewModel.clearMessage()
        }
    }

    val providerName: (String) -> String = { code ->
        state.providers.find { it.code == code }?.name ?: code
    }
    val modelTasks  = state.tasks.filter { it.requiresModel }
    val promptTasks = state.tasks.filter { it.promptEditable && !it.requiresModel }

    Scaffold(
        containerColor = Color.White,
        snackbarHost = { SnackbarHost(snackbar) },
        // MainScaffold уже применяет системные отступы к NavHost — не добавляем
        // их повторно, иначе верхняя панель уезжает вниз (двойной inset).
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
    ) { padding ->
        if (state.loading && state.providers.isEmpty()) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Teal)
            }
            return@Scaffold
        }

        Column(Modifier.fillMaxSize().padding(padding)) {
            MerloticTopBar(title = "Настройки")
            androidx.compose.material3.pulltorefresh.PullToRefreshBox(
                isRefreshing = state.loading,
                onRefresh    = { viewModel.load() },
                modifier     = Modifier.fillMaxSize(),
            ) {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 8.dp, bottom = 32.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // ── Провайдеры AI ──────────────────────────────────────────────
                item { SectionLabel("ПРОВАЙДЕРЫ AI") }
                item {
                    Text(
                        "Подключите своего провайдера — AI-функции будут работать на вашем бесплатном или платном лимите. Ключи хранятся в зашифрованном виде и никогда не показываются повторно.",
                        fontSize = 13.sp, color = Ink3, lineHeight = 19.sp,
                    )
                }
                items(state.providers.size) { i ->
                    val p = state.providers[i]
                    ProviderCard(
                        provider = p,
                        keyInfo = state.keys.find { it.providerCode == p.code },
                        busy = state.busyProvider == p.code,
                        onSaveKey = { key -> viewModel.saveKey(p.code, key) },
                        onTest = { viewModel.testKey(p.code) },
                        onDelete = { viewModel.deleteKey(p.code) },
                    )
                }

                // ── Используемые модели ────────────────────────────────────────
                if (modelTasks.isNotEmpty()) {
                    item { Spacer(Modifier.height(8.dp)); SectionHeading("Используемые модели") }
                    items(modelTasks.size) { i ->
                        val t = modelTasks[i]
                        ModelTaskCard(
                            task = t,
                            providers = state.providers,
                            connectedProviders = state.keys.map { it.providerCode }.toSet(),
                            providerName = providerName,
                            busy = state.busyTask == t.code,
                            onSelectModel = { modelId -> viewModel.selectModel(t.code, modelId) },
                            onReset = { viewModel.resetTask(t.code) },
                        )
                    }
                }

                // ── Используемые промпты ───────────────────────────────────────
                if (promptTasks.isNotEmpty()) {
                    item { Spacer(Modifier.height(8.dp)); SectionHeading("Используемые промпты") }
                    items(promptTasks.size) { i ->
                        val t = promptTasks[i]
                        PromptTaskCard(
                            task = t,
                            busy = state.busyTask == t.code,
                            onSavePrompt = { prompt -> viewModel.savePrompt(t.code, prompt) },
                        )
                    }
                }

                // ── Выход ──────────────────────────────────────────────────────
                item {
                    Spacer(Modifier.height(8.dp))
                    HorizontalDivider(color = Line)
                    Row(
                        Modifier.fillMaxWidth().clickable { viewModel.logout() }.padding(vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null, tint = Red, modifier = Modifier.size(20.dp))
                        Text("Выйти из аккаунта", fontSize = 14.5.sp, fontWeight = FontWeight.Medium, color = Red)
                    }
                }
            }
            }
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(text, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.2.sp, color = Ink3)
}

@Composable
private fun SectionHeading(text: String) {
    Text(text, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Ink)
}

// ─── Provider card ───────────────────────────────────────────────────────────

@Composable
private fun ProviderCard(
    provider: AiProviderDto,
    keyInfo: AiProviderKeyDto?,
    busy: Boolean,
    onSaveKey: (String) -> Unit,
    onTest: () -> Unit,
    onDelete: () -> Unit,
) {
    val context = LocalContext.current
    var showInstructions by remember { mutableStateOf(false) }
    var keyInput by remember { mutableStateOf("") }
    var editing by remember { mutableStateOf(false) }

    val hasKey = keyInfo != null
    val showInput = !hasKey || editing

    Surface(shape = RoundedCornerShape(16.dp), color = Color.White, border = BorderStroke(1.dp, Line)) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            // Шапка: монограмма + название + описание
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                ProviderMonogram(provider.name)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(provider.name, fontSize = 17.sp, fontWeight = FontWeight.Bold, color = Ink)
                    provider.freeTierNote?.let {
                        Text(it, fontSize = 13.sp, color = Ink3, lineHeight = 18.sp)
                    }
                }
            }

            // Инструкция
            Row(
                Modifier.clickable { showInstructions = !showInstructions },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Icon(
                    if (showInstructions) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = null, tint = Teal, modifier = Modifier.size(18.dp),
                )
                Text("Как получить ключ", fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, color = Teal)
            }
            if (showInstructions) {
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Fill).padding(10.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(stripMarkdown(provider.keyInstructions), fontSize = 12.5.sp, color = Ink2, lineHeight = 18.sp)
                    Surface(
                        onClick = {
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(provider.keyConsoleUrl)))
                        },
                        shape = RoundedCornerShape(8.dp),
                        color = TealWash,
                    ) {
                        Row(
                            Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = null, tint = Teal, modifier = Modifier.size(14.dp))
                            Text("Открыть консоль провайдера", fontSize = 12.5.sp, fontWeight = FontWeight.Medium, color = Teal)
                        }
                    }
                }
            }

            // Поле ключа
            if (showInput) {
                OutlinedTextField(
                    value = keyInput,
                    onValueChange = { keyInput = it },
                    placeholder = { Text("Вставьте API-ключ", fontSize = 14.sp, color = Ink3) },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Teal, unfocusedBorderColor = Line, cursorColor = Teal),
                    modifier = Modifier.fillMaxWidth(),
                )
            } else {
                MaskedKeyField(mask = keyInfo!!.keyMask, valid = keyInfo.isValid != false)
            }

            // Основная кнопка
            Button(
                onClick = {
                    if (showInput) { onSaveKey(keyInput.trim()); keyInput = ""; editing = false } else onTest()
                },
                enabled = !busy && (if (showInput) keyInput.trim().length >= 8 else true),
                modifier = Modifier.fillMaxWidth().height(50.dp),
                shape = RoundedCornerShape(13.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Teal,
                    disabledContainerColor = Fill,
                    disabledContentColor = Ink3,
                ),
            ) {
                if (busy) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Text("Сохранить и проверить", fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                }
            }

            // Управление сохранённым ключом
            if (hasKey && !editing) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text("Заменить", fontSize = 13.5.sp, fontWeight = FontWeight.Medium, color = Ink2,
                        modifier = Modifier.clickable(enabled = !busy) { editing = true })
                    Text("Удалить", fontSize = 13.5.sp, fontWeight = FontWeight.Medium, color = Red,
                        modifier = Modifier.clickable(enabled = !busy) { onDelete() })
                }
            } else if (editing) {
                Text("Отмена", fontSize = 13.5.sp, fontWeight = FontWeight.Medium, color = Ink3,
                    modifier = Modifier.clickable { editing = false; keyInput = "" })
            }
        }
    }
}

@Composable
private fun ProviderMonogram(name: String) {
    Box(
        Modifier.size(48.dp).clip(RoundedCornerShape(12.dp)).background(Fill),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            name.trim().firstOrNull()?.uppercase() ?: "?",
            fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Ink2,
        )
    }
}

@Composable
private fun MaskedKeyField(mask: String, valid: Boolean) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Color.White)
            .border(BorderStroke(1.dp, Line), RoundedCornerShape(12.dp))
            .padding(horizontal = 14.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(Icons.Default.Lock, contentDescription = null, tint = Ink3, modifier = Modifier.size(18.dp))
        Text(mask, fontSize = 15.sp, color = Ink, modifier = Modifier.weight(1f))
        Box(
            Modifier.size(24.dp).clip(CircleShape).background(if (valid) Teal else Red),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (valid) Icons.Default.Check else Icons.Default.ErrorOutline,
                contentDescription = if (valid) "Проверен" else "Ошибка",
                tint = Color.White, modifier = Modifier.size(15.dp),
            )
        }
    }
}

// ─── Model task card ───────────────────────────────────────────────────────────

@Composable
private fun ModelTaskCard(
    task: AiTaskDto,
    providers: List<AiProviderDto>,
    connectedProviders: Set<String>,
    providerName: (String) -> String,
    busy: Boolean,
    onSelectModel: (String) -> Unit,
    onReset: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }

    val options = providers
        .filter { it.code in connectedProviders }
        .flatMap { p ->
            p.models
                .filter { task.requiredCapability in it.capabilities }
                .map { Triple(it.id, "${it.name} · ${p.name}", it.note) }
        }

    val trialLeft = (task.trialLimit - task.trialUsed).coerceAtLeast(0)
    val usingOwn = task.setting != null

    Surface(shape = RoundedCornerShape(16.dp), color = Color.White, border = BorderStroke(1.dp, Line)) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(task.name, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Ink)
                    task.description?.let { Text(it, fontSize = 13.sp, color = Ink3, lineHeight = 18.sp) }
                }
                Spacer(Modifier.width(10.dp))
                if (usingOwn) {
                    StatusPill("Своя модель", TealWash, Teal)
                } else if (trialLeft > 0) {
                    StatusPill("Осталось $trialLeft из ${task.trialLimit}", GoldBg, GoldText)
                } else {
                    StatusPill("Лимит исчерпан", RedWash, Red)
                }
            }

            // Селектор модели на всю ширину
            Box {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .border(BorderStroke(1.dp, Line), RoundedCornerShape(12.dp))
                        .clickable(enabled = !busy && options.isNotEmpty()) { menuOpen = true }
                        .padding(horizontal = 16.dp, vertical = 15.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        task.setting?.let { "${it.modelName} · ${providerName(it.providerCode ?: "")}" } ?: "Выбрать модель",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Medium,
                        color = if (options.isEmpty() && task.setting == null) Ink3 else Ink,
                        modifier = Modifier.weight(1f),
                    )
                    if (busy) {
                        CircularProgressIndicator(color = Teal, modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    } else {
                        Icon(Icons.Default.ExpandMore, contentDescription = null, tint = Ink3, modifier = Modifier.size(20.dp))
                    }
                }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    options.forEach { (id, label, note) ->
                        DropdownMenuItem(
                            text = {
                                Column {
                                    Text(label, fontSize = 14.sp, color = Ink)
                                    note?.let { Text(it, fontSize = 11.sp, color = Ink3) }
                                }
                            },
                            onClick = { menuOpen = false; onSelectModel(id) },
                        )
                    }
                }
            }

            if (options.isEmpty() && task.setting == null) {
                Text(
                    "Сначала подключите провайдера с поддержкой «${capabilityNoun(task.requiredCapability)}»",
                    fontSize = 12.5.sp, color = Ink3,
                )
            } else {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(
                        Modifier.size(18.dp).clip(CircleShape).background(Teal),
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Default.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(12.dp)) }
                    Text(capabilityLabel(task.requiredCapability), fontSize = 13.sp, color = Ink2)
                    if (usingOwn) {
                        Spacer(Modifier.weight(1f))
                        Text("Сбросить", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = Ink3,
                            modifier = Modifier.clickable(enabled = !busy) { onReset() })
                    }
                }
            }
        }
    }
}

@Composable
private fun StatusPill(text: String, bg: Color, fg: Color) {
    Surface(shape = RoundedCornerShape(8.dp), color = bg) {
        Text(
            text, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = fg,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
        )
    }
}

// ─── Prompt task card ──────────────────────────────────────────────────────────

@Composable
private fun PromptTaskCard(
    task: AiTaskDto,
    busy: Boolean,
    onSavePrompt: (String?) -> Unit,
) {
    val saved = task.setting?.customPrompt ?: task.defaultPrompt ?: ""
    var promptText by remember(task.code, saved) { mutableStateOf(saved) }
    val changed = promptText.trim() != saved.trim()

    Surface(shape = RoundedCornerShape(16.dp), color = Color.White, border = BorderStroke(1.dp, Line)) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(task.name, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Ink)
            task.description?.let { Text(it, fontSize = 13.sp, color = Ink3, lineHeight = 18.sp) }

            OutlinedTextField(
                value = promptText,
                onValueChange = { promptText = it },
                minLines = 5,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                textStyle = androidx.compose.ui.text.TextStyle(fontSize = 14.sp, color = Ink, lineHeight = 20.sp),
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Teal, unfocusedBorderColor = Line, cursorColor = Teal),
            )

            Text(
                "Этот промпт будет скопирован в буфер обмена вместе с названием вина.",
                fontSize = 12.5.sp, color = Ink3, lineHeight = 17.sp,
            )

            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Button(
                    onClick = {
                        val toSave = promptText.trim().takeIf { it.isNotBlank() && it != task.defaultPrompt?.trim() }
                        onSavePrompt(toSave)
                    },
                    enabled = !busy && changed,
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Teal, disabledContainerColor = Fill, disabledContentColor = Ink3,
                    ),
                    contentPadding = PaddingValues(horizontal = 20.dp, vertical = 10.dp),
                ) {
                    if (busy) CircularProgressIndicator(color = Color.White, modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                    else Text("Сохранить", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                }
                if (!task.defaultPrompt.isNullOrBlank() && promptText.trim() != task.defaultPrompt.trim()) {
                    Text("Вернуть стандартный", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = Ink3,
                        modifier = Modifier.clickable(enabled = !busy) { promptText = task.defaultPrompt })
                }
            }
        }
    }
}

private fun capabilityLabel(capability: String): String = when (capability) {
    "vision" -> "Требуется поддержка изображений"
    "audio"  -> "Требуется поддержка аудио"
    else     -> "Поддержка текста"
}

private fun capabilityNoun(capability: String): String = when (capability) {
    "vision" -> "изображений"
    "audio"  -> "аудио"
    else     -> "текста"
}

/** Markdown инструкции показываем как простой текст: убираем ###, **, [текст](url) → текст. */
private fun stripMarkdown(md: String): String = md
    .replace(Regex("""\[([^\]]+)\]\([^)]+\)"""), "$1")
    .replace(Regex("""\*\*([^*]+)\*\*"""), "$1")
    .replace(Regex("""`([^`]+)`"""), "$1")
    .replace(Regex("""^###\s+""", RegexOption.MULTILINE), "")
    .trim()
