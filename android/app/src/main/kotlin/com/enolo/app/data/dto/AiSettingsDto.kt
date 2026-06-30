package com.enolo.app.data.dto

import kotlinx.serialization.Serializable

@Serializable
data class AiCatalogResponse(val providers: List<AiProviderDto>)

@Serializable
data class AiProviderDto(
    val code: String,
    val name: String,
    val keyConsoleUrl: String,
    val keyInstructions: String,
    val freeTierNote: String? = null,
    val models: List<AiModelDto> = emptyList(),
)

@Serializable
data class AiModelDto(
    val id: String,
    val code: String,
    val name: String,
    val capabilities: List<String> = emptyList(),
    val note: String? = null,
)

@Serializable
data class AiSettingsResponse(
    val providerKeys: List<AiProviderKeyDto> = emptyList(),
    val tasks: List<AiTaskDto> = emptyList(),
)

@Serializable
data class AiProviderKeyDto(
    val providerCode: String,
    val keyMask: String,
    val isValid: Boolean? = null,
    val checkedAt: String? = null,
)

@Serializable
data class AiTaskDto(
    val code: String,
    val name: String,
    val description: String? = null,
    val requiredCapability: String,
    val promptEditable: Boolean = false,
    val requiresModel: Boolean = true,
    val defaultPrompt: String? = null,
    val recommendedModel: String? = null,
    val trialLimit: Int = 0,
    val trialUsed: Int = 0,
    val setting: AiTaskSettingDto? = null,
)

@Serializable
data class AiTaskSettingDto(
    val modelId: String? = null,
    val modelCode: String? = null,
    val modelName: String? = null,
    val providerCode: String? = null,
    val customPrompt: String? = null,
)

@Serializable
data class SaveKeyRequest(val apiKey: String)

@Serializable
data class SaveKeyResponse(val providerCode: String, val keyMask: String)

@Serializable
data class TestKeyResponse(val ok: Boolean, val error: String? = null)

@Serializable
data class SaveTaskSettingRequest(val modelId: String? = null, val customPrompt: String? = null)
