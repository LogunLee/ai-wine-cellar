package com.enolo.app.ui.home

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.enolo.app.core.network.ApiResult
import com.enolo.app.data.dto.AddWineRequest
import com.enolo.app.data.dto.CellarItemDto
import com.enolo.app.data.dto.DiscountOfferDto
import com.enolo.app.data.dto.WineRecognitionResult
import com.enolo.app.data.dto.WineResearchInput
import com.enolo.app.data.dto.WineResearchResult
import com.enolo.app.data.repository.CellarRepository
import com.enolo.app.data.repository.DiscountFilters
import com.enolo.app.data.repository.DiscountsRepository
import com.enolo.app.data.repository.WineSearchRepository
import com.enolo.app.util.ImageCompressor
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
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

// ── "What to open?" state ────────────────────────────────────────────────────
sealed class WhatToOpenState {
    object Idle    : WhatToOpenState()
    object Loading : WhatToOpenState()
    data class Result(val item: CellarItemDto, val explanation: String) : WhatToOpenState()
    data class Empty(val message: String) : WhatToOpenState()
    data class Error(val message: String) : WhatToOpenState()
}

@HiltViewModel
class HomeViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val searchRepo: WineSearchRepository,
    private val discountsRepo: DiscountsRepository,
    private val cellarRepo: CellarRepository,
) : ViewModel() {

    // ── Search ────────────────────────────────────────────────────────────────
    private val _query    = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val _uiState  = MutableStateFlow<HomeUiState>(HomeUiState.Idle)
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    private val _imageLoading = MutableStateFlow(false)
    val imageLoading: StateFlow<Boolean> = _imageLoading.asStateFlow()

    private val _recognitionPhotoUri = MutableStateFlow<Uri?>(null)

    private val _addToCellarSuccess = MutableStateFlow(false)
    val addToCellarSuccess: StateFlow<Boolean> = _addToCellarSuccess.asStateFlow()

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

    private val _cellarItems = MutableStateFlow<List<CellarItemDto>>(emptyList())

    // ── "What to open?" ───────────────────────────────────────────────────────
    private val _whatToOpen = MutableStateFlow<WhatToOpenState>(WhatToOpenState.Idle)
    val whatToOpen: StateFlow<WhatToOpenState> = _whatToOpen.asStateFlow()

    // ── Quick note draft ──────────────────────────────────────────────────────
    private val _noteSaved  = MutableStateFlow(false)
    val noteSaved: StateFlow<Boolean> = _noteSaved.asStateFlow()

    private var searchJob: Job? = null

    init {
        loadTopDeals()
        loadCellarStats()
    }

    // ── Search ────────────────────────────────────────────────────────────────
    fun onQueryChange(value: String) {
        _query.value = value
        searchJob?.cancel()
        if (value.isBlank()) { _uiState.value = HomeUiState.Idle; return }
        searchJob = viewModelScope.launch {
            delay(600)
            _uiState.value = HomeUiState.Loading
            when (val res = searchRepo.textSearch(value.trim())) {
                is ApiResult.Success -> _uiState.value =
                    if (res.data.isEmpty()) HomeUiState.Idle
                    else HomeUiState.Results(res.data)
                is ApiResult.Error       -> _uiState.value = HomeUiState.Error(res.message ?: "Ошибка поиска")
                is ApiResult.NetworkError -> _uiState.value = HomeUiState.Error("Нет соединения")
            }
        }
    }

    fun onImagePicked(uri: Uri) {
        _recognitionPhotoUri.value = uri
        viewModelScope.launch {
            _imageLoading.value = true
            _uiState.value      = HomeUiState.Loading
            try {
                val base64 = ImageCompressor.toBase64(context, uri)
                when (val res = searchRepo.recognizeFromImages(listOf(base64))) {
                    is ApiResult.Success -> _uiState.value =
                        if (res.data.isEmpty()) HomeUiState.Error("Вино не распознано")
                        else HomeUiState.Results(res.data)
                    is ApiResult.Error       -> _uiState.value = HomeUiState.Error(res.message ?: "Ошибка распознавания")
                    is ApiResult.NetworkError -> _uiState.value = HomeUiState.Error("Нет соединения")
                }
            } catch (e: Exception) {
                _uiState.value = HomeUiState.Error("Не удалось обработать фото: ${e.message}")
            } finally {
                _imageLoading.value = false
            }
        }
    }

    fun clearResults() {
        _query.value  = ""
        _uiState.value = HomeUiState.Idle
    }

    fun addToCellar(wine: WineRecognitionResult, quantity: Int) {
        viewModelScope.launch {
            val res = cellarRepo.add(AddWineRequest(
                producer    = wine.producer,
                name        = wine.name,
                vintageYear = wine.vintageYear,
                country     = wine.country,
                wineType    = wine.wineType,
                quantity    = quantity,
            ))
            if (res is ApiResult.Success) {
                _recognitionPhotoUri.value?.let { uri ->
                    uriToFile(context, uri)?.let { file ->
                        cellarRepo.uploadPhoto(res.data.id, file)
                    }
                }
                loadCellarStats()
                _addToCellarSuccess.value = true
            }
        }
    }

    fun clearAddToCellarSuccess() { _addToCellarSuccess.value = false }

    private fun uriToFile(context: Context, uri: Uri): File? = try {
        val inputStream = context.contentResolver.openInputStream(uri) ?: return null
        val tempFile = File(context.cacheDir, "cellar_upload_${System.currentTimeMillis()}.jpg")
        tempFile.outputStream().use { out -> inputStream.copyTo(out) }
        tempFile
    } catch (_: Exception) { null }

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
        viewModelScope.launch {
            val res = cellarRepo.getItems()
            if (res is ApiResult.Success) {
                _cellarItems.value = res.data
                _cellarCount.value = res.data.sumOf { it.quantity }
            }
        }
    }

    // ── "What to open?" ───────────────────────────────────────────────────────
    fun getRecommendation(moodWineType: String?, food: String?) {
        _whatToOpen.value = WhatToOpenState.Loading
        viewModelScope.launch {
            val items = _cellarItems.value.ifEmpty {
                val res = cellarRepo.getItems()
                if (res is ApiResult.Success) {
                    _cellarItems.value = res.data
                    res.data
                } else emptyList()
            }

            if (items.isEmpty()) {
                _whatToOpen.value = WhatToOpenState.Empty("Погреб пуст. Добавьте вина, чтобы получать рекомендации.")
                return@launch
            }

            // Filter by mood wine type if specified
            val candidates = if (!moodWineType.isNullOrBlank()) {
                items.filter { it.wineType?.uppercase() == moodWineType.uppercase() }
                    .takeIf { it.isNotEmpty() } ?: items
            } else items

            // Pick the one with the most bottles (most "ready to open")
            val pick = candidates.maxByOrNull { it.quantity } ?: candidates.first()

            // Build a research query for the explanation
            val input = WineResearchInput(
                wineName     = "${pick.producer} ${pick.name}".trim(),
                vintage      = pick.vintageYear?.toString(),
                countryHint  = pick.country,
                producerHint = pick.producer
            )
            val explanation = when (val res = searchRepo.research(input)) {
                is ApiResult.Success -> buildExplanation(res.data, moodWineType, food)
                else -> "Отличный выбор для вечера."
            }
            _whatToOpen.value = WhatToOpenState.Result(pick, explanation)
        }
    }

    fun clearWhatToOpen() { _whatToOpen.value = WhatToOpenState.Idle }

    fun onNoteSaved() { _noteSaved.value = true }
    fun clearNoteSaved() { _noteSaved.value = false }

    fun absolutePhotoUrl(path: String?) = cellarRepo.absolutePhotoUrl(path)

    private fun buildExplanation(
        result: WineResearchResult,
        moodType: String?,
        food: String?
    ): String {
        val w = result.wine
        val parts = mutableListOf<String>()
        w.tastingProfile?.let { parts += it }
        if (!food.isNullOrBlank() && !w.foodPairing.isNullOrEmpty()) {
            val match = w.foodPairing.firstOrNull {
                it.contains(food, ignoreCase = true)
            } ?: w.foodPairing.firstOrNull()
            match?.let { parts += "Хорошо сочетается с: $it." }
        }
        w.servingTemperature?.let { parts += "Подавать при $it." }
        return parts.joinToString(" ").ifBlank { "Отличный выбор для вечера." }
    }
}
