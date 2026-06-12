package com.enolo.app.ui.cellar

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.enolo.app.core.network.ApiResult
import com.enolo.app.data.dto.VivinoResultDto
import com.enolo.app.data.repository.VivinoRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

private val Ink   = Color(0xFF1A1A1D)
private val Ink3  = Color(0xFF787880)
private val Fill  = Color(0xFFEEECE9)
private val Line  = Color(0xFFD6D4CF)
private val Teal  = Color(0xFF1C6F5E)
private val TealWash = Color(0xFFE9F3EE)

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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VivinoSearchSheet(
    initialQuery : String = "",
    onSelect     : (url: String) -> Unit,
    onDismiss    : () -> Unit,
    viewModel    : VivinoSearchViewModel = hiltViewModel(),
) {
    var query   by remember { mutableStateOf(initialQuery) }
    val results by viewModel.results.collectAsState()
    val loading by viewModel.loading.collectAsState()
    val error   by viewModel.error.collectAsState()

    LaunchedEffect(initialQuery) {
        if (initialQuery.isNotBlank()) viewModel.search(initialQuery)
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor   = Color.White,
        shape            = RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp),
        scrimColor       = Color(0x51141419),
        dragHandle = {
            Box(
                Modifier.padding(top = 8.dp, bottom = 4.dp)
                    .size(width = 36.dp, height = 4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(Color(0xFFD6D6D4)),
            )
        },
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.85f)
        ) {
            // Header
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Поиск в Vivino", fontSize = 19.sp, fontWeight = FontWeight.SemiBold, color = Ink, modifier = Modifier.weight(1f))
                Box(
                    Modifier.size(34.dp).clip(CircleShape).background(Fill).clickable(onClick = onDismiss),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(18.dp), tint = Ink) }
            }
            HorizontalDivider(color = Line)

            // Search field
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Fill)
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Default.Search, contentDescription = null, tint = Ink3, modifier = Modifier.size(18.dp))
                BasicTextField(
                    value         = query,
                    onValueChange = { q -> query = q; viewModel.search(q) },
                    modifier      = Modifier.weight(1f),
                    singleLine    = true,
                    textStyle     = TextStyle(fontSize = 15.sp, color = Ink),
                    cursorBrush   = SolidColor(Teal),
                    decorationBox = { inner ->
                        if (query.isEmpty()) Text("Введите название вина…", fontSize = 15.sp, color = Ink3)
                        inner()
                    },
                )
                if (query.isNotEmpty()) {
                    IconButton(onClick = { query = ""; viewModel.search("") }, modifier = Modifier.size(20.dp)) {
                        Icon(Icons.Default.Close, contentDescription = null, tint = Ink3, modifier = Modifier.size(16.dp))
                    }
                }
            }

            // Content
            when {
                loading -> {
                    Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Teal, modifier = Modifier.size(28.dp))
                    }
                }
                error != null -> {
                    Text(
                        text     = "Ошибка: $error",
                        color    = Color(0xFFC23B36),
                        fontSize = 13.sp,
                        modifier = Modifier.padding(horizontal = 20.dp),
                    )
                }
                results.isEmpty() && query.length >= 2 && !loading -> {
                    Text(
                        text     = "Ничего не найдено",
                        color    = Ink3,
                        fontSize = 14.sp,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
                    )
                }
                else -> {
                    LazyColumn(
                        Modifier.fillMaxWidth(),
                        contentPadding = PaddingValues(bottom = 24.dp),
                    ) {
                        items(results, key = { it.url }) { result ->
                            VivinoResultRow(
                                result   = result,
                                onSelect = onSelect,
                            )
                            HorizontalDivider(color = Line, modifier = Modifier.padding(start = 16.dp))
                        }
                    }
                }
            }
        }
    }
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
