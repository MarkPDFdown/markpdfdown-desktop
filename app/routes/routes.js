import express from 'express';
import providerController from '../controllers/providerController.js';

const router = express.Router();

// 服务商路由
router.get('/providers', providerController.getAllProviders);
router.get('/providers/:id', providerController.getProviderById);
router.post('/providers', providerController.createProvider);
router.put('/providers/:id', providerController.updateProvider);
router.delete('/providers/:id', providerController.deleteProvider);
router.patch('/providers/:id/status', providerController.updateProviderStatus);

export default router;