package com.enolo.app.ui.sommelier

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Liquor
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.enolo.app.data.dto.ChatMessageDto
import com.enolo.app.data.dto.ChatSessionDto
import com.enolo.app.ui.components.MerloticSheet
import com.enolo.app.ui.components.SheetDragHandle
import com.enolo.app.ui.theme.TokenFill as Fill
import com.enolo.app.ui.theme.TokenInk as Ink
import com.enolo.app.ui.theme.TokenInk2 as Ink2
import com.enolo.app.ui.theme.TokenInk3 as Ink3
import com.enolo.app.ui.theme.TokenLine as Line
import com.enolo.app.ui.theme.TokenTeal as Teal
import com.enolo.app.ui.theme.TokenTealWash as TealWash

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SommelierScreen(
    onBack: () -> Unit,
    viewModel: SommelierViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val sessions by viewModel.sessions.collectAsState()
    val cellarById by viewModel.cellarById.collectAsState()
    var input by remember { mutableStateOf("") }
    var showHistory by remember { mutableStateOf(false) }
    var showSlashMenu by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()

    // Автопрокрутка к последнему сообщению (в т.ч. по мере прихода токенов).
    LaunchedEffect(state.messages.size, state.sending, state.streaming?.length) {
        val count = state.messages.size + if (state.sending) 1 else 0
        if (count > 0) listState.animateScrollToItem(count - 1)
    }

    Surface(Modifier.fillMaxSize(), color = Color.White) {
        Column(Modifier.fillMaxSize()) {
            // ── Top bar (как на главном: тот же шрифт/место, но слева «Назад») ──
            com.enolo.app.ui.components.MerloticTopBar(
                title = "AI-сомелье",
                leading = {
                    Box(
                        Modifier.size(30.dp).clickable(onClick = onBack),
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад", tint = Ink, modifier = Modifier.size(24.dp)) }
                },
                actions = {
                    IconButton(onClick = { viewModel.loadSessions(); showHistory = true }) {
                        Icon(Icons.Default.History, "История чатов", tint = Ink2)
                    }
                },
            )
            HorizontalDivider(color = Line)

            // ── Messages ──
            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f).fillMaxWidth(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (state.messages.isEmpty() && !state.sending) {
                    item { GreetingBubble() }
                }
                items(state.messages, key = { it.id }) { m ->
                    if (m.role == "user") UserBubble(m.content)
                    else AssistantBubble(m, cellarById, viewModel::photoUri)
                }
                if (state.sending) {
                    item {
                        val partial = state.streaming
                        // Пока токенов нет — индикатор «печатает», дальше — текст по мере прихода.
                        if (partial.isNullOrEmpty()) TypingBubble() else StreamingBubble(partial)
                    }
                }
            }

            state.error?.let {
                Text(it, color = com.enolo.app.ui.theme.TokenRed, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
            }

            // ── Composer ──
            Composer(
                input = input,
                onInput = { input = it },
                sending = state.sending,
                onSend = { if (input.isNotBlank()) { viewModel.send(input); input = "" } },
                slashMenuOpen = showSlashMenu,
                onToggleSlashMenu = { showSlashMenu = !showSlashMenu },
                onPickCommand = { cmd -> input = "$cmd ${input.trimStart()}"; showSlashMenu = false },
            )
        }
    }

    if (showHistory) {
        HistorySheet(
            sessions = sessions,
            onOpen = { id -> showHistory = false; viewModel.openSession(id) },
            onNew = { showHistory = false; viewModel.newChat() },
            onDismiss = { showHistory = false },
        )
    }
}

// ─── Bubbles ───────────────────────────────────────────────────────────────

@Composable
private fun GreetingBubble() {
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        SommelierAvatar()
        Surface(shape = RoundedCornerShape(16.dp), color = Fill, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Привет! Я ваш AI-сомелье.", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Ink)
                Text(
                    "Помогу подобрать вино из вашего погреба и отвечу на вопросы о вине по литературе. " +
                        "Через меню слева можно выбрать режим: /погреб — подбор бутылок, /консультация — ответ по книгам.",
                    fontSize = 14.sp, color = Ink2, lineHeight = 20.sp,
                )
            }
        }
    }
}

@Composable
private fun UserBubble(text: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
        Surface(shape = RoundedCornerShape(16.dp), color = Teal, modifier = Modifier.widthIn(max = 300.dp)) {
            Text(text, fontSize = 15.sp, color = Color.White, lineHeight = 20.sp, modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp))
        }
    }
}

