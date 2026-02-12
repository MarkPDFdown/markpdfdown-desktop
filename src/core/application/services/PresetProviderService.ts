import ProviderRepository from "../../domain/repositories/ProviderRepository.js";
import {
  providerPresets,
  getProviderPresetKey,
} from "../../infrastructure/config/providerPresets.js";

/**
 * 预设供应商注入服务
 * 在应用启动时执行，将预设供应商注入数据库（如果不存在）
 */
export class PresetProviderService {
  private static instance: PresetProviderService;
  private initialized = false;

  private constructor() {}

  static getInstance(): PresetProviderService {
    if (!PresetProviderService.instance) {
      PresetProviderService.instance = new PresetProviderService();
    }
    return PresetProviderService.instance;
  }

  /**
   * 初始化预设供应商
   * 使用 type + name 去重，若不存在则插入，status = -1（禁用）
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log("[PresetProviderService] Already initialized, skipping...");
      return;
    }

    try {
      console.log("[PresetProviderService] Starting preset provider injection...");

      // 获取已有供应商列表
      const existingProviders = await ProviderRepository.findAllIncludeDisabled();

      // 构建已有供应商的 key 集合
      const existingKeys = new Set(
        existingProviders.map((p) => getProviderPresetKey(p.type, p.name))
      );

      // 遍历预设列表，插入不存在的供应商
      let insertedCount = 0;
      for (const preset of providerPresets) {
        const key = getProviderPresetKey(preset.type, preset.name);

        if (!existingKeys.has(key)) {
          await ProviderRepository.create({
            name: preset.name,
            type: preset.type,
            api_key: "",
            base_url: preset.apiBase,
            suffix: "",
            status: -1, // 默认禁用
          });
          console.log(
            `[PresetProviderService] Inserted preset provider: ${preset.name} (${preset.type})`
          );
          insertedCount++;
        } else {
          console.log(
            `[PresetProviderService] Preset provider already exists: ${preset.name} (${preset.type})`
          );
        }
      }

      console.log(
        `[PresetProviderService] Preset provider injection completed. Inserted: ${insertedCount}`
      );
      this.initialized = true;
    } catch (error) {
      console.error("[PresetProviderService] Failed to initialize preset providers:", error);
      throw error;
    }
  }

  /**
   * 重置初始化状态（主要用于测试）
   */
  reset(): void {
    this.initialized = false;
  }
}

// 导出单例实例
export const presetProviderService = PresetProviderService.getInstance();
