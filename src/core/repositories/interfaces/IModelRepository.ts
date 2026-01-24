import type { Model } from '../../../shared/types/Model.js';

/**
 * Model Repository Interface
 */
export interface IModelRepository {
  /**
   * Find all models
   */
  findAll(): Promise<Model[]>;

  /**
   * Find models by provider ID
   */
  findByProviderId(providerId: number): Promise<Model[]>;

  /**
   * Create a new model
   */
  create(data: Model): Promise<Model>;

  /**
   * Remove model by ID and provider
   */
  remove(id: string, provider: number): Promise<void>;

  /**
   * Remove all models by provider ID
   */
  removeByProviderId(providerId: number): Promise<void>;
}