@Composable
private fun AssistantBubble(
    m: ChatMessageDto,
    cellarById: Map<String, com.enolo.app.data.dto.CellarItemDto>,
    photoUri: (String?) -> String?,
) {
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        SommelierAvatar()
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Surface(shape = RoundedCornerShape(16.dp), color = Fill, modifier = Modifier.fillMaxWidth()) {
                Text(m.content, fontSize = 15.sp, color = Ink, lineHeight = 21.sp, modifier = Modifier.padding(14.dp))
            }
            // Карточки подбираемых вин — точно как в погребе (фото сбоку, та же вёрстка).
            // Весь поясняющий текст — в сообщении выше, в карточке только данные вина.
            m.picks.forEach { p ->
                val item = cellarById[p.cellarItemId]
                if (item != null) {
                    com.enolo.app.ui.cellar.CellarWineCard(
                        item     = item,
                        photoUrl = photoUri(item.photoPath),
                        onClick  = {},
                        onMenu   = {},
                        showMenu = false,
                    )
                } else {
                    // Вина нет в локальном кэше погреба — минимальная карточка-заглушка.
                    Surface(shape = RoundedCornerShape(12.dp), color = Color.White, border = androidx.compose.foundation.BorderStroke(1.dp, Line), modifier = Modifier.fillMaxWidth()) {
                        Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(36.dp).clip(CircleShape).background(TealWash), contentAlignment = Alignment.Center) {
                                Icon(Icons.Default.Liquor, null, Modifier.size(20.dp), tint = Teal)
                            }
                            Text(p.title, fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold, color = Ink, modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StreamingBubble(text: String) {
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        SommelierAvatar()
        Column(Modifier.weight(1f)) {
            Surface(shape = RoundedCornerShape(16.dp), color = Fill, modifier = Modifier.fillMaxWidth()) {
                Text("$text▌", fontSize = 15.sp, color = Ink, lineHeight = 21.sp, modifier = Modifier.padding(14.dp))
            }
        }
    }
}

@Composable
private fun TypingBubble() {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        SommelierAvatar()
        Surface(shape = RoundedCornerShape(16.dp), color = Fill) {
            Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CircularProgressIndicator(Modifier.size(16.dp), color = Teal, strokeWidth = 2.dp)
                Text("Думаю…", fontSize = 14.sp, color = Ink2)
            }
        }
    }
}

@Composable
private fun SommelierAvatar() {
    Box(Modifier.size(32.dp).clip(CircleShape).background(Teal), contentAlignment = Alignment.Center) {
        Icon(Icons.Default.AutoAwesome, null, Modifier.size(18.dp), tint = Color.White)
    }
}

// ─── Composer ──────────────────────────────────────────────────────────────

@Composable
private fun Composer(
    input: String,
    onInput: (String) -> Unit,
    sending: Boolean,
    onSend: () -> Unit,
    slashMenuOpen: Boolean,
    onToggleSlashMenu: () -> Unit,
    onPickCommand: (String) -> Unit,
) {
    // Отступ снизу = максимум из клавиатуры и системной навигации → поле не перекрывается.
    Row(
        Modifier.fillMaxWidth()
            .windowInsetsPadding(WindowInsets.ime.union(WindowInsets.navigationBars))
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        OutlinedTextField(
            value = input,
            onValueChange = onInput,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Напишите сообщение…", color = Ink3) },
            shape = RoundedCornerShape(24.dp),
            maxLines = 5,
            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Teal, unfocusedBorderColor = Line, cursorColor = Teal),
            // «/»-меню слева внутри поля
            leadingIcon = {
                Box {
                    Box(
                        Modifier.padding(start = 4.dp).size(34.dp).clip(CircleShape).background(Fill).clickable(onClick = onToggleSlashMenu),
                        contentAlignment = Alignment.Center,
                    ) { Text("/", fontSize = 19.sp, fontWeight = FontWeight.Bold, color = Ink2) }
                    DropdownMenu(expanded = slashMenuOpen, onDismissRequest = onToggleSlashMenu) {
                        DropdownMenuItem(
                            text = { Column { Text("Поиск в погребе"); Text("/погреб", fontSize = 12.sp, color = Ink3) } },
                            onClick = { onPickCommand("/погреб") },
                            leadingIcon = { Icon(Icons.Default.Liquor, null) },
                        )
                        DropdownMenuItem(
                            text = { Column { Text("Консультация"); Text("/консультация", fontSize = 12.sp, color = Ink3) } },
                            onClick = { onPickCommand("/консультация") },
                            leadingIcon = { Icon(Icons.Default.MenuBook, null) },
                        )
                    }
                }
            },
            // Кнопка отправки справа внутри поля (круглая зелёная)
            trailingIcon = {
                Box(
                    Modifier.padding(end = 4.dp).size(36.dp).clip(CircleShape)
                        .background(if (input.isBlank() || sending) Teal.copy(alpha = 0.4f) else Teal)
                        .clickable(enabled = input.isNotBlank() && !sending, onClick = onSend),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.AutoMirrored.Filled.Send, "Отправить", Modifier.size(18.dp), tint = Color.White) }
            },
        )
    }
}

// ─── History ──────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HistorySheet(
    sessions: List<ChatSessionDto>,
    onOpen: (String) -> Unit,
    onNew: () -> Unit,
    onDismiss: () -> Unit,
) {
    val screenH = androidx.compose.ui.platform.LocalConfiguration.current.screenHeightDp.dp
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Color.White,
        shape = MerloticSheet.Shape,
        scrimColor = MerloticSheet.ScrimColor,
        dragHandle = { SheetDragHandle() },
    ) {
        Column(Modifier.fillMaxWidth().heightIn(max = screenH * 0.85f).navigationBarsPadding()) {
            Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 6.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("История чатов", fontSize = 19.sp, fontWeight = FontWeight.SemiBold, color = Ink, modifier = Modifier.weight(1f))
                TextButton(onClick = onNew) { Text("Новый чат", color = Teal) }
            }
            if (sessions.isEmpty()) {
                Text("Пока нет сохранённых диалогов", color = Ink3, modifier = Modifier.padding(20.dp))
            } else {
                LazyColumn(Modifier.weight(1f, fill = false)) {
                    items(sessions, key = { it.id }) { s ->
                        Column(
                            Modifier.fillMaxWidth().clickable { onOpen(s.id) }.padding(horizontal = 20.dp, vertical = 14.dp),
                            verticalArrangement = Arrangement.spacedBy(2.dp),
                        ) {
                            Text(s.title ?: "Без названия", fontSize = 15.sp, color = Ink, fontWeight = FontWeight.Medium, maxLines = 1)
                            Text(s.updatedAt.take(10), fontSize = 12.sp, color = Ink3)
                        }
                        HorizontalDivider(color = Line)
                    }
                }
            }
        }
    }
}
