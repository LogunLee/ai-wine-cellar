package com.enolo.app.ui.notes

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.enolo.app.core.network.ApiResult
import com.enolo.app.data.dto.CellarItemDto
import com.enolo.app.data.dto.CreateTastingNoteRequest
import com.enolo.app.data.dto.TastingNoteDto
import com.enolo.app.data.dto.UpdateTastingNoteRequest
import com.enolo.app.data.repository.CellarRepository
import com.enolo.app.data.repository.TastingNotesRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

private const val PAGE_SIZE = 20

data class NotesFilters(
    val search: String = "",
    val ratingMin: Double? = null,
    val wineType: String = "",
    val country: String = "",
    val region: String = "",
    val createdYear: Int? = null,
    val sort: String = "tasting_date_desc", // новые/старые/высокий/низкий рейтинг
) {
    fun activeCount(): Int = listOfNotNull(
        ratingMin,
        wineType.takeIf { it.isNotBlank() },
        country.takeIf { it.isNotBlank() },
        region.takeIf { it.isNotBlank() },
        createdYear,
    ).size
}

data class NotesUiState(
    val items: List<TastingNoteDto> = emptyList(),
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val error: String? = null,
    val page: Int = 1,
    val totalPages: Int = 1,
    val total: Int = 0,
) {
    val canLoadMore: Boolean get() = page < totalPages
}

