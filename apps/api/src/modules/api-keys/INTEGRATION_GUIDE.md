# API Keys Integration Guide

This guide explains how to integrate API key authentication into your Health Watchers API implementation.

## Quick Start

### 1. Middleware Setup

The API key middleware is already integrated into `app.ts`:

```typescript
import { authenticateApiKey, validateApiKeyScopes } from "./modules/api-keys/api-key.middleware";

app.use(authenticateApiKey);
app.use(validateApiKeyScopes);
```

This middleware:
- Extracts API keys from `Authorization: Bearer hw_...` headers
- Validates the key against the database
- Checks if the key has expired
- Validates scopes against the requested endpoint
- Logs all requests for audit trail

### 2. Creating API Keys

Users create API keys through the management endpoint:

```bash
curl -X POST http://localhost:4000/api/v1/api-keys \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Lab System Integration",
    "scopes": ["patients:read", "encounters:read"],
    "expiresAt": "2025-12-31T23:59:59Z"
  }'
```

Response includes the full API key (only shown once):

```json
{
  "status": "success",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "name": "Lab System Integration",
    "keyPrefix": "hw_a1b2c3d4",
    "key": "hw_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2",
    "scopes": ["patients:read", "encounters:read"],
    "isActive": true,
    "expiresAt": "2025-12-31T23:59:59Z",
    "createdAt": "2024-05-27T10:30:00Z"
  }
}
```

### 3. Using API Keys

Third-party systems use the API key in requests:

```bash
curl http://localhost:4000/api/v1/patients \
  -H "Authorization: Bearer hw_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2"
```

## Scope Design

### Principle: Least Privilege

Grant only the minimum scopes needed for each integration.

### Common Integration Patterns

#### Lab System
Needs to read patient and encounter data:
```json
{
  "scopes": ["patients:read", "encounters:read"]
}
```

#### Billing System
Needs to read and create payments:
```json
{
  "scopes": ["payments:read", "payments:write"]
}
```

#### Reporting System
Needs read-only access to all data:
```json
{
  "scopes": ["patients:read", "encounters:read", "payments:read"]
}
```

#### AI Integration
Needs to read encounters and generate insights:
```json
{
  "scopes": ["encounters:read", "ai:read", "ai:write"]
}
```

## Request Flow

```
Client Request
    ↓
authenticateApiKey Middleware
    ├─ Extract API key from Authorization header
    ├─ Hash the key
    ├─ Look up in database
    ├─ Check if expired
    └─ Attach to req.apiKey
    ↓
validateApiKeyScopes Middleware
    ├─ Get scopes from req.apiKey
    ├─ Check if any scope grants access
    ├─ Log usage (success or failure)
    └─ Allow or deny request
    ↓
Route Handler
    ├─ Access req.apiKey or req.user
    └─ Process request
    ↓
Response
```

## Error Handling

### Invalid API Key

```bash
curl http://localhost:4000/api/v1/patients \
  -H "Authorization: Bearer hw_invalid"
```

Response (401):
```json
{
  "error": "Unauthorized",
  "message": "Invalid API key"
}
```

### Insufficient Scopes

```bash
# API key has only patients:read scope
curl -X POST http://localhost:4000/api/v1/patients \
  -H "Authorization: Bearer hw_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2" \
  -H "Content-Type: application/json" \
  -d '{"firstName": "John", "lastName": "Doe"}'
```

Response (403):
```json
{
  "error": "Forbidden",
  "message": "API key does not have permission to access this endpoint",
  "requiredScopes": ["patients:read"]
}
```

### Expired API Key

```bash
curl http://localhost:4000/api/v1/patients \
  -H "Authorization: Bearer hw_expired_key"
```

Response (401):
```json
{
  "error": "Unauthorized",
  "message": "API key has expired"
}
```

## Audit Logging

Every API key request is logged in the `ApiKeyUsage` collection:

```typescript
{
  apiKeyId: ObjectId,
  userId: ObjectId,
  clinicId: ObjectId,
  method: "GET",
  endpoint: "/api/v1/patients",
  statusCode: 200,
  scopes: ["patients:read"],
  scopeGranted: true,
  ipAddress: "192.168.1.100",
  userAgent: "curl/7.68.0",
  errorMessage: null,
  createdAt: Date
}
```

### Querying Usage Logs

```bash
# Get usage logs for an API key
curl http://localhost:4000/api/v1/api-keys/507f1f77bcf86cd799439011/usage \
  -H "Authorization: Bearer <jwt_token>"
```

### Analyzing Logs

Find failed scope checks:
```javascript
db.apikeyusages.find({ scopeGranted: false })
```

Find requests from specific IP:
```javascript
db.apikeyusages.find({ ipAddress: "192.168.1.100" })
```

