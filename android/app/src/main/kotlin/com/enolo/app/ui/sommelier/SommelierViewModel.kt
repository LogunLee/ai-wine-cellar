package com.enolo.app.ui.sommelier

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.enolo.app.core.network.ApiResult
import com.enolo.app.data.dto.CellarItemDto
import com.enolo.app.data.dto.ChatMessageDto
import com.enolo.app.data.dto.ChatSessionDto
import com.enolo.app.data.dto.ChatStreamEvent
import com.enolo.app.data.repository.CellarRepository
import com.enolo.app.data.repository.SommelierRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SommelierUiState(
    val sessionId: String? = null,
    val messages: List<ChatMessageDto> = emptyList(),
    val sending: Boolean = false,
    /** Частичный текст ответа во время потоковой печати (null — стрима нет). */
    val streaming: String? = null,
    val error: String? = null,
)

@HiltViewModel
class SommelierViewModel @Inject constructor(
    private val repo: SommelierRepository,
    private val cellarRepo: CellarRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(SommelierUiState())
    val state: StateFlow<SommelierUiState> = _state.asStateFlow()

    private val _sessions = MutableStateFlow<List<ChatSessionDto>>(emptyList())
    val sessions: StateFlow<List<ChatSessionDto>> = _sessions.asStateFlow()

    /** Вина погреба по id — чтобы рисовать карточки подбора так же, как в погребе. */
    private val _cellarById = MutableStateFlow<Map<String, CellarItemDto>>(emptyMap())
    val cellarById: StateFlow<Map<String, CellarItemDto>> = _cellarById.asStateFlow()

    init {
        newChat()
        loadCellarCache()
    }

    /**
     * Новый пустой диалог. Сессию на сервере НЕ создаём заранее — чтобы пустые чаты
     * не висели в истории; реальная сессия создаётся лениво при первой отправке.
     */
    fun newChat() {
        _state.value = SommelierUiState(sending = false)
    }

    private fun loadCellarCache() {
        _cellarById.value = (cellarRepo.cachedItems() ?: emptyList()).associateBy { it.id }
    }

    /** URI фото вина: локальный файл (офлайн) либо URL сервера. */
    fun photoUri(path: String?): String? = cellarRepo.photoUri(path)

    fun loadSessions() {
        viewModelScope.launch {
            when (val r = repo.listSessions()) {
                is ApiResult.Success -> _sessions.value = r.data
                else -> {}
            }
        }
    }

    fun openSession(id: String) {
        loadCellarCache()
        viewModelScope.launch {
            _state.value = _state.value.copy(sending = true, error = null)
            when (val r = repo.getSession(id)) {
                is ApiResult.Success -> _state.value = SommelierUiState(sessionId = r.data.id, messages = r.data.messages)
                is ApiResult.Error -> _state.value = _state.value.copy(sending = false, error = r.message)
                is ApiResult.NetworkError -> _state.value = _state.value.copy(sending = false, error = "Нет соединения")
            }
        }
    }

    fun send(text: String) {
        val msg = text.trim()
        if (msg.isEmpty() || _state.value.sending) return
        viewModelScope.launch {
            // Свежий кэш погреба, чтобы карточки подбора в финальном сообщении нашлись.
            loadCellarCache()
            // Гарантируем наличие сессии.
            var sid = _state.value.sessionId
            if (sid == null) {
                sid = (repo.createSession() as? ApiResult.Success)?.data?.id
                if (sid == null) { _state.value = _state.value.copy(error = "Не удалось создать диалог"); return@launch }
                _state.value = _state.value.copy(sessionId = sid)
            }
            // Оптимистично показываем сообщение пользователя; streaming="" → пузырь «печатает».
            val userMsg = ChatMessageDto(id = "local-${System.currentTimeMillis()}", role = "user", content = msg)
            _state.value = _state.value.copy(messages = _state.value.messages + userMsg, sending = true, streaming = "", error = null)

            try {
                repo.streamMessage(sid, msg).collect { ev ->
                    when (ev) {
                        is ChatStreamEvent.Delta ->
                            _state.value = _state.value.copy(streaming = (_state.value.streaming ?: "") + ev.text)
                        is ChatStreamEvent.Done ->
                            _state.value = _state.value.copy(messages = _state.value.messages + ev.message, streaming = null, sending = false)
                        is ChatStreamEvent.Error ->
                            _state.value = _state.value.copy(streaming = null, sending = false, error = ev.message)
                    }
                }
                // Поток закрылся без явного done — снимаем индикатор.
                if (_state.value.sending) _state.value = _state.value.copy(sending = false, streaming = null)
            } catch (e: Exception) {
                _state.value = _state.value.copy(sending = false, streaming = null, error = "Нет соединения")
            }
        }
    }

    fun clearError() { _state.value = _state.value.copy(error = null) }
}
