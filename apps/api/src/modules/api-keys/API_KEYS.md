# API Keys Documentation

## Overview

API Keys provide a secure way for third-party integrations and external systems to authenticate with the Health Watchers API. Unlike user accounts, API keys support **scope-based access control**, allowing you to grant specific permissions to each integration.

## Key Features

- **Scope-Based Access Control**: Grant only the permissions needed for each integration
- **Audit Logging**: Track all API key usage with detailed logs
- **Key Expiration**: Set expiration dates for temporary access
- **Key Revocation**: Instantly revoke access without affecting other keys
- **Secure Hashing**: API keys are hashed using SHA-256 before storage

## Authentication

### Using an API Key

Include your API key in the `Authorization` header with the `Bearer` scheme:

```bash
curl -H "Authorization: Bearer hw_your_api_key_here" \
  https://api.health-watchers.com/api/v1/patients
```

### Key Format

API keys follow the format: `hw_<64_hex_characters>`

Example: `hw_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2`

## Available Scopes

Scopes follow a `resource:action` pattern for fine-grained access control.

### Patient Scopes

| Scope | Access | Endpoints |
|-------|--------|-----------|
| `patients:read` | Read patient records | `GET /api/v1/patients`, `GET /api/v1/patients/:id` |
| `patients:write` | Create/update patients | `POST /api/v1/patients`, `PUT /api/v1/patients/:id`, `PATCH /api/v1/patients/:id` |
| `patients:delete` | Delete patient records | `DELETE /api/v1/patients/:id` |

### Encounter Scopes

| Scope | Access | Endpoints |
|-------|--------|-----------|
| `encounters:read` | Read encounter records | `GET /api/v1/encounters`, `GET /api/v1/encounters/:id` |
| `encounters:write` | Create/update encounters | `POST /api/v1/encounters`, `PUT /api/v1/encounters/:id`, `PATCH /api/v1/encounters/:id` |
| `encounters:delete` | Delete encounter records | `DELETE /api/v1/encounters/:id` |

### Payment Scopes

| Scope | Access | Endpoints |
|-------|--------|-----------|
| `payments:read` | Read payment records | `GET /api/v1/payments`, `GET /api/v1/payments/:id` |
| `payments:write` | Create/update payments | `POST /api/v1/payments`, `PUT /api/v1/payments/:id`, `PATCH /api/v1/payments/:id` |
| `payments:confirm` | Confirm/process payments | `POST /api/v1/payments/:id/confirm` |

### AI Scopes

| Scope | Access | Endpoints |
|-------|--------|-----------|
| `ai:read` | Read AI insights | `GET /api/v1/ai` |
| `ai:write` | Generate AI insights | `POST /api/v1/ai` |

### API Keys Management Scopes

| Scope | Access | Endpoints |
|-------|--------|-----------|
| `api-keys:read` | List and view API keys | `GET /api/v1/api-keys`, `GET /api/v1/api-keys/:id` |
| `api-keys:manage` | Create, update, revoke API keys | `POST /api/v1/api-keys`, `PATCH /api/v1/api-keys/:id`, `DELETE /api/v1/api-keys/:id` |

## API Endpoints

### Get Available Scopes

Returns all available scopes for API key creation.

```
GET /api/v1/api-keys/scopes
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "scopes": [
      "patients:read",
      "patients:write",
      "patients:delete",
      "encounters:read",
      "encounters:write",
      "encounters:delete",
      "payments:read",
      "payments:write",
      "payments:confirm",
      "ai:read",
      "ai:write",
      "api-keys:read",
      "api-keys:manage"
    ],
    "description": "Available API key scopes for fine-grained access control"
  }
}
```

### Create API Key

Creates a new API key with specified scopes.

```
POST /api/v1/api-keys
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Lab System Integration",
  "scopes": ["patients:read", "encounters:read"],
  "expiresAt": "2025-12-31T23:59:59Z"
}
```

**Response (201 Created):**
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

**Important**: The full API key is only returned at creation time. Store it securely. You cannot retrieve it later.

### List API Keys

Lists all API keys for the authenticated user.

```
GET /api/v1/api-keys?page=1&limit=10&isActive=true
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
- `page` (optional, default: 1): Page number for pagination
- `limit` (optional, default: 10, max: 100): Items per page
- `isActive` (optional): Filter by active status (`true` or `false`)

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "name": "Lab System Integration",
      "keyPrefix": "hw_a1b2c3d4",
      "scopes": ["patients:read", "encounters:read"],
      "isActive": true,
      "lastUsedAt": "2024-05-27T15:45:00Z",
      "expiresAt": "2025-12-31T23:59:59Z",
      "createdAt": "2024-05-27T10:30:00Z",
      "updatedAt": "2024-05-27T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "pages": 1
  }
}
```

### Get API Key Details

Retrieves details for a specific API key.

```
GET /api/v1/api-keys/:id
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "name": "Lab System Integration",
    "keyPrefix": "hw_a1b2c3d4",
    "scopes": ["patients:read", "encounters:read"],
    "isActive": true,
    "lastUsedAt": "2024-05-27T15:45:00Z",
    "expiresAt": "2025-12-31T23:59:59Z",
    "createdAt": "2024-05-27T10:30:00Z",
    "updatedAt": "2024-05-27T10:30:00Z"
  }
}
```

### Update API Key

Updates an API key's name, scopes, or active status.

```
PATCH /api/v1/api-keys/:id
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Lab System Integration v2",
  "scopes": ["patients:read", "encounters:read", "payments:read"],
  "isActive": true
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "name": "Lab System Integration v2",
    "keyPrefix": "hw_a1b2c3d4",
    "scopes": ["patients:read", "encounters:read", "payments:read"],
    "isActive": true,
    "lastUsedAt": "2024-05-27T15:45:00Z",
    "expiresAt": "2025-12-31T23:59:59Z",
    "createdAt": "2024-05-27T10:30:00Z",
    "updatedAt": "2024-05-27T16:00:00Z"
  }
}
```

### Revoke API Key

Deactivates an API key, preventing further use.

```
DELETE /api/v1/api-keys/:id
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "status": "success",
  "message": "API key revoked",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "name": "Lab System Integration",
    "keyPrefix": "hw_a1b2c3d4",
    "scopes": ["patients:read", "encounters:read"],
    "isActive": false,
    "lastUsedAt": "2024-05-27T15:45:00Z",
    "expiresAt": "2025-12-31T23:59:59Z",
    "createdAt": "2024-05-27T10:30:00Z",
    "updatedAt": "2024-05-27T16:05:00Z"
  }
}
```

### Get API Key Usage Logs

Retrieves audit logs for a specific API key showing all requests made with it.

```
GET /api/v1/api-keys/:id/usage?page=1&limit=50
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
- `page` (optional, default: 1): Page number for pagination
- `limit` (optional, default: 50, max: 100): Items per page

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "507f1f77bcf86cd799439012",
      "apiKeyId": "507f1f77bcf86cd799439011",
      "userId": "507f1f77bcf86cd799439010",
      "clinicId": "507f1f77bcf86cd799439009",
      "method": "GET",
      "endpoint": "/api/v1/patients",
      "statusCode": 200,
      "scopes": ["patients:read", "encounters:read"],
      "scopeGranted": true,
      "ipAddress": "192.168.1.100",
      "userAgent": "curl/7.68.0",
      "errorMessage": null,
      "createdAt": "2024-05-27T15:45:00Z"
    },
    {
      "id": "507f1f77bcf86cd799439013",
      "apiKeyId": "507f1f77bcf86cd799439011",
      "userId": "507f1f77bcf86cd799439010",
      "clinicId": "507f1f77bcf86cd799439009",
      "method": "POST",
      "endpoint": "/api/v1/payments",
      "statusCode": 403,
      "scopes": ["patients:read", "encounters:read"],
      "scopeGranted": false,
      "ipAddress": "192.168.1.100",
      "userAgent": "curl/7.68.0",
      "errorMessage": "Insufficient scopes",
      "createdAt": "2024-05-27T15:46:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 2,
    "pages": 1
  }
}
```

## Error Responses

### 401 Unauthorized

Returned when:
- API key is missing or invalid
- API key has expired
- JWT token is invalid or expired

```json
{
  "error": "Unauthorized",
  "message": "Invalid API key"
}
```

### 403 Forbidden

Returned when the API key doesn't have the required scopes for the requested endpoint.

```json
{
  "error": "Forbidden",
  "message": "API key does not have permission to access this endpoint",
  "requiredScopes": ["patients:read"]
}
```

### 404 Not Found

Returned when the API key doesn't exist or doesn't belong to the authenticated user.

```json
{
  "error": "NotFound",
  "message": "API key not found"
}
```

### 400 Bad Request

Returned when request validation fails.

```json
{
  "error": "ValidationError",
  "message": "Request validation failed",
  "issues": [
    {
      "field": "scopes",
      "message": "At least one scope is required",
      "code": "too_small"
    }
  ]
}
```

## Security Best Practices

1. **Store Keys Securely**: Treat API keys like passwords. Store them in secure vaults or environment variables.

2. **Use Minimal Scopes**: Grant only the scopes needed for each integration. For example, if a lab system only needs to read patient data, use `patients:read` instead of broader scopes.

3. **Rotate Keys Regularly**: Set expiration dates and rotate keys periodically.

4. **Monitor Usage**: Regularly review API key usage logs to detect suspicious activity.

5. **Revoke Unused Keys**: Deactivate API keys that are no longer needed.

6. **Use HTTPS**: Always use HTTPS when making API requests with API keys.

7. **Limit IP Access**: If possible, restrict API key usage to specific IP addresses (implement in your integration).

## Examples

### Lab System Integration

A lab system needs to read patient and encounter data:

```bash
# Create API key
curl -X POST https://api.health-watchers.com/api/v1/api-keys \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Lab System",
    "scopes": ["patients:read", "encounters:read"],
    "expiresAt": "2025-12-31T23:59:59Z"
  }'

# Use API key to read patients
curl https://api.health-watchers.com/api/v1/patients \
  -H "Authorization: Bearer hw_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2"
```

### Billing System Integration

A billing system needs to read and create payments:

```bash
# Create API key
curl -X POST https://api.health-watchers.com/api/v1/api-keys \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Billing System",
    "scopes": ["payments:read", "payments:write"],
    "expiresAt": "2025-12-31T23:59:59Z"
  }'
```

## Troubleshooting

### "Invalid API key" Error

- Verify the API key is correct and hasn't been revoked
- Check that the key hasn't expired
- Ensure the Authorization header format is correct: `Bearer hw_...`

### "Insufficient scopes" Error

- Check the API key's scopes using `GET /api/v1/api-keys/:id`
- Update the API key with additional scopes using `PATCH /api/v1/api-keys/:id`
- Refer to the "Available Scopes" section to see which scopes are needed

### API Key Not Found

- Verify the API key ID is correct
- Ensure you're authenticated with the same user account that created the key
- Check that the key hasn't been deleted
