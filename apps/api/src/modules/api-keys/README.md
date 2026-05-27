# API Keys Module

This module implements scope-based API key authentication for the Health Watchers API, allowing third-party integrations to access specific endpoints with fine-grained permissions.

## Architecture

### Components

1. **Models**
   - `api-key.model.ts`: API key storage and utilities (generation, hashing, prefix extraction)
   - `api-key-usage.model.ts`: Audit logs for all API key requests

2. **Middleware**
   - `api-key.middleware.ts`: Authentication and scope validation
     - `authenticateApiKey`: Validates API key and attaches to request
     - `validateApiKeyScopes`: Checks if key has permission for endpoint

3. **Controller**
   - `api-key.controller.ts`: Request handlers for API key management

4. **Routes**
   - `api-key.routes.ts`: Express router with all endpoints

5. **Constants**
   - `constants/scopes.ts`: Predefined scopes and endpoint mappings

6. **Validation**
   - `api-key.validation.ts`: Zod schemas for request validation

## Key Features

### Scope-Based Access Control

Each API key is assigned specific scopes that determine which endpoints it can access:

```typescript
// Example: Lab system can only read patients and encounters
const scopes = ['patients:read', 'encounters:read'];
```

### Audit Logging

Every API key request is logged with:
- Request method and endpoint
- HTTP status code
- Whether scope validation passed
- IP address and user agent
- Error messages for failed requests

### Security

- API keys are hashed using SHA-256 before storage
- Full key is only returned at creation time
- Keys can be revoked instantly
- Keys can have expiration dates
- Usage logs are automatically deleted after 90 days

## Integration

### Adding to Express App

```typescript
import { authenticateApiKey, validateApiKeyScopes } from './modules/api-keys/api-key.middleware';

app.use(authenticateApiKey);
app.use(validateApiKeyScopes);
```

### Using in Routes

API key authentication is transparent to route handlers. If a request uses an API key:

```typescript
req.apiKey = {
  id: string;
  userId: string;
  clinicId: string;
  scopes: string[];
}
```

If a request uses JWT token:

```typescript
req.user = {
  userId: string;
  role: AppRole;
  clinicId: string;
}
```

## Scope Patterns

Scopes follow a `resource:action` pattern:

- `patients:read` - Read patient records
- `patients:write` - Create/update patients
- `patients:delete` - Delete patients
- `encounters:read` - Read encounters
- `encounters:write` - Create/update encounters
- `encounters:delete` - Delete encounters
- `payments:read` - Read payments
- `payments:write` - Create/update payments
- `payments:confirm` - Confirm/process payments
- `ai:read` - Read AI insights
- `ai:write` - Generate AI insights
- `api-keys:read` - List and view API keys
- `api-keys:manage` - Create, update, revoke API keys

## Endpoint Mapping

Scopes are mapped to endpoints using regex patterns in `SCOPE_ENDPOINT_MAP`:

```typescript
[PREDEFINED_SCOPES.PATIENTS_READ]: [
  /^\/api\/v1\/patients\/?$/i,
  /^\/api\/v1\/patients\/[^/]+\/?$/i
]
```

The `scopeGrantsAccess()` function validates:
1. Scope matches the HTTP method (read/write/delete)
2. Endpoint matches the scope's pattern

## Database Schema

### ApiKey Collection

```typescript
{
  name: string;
  key: string; // SHA-256 hashed
  keyPrefix: string; // First 11 chars for display
  userId: ObjectId;
  clinicId: ObjectId;
  scopes: string[];
  isActive: boolean;
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### ApiKeyUsage Collection

```typescript
{
  apiKeyId: ObjectId;
  userId: ObjectId;
  clinicId: ObjectId;
  method: string;
  endpoint: string;
  statusCode: number;
  scopes: string[];
  scopeGranted: boolean;
  ipAddress?: string;
  userAgent?: string;
  errorMessage?: string;
  createdAt: Date; // TTL index: auto-delete after 90 days
}
```

## API Endpoints

### Management Endpoints (Require JWT)

- `POST /api/v1/api-keys` - Create API key
- `GET /api/v1/api-keys` - List API keys
- `GET /api/v1/api-keys/:id` - Get API key details
- `PATCH /api/v1/api-keys/:id` - Update API key
- `DELETE /api/v1/api-keys/:id` - Revoke API key
- `GET /api/v1/api-keys/:id/usage` - Get usage logs
- `GET /api/v1/api-keys/scopes` - Get available scopes

### Usage (API Key or JWT)

All other endpoints accept either:
- JWT token in `Authorization: Bearer <token>`
- API key in `Authorization: Bearer hw_<key>`

## Testing

Run tests with:

```bash
npm test -- api-keys
```

Test files:
- `__tests__/api-key.scope.test.ts` - Scope validation logic
- `__tests__/api-key.model.test.ts` - Key generation and hashing

## Error Handling

### 401 Unauthorized

- Invalid or missing API key
- Expired API key
- Invalid JWT token

### 403 Forbidden

- API key lacks required scopes for endpoint
- User lacks required role for endpoint

### 404 Not Found

- API key doesn't exist
- API key doesn't belong to user

### 400 Bad Request

- Invalid request body
- Invalid scopes
- Missing required fields

## Security Considerations

1. **Key Storage**: Keys are hashed before storage. Never log or expose raw keys.

2. **Scope Validation**: Happens on every request. Scope checks are logged for audit trail.

3. **Expiration**: Keys can expire. Expired keys are rejected with 401.

4. **Revocation**: Revoked keys are immediately unusable.

5. **Audit Trail**: All requests are logged with IP, user agent, and scope validation result.

6. **Multi-tenancy**: API keys are scoped to clinic. Users can only manage their own keys.

## Future Enhancements

- IP whitelist/blacklist per API key
- Rate limiting per API key
- Webhook notifications for suspicious activity
- API key rotation policies
- Scope templates for common integrations
- OAuth2 support for delegated access
