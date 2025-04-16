import express from 'express';
import providerController from '../controllers/providerController.js';
import modelController from '../controllers/modelController.js';
const router = express.Router();

// 服务商路由
router.get('/providers', providerController.getAllProviders);
router.get('/providers/:id', providerController.getProviderById);
router.post('/providers', providerController.createProvider);
router.put('/providers/:id', providerController.updateProvider);
router.delete('/providers/:id', providerController.deleteProvider);
router.put('/providers/:id/status', providerController.updateProviderStatus);

// 模型路由
router.get('/models/:provider', modelController.getModelsByProviderId);
router.post('/models', modelController.createModel);
router.delete('/models/:id/:provider', modelController.deleteModel);

export default router;