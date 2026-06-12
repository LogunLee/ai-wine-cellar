package com.enolo.app.ui.cellar

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.enolo.app.core.network.ApiResult
import com.enolo.app.data.dto.WineSearcherResultDto
import com.enolo.app.data.repository.WineCriticRepository
import com.enolo.app.ui.theme.TokenInk as Ink
import com.enolo.app.ui.theme.TokenTeal as Teal
import com.enolo.app.ui.theme.TokenTealWash as TealWash
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

// ─── ViewModel ───────────────────────────────────────────────────────────────

@HiltViewModel
class WineSearcherSearchViewModel @Inject constructor(
    private val wineCriticRepository: WineCriticRepository
) : ViewModel() {

    private val _results = MutableStateFlow<List<WineSearcherResultDto>>(emptyList())
    val results: StateFlow<List<WineSearcherResultDto>> = _results.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private var searchJob: Job? = null

    fun search(query: String) {
        searchJob?.cancel()
        if (query.trim().length < 2) { _results.value = emptyList(); return }
        searchJob = viewModelScope.launch {
            delay(600)
            _loading.value = true
            _error.value = null
            when (val r = wineCriticRepository.search(query.trim())) {
                is ApiResult.Success      -> _results.value = r.data
                is ApiResult.Error        -> { _error.value = r.message; _results.value = emptyList() }
                is ApiResult.NetworkError -> { _error.value = "Нет соединения"; _results.value = emptyList() }
            }
            _loading.value = false
        }
    }
}

// ─── Sheet ───────────────────────────────────────────────────────────────────

@Composable
fun WineSearcherSearchSheet(
    initialQuery : String = "",
    onSelect     : (url: String) -> Unit,
    onDismiss    : () -> Unit,
    viewModel    : WineSearcherSearchViewModel = hiltViewModel(),
) {
    val results by viewModel.results.collectAsState()
    val loading by viewModel.loading.collectAsState()
    val error   by viewModel.error.collectAsState()

    LinkSearchSheet(
        title         = "Поиск в Wine-Searcher",
        initialQuery  = initialQuery,
        results       = results,
        loading       = loading,
        error         = error,
        onQueryChange = viewModel::search,
        onDismiss     = onDismiss,
        resultKey     = { it.url },
        resultRow     = { result -> WineSearcherResultRow(result = result, onSelect = onSelect) },
    )
}

// ─── Result row ──────────────────────────────────────────────────────────────

@Composable
private fun WineSearcherResultRow(
    result   : WineSearcherResultDto,
    onSelect : (String) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onSelect(result.url) }
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text       = result.name,
            fontSize   = 14.sp,
            fontWeight = FontWeight.Medium,
            color      = Ink,
            modifier   = Modifier.weight(1f),
        )
        Surface(shape = RoundedCornerShape(8.dp), color = TealWash) {
            Text(
                "Выбрать",
                fontSize   = 12.sp,
                color      = Teal,
                fontWeight = FontWeight.Medium,
                modifier   = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
            )
        }
    }
}
