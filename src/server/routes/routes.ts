import express, { RequestHandler } from 'express';
import providerController from '../controllers/ProviderController.js';
import modelController from '../controllers/ModelController.js';
import completionController from '../controllers/CompletionController.js';
import taskController from '../controllers/TaskController.js';
import fileController from '../controllers/FileController.js';
const router = express.Router();

// 服务商路由
router.get('/providers', providerController.getAllProviders as RequestHandler);
router.get('/providers/:id', providerController.getProviderById as RequestHandler);
router.post('/providers', providerController.createProvider as RequestHandler);
router.put('/providers/:id', providerController.updateProvider as RequestHandler);
router.delete('/providers/:id', providerController.deleteProvider as RequestHandler);
router.put('/providers/:id/status', providerController.updateProviderStatus as RequestHandler);

// 模型路由
router.get('/models', modelController.getAllModels as RequestHandler);
router.get('/models/:provider', modelController.getModelsByProviderId as RequestHandler);
router.post('/models', modelController.createModel as RequestHandler);
router.delete('/models/:id/:provider', modelController.deleteModel as RequestHandler);

// 任务路由
router.post('/tasks', taskController.createTasks as RequestHandler);
router.get('/tasks', taskController.getAllTasks as RequestHandler);

// 文件上传路由
router.post('/upload', fileController.uploadFiles as RequestHandler);

// 对话接口路由
router.post('/markimagedown', completionController.markImagedown as RequestHandler);
router.post('/try', completionController.testConnection as RequestHandler);

export default router; 