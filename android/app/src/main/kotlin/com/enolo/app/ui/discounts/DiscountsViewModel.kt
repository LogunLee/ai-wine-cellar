package com.enolo.app.ui.discounts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.enolo.app.core.network.ApiResult
import com.enolo.app.core.storage.SettingsStore
import com.enolo.app.data.dto.DiscountOfferDto
import com.enolo.app.data.dto.StoreDto
import com.enolo.app.data.repository.DiscountFilters
import com.enolo.app.data.repository.DiscountsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DiscountsUiState(
    val items: List<DiscountOfferDto> = emptyList(),
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val error: String? = null,
    val total: Int = 0,
    val currentPage: Int = 1,
    val hasMore: Boolean = false,
    val lastUpdated: String? = null,
)

data class FilterOptionsState(
    val grapes: List<String> = emptyList(),
    val countries: List<String> = emptyList(),
)

data class QuickPreset(val key: String, val label: String)

val QUICK_PRESETS = listOf(
    QuickPreset("RED",          "Красное"),
    QuickPreset("WHITE",        "Белое"),
    QuickPreset("SPARKLING",    "Игристое"),
    QuickPreset("ROSE",         "Розе"),
    QuickPreset("PRICE_1000",   "до 1000 ₽"),
    QuickPreset("DISCOUNT_30",  "Скидка 30%+"),
)

fun DiscountFilters.activePresetKeys(): Set<String> = buildSet {
    if (wineType == "RED")       add("RED")
    if (wineType == "WHITE")     add("WHITE")
    if (wineType == "SPARKLING") add("SPARKLING")
    if (wineType == "ROSE")      add("ROSE")
    if (maxPrice == 1000 && minPrice == null) add("PRICE_1000")
    if (minDiscount == 30)       add("DISCOUNT_30")
}

fun DiscountFilters.activeFilterCount(): Int = listOfNotNull(
    wineType.takeIf { it.isNotBlank() },
    minDiscount,
    minPrice,
    maxPrice,
    seller.takeIf { it.isNotBlank() },
    country.takeIf { it.isNotBlank() },
    grapes.takeIf { it.isNotEmpty() },
).size

@HiltViewModel
class DiscountsViewModel @Inject constructor(
    private val repository: DiscountsRepository,
    private val settingsStore: SettingsStore,
) : ViewModel() {

    private val _uiState  = MutableStateFlow(DiscountsUiState())
    val uiState: StateFlow<DiscountsUiState> = _uiState.asStateFlow()

    private val _filters  = MutableStateFlow(DiscountFilters())
    val filters: StateFlow<DiscountFilters> = _filters.asStateFlow()

    private val _stores   = MutableStateFlow<List<StoreDto>>(emptyList())
    val stores: StateFlow<List<StoreDto>> = _stores.asStateFlow()

    private val _filterOptions = MutableStateFlow(FilterOptionsState())
    val filterOptions: StateFlow<FilterOptionsState> = _filterOptions.asStateFlow()

    private var searchJob: Job? = null

    init {
        // Load persisted sort, then start main data fetch
        viewModelScope.launch {
            val savedSort = settingsStore.discountSortFlow.first()
            _filters.value = _filters.value.copy(sort = savedSort)
            load(reset = true)
        }
        loadStores()
        loadLastUpdated()
        loadFilterOptions()
    }

    private fun loadStores() {
        viewModelScope.launch {
            when (val res = repository.getStores()) {
                is ApiResult.Success -> _stores.value = res.data
                else -> {}
            }
        }
    }

    private fun loadLastUpdated() {
        viewModelScope.launch {
            when (val res = repository.getLastUpdated()) {
                is ApiResult.Success -> _uiState.value = _uiState.value.copy(lastUpdated = res.data.lastUpdated)
                else -> {}
            }
        }
    }

    private fun loadFilterOptions() {
        viewModelScope.launch {
            when (val res = repository.getFilterOptions()) {
                is ApiResult.Success -> _filterOptions.value = FilterOptionsState(
                    grapes    = res.data.grapes,
                    countries = res.data.countries,
                )
                else -> {}
            }
        }
    }

    fun onSearchChange(value: String) {
        _filters.value = _filters.value.copy(search = value, page = 1)
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(600)
            load(reset = true)
        }
    }

    fun applyFilters(newFilters: DiscountFilters) {
        _filters.value = newFilters.copy(page = 1)
        load(reset = true)
    }

    fun togglePreset(key: String) {
        val f = _filters.value
        val updated = when (key) {
            "RED", "WHITE", "SPARKLING", "ROSE" ->
                f.copy(wineType = if (f.wineType == key) "" else key, page = 1)
            "PRICE_1000" ->
                if (f.maxPrice == 1000 && f.minPrice == null)
                    f.copy(maxPrice = null, page = 1)
                else
                    f.copy(minPrice = null, maxPrice = 1000, page = 1)
            "DISCOUNT_30" ->
                f.copy(minDiscount = if (f.minDiscount == 30) null else 30, page = 1)
            else -> f
        }
        _filters.value = updated
        load(reset = true)
    }

    fun setSort(sort: String) {
        _filters.value = _filters.value.copy(sort = sort, page = 1)
        viewModelScope.launch { settingsStore.setDiscountSort(sort) }
        load(reset = true)
    }

    fun loadMore() {
        val state = _uiState.value
        if (state.isLoading || state.isLoadingMore || !state.hasMore) return
        _filters.value = _filters.value.copy(page = state.currentPage + 1)
        load(reset = false)
    }

    fun refresh() {
        _filters.value = _filters.value.copy(page = 1)
        load(reset = true)
    }

    private fun load(reset: Boolean) {
        viewModelScope.launch {
            if (reset) _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            else       _uiState.value = _uiState.value.copy(isLoadingMore = true)

            when (val res = repository.getOffers(_filters.value)) {
                is ApiResult.Success -> {
                    val resp     = res.data
                    val newItems = if (reset) resp.items else _uiState.value.items + resp.items
                    _uiState.value = _uiState.value.copy(
                        items         = newItems,
                        total         = resp.total,
                        currentPage   = resp.page,
                        hasMore       = newItems.size < resp.total,
                        isLoading     = false,
                        isLoadingMore = false,
                        error         = null,
                    )
                }
                is ApiResult.Error -> _uiState.value = _uiState.value.copy(
                    isLoading = false, isLoadingMore = false,
                    error = res.message ?: "Ошибка загрузки"
                )
                is ApiResult.NetworkError -> _uiState.value = _uiState.value.copy(
                    isLoading = false, isLoadingMore = false,
                    error = "Нет соединения"
                )
            }
        }
    }
}
