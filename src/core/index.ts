// Core Module - Clean Architecture
//
// Layer hierarchy (outer to inner):
// 1. Infrastructure - Database, adapters, external services
// 2. Application - Use cases, orchestration, workers
// 3. Domain - Business logic, repositories
// 4. Shared - Cross-cutting concerns (events, DI)

// Re-export all layers
export * from './infrastructure/index.js';
export * from './application/index.js';
export * from './domain/index.js';
export * from './shared/index.js';
