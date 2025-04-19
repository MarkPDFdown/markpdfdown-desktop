import express, { RequestHandler } from 'express';
import providerController from '../controllers/providerController.js';
import modelController from '../controllers/modelController.js';
import completionController from '../controllers/completionController.js';
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


// 对话接口路由
router.post('/markimagedown', completionController.markImagedown as RequestHandler);
router.post('/try', completionController.testConnection as RequestHandler);

export default router; 