import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { validateRequest } from '../../middlewares/validate.middleware';
import {
  createApiKey,
  listApiKeys,
  getApiKey,
  updateApiKey,
  revokeApiKey,
  getApiKeyUsage,
  getAvailableScopes,
} from './api-key.controller';
import {
  createApiKeySchema,
  updateApiKeySchema,
  listApiKeysSchema,
} from './api-key.validation';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get available scopes (public endpoint)
router.get('/scopes', getAvailableScopes);

// Create a new API key
router.post('/', validateRequest(createApiKeySchema), createApiKey);

// List API keys
router.get('/', validateRequest(listApiKeysSchema), listApiKeys);

// Get a specific API key
router.get('/:id', getApiKey);

// Update an API key
router.patch('/:id', validateRequest(updateApiKeySchema), updateApiKey);

// Revoke an API key
router.delete('/:id', revokeApiKey);

// Get usage logs for an API key
router.get('/:id/usage', getApiKeyUsage);

export default router;
