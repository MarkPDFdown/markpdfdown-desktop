/**
 * Task Logic
 *
 * This module re-exports the WorkerOrchestrator for backward compatibility.
 * For the actual implementation, see: services/WorkerOrchestrator.ts
 *
 * @deprecated Import directly from '../services/WorkerOrchestrator.js'
 */
import workerOrchestrator from '../services/WorkerOrchestrator.js';

export default workerOrchestrator;