Find requests to specific endpoint:
```javascript
db.apikeyusages.find({ endpoint: "/api/v1/patients" })
```

## Managing API Keys

### List API Keys

```bash
curl http://localhost:4000/api/v1/api-keys \
  -H "Authorization: Bearer <jwt_token>"
```

### Update API Key

Add new scopes:
```bash
curl -X PATCH http://localhost:4000/api/v1/api-keys/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "scopes": ["patients:read", "encounters:read", "payments:read"]
  }'
```

### Revoke API Key

```bash
curl -X DELETE http://localhost:4000/api/v1/api-keys/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer <jwt_token>"
```

## Security Best Practices

### For API Key Creators

1. **Minimal Scopes**: Only grant scopes the integration actually needs
2. **Expiration Dates**: Set reasonable expiration dates (e.g., 1 year)
3. **Regular Rotation**: Rotate keys periodically
4. **Monitor Usage**: Review usage logs for suspicious activity
5. **Revoke Unused Keys**: Deactivate keys that are no longer needed

### For Integration Developers

1. **Secure Storage**: Store API keys in environment variables or secure vaults
2. **Never Log Keys**: Don't log the full API key in your application
3. **Use HTTPS**: Always use HTTPS when making API requests
4. **Handle Errors**: Implement proper error handling for 401/403 responses
5. **Retry Logic**: Implement exponential backoff for rate limiting

## Example: Lab System Integration

### Step 1: Create API Key

```bash
curl -X POST http://localhost:4000/api/v1/api-keys \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Lab System",
    "scopes": ["patients:read", "encounters:read"],
    "expiresAt": "2025-12-31T23:59:59Z"
  }'
```

Response:
```json
{
  "status": "success",
  "data": {
    "key": "hw_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2"
  }
}
```

### Step 2: Configure Lab System

Store the API key in the lab system's configuration:

```env
HEALTH_WATCHERS_API_KEY=hw_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
HEALTH_WATCHERS_API_URL=http://localhost:4000
```

### Step 3: Make Requests

```python
import requests

api_key = os.getenv('HEALTH_WATCHERS_API_KEY')
api_url = os.getenv('HEALTH_WATCHERS_API_URL')

headers = {
    'Authorization': f'Bearer {api_key}',
    'Content-Type': 'application/json'
}

# Read patient data
response = requests.get(
    f'{api_url}/api/v1/patients',
    headers=headers
)

if response.status_code == 200:
    patients = response.json()['data']
    # Process patients
elif response.status_code == 403:
    print('API key lacks required scopes')
elif response.status_code == 401:
    print('API key is invalid or expired')
```

### Step 4: Monitor Usage

```bash
# Check API key usage
curl http://localhost:4000/api/v1/api-keys/507f1f77bcf86cd799439011/usage \
  -H "Authorization: Bearer <jwt_token>"
```

## Troubleshooting

### API Key Not Working

1. Verify the API key format starts with `hw_`
2. Check that the key hasn't been revoked
3. Verify the key hasn't expired
4. Ensure the Authorization header format is correct: `Bearer hw_...`

### Scope Errors

1. Check the API key's scopes: `GET /api/v1/api-keys/:id`
2. Verify the endpoint matches the scope pattern
3. Update scopes if needed: `PATCH /api/v1/api-keys/:id`

### Usage Logs Not Appearing

1. Verify the API key is being used (check logs)
2. Check that the request is reaching the API
3. Verify the API key ID is correct

## Testing

### Unit Tests

```bash
npm test -- api-keys
```

### Integration Tests

```bash
# Create API key
API_KEY=$(curl -s -X POST http://localhost:4000/api/v1/api-keys \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"test","scopes":["patients:read"]}' | jq -r '.data.key')

# Test with API key
curl http://localhost:4000/api/v1/patients \
  -H "Authorization: Bearer $API_KEY"
```

## Performance Considerations

### Database Indexes

The API key module creates indexes for:
- `keyPrefix` - Fast lookup by key prefix
- `userId, clinicId, isActive` - Fast lookup by user
- `apiKeyId, createdAt` - Fast lookup of usage logs
- `scopeGranted, createdAt` - Fast lookup of failed checks

### Caching

Consider caching API key lookups in production:
- Cache valid keys for 5-10 minutes
- Invalidate cache on key update/revocation
- Use Redis or similar for distributed caching

### Usage Log Retention

Usage logs are automatically deleted after 90 days via TTL index. Adjust in `api-key-usage.model.ts` if needed:

```typescript
// Change from 7776000 (90 days) to desired seconds
apiKeyUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 days
```

## Next Steps

1. Deploy the API key module
2. Create API keys for your integrations
3. Configure third-party systems with API keys
4. Monitor usage logs for suspicious activity
5. Rotate keys periodically
