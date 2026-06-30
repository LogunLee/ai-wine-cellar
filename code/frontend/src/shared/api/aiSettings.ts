import { api } from './client'

export interface AiCatalogModel {
  id: string
  code: string
  name: string
  capabilities: string[]
  note: string | null
}

export interface AiCatalogProvider {
  code: string
  name: string
  keyConsoleUrl: string
  keyInstructions: string
  freeTierNote: string | null
  models: AiCatalogModel[]
}

export interface AiProviderKeyInfo {
  providerCode: string
  keyMask: string
  isValid: boolean | null
  checkedAt: string | null
}

export interface AiTaskSettingInfo {
  modelId: string | null
  modelCode: string | null
  modelName: string | null
  providerCode: string | null
  customPrompt: string | null
}

export interface AiTaskInfo {
  code: string
  name: string
  description: string | null
  requiredCapability: string
  promptEditable: boolean
  requiresModel: boolean
  defaultPrompt: string | null
  recommendedModel: string | null
  trialLimit: number
  trialUsed: number
  setting: AiTaskSettingInfo | null
}

export interface AiSettingsResponse {
  providerKeys: AiProviderKeyInfo[]
  tasks: AiTaskInfo[]
}

export const aiSettingsApi = {
  catalog: () => api.get<{ providers: AiCatalogProvider[] }>('/ai/catalog'),
  settings: () => api.get<AiSettingsResponse>('/ai/settings'),
  saveKey: (providerCode: string, apiKey: string) =>
    api.put<{ providerCode: string; keyMask: string }>(`/ai/providers/${providerCode}/key`, { apiKey }),
  testKey: (providerCode: string) =>
    api.post<{ ok: boolean; error: string | null }>(`/ai/providers/${providerCode}/key/test`),
  deleteKey: (providerCode: string) => api.delete(`/ai/providers/${providerCode}/key`),
  saveTaskSetting: (taskCode: string, body: { modelId?: string | null; customPrompt?: string | null }) =>
    api.put(`/ai/tasks/${taskCode}/setting`, body),
  resetTaskSetting: (taskCode: string) => api.delete(`/ai/tasks/${taskCode}/setting`),
}
