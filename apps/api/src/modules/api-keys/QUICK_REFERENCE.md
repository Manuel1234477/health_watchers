# API Keys Quick Reference

## Key Concepts

| Concept | Description |
|---------|-------------|
| **API Key** | Secure token for third-party integrations (format: `hw_<64_hex_chars>`) |
| **Scope** | Permission to access specific endpoints (format: `resource:action`) |
| **Audit Log** | Record of every API key request for security monitoring |
| **Expiration** | Optional date when API key becomes invalid |
| **Revocation** | Immediate deactivation of an API key |

## Available Scopes

### Patient Management
- `patients:read` - Read patient records
- `patients:write` - Create/update patients
- `patients:delete` - Delete patients

### Encounter Management
- `encounters:read` - Read encounters
- `encounters:write` - Create/update encounters
- `encounters:delete` - Delete encounters

### Payment Processing
- `payments:read` - Read payments
- `payments:write` - Create/update payments
- `payments:confirm` - Confirm/process payments

### AI Features
- `ai:read` - Read AI insights
- `ai:write` - Generate AI insights

### API Key Management
- `api-keys:read` - List and view API keys
- `api-keys:manage` - Create, update, revoke API keys

## Common Tasks

### Create API Key
```bash
curl -X POST http://localhost:4000/api/v1/api-keys \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Integration Name",
    "scopes": ["patients:read", "encounters:read"],
    "expiresAt": "2025-12-31T23:59:59Z"
  }'
```

### List API Keys
```bash
curl http://localhost:4000/api/v1/api-keys \
  -H "Authorization: Bearer <jwt_token>"
```

### Get API Key Details
```bash
curl http://localhost:4000/api/v1/api-keys/{id} \
  -H "Authorization: Bearer <jwt_token>"
```

### Update API Key
```bash
curl -X PATCH http://localhost:4000/api/v1/api-keys/{id} \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "scopes": ["patients:read", "encounters:read", "payments:read"]
  }'
```

### Revoke API Key
```bash
curl -X DELETE http://localhost:4000/api/v1/api-keys/{id} \
  -H "Authorization: Bearer <jwt_token>"
```

### Get Usage Logs
```bash
curl http://localhost:4000/api/v1/api-keys/{id}/usage \
  -H "Authorization: Bearer <jwt_token>"
```

### Get Available Scopes
```bash
curl http://localhost:4000/api/v1/api-keys/scopes \
  -H "Authorization: Bearer <jwt_token>"
```

### Use API Key in Request
```bash
curl http://localhost:4000/api/v1/patients \
  -H "Authorization: Bearer hw_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2"
```

## Error Codes

| Code | Meaning | Solution |
|------|---------|----------|
| 401 | Invalid/expired API key | Check key format, verify not expired, check not revoked |
| 403 | Insufficient scopes | Update API key with required scopes |
| 404 | API key not found | Verify API key ID, ensure you own the key |
| 400 | Invalid request | Check request body, verify required fields |

## Scope Selection Guide

### For Lab Systems
```json
{
  "scopes": ["patients:read", "encounters:read"]
}
```

### For Billing Systems
```json
{
  "scopes": ["payments:read", "payments:write"]
}
```

### For Reporting Systems
```json
{
  "scopes": ["patients:read", "encounters:read", "payments:read"]
}
```

### For AI Integration
```json
{
  "scopes": ["encounters:read", "ai:read", "ai:write"]
}
```

### For Full Access (Admin)
```json
{
  "scopes": [
    "patients:read", "patients:write", "patients:delete",
    "encounters:read", "encounters:write", "encounters:delete",
    "payments:read", "payments:write", "payments:confirm",
    "ai:read", "ai:write",
    "api-keys:read", "api-keys:manage"
  ]
}
```

## Security Checklist

- [ ] Use minimal scopes (least privilege)
- [ ] Set expiration dates
- [ ] Store keys in secure vault/environment variables
- [ ] Never log full API keys
- [ ] Use HTTPS for all requests
- [ ] Monitor usage logs regularly
- [ ] Rotate keys periodically
- [ ] Revoke unused keys immediately

## Response Examples

### Successful Request
```json
{
  "status": "success",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "name": "Lab System",
    "keyPrefix": "hw_a1b2c3d4",
    "scopes": ["patients:read", "encounters:read"],
    "isActive": true,
    "expiresAt": "2025-12-31T23:59:59Z",
    "createdAt": "2024-05-27T10:30:00Z"
  }
}
```

### Insufficient Scopes Error
```json
{
  "error": "Forbidden",
  "message": "API key does not have permission to access this endpoint",
  "requiredScopes": ["patients:read"]
}
```

### Invalid API Key Error
```json
{
  "error": "Unauthorized",
  "message": "Invalid API key"
}
```

## Database Queries

### Find all API keys for a user
```javascript
db.apikeys.find({ userId: ObjectId("..."), clinicId: ObjectId("...") })
```

### Find failed scope checks
```javascript
db.apikeyusages.find({ scopeGranted: false })
```

### Find requests from specific IP
```javascript
db.apikeyusages.find({ ipAddress: "192.168.1.100" })
```

### Find requests to specific endpoint
```javascript
db.apikeyusages.find({ endpoint: "/api/v1/patients" })
```

### Find requests in last 24 hours
```javascript
db.apikeyusages.find({
  createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) }
})
```

## Troubleshooting

### "Invalid API key"
- Verify key format starts with `hw_`
- Check key hasn't been revoked
- Verify key hasn't expired
- Ensure correct Authorization header format

### "Insufficient scopes"
- Check API key scopes: `GET /api/v1/api-keys/{id}`
- Update scopes: `PATCH /api/v1/api-keys/{id}`
- Verify endpoint matches scope pattern

### "API key not found"
- Verify API key ID is correct
- Ensure you're authenticated with the same user
- Check key hasn't been deleted

## Performance Tips

1. **Cache API keys** for 5-10 minutes in production
2. **Use pagination** when listing keys (default: 10 per page)
3. **Monitor usage logs** for suspicious patterns
4. **Archive old logs** after 90 days (automatic TTL)
5. **Index frequently queried fields** (already done)

## Integration Examples

### Python
```python
import requests

api_key = "hw_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2"
headers = {"Authorization": f"Bearer {api_key}"}

response = requests.get("http://localhost:4000/api/v1/patients", headers=headers)
```

### JavaScript
```javascript
const apiKey = "hw_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2";

fetch("http://localhost:4000/api/v1/patients", {
  headers: { "Authorization": `Bearer ${apiKey}` }
})
```

### cURL
```bash
curl http://localhost:4000/api/v1/patients \
  -H "Authorization: Bearer hw_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2"
```

## Related Documentation

- **API_KEYS.md** - Complete API reference
- **README.md** - Module architecture
- **INTEGRATION_GUIDE.md** - Integration instructions
- **IMPLEMENTATION_SUMMARY.md** - Implementation details
