import type { Provider } from '../../../shared/types/Provider.js';

/**
 * Provider Repository Interface
 */
export interface IProviderRepository {
  /**
   * Find all enabled providers
   */
  findAll(): Promise<Provider[]>;

  /**
   * Find provider by ID
   */
  findById(id: number): Promise<Provider | null>;

  /**
   * Create a new provider
   */
  create(data: Provider): Promise<Provider>;

  /**
   * Update provider
   */
  update(id: number, data: Partial<Provider>): Promise<Provider>;

  /**
   * Remove provider
   */
  remove(id: number): Promise<void>;

  /**
   * Update provider status
   */
  updateStatus(id: number, status: number): Promise<Provider>;
}
