package com.enolo.app.ui.cellar

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
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
import com.enolo.app.data.dto.VivinoResultDto
import com.enolo.app.data.repository.VivinoRepository
import com.enolo.app.ui.theme.TokenFill as Fill
import com.enolo.app.ui.theme.TokenInk as Ink
import com.enolo.app.ui.theme.TokenInk3 as Ink3
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
class VivinoSearchViewModel @Inject constructor(
    private val vivinoRepository: VivinoRepository
) : ViewModel() {

    private val _results = MutableStateFlow<List<VivinoResultDto>>(emptyList())
    val results: StateFlow<List<VivinoResultDto>> = _results.asStateFlow()

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
            when (val r = vivinoRepository.search(query.trim())) {
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
fun VivinoSearchSheet(
    initialQuery : String = "",
    onSelect     : (url: String) -> Unit,
    onDismiss    : () -> Unit,
    viewModel    : VivinoSearchViewModel = hiltViewModel(),
) {
    val results by viewModel.results.collectAsState()
    val loading by viewModel.loading.collectAsState()
    val error   by viewModel.error.collectAsState()

    LinkSearchSheet(
        title         = "Поиск в Vivino",
        initialQuery  = initialQuery,
        results       = results,
        loading       = loading,
        error         = error,
        onQueryChange = viewModel::search,
        onDismiss     = onDismiss,
        resultKey     = { it.url },
        resultRow     = { result -> VivinoResultRow(result = result, onSelect = onSelect) },
    )
}

// ─── Result row ──────────────────────────────────────────────────────────────

@Composable
private fun VivinoResultRow(
    result   : VivinoResultDto,
    onSelect : (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxWidth()) {
        Row(
            Modifier
                .fillMaxWidth()
                .clickable {
                    if (result.years.isEmpty()) onSelect(result.url)
                    else expanded = !expanded
                }
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Column(Modifier.weight(1f)) {
                Text(result.name, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Ink)
                if (result.years.isNotEmpty()) {
                    Text(
                        text     = "${result.years.size} vintage${if (result.years.size > 1) "s" else ""}",
                        fontSize = 12.sp,
                        color    = Ink3,
                    )
                }
            }
            if (result.years.isEmpty()) {
                // No years — tap whole row to select base URL
                Surface(shape = RoundedCornerShape(8.dp), color = TealWash) {
                    Text("Выбрать", fontSize = 12.sp, color = Teal, fontWeight = FontWeight.Medium,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp))
                }
            } else {
                Surface(shape = RoundedCornerShape(8.dp), color = Fill) {
                    Text(if (expanded) "Скрыть" else "Год ▾", fontSize = 12.sp, color = Ink3,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp))
                }
            }
        }

        // Year picker
        if (expanded && result.years.isNotEmpty()) {
            LazyRow(
                Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                // "Any" = base URL without year
                item {
                    YearPill(label = "Без года") { onSelect(result.url) }
                }
                items(result.years) { year ->
                    YearPill(label = year.toString()) {
                        onSelect("${result.url}?year=$year")
                    }
                }
            }
        }
    }
}

@Composable
private fun YearPill(label: String, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape   = RoundedCornerShape(20.dp),
        color   = TealWash,
        modifier = Modifier.height(32.dp),
    ) {
        Text(
            label,
            modifier   = Modifier.padding(horizontal = 14.dp, vertical = 6.dp),
            fontSize   = 13.sp,
            fontWeight = FontWeight.Medium,
            color      = Teal,
        )
    }
}
