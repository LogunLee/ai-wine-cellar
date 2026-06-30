package com.enolo.app.ui.cellar

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.enolo.app.core.network.ApiResult
import com.enolo.app.data.dto.AddWineRequest
import com.enolo.app.data.dto.CellarItemDto
import com.enolo.app.data.dto.NoteDto
import com.enolo.app.data.repository.CellarRepository
import com.enolo.app.util.ExternalResearchPrompt
import com.enolo.app.util.ImageCompressor
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.io.File
import java.util.Calendar
import javax.inject.Inject

// ─── Drink window status ──────────────────────────────────────────────────────

enum class DrinkWindowStatus { DUE, READY, HOLD }

fun CellarItemDto.drinkWindowStatus(currentYear: Int = Calendar.getInstance().get(Calendar.YEAR)): DrinkWindowStatus? {
    val from = drinkWindowFrom ?: return null
    val to   = drinkWindowTo   ?: return null
    return when {
        currentYear >= to   -> DrinkWindowStatus.DUE
        currentYear >= from -> DrinkWindowStatus.READY
        else                -> DrinkWindowStatus.HOLD
    }
}

// ─── Filter model ─────────────────────────────────────────────────────────────

data class CellarFilters(
    val search      : String = "",
    val wineType    : String = "",
    val statusPreset: String = "",
    val country     : String = "",
    val grapes      : List<String> = emptyList(),
    val sort        : String = "due_first",
)

val CELLAR_QUICK_PRESETS = listOf(
    "DUE"      to "Пора открыть",
    "RED"      to "Красное",
    "WHITE"    to "Белое",
    "SPARKLING" to "Игристое",
    "ROSE"     to "Розе",
)

fun CellarFilters.activePresetKeys(): Set<String> = buildSet {
    if (statusPreset == "DUE")   add("DUE")
    if (wineType == "RED")       add("RED")
    if (wineType == "WHITE")     add("WHITE")
    if (wineType == "SPARKLING") add("SPARKLING")
    if (wineType == "ROSE")      add("ROSE")
}

fun CellarFilters.activeFilterCount(): Int = listOfNotNull(
    wineType.takeIf { it.isNotBlank() },
    statusPreset.takeIf { it.isNotBlank() },
    country.takeIf { it.isNotBlank() },
    grapes.takeIf { it.isNotEmpty() },
).size

// ─── UI state ─────────────────────────────────────────────────────────────────

data class CellarUiState(
    val items          : List<CellarItemDto> = emptyList(),
    val isLoading      : Boolean = false,
    val error          : String? = null,
    val totalBottles   : Int = 0,
    val dueBottles     : Int = 0,
    val totalPositions : Int = 0,
)

// ─── ViewModel ────────────────────────────────────────────────────────────────