@HiltViewModel
class NotesViewModel @Inject constructor(
    @dagger.hilt.android.qualifiers.ApplicationContext private val context: android.content.Context,
    private val repository: TastingNotesRepository,
    private val cellarRepository: CellarRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(NotesUiState())
    val uiState: StateFlow<NotesUiState> = _uiState.asStateFlow()

    private val _filters = MutableStateFlow(NotesFilters())
    val filters: StateFlow<NotesFilters> = _filters.asStateFlow()

    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing.asStateFlow()

    // Фоновая синхронизация (крутит значок кнопки синхронизации в шапке).
    private val _syncing = MutableStateFlow(false)
    val syncing: StateFlow<Boolean> = _syncing.asStateFlow()

    private val _cellarItems = MutableStateFlow<List<CellarItemDto>>(emptyList())
    val cellarItems: StateFlow<List<CellarItemDto>> = _cellarItems.asStateFlow()

    private val _actionError = MutableStateFlow<String?>(null)
    val actionError: StateFlow<String?> = _actionError.asStateFlow()

    private var searchJob: Job? = null

    init { load() }

    fun load() {
        // 1) Cache-first: мгновенно показываем заметки из локального кэша (без ожидания сети).
        val cached = repository.cachedNotes()?.let { sortNotes(it, _filters.value.sort) }
        if (!cached.isNullOrEmpty()) {
            _uiState.value = NotesUiState(items = cached, page = 1, totalPages = 1, total = cached.size)
        } else {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
        }
        // 2) Тихая инкрементальная синхронизация кэша (дёшево: только изменения с прошлого раза).
        viewModelScope.launch { repository.syncDelta() }
        // 3) Лёгкое обновление видимого списка (1-я страница, с учётом фильтров).
        lightRefresh()
    }

    /** Лёгкое обновление: подтягивает 1-ю страницу с сервера для текущих фильтров. */
    private fun lightRefresh() {
        viewModelScope.launch {
            _syncing.value = true
            when (val res = fetch(1)) {
                is ApiResult.Success -> _uiState.value = NotesUiState(
                    items = res.data.items,
                    page = res.data.page,
                    totalPages = res.data.totalPages,
                    total = res.data.total,
                )
                is ApiResult.Error -> if (_uiState.value.items.isEmpty()) _uiState.value = _uiState.value.copy(isLoading = false, error = res.message ?: "Ошибка")
                is ApiResult.NetworkError -> if (_uiState.value.items.isEmpty()) _uiState.value = _uiState.value.copy(isLoading = false, error = "Нет соединения")
            }
            _syncing.value = false
        }
    }

    /**
     * Синхронизация по кнопке: СКАЧИВАЕТ ВСЮ базу заметок (все страницы) в локальный кэш,
     * префетчит фото всех вин, затем обновляет видимый (отфильтрованный) список.
     */
    fun sync() {
        viewModelScope.launch {
            _syncing.value = true
            // 1) Инкрементальная синхронизация (фото скачиваются на устройство внутри syncDelta).
            repository.syncDelta()
            // 2) Обновляем видимый список с учётом текущих фильтров.
            when (val res = fetch(1)) {
                is ApiResult.Success -> _uiState.value = NotesUiState(
                    items = res.data.items,
                    page = res.data.page,
                    totalPages = res.data.totalPages,
                    total = res.data.total,
                )
                is ApiResult.Error -> if (_uiState.value.items.isEmpty()) _uiState.value = _uiState.value.copy(isLoading = false, error = res.message ?: "Ошибка")
                is ApiResult.NetworkError -> if (_uiState.value.items.isEmpty()) _uiState.value = _uiState.value.copy(isLoading = false, error = "Нет соединения")
            }
            _syncing.value = false
        }
    }

    /** URI фото: локальный файл (офлайн) если скачан, иначе URL сервера. */
    fun photoUri(relativePath: String?): String? = repository.photoUri(relativePath)

    fun loadMore() {
        val s = _uiState.value
        if (s.isLoadingMore || !s.canLoadMore) return
        viewModelScope.launch {
            _uiState.value = s.copy(isLoadingMore = true)
            when (val res = fetch(s.page + 1)) {
                is ApiResult.Success -> _uiState.value = _uiState.value.copy(
                    items = _uiState.value.items + res.data.items,
                    page = res.data.page,
                    totalPages = res.data.totalPages,
                    total = res.data.total,
                    isLoadingMore = false,
                )
                else -> _uiState.value = _uiState.value.copy(isLoadingMore = false)
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _refreshing.value = true
            when (val res = fetch(1)) {
                is ApiResult.Success -> _uiState.value = NotesUiState(
                    items = res.data.items,
                    page = res.data.page,
                    totalPages = res.data.totalPages,
                    total = res.data.total,
                )
                else -> {}
            }
            _refreshing.value = false
        }
    }

    private suspend fun fetch(page: Int) = repository.list(
        search = _filters.value.search,
        ratingMin = _filters.value.ratingMin,
        wineType = _filters.value.wineType,
        country = _filters.value.country,
        region = _filters.value.region,
        createdYear = _filters.value.createdYear,
        sort = _filters.value.sort,
        page = page,
        limit = PAGE_SIZE,
    )

    private fun sortNotes(list: List<TastingNoteDto>, sort: String): List<TastingNoteDto> = when (sort) {
        "tasting_date_asc" -> list.sortedBy { it.tastingDate }
        "rating_desc"      -> list.sortedByDescending { it.rating }
        "rating_asc"       -> list.sortedBy { it.rating }
        else                -> list.sortedByDescending { it.tastingDate }
    }

    /** Сортировка списка заметок (новые/старые/высокий/низкий рейтинг). */
    fun setSort(sort: String) {
        if (_filters.value.sort == sort) return
        _filters.value = _filters.value.copy(sort = sort)
        load()
    }

    /** Быстрый фильтр по цвету (тип вина): повторное нажатие снимает. */
    fun toggleColor(type: String) {
        _filters.value = _filters.value.copy(wineType = if (_filters.value.wineType == type) "" else type)
        load()
    }

    /** Быстрый фильтр по году создания заметки: повторное нажатие снимает. */
    fun toggleYear(year: Int) {
        _filters.value = _filters.value.copy(createdYear = if (_filters.value.createdYear == year) null else year)
        load()
    }

    fun onSearchChange(q: String) {
        _filters.value = _filters.value.copy(search = q)
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(400)
            load()
        }
    }

    fun applyFilters(ratingMin: Double?, wineType: String, country: String, region: String) {
        _filters.value = _filters.value.copy(ratingMin = ratingMin, wineType = wineType, country = country, region = region)
        load()
    }

    fun clearFilters() {
        _filters.value = NotesFilters(search = _filters.value.search)
        load()
    }

    fun loadCellarItems() {
        if (_cellarItems.value.isNotEmpty()) return
        viewModelScope.launch {
            when (val res = cellarRepository.getItems()) {
                is ApiResult.Success -> _cellarItems.value = res.data
                else -> {}
            }
        }
    }

    fun create(request: CreateTastingNoteRequest, onDone: () -> Unit) {
        viewModelScope.launch {
            when (val res = repository.create(request)) {
                is ApiResult.Success -> { _uiState.value = _uiState.value.copy(items = listOf(res.data) + _uiState.value.items, total = _uiState.value.total + 1); onDone() }
                is ApiResult.Error -> _actionError.value = res.message ?: "Ошибка сохранения"
                is ApiResult.NetworkError -> _actionError.value = "Нет соединения"
            }
        }
    }

    fun update(id: String, request: UpdateTastingNoteRequest, onDone: (TastingNoteDto) -> Unit) {
        viewModelScope.launch {
            when (val res = repository.update(id, request)) {
                is ApiResult.Success -> { replaceInList(res.data); onDone(res.data) }
                is ApiResult.Error -> _actionError.value = res.message ?: "Ошибка сохранения"
                is ApiResult.NetworkError -> _actionError.value = "Нет соединения"
            }
        }
    }

    fun delete(id: String, onDone: () -> Unit) {
        viewModelScope.launch {
            when (repository.delete(id)) {
                is ApiResult.Success -> {
                    _uiState.value = _uiState.value.copy(
                        items = _uiState.value.items.filterNot { it.id == id },
                        total = (_uiState.value.total - 1).coerceAtLeast(0),
                    )
                    onDone()
                }
                is ApiResult.Error -> _actionError.value = "Ошибка удаления"
                is ApiResult.NetworkError -> _actionError.value = "Нет соединения"
            }
        }
    }

    /** Заменить исходную заметку сгенерированным текстом (vivino-поля не заполняются). */
    fun saveVivinoReplace(id: String, text: String, onDone: (TastingNoteDto) -> Unit) {
        update(id, UpdateTastingNoteRequest(noteText = text), onDone)
    }

    /** Сохранить Vivino-версию в дополнение к исходной заметке. */
    fun saveVivinoAppend(id: String, text: String, onDone: (TastingNoteDto) -> Unit) {
        viewModelScope.launch {
            when (val res = repository.saveVivino(id, text)) {
                is ApiResult.Success -> { replaceInList(res.data); onDone(res.data) }
                is ApiResult.Error -> _actionError.value = res.message ?: "Ошибка сохранения"
                is ApiResult.NetworkError -> _actionError.value = "Нет соединения"
            }
        }
    }

    fun deleteVivino(id: String, onDone: (TastingNoteDto) -> Unit) {
        viewModelScope.launch {
            when (val res = repository.deleteVivino(id)) {
                is ApiResult.Success -> { replaceInList(res.data); onDone(res.data) }
                is ApiResult.Error -> _actionError.value = "Ошибка удаления Vivino-версии"
                is ApiResult.NetworkError -> _actionError.value = "Нет соединения"
            }
        }
    }

    /** Генерация Vivino-текста (one-shot). Возвращает текст или сообщение об ошибке. */
    suspend fun generateVivino(id: String): Result<String> =
        when (val res = repository.generateVivino(id)) {
            is ApiResult.Success -> Result.success(res.data)
            is ApiResult.Error -> Result.failure(Exception(res.message ?: "Не удалось сгенерировать текст"))
            is ApiResult.NetworkError -> Result.failure(Exception("Нет соединения"))
        }

    fun absolutePhotoUrl(relativePath: String?): String? = repository.absolutePhotoUrl(relativePath)

    fun clearActionError() { _actionError.value = null }

    private fun replaceInList(note: TastingNoteDto) {
        _uiState.value = _uiState.value.copy(
            items = _uiState.value.items.map { if (it.id == note.id) note else it },
        )
    }
}
