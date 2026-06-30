package com.enolo.app.data.dto

import kotlinx.serialization.Serializable

@Serializable
data class TastingNoteWineDto(
    val cellarItemId: String? = null,
    val producer: String? = null,
    val name: String? = null,
    val wineType: String? = null,
    val country: String? = null,
    val countryIso2: String? = null,
    val region: String? = null,
    val appellation: String? = null,
    val vintageYear: Int? = null,
    val grapes: List<String>? = null,
    val photoPath: String? = null,
)

@Serializable
data class TastingNoteDto(
    val id: String,
    val wine: TastingNoteWineDto,
    val vintage: Int? = null,
    val tastingDate: String,
    val rating: Double,
    val noteText: String? = null,
    val noteExcerpt: String? = null,
    val vivinoNoteText: String? = null,
    val hasVivinoNote: Boolean = false,
    val vivinoNoteCreatedAt: String? = null,
    val vivinoNoteUpdatedAt: String? = null,
    val place: String? = null,
    val price: Double? = null,
    val wouldBuyAgain: Boolean? = null,
    val createdAt: String = "",
    val updatedAt: String = "",
)

/** Результат инкрементальной синхронизации заметок. */
@Serializable
data class SyncNotesResultDto(
    val serverTime: String,
    val changed: List<TastingNoteDto> = emptyList(),
    val deletedIds: List<String> = emptyList(),
)

@Serializable
data class TastingNotesPageDto(
    val items: List<TastingNoteDto> = emptyList(),
    val page: Int = 1,
    val limit: Int = 20,
    val total: Int = 0,
    val totalPages: Int = 1,
)

/** Вручную введённое вино (когда нет в погребе). */
@Serializable
data class ManualWineRequest(
    val producer: String? = null,
    val name: String? = null,
    val vintageYear: Int? = null,
    val country: String? = null,
    val region: String? = null,
    val wineType: String? = null,
)

@Serializable
data class CreateTastingNoteRequest(
    val cellarItemId: String? = null,
    val manualWine: ManualWineRequest? = null,
    val tastingDate: String,
    val rating: Double,
    val vintage: Int? = null,
    val noteText: String? = null,
    val place: String? = null,
    val price: Double? = null,
    val wouldBuyAgain: Boolean? = null,
)

/**
 * Частичное обновление. Поля с дефолтом null НЕ сериализуются (encodeDefaults=false),
 * поэтому не указанные поля сервер трактует как «не трогать». Чтобы очистить текстовое
 * поле, передаём пустую строку ("") — сервер приведёт её к null.
 */
@Serializable
data class UpdateTastingNoteRequest(
    val cellarItemId: String? = null,
    val manualWine: ManualWineRequest? = null,
    val tastingDate: String? = null,
    val rating: Double? = null,
    val vintage: Int? = null,
    val noteText: String? = null,
    val place: String? = null,
    val price: Double? = null,
    val wouldBuyAgain: Boolean? = null,
)

@Serializable
data class GenerateVivinoResponse(
    val vivinoNoteText: String,
)

@Serializable
data class SaveVivinoRequest(
    val vivinoNoteText: String,
)
