package com.enolo.app.util

import com.enolo.app.core.network.ApiResult
import com.enolo.app.data.repository.AiSettingsRepository
import javax.inject.Inject
import javax.inject.Singleton

private const val FALLBACK_PROMPT =
    "Расскажи подробно об этом вине: производитель, регион, сорта винограда, стиль, " +
        "потенциал хранения, температура подачи, гастрономические сочетания, оценки критиков. " +
        "Отвечай на русском, структурированно.\n\nВино:"

/**
 * Собирает готовый запрос для внешней LLM: промпт задачи external_research
 * (пользовательский или дефолтный) + данные вина. Результат копируется в буфер обмена.
 */
@Singleton
class ExternalResearchPrompt @Inject constructor(
    private val aiSettingsRepository: AiSettingsRepository,
) {
    private var cachedPrompt: String? = null

    suspend fun build(producer: String?, name: String, vintageYear: Int?): String {
        val prompt = cachedPrompt ?: fetchPrompt().also { cachedPrompt = it }
        val wine = listOfNotNull(
            producer?.takeIf { it.isNotBlank() },
            name.takeIf { it.isNotBlank() },
            vintageYear?.toString(),
        ).joinToString(" ")
        return "$prompt $wine".trim()
    }

    /** Сбрасывает кэш (после изменения промпта в настройках). */
    fun invalidate() {
        cachedPrompt = null
    }

    private suspend fun fetchPrompt(): String {
        val res = aiSettingsRepository.settings()
        if (res is ApiResult.Success) {
            val task = res.data.tasks.find { it.code == "external_research" }
            val custom = task?.setting?.customPrompt?.takeIf { it.isNotBlank() }
            val default = task?.defaultPrompt?.takeIf { it.isNotBlank() }
            return custom ?: default ?: FALLBACK_PROMPT
        }
        return FALLBACK_PROMPT
    }
}
