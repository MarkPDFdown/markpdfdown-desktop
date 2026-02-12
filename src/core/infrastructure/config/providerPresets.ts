/**
 * 预设供应商配置接口
 */
export interface ProviderPreset {
  /** 供应商名称 */
  name: string;
  /** 协议类型 */
  type: string;
  /** API 基础地址 */
  apiBase: string;
  /** 模型列表 API 路径 */
  modelListApi: string;
  /** 模型名称字段映射（从 API 响应中提取模型名称的字段路径） */
  modelNameField: string;
  /** 模型 ID 字段映射（从 API 响应中提取模型 ID 的字段路径） */
  modelIdField: string;
  /** 可选：模型能力字段映射（支持点号嵌套路径，如 "architecture.input_modalities"） */
  capabilityField?: string;
  /** 可选：能力过滤值，仅保留能力字段数组中包含该值的模型（默认 "image"） */
  capabilityFilter?: string;
  /** 可选：默认模型列表 */
  defaultModels?: Array<{ id: string; name: string }>;
}

/**
 * 预设供应商列表
 * 应用启动时会自动注入这些供应商（如果不存在），默认状态为禁用（status = -1）
 */
export const providerPresets: ProviderPreset[] = [
  {
    name: "OpenAI",
    type: "openai-responses",
    apiBase: "https://api.openai.com/v1",
    modelListApi: "/models",
    modelNameField: "id",
    modelIdField: "id",
    defaultModels: [],
  },
  {
    name: "Anthropic",
    type: "anthropic",
    apiBase: "https://api.anthropic.com/v1",
    modelListApi: "/models",
    modelNameField: "display_name",
    modelIdField: "id",
    capabilityField: "input_modalities",
    capabilityFilter: "image",
    defaultModels: [],
  },
  {
    name: "Gemini",
    type: "gemini",
    apiBase: "https://generativelanguage.googleapis.com/v1beta",
    modelListApi: "/models",
    modelNameField: "displayName",
    modelIdField: "name",
    defaultModels: [],
  },
  {
    name: "ZenMux",
    type: "anthropic",
    apiBase: "https://zenmux.ai/api/anthropic/v1",
    modelListApi: "/models",
    modelNameField: "display_name",
    modelIdField: "id",
    capabilityField: "input_modalities",
    capabilityFilter: "image",
    defaultModels: [],
  },
  {
    name: "OpenRouter",
    type: "openai",
    apiBase: "https://openrouter.ai/api/v1",
    modelListApi: "/models",
    modelNameField: "name",
    modelIdField: "id",
    capabilityField: "architecture.input_modalities",
    capabilityFilter: "image",
    defaultModels: [],
  },
  {
    name: "SiliconFlow",
    type: "openai",
    apiBase: "https://api.siliconflow.cn/v1",
    modelListApi: "/models",
    modelNameField: "id",
    modelIdField: "id",
    defaultModels: [],
  },
  {
    name: "Ollama",
    type: "ollama",
    apiBase: "http://localhost:11434/api",
    modelListApi: "/tags",
    modelNameField: "name",
    modelIdField: "name",
    defaultModels: [],
  },
];

/**
 * 根据供应商类型和名称查找预设配置
 * @param type 协议类型
 * @param name 供应商名称
 * @returns 预设配置或 undefined
 */
export function findProviderPreset(
  type: string,
  name: string,
): ProviderPreset | undefined {
  return providerPresets.find(
    (preset) => preset.type === type && preset.name === name,
  );
}

/**
 * 根据供应商类型和名称生成唯一标识
 * @param type 协议类型
 * @param name 供应商名称
 * @returns 唯一标识字符串
 */
export function getProviderPresetKey(type: string, name: string): string {
  return `${type}:${name}`;
}
