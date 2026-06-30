package com.enolo.app.ui.home

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.enolo.app.core.network.ApiResult
import com.enolo.app.data.dto.AddWineRequest
import com.enolo.app.data.dto.CellarItemDto
import com.enolo.app.data.dto.DiscountOfferDto
import com.enolo.app.data.dto.EnrichPreviewDto
import com.enolo.app.data.dto.WineRecognitionResult
import com.enolo.app.data.dto.WineResearchInput
import com.enolo.app.data.dto.WineResearchResult
import com.enolo.app.data.dto.DailyFactDto
import com.enolo.app.data.repository.CellarRepository
import com.enolo.app.data.repository.DiscountFilters
import com.enolo.app.data.repository.DiscountsRepository
import com.enolo.app.data.repository.FactsRepository
import com.enolo.app.data.repository.TastingNotesRepository
import com.enolo.app.data.repository.WineSearchRepository
import com.enolo.app.util.ExternalResearchPrompt
import com.enolo.app.util.ImageCompressor
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject

// ── Search / recognition state ───────────────────────────────────────────────
sealed class HomeUiState {
    object Idle    : HomeUiState()
    object Loading : HomeUiState()
    data class Results(val wines: List<WineRecognitionResult>) : HomeUiState()
    data class Error(val message: String) : HomeUiState()
}

// ── Research state ───────────────────────────────────────────────────────────
sealed class ResearchUiState {
    object Idle    : ResearchUiState()
    object Loading : ResearchUiState()
    data class Result(val data: WineResearchResult) : ResearchUiState()
    data class Error(val message: String) : ResearchUiState()
}

/** Дополнительные данные карточки распознанного вина (обогащение, погреб, фото). */
data class WineExtras(
    val enrichLoading: Boolean = false,
    val enrich: EnrichPreviewDto? = null,
    val inCellarCount: Int = 0,
    val cellarItemId: String? = null,
    val hasNote: Boolean = false,
    val selectedPhotoUrl: String? = null,
    val added: Boolean = false,
)

// ── Photo candidates sheet state ─────────────────────────────────────────────
sealed class PhotoCandidatesState {
    object Hidden : PhotoCandidatesState()
    data class Loading(val wine: WineRecognitionResult) : PhotoCandidatesState()
    data class Loaded(val wine: WineRecognitionResult, val images: List<String>) : PhotoCandidatesState()
}

fun wineKey(w: WineRecognitionResult): String =
    "${w.producer}|${w.name}|${w.vintageYear ?: ""}".lowercase()

@HiltViewModel
class HomeViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val searchRepo: WineSearchRepository,
    private val discountsRepo: DiscountsRepository,
    private val cellarRepo: CellarRepository,
    private val notesRepo: TastingNotesRepository,
    private val factsRepo: FactsRepository,
    private val externalPrompt: ExternalResearchPrompt,
) : ViewModel() {

    // ── Search ────────────────────────────────────────────────────────────────
    private val _query    = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val _uiState  = MutableStateFlow<HomeUiState>(HomeUiState.Idle)
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    private val _imageLoading = MutableStateFlow(false)
    val imageLoading: StateFlow<Boolean> = _imageLoading.asStateFlow()

    private val _recognitionPhotoUri = MutableStateFlow<Uri?>(null)
    val recognitionPhotoUri: StateFlow<Uri?> = _recognitionPhotoUri.asStateFlow()

    private val _extras = MutableStateFlow<Map<String, WineExtras>>(emptyMap())
    val extras: StateFlow<Map<String, WineExtras>> = _extras.asStateFlow()

    private val _photoCandidates = MutableStateFlow<PhotoCandidatesState>(PhotoCandidatesState.Hidden)
    val photoCandidates: StateFlow<PhotoCandidatesState> = _photoCandidates.asStateFlow()

    // Текст, который UI должен скопировать в буфер обмена (one-shot)
    private val _clipboardText = MutableStateFlow<String?>(null)
    val clipboardText: StateFlow<String?> = _clipboardText.asStateFlow()

    // ── Research ──────────────────────────────────────────────────────────────
    private val _researchState = MutableStateFlow<ResearchUiState>(ResearchUiState.Idle)
    val researchState: StateFlow<ResearchUiState> = _researchState.asStateFlow()

    // ── Top deals ─────────────────────────────────────────────────────────────
    private val _topDeals = MutableStateFlow<List<DiscountOfferDto>>(emptyList())
    val topDeals: StateFlow<List<DiscountOfferDto>> = _topDeals.asStateFlow()

    private val _dealsLoading = MutableStateFlow(false)
    val dealsLoading: StateFlow<Boolean> = _dealsLoading.asStateFlow()

    // ── Cellar stats ──────────────────────────────────────────────────────────
    private val _cellarCount = MutableStateFlow(0)
    val cellarCount: StateFlow<Int> = _cellarCount.asStateFlow()

    private val _notesCount = MutableStateFlow(0)
    val notesCount: StateFlow<Int> = _notesCount.asStateFlow()

    // ── Интересные факты дня ────────────────────────────────────────────────────
    private val _facts = MutableStateFlow<List<DailyFactDto>>(emptyList())
    val facts: StateFlow<List<DailyFactDto>> = _facts.asStateFlow()

    private val _cellarItems = MutableStateFlow<List<CellarItemDto>>(emptyList())

    // ── "What to open?" ───────────────────────────────────────────────────────
    // ── Quick note draft ──────────────────────────────────────────────────────
    private val _noteSaved  = MutableStateFlow(false)
    val noteSaved: StateFlow<Boolean> = _noteSaved.asStateFlow()

    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing.asStateFlow()

    private var searchJob: Job? = null

    init {
        cleanupScanCache()
        loadTopDeals()
        loadCellarStats()
        loadFacts()
    }

    fun loadFacts() {
        viewModelScope.launch {
            val res = factsRepo.daily(3)
            if (res is ApiResult.Success) _facts.value = res.data
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _refreshing.value = true
            loadTopDeals()
            loadCellarStats()
            delay(400)
            _refreshing.value = false
        }
    }

    // ── Search ────────────────────────────────────────────────────────────────
    // Поиск НЕ запускается при вводе (каждый запрос тратит токены LLM) —
    // только вручную через submitSearch()
    fun onQueryChange(value: String) {
        _query.value = value
        searchJob?.cancel()
        if (value.isBlank()) _uiState.value = HomeUiState.Idle
    }

    fun submitSearch() {
        val text = _query.value.trim()
        if (text.isEmpty()) return
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            _uiState.value = HomeUiState.Loading
            when (val res = searchRepo.textSearch(text)) {
                is ApiResult.Success -> setResults(res.data, photoUri = null)
                is ApiResult.Error       -> _uiState.value = HomeUiState.Error(res.message ?: "Ошибка поиска")
                is ApiResult.NetworkError -> _uiState.value = HomeUiState.Error("Нет соединения")
            }
        }
    }

    fun onImagePicked(uri: Uri) {
        viewModelScope.launch {
            _imageLoading.value = true
            _uiState.value      = HomeUiState.Loading
            // Сразу копируем картинку из галереи (content://) во внутренний кэш, пока URI
            // гарантированно читается. Иначе к моменту «Добавить в погреб» временный доступ
            // к content:// может пропасть → uriToFile вернёт null → фото молча не сохранится.
            val localUri = withContext(Dispatchers.IO) { copyIncomingToCache(uri) } ?: uri
            try {
                val base64 = ImageCompressor.toBase64(context, localUri)
                when (val res = searchRepo.recognizeFromImages(listOf(base64))) {
                    is ApiResult.Success -> {
                        if (res.data.isEmpty()) {
                            _uiState.value = HomeUiState.Error("Вино не распознано")
                            deleteIfScanFile(localUri)
                        } else {
                            setResults(res.data, photoUri = localUri)
                        }
                    }
                    is ApiResult.Error       -> { _uiState.value = HomeUiState.Error(res.message ?: "Ошибка распознавания"); deleteIfScanFile(localUri) }
                    is ApiResult.NetworkError -> { _uiState.value = HomeUiState.Error("Нет соединения"); deleteIfScanFile(localUri) }
                }
            } catch (e: Exception) {
                _uiState.value = HomeUiState.Error("Не удалось обработать фото: ${e.message}")
                deleteIfScanFile(localUri)
            } finally {
                _imageLoading.value = false
            }
        }
    }

    /** Копирует входящую картинку (галерея content:// или file://) в cacheDir как scan_*.jpg. */
    private fun copyIncomingToCache(uri: Uri): Uri? = try {
        if (uri.scheme == "file") {
            uri // камера уже отдаёт локальный файл
        } else {
            context.contentResolver.openInputStream(uri)?.use { input ->
                val f = File(context.cacheDir, "scan_${System.currentTimeMillis()}.jpg")
                f.outputStream().use { out -> input.copyTo(out) }
                Uri.fromFile(f)
            }
        }
    } catch (_: Exception) { null }

    private fun setResults(wines: List<WineRecognitionResult>, photoUri: Uri?) {
        // Прошлое фото распознавания больше не нужно
        _recognitionPhotoUri.value?.let { if (it != photoUri) deleteIfScanFile(it) }
        _recognitionPhotoUri.value = photoUri
        _extras.value = emptyMap()

        if (wines.isEmpty()) { _uiState.value = HomeUiState.Idle; return }
        _uiState.value = HomeUiState.Results(wines)

        wines.forEach { loadEnrichPreview(it) }
        // Погреб грузим ОДИН раз, затем сверяем с ним все распознанные вина
        viewModelScope.launch {
            val items = ensureCellarLoaded()
            wines.forEach { matchWine(it, items) }
        }
    }

    /** Vivino + Wine-Searcher + оценки критиков для карточки. */
    private fun loadEnrichPreview(wine: WineRecognitionResult) {
        if (wine.name.isBlank() && wine.producer.isBlank()) return
        updateExtras(wine) { it.copy(enrichLoading = true) }
        viewModelScope.launch {
            val res = cellarRepo.enrichPreview(wine.producer, wine.name, wine.vintageYear)
            updateExtras(wine) {
                it.copy(
                    enrichLoading = false,
                    enrich = (res as? ApiResult.Success)?.data,
                )
            }
        }
    }

    /** Загружает погреб один раз (из кэша, иначе сетевой запрос). */
    private suspend fun ensureCellarLoaded(): List<CellarItemDto> {
        _cellarItems.value.takeIf { it.isNotEmpty() }?.let { return it }
        val data = (cellarRepo.getItems() as? ApiResult.Success)?.data.orEmpty()
        if (data.isNotEmpty()) {
            _cellarItems.value = data
            _cellarCount.value = data.sumOf { it.quantity }
        }
        return data
    }

    /** Сверяет одно вино с уже загруженным погребом: количество + наличие заметки. */
    private suspend fun matchWine(wine: WineRecognitionResult, items: List<CellarItemDto>) {
        val norm = { s: String -> s.lowercase().replace(Regex("[^a-zа-я0-9]+"), " ").trim() }
        val target = norm("${wine.producer} ${wine.name}")
        val match = items.find { item ->
            val itemName = norm("${item.producer} ${item.name}")
            itemName == target || (target.length > 5 && (itemName.contains(target) || target.contains(itemName)))
        } ?: return
        updateExtras(wine) { it.copy(inCellarCount = match.quantity, cellarItemId = match.id) }
        val note = cellarRepo.getNote(match.id)
        if (note is ApiResult.Success && note.data != null) {
            updateExtras(wine) { it.copy(hasNote = true) }
        }
    }

    private fun rematch(wine: WineRecognitionResult) {
        viewModelScope.launch { matchWine(wine, ensureCellarLoaded()) }
    }

    /** Правка полей распознанного вина (некорректное распознавание). */
    fun editWine(original: WineRecognitionResult, edited: WineRecognitionResult) {
        val state = _uiState.value as? HomeUiState.Results ?: return
        val newList = state.wines.map { if (it === original || wineKey(it) == wineKey(original)) edited else it }
        _uiState.value = HomeUiState.Results(newList)
        // Переносим extras на новый ключ и перезапускаем обогащение
        val old = _extras.value[wineKey(original)]
        _extras.value = _extras.value - wineKey(original) +
            (wineKey(edited) to (old ?: WineExtras()).copy(enrich = null, added = false))
        rematch(edited)
        loadEnrichPreview(edited)
    }

    // ── Photo candidates ──────────────────────────────────────────────────────
    fun openPhotoCandidates(wine: WineRecognitionResult) {
        _photoCandidates.value = PhotoCandidatesState.Loading(wine)
        viewModelScope.launch {
            val res = cellarRepo.photoCandidates(wine.producer, wine.name, wine.vintageYear)
            _photoCandidates.value = PhotoCandidatesState.Loaded(
                wine,
                (res as? ApiResult.Success)?.data?.images.orEmpty(),
            )
        }
    }

    fun selectPhotoCandidate(wine: WineRecognitionResult, url: String) {
        updateExtras(wine) { it.copy(selectedPhotoUrl = url) }
        _photoCandidates.value = PhotoCandidatesState.Hidden
    }

    fun closePhotoCandidates() { _photoCandidates.value = PhotoCandidatesState.Hidden }

    fun clearResults() {
        _query.value  = ""
        _uiState.value = HomeUiState.Idle
        _extras.value = emptyMap()
        _recognitionPhotoUri.value?.let { deleteIfScanFile(it) }
        _recognitionPhotoUri.value = null
    }

    // ── Add to cellar (с фото: кандидат > снимок > автопоиск) ────────────────
    fun addToCellar(wine: WineRecognitionResult, quantity: Int) {
        viewModelScope.launch {
            val res = cellarRepo.add(AddWineRequest(
                producer    = wine.producer,
                name        = wine.name,
                vintageYear = wine.vintageYear,
                region      = wine.region,
                country     = wine.country,
                wineType    = wine.wineType,
                quantity    = quantity,
            ))
            if (res is ApiResult.Success) {
                updateExtras(wine) { it.copy(added = true) }
                attachPhoto(res.data.id, wine)
                loadCellarStats()
            }
        }
    }

    private suspend fun attachPhoto(itemId: String, wine: WineRecognitionResult) {
        val selected = _extras.value[wineKey(wine)]?.selectedPhotoUrl
        when {
            selected != null -> cellarRepo.photoFromUrl(itemId, selected)
            _recognitionPhotoUri.value != null -> {
                ImageCompressor.toJpegFile(context, _recognitionPhotoUri.value!!)?.let { file ->
                    cellarRepo.uploadPhoto(itemId, file)
                    file.delete() // временный сжатый файл в cacheDir
                }
            }
            else -> cellarRepo.fetchPhoto(itemId, wine.producer, wine.name, wine.vintageYear)
        }
    }

    // ── External research prompt → буфер обмена ──────────────────────────────
    fun externalResearch(wine: WineRecognitionResult) {
        viewModelScope.launch {
            _clipboardText.value = externalPrompt.build(wine.producer, wine.name, wine.vintageYear)
        }
    }

    fun clearClipboardText() { _clipboardText.value = null }

    // ── Cache hygiene ─────────────────────────────────────────────────────────
    /** Снимки сканирования не должны копиться в cacheDir (P4). */
    private fun cleanupScanCache() {
        viewModelScope.launch {
            runCatching {
                val cutoff = System.currentTimeMillis() - 60 * 60 * 1000 // старше часа
                context.cacheDir.listFiles()?.forEach { f ->
                    val isScanFile = f.name.startsWith("scan_") || f.name.startsWith("cam_") ||
                        f.name.startsWith("cellar_upload_") || f.name.startsWith("gallery_") ||
                        f.name.startsWith("upload_") || f.name.startsWith("cellar_photo_")
                    if (isScanFile && f.lastModified() < cutoff) f.delete()
                }
            }
        }
    }

    private fun deleteIfScanFile(uri: Uri) {
        runCatching {
            if (uri.scheme == "file") {
                val f = File(uri.path ?: return)
                if (f.parentFile == context.cacheDir) f.delete()
            }
        }
    }

    private fun uriToFile(uri: Uri): File? = try {
        if (uri.scheme == "file") {
            File(uri.path!!).takeIf { it.exists() }
        } else {
            val inputStream = context.contentResolver.openInputStream(uri)
            inputStream?.use { input ->
                val tempFile = File(context.cacheDir, "gallery_${System.currentTimeMillis()}.jpg")
                tempFile.outputStream().use { out -> input.copyTo(out) }
                tempFile
            }
        }
    } catch (_: Exception) { null }

    private fun updateExtras(wine: WineRecognitionResult, transform: (WineExtras) -> WineExtras) {
        val key = wineKey(wine)
        _extras.value = _extras.value + (key to transform(_extras.value[key] ?: WineExtras()))
    }

    // ── Research ──────────────────────────────────────────────────────────────
    fun researchWine(wine: WineRecognitionResult) {
        _researchState.value = ResearchUiState.Loading
        viewModelScope.launch {
            val input = WineResearchInput(
                wineName    = "${wine.producer} ${wine.name}".trim(),
                vintage     = wine.vintageYear?.toString(),
                countryHint = wine.country
            )
            when (val res = searchRepo.research(input)) {
                is ApiResult.Success -> _researchState.value = ResearchUiState.Result(res.data)
                is ApiResult.Error   -> _researchState.value = ResearchUiState.Error(res.message ?: "Ошибка")
                is ApiResult.NetworkError -> _researchState.value = ResearchUiState.Error("Нет соединения")
            }
        }
    }

    fun clearResearch() { _researchState.value = ResearchUiState.Idle }

    // ── Top deals ─────────────────────────────────────────────────────────────
    fun loadTopDeals() {
        viewModelScope.launch {
            _dealsLoading.value = true
            val res = discountsRepo.getOffers(
                DiscountFilters(sort = "discountPercent_desc", limit = 10, page = 1)
            )
            if (res is ApiResult.Success) _topDeals.value = res.data.items
            _dealsLoading.value = false
        }
    }

    // ── Cellar stats ──────────────────────────────────────────────────────────
    fun loadCellarStats() {
        // 1) Cache-first: мгновенно показываем счётчики из локального кэша, не дожидаясь сети.
        //    Иначе при недоступном сервере значения появляются только после таймаута HTTP (~30с).
        cellarRepo.cachedItems()?.let { cached ->
            _cellarItems.value = cached
            _cellarCount.value = cached.sumOf { it.quantity }
        }
        notesRepo.cachedNotes()?.let { _notesCount.value = it.size }
        // 2) Фоновое обновление через инкрементальную синхронизацию (дёшево, обновляет и кэш).
        viewModelScope.launch {
            val res = cellarRepo.syncDelta()
            if (res is ApiResult.Success) {
                _cellarItems.value = res.data
                _cellarCount.value = res.data.sumOf { it.quantity }
            }
            val notes = notesRepo.syncDelta()
            if (notes is ApiResult.Success) _notesCount.value = notes.data
        }
    }

    fun onNoteSaved() { _noteSaved.value = true }
    fun clearNoteSaved() { _noteSaved.value = false }

    fun absolutePhotoUrl(path: String?) = cellarRepo.absolutePhotoUrl(path)
}