@HiltViewModel
class CellarViewModel @Inject constructor(
    private val repository: CellarRepository,
    private val externalPrompt: ExternalResearchPrompt,
    @ApplicationContext private val context: Context
) : ViewModel() {

    private val _uiState = MutableStateFlow(CellarUiState())
    val uiState: StateFlow<CellarUiState> = _uiState.asStateFlow()

    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing.asStateFlow()

    // Фоновая синхронизация с сервером (крутит значок кнопки синхронизации в шапке).
    private val _syncing = MutableStateFlow(false)
    val syncing: StateFlow<Boolean> = _syncing.asStateFlow()

    // Текст для копирования в буфер (one-shot, «внешнее исследование»)
    private val _clipboardText = MutableStateFlow<String?>(null)
    val clipboardText: StateFlow<String?> = _clipboardText.asStateFlow()

    private val _filters = MutableStateFlow(CellarFilters())
    val filters: StateFlow<CellarFilters> = _filters.asStateFlow()

    private val _noteState = MutableStateFlow<NoteDto?>(null)
    val noteState: StateFlow<NoteDto?> = _noteState.asStateFlow()

    private val _actionError = MutableStateFlow<String?>(null)
    val actionError: StateFlow<String?> = _actionError.asStateFlow()

    val filteredItems: StateFlow<List<CellarItemDto>> = combine(_uiState, _filters) { state, f ->
        applyFilters(state.items, f)
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val availableCountries: StateFlow<List<String>> = _uiState.map { state ->
        state.items.mapNotNull { it.country }.filter { it.isNotBlank() }.distinct().sorted()
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val availableGrapes: StateFlow<List<String>> = _uiState.map { state ->
        state.items.flatMap { it.grapes ?: emptyList() }.filter { it.isNotBlank() }.distinct().sorted()
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    init { load() }

    /** Применяет список вин к UI-состоянию (без флагов загрузки). */
    private fun applyItems(items: List<CellarItemDto>) {
        val currentYear = Calendar.getInstance().get(Calendar.YEAR)
        _uiState.value = CellarUiState(
            items          = items,
            isLoading      = false,
            totalBottles   = items.sumOf { it.quantity },
            dueBottles     = items.filter { it.drinkWindowStatus(currentYear) == DrinkWindowStatus.DUE }.sumOf { it.quantity },
            totalPositions = items.size,
        )
    }

    fun load() {
        // 1) Cache-first: моментально показываем погреб из локального кэша (без ожидания сети).
        val cached = repository.cachedItems()
        if (!cached.isNullOrEmpty()) applyItems(cached)
        else _uiState.value = _uiState.value.copy(isLoading = true, error = null)
        // 2) Фоновая синхронизация с сервером (значок синхронизации крутится).
        sync()
    }

    /** Фоновая инкрементальная синхронизация: дельта с сервера, обновляет UI; крутит значок кнопки. */
    fun sync() {
        viewModelScope.launch {
            _syncing.value = true
            when (val res = repository.syncDelta()) {
                is ApiResult.Success -> applyItems(res.data)
                is ApiResult.Error        -> if (_uiState.value.items.isEmpty()) _uiState.value = CellarUiState(error = res.message ?: "Ошибка", isLoading = false)
                is ApiResult.NetworkError -> if (_uiState.value.items.isEmpty()) _uiState.value = CellarUiState(error = "Нет соединения", isLoading = false)
            }
            _syncing.value = false
        }
    }

    /** URI фото: локальный файл (офлайн) если скачан, иначе URL сервера. */
    fun photoUri(relativePath: String?) = repository.photoUri(relativePath)

    fun onSearchChange(query: String) {
        _filters.value = _filters.value.copy(search = query)
    }

    fun togglePreset(key: String) {
        val f = _filters.value
        _filters.value = when (key) {
            "DUE"                              -> f.copy(statusPreset = if (f.statusPreset == "DUE") "" else "DUE")
            "RED", "WHITE", "SPARKLING", "ROSE" -> f.copy(wineType = if (f.wineType == key) "" else key)
            else -> f
        }
    }

    fun setSort(sort: String) {
        _filters.value = _filters.value.copy(sort = sort)
    }

    fun applyFiltersFromSheet(wineType: String, statusPreset: String, country: String, grapes: List<String>) {
        _filters.value = _filters.value.copy(wineType = wineType, statusPreset = statusPreset, country = country, grapes = grapes)
    }

    fun addWine(request: AddWineRequest, photoUri: Uri? = null, onDone: () -> Unit) {
        viewModelScope.launch {
            when (val res = repository.add(request)) {
                is ApiResult.Success -> {
                    // Фото грузим сразу после создания карточки — сжимаем перед отправкой.
                    if (photoUri != null) {
                        ImageCompressor.toJpegFile(context, photoUri)?.let { file -> repository.uploadPhoto(res.data.id, file); file.delete() }
                    }
                    load(); onDone()
                }
                is ApiResult.Error        -> _actionError.value = res.message ?: "Ошибка добавления"
                is ApiResult.NetworkError -> _actionError.value = "Нет соединения"
            }
        }
    }

    fun updateWine(id: String, request: AddWineRequest, onDone: () -> Unit) {
        viewModelScope.launch {
            when (val res = repository.update(id, request)) {
                is ApiResult.Success -> { load(); onDone() }
                is ApiResult.Error        -> _actionError.value = res.message ?: "Ошибка изменения"
                is ApiResult.NetworkError -> _actionError.value = "Нет соединения"
            }
        }
    }

    fun deleteWine(id: String, onDone: () -> Unit = {}) {
        viewModelScope.launch {
            when (repository.delete(id)) {
                is ApiResult.Success -> { load(); onDone() }
                is ApiResult.Error        -> _actionError.value = "Ошибка удаления"
                is ApiResult.NetworkError -> _actionError.value = "Нет соединения"
            }
        }
    }

    fun consumeOne(item: CellarItemDto, onDone: () -> Unit = {}) {
        val newQty = item.quantity - 1
        if (newQty <= 0) {
            deleteWine(item.id, onDone)
        } else {
            updateWine(
                item.id,
                AddWineRequest(
                    producer       = item.producer,
                    name           = item.name,
                    vintageYear    = item.vintageYear,
                    region         = item.region,
                    country        = item.country,
                    wineType       = item.wineType,
                    quantity       = newQty,
                    drinkWindowFrom = item.drinkWindowFrom,
                    drinkWindowTo   = item.drinkWindowTo,
                ),
                onDone,
            )
        }
    }

    fun loadNote(id: String) {
        viewModelScope.launch {
            _noteState.value = null
            _noteState.value = when (val res = repository.getNote(id)) {
                is ApiResult.Success -> res.data
                else -> null
            }
        }
    }

    fun saveNote(id: String, text: String, onDone: () -> Unit) {
        viewModelScope.launch {
            when (val res = repository.saveNote(id, text)) {
                is ApiResult.Success -> { _noteState.value = res.data; onDone() }
                is ApiResult.Error        -> _actionError.value = res.message ?: "Ошибка сохранения"
                is ApiResult.NetworkError -> _actionError.value = "Нет соединения"
            }
        }
    }

    fun uploadPhoto(id: String, uri: Uri) {
        viewModelScope.launch {
            val file = ImageCompressor.toJpegFile(context, uri) ?: return@launch
            when (val res = repository.uploadPhoto(id, file)) {
                is ApiResult.Success -> load()
                is ApiResult.Error        -> _actionError.value = res.message ?: "Ошибка загрузки фото"
                is ApiResult.NetworkError -> _actionError.value = "Нет соединения"
            }
        }
    }

    fun fetchPhoto(id: String, producer: String, name: String, vintageYear: Int?) {
        viewModelScope.launch {
            when (val res = repository.fetchPhoto(id, producer, name, vintageYear)) {
                is ApiResult.Success -> load()
                is ApiResult.Error        -> _actionError.value = res.message ?: "Не удалось найти фото"
                is ApiResult.NetworkError -> _actionError.value = "Нет соединения"
            }
        }
    }

    fun saveVivinoUrl(id: String, url: String, onDone: () -> Unit = {}) {
        viewModelScope.launch {
            when (repository.saveVivinoUrl(id, url)) {
                is ApiResult.Success -> { load(); onDone() }
                is ApiResult.Error        -> _actionError.value = "Ошибка сохранения Vivino"
                is ApiResult.NetworkError -> _actionError.value = "Нет соединения"
            }
        }
    }

    fun saveWineSearcherUrl(id: String, url: String, onDone: () -> Unit = {}) {
        viewModelScope.launch {
            when (repository.saveWineSearcherUrl(id, url)) {
                is ApiResult.Success -> { load(); onDone() }
                is ApiResult.Error        -> _actionError.value = "Ошибка сохранения Wine-Searcher"
                is ApiResult.NetworkError -> _actionError.value = "Нет соединения"
            }
        }
    }

    fun absolutePhotoUrl(relativePath: String?) = repository.absolutePhotoUrl(relativePath)

    fun clearActionError() { _actionError.value = null }

    fun refresh() {
        viewModelScope.launch {
            _refreshing.value = true
            when (val res = repository.syncDelta()) {
                is ApiResult.Success -> applyItems(res.data)
                else -> {}
            }
            _refreshing.value = false
        }
    }

    /** Собирает запрос «внешнего исследования» — UI копирует его в буфер обмена. */
    fun externalResearch(item: CellarItemDto) {
        viewModelScope.launch {
            _clipboardText.value = externalPrompt.build(item.producer, item.name, item.vintageYear)
        }
    }

    fun clearClipboardText() { _clipboardText.value = null }

    private fun applyFilters(items: List<CellarItemDto>, f: CellarFilters): List<CellarItemDto> {
        val currentYear = Calendar.getInstance().get(Calendar.YEAR)
        var result = items

        if (f.search.isNotBlank()) {
            val q = f.search.lowercase()
            result = result.filter {
                it.name.lowercase().contains(q) ||
                it.producer.lowercase().contains(q) ||
                it.region?.lowercase()?.contains(q) == true
            }
        }
        if (f.wineType.isNotBlank()) {
            result = result.filter { it.wineType?.uppercase() == f.wineType }
        }
        if (f.statusPreset.isNotBlank()) {
            result = result.filter { it.drinkWindowStatus(currentYear)?.name == f.statusPreset }
        }
        if (f.country.isNotBlank()) {
            result = result.filter { it.country == f.country }
        }
        if (f.grapes.isNotEmpty()) {
            result = result.filter { item -> f.grapes.any { g -> item.grapes?.contains(g) == true } }
        }

        return when (f.sort) {
            "due_first"  -> result.sortedWith(
                compareBy({ it.drinkWindowStatus(currentYear)?.ordinal ?: Int.MAX_VALUE }, { it.producer.lowercase() })
            )
            "date_added" -> result.sortedByDescending { it.createdAt }
            "name"       -> result.sortedBy { "${it.producer} ${it.name}".lowercase() }
            "quantity"   -> result.sortedByDescending { it.quantity }
            else         -> result
        }
    }

    private fun uriToFile(context: Context, uri: Uri): File? = try {
        val inputStream = context.contentResolver.openInputStream(uri) ?: return null
        val tempFile = File(context.cacheDir, "upload_${System.currentTimeMillis()}.jpg")
        tempFile.outputStream().use { it2 -> inputStream.copyTo(it2) }
        tempFile
    } catch (_: Exception) { null }
}
