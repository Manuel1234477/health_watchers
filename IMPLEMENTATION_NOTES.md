# API Keys Implementation - Developer Notes

## What Was Delivered

A complete, production-ready API key scoping system for the Health Watchers API with scope-based access control, audit logging, and comprehensive documentation.

## Quick Start

### 1. Review Documentation
Start with these files in order:
1. `apps/api/src/modules/api-keys/QUICK_REFERENCE.md` - 5 min overview
2. `apps/api/src/modules/api-keys/API_KEYS.md` - Complete API reference
3. `apps/api/src/modules/api-keys/INTEGRATION_GUIDE.md` - Integration help

### 2. Run Tests
```bash
npm test -- api-keys
```

### 3. Create Test API Key
```bash
# Get JWT token first (login)
JWT_TOKEN="<your_jwt_token>"

# Create API key
curl -X POST http://localhost:4000/api/v1/api-keys \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Key",
    "scopes": ["patients:read"]
  }'
```

### 4. Use API Key
```bash
API_KEY="hw_<your_key_here>"

curl http://localhost:4000/api/v1/patients \
  -H "Authorization: Bearer $API_KEY"
```

## File Organization

### Core Implementation
- `constants/scopes.ts` - Predefined scopes and validation logic
- `models/api-key.model.ts` - API key schema and utilities
- `models/api-key-usage.model.ts` - Audit log schema
- `api-key.middleware.ts` - Authentication and scope validation
- `api-key.controller.ts` - Request handlers
- `api-key.routes.ts` - Express router
- `api-key.validation.ts` - Request validation schemas

### Tests
- `__tests__/api-key.scope.test.ts` - Scope validation tests
- `__tests__/api-key.model.test.ts` - Model utility tests
- `__tests__/api-key.middleware.test.ts` - Middleware tests

### Documentation
- `API_KEYS.md` - Complete API reference
- `README.md` - Module architecture
- `INTEGRATION_GUIDE.md` - Integration instructions
- `QUICK_REFERENCE.md` - Quick lookup
- `DEPLOYMENT.md` - Deployment guide
- `MIGRATION.md` - Migration guide
- `IMPLEMENTATION_SUMMARY.md` - Implementation details
- `FILES_MANIFEST.md` - File listing

## Key Concepts

### API Key Format
- Format: `hw_<64_hex_characters>`
- Example: `hw_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2`
- Hashed with SHA-256 before storage
- Full key only returned at creation time

### Scopes
- 13 predefined scopes
- Format: `resource:action` (e.g., `patients:read`)
- Mapped to endpoints using regex patterns
- Validated on every request

### Audit Logging
- Every request logged with full context
- Includes method, endpoint, status, scopes, IP, user agent
- Failed scope checks logged with error message
- Automatic cleanup after 90 days

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

## Error Handling

### 401 Unauthorized
- Invalid or missing API key
- Expired API key
- Invalid JWT token

### 403 Forbidden
- API key lacks required scopes
- User lacks required role

### 404 Not Found
- API key doesn't exist
- API key doesn't belong to user

### 400 Bad Request
- Invalid request body
- Invalid scopes
- Missing required fields

## Database Queries

### Find API keys for a user
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

### Find requests in last 24 hours
```javascript
db.apikeyusages.find({
  createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) }
})
```

## Troubleshooting

### API Key Not Working
1. Check key format starts with `hw_`
2. Verify key hasn't been revoked
3. Verify key hasn't expired
4. Check Authorization header format: `Bearer hw_...`

### Scope Validation Failing
1. Check API key scopes: `GET /api/v1/api-keys/{id}`
2. Verify endpoint matches scope pattern
3. Check HTTP method (GET for read, POST for write)

### Database Connection Issues
1. Verify MongoDB is running
2. Check connection string in `.env`
3. Verify credentials

## Performance Tips

1. **Cache API keys** for 5-10 minutes in production
2. **Use pagination** when listing keys
3. **Monitor usage logs** for suspicious patterns
4. **Archive old logs** after 90 days (automatic TTL)
5. **Index frequently queried fields** (already done)

## Security Checklist

- [ ] Use minimal scopes (least privilege)
- [ ] Set expiration dates
- [ ] Store keys in secure vault/environment variables
- [ ] Never log full API keys
- [ ] Use HTTPS for all requests
- [ ] Monitor usage logs regularly
- [ ] Rotate keys periodically
- [ ] Revoke unused keys immediately

## Integration Examples

### Python
```python
import requests
import os

api_key = os.getenv('HEALTH_WATCHERS_API_KEY')
headers = {"Authorization": f"Bearer {api_key}"}

response = requests.get("http://localhost:4000/api/v1/patients", headers=headers)
```

### JavaScript
```javascript
const apiKey = process.env.HEALTH_WATCHERS_API_KEY;

fetch("http://localhost:4000/api/v1/patients", {
  headers: { "Authorization": `Bearer ${apiKey}` }
})
```

### cURL
```bash
curl http://localhost:4000/api/v1/patients \
  -H "Authorization: Bearer $API_KEY"
```

## Testing

### Run All Tests
```bash
npm test -- api-keys
```

### Run Specific Test File
```bash
npm test -- api-keys/scope.test.ts
```

### Run with Coverage
```bash
npm test -- api-keys --coverage
```

## Deployment

### Pre-Deployment
1. Run tests: `npm test -- api-keys`
2. Check TypeScript: `npm run build`
3. Review database indexes
4. Configure JWT secrets in `.env`

### Deployment
1. Build: `npm run build`
2. Start: `npm start`
3. Verify: `curl http://localhost:4000/health`

### Post-Deployment
1. Create test API key
2. Test scope validation
3. Check usage logs
4. Monitor for errors

## Documentation Map

| Document | Purpose | Read Time |
|----------|---------|-----------|
| QUICK_REFERENCE.md | Quick lookup | 5 min |
| API_KEYS.md | Complete API reference | 15 min |
| INTEGRATION_GUIDE.md | Integration help | 20 min |
| README.md | Module architecture | 15 min |
| DEPLOYMENT.md | Deployment help | 20 min |
| MIGRATION.md | Migration help | 20 min |
| IMPLEMENTATION_SUMMARY.md | Implementation details | 15 min |
| FILES_MANIFEST.md | File listing | 10 min |

## Key Files to Review

1. **Start Here**: `QUICK_REFERENCE.md`
2. **API Reference**: `API_KEYS.md`
3. **Integration**: `INTEGRATION_GUIDE.md`
4. **Code**: `api-key.controller.ts` (request handlers)
5. **Tests**: `__tests__/api-key.scope.test.ts` (usage examples)

## Common Scope Combinations

### Lab System
```json
["patients:read", "encounters:read"]
```

### Billing System
```json
["payments:read", "payments:write"]
```

### Reporting System
```json
["patients:read", "encounters:read", "payments:read"]
```

### AI Integration
```json
["encounters:read", "ai:read", "ai:write"]
```

### Full Access (Admin)
```json
[
  "patients:read", "patients:write", "patients:delete",
  "encounters:read", "encounters:write", "encounters:delete",
  "payments:read", "payments:write", "payments:confirm",
  "ai:read", "ai:write",
  "api-keys:read", "api-keys:manage"
]
```

## Next Steps

1. **Review** - Read `QUICK_REFERENCE.md`
2. **Understand** - Read `API_KEYS.md`
3. **Test** - Run `npm test -- api-keys`
4. **Deploy** - Follow `DEPLOYMENT.md`
5. **Integrate** - Follow `INTEGRATION_GUIDE.md`
6. **Monitor** - Check usage logs regularly

## Support

### Questions?
1. Check `QUICK_REFERENCE.md` troubleshooting
2. Check `API_KEYS.md` error responses
3. Review test files for examples
4. Check application logs

### Issues?
1. Check database connection
2. Verify MongoDB is running
3. Check JWT secrets in `.env`
4. Review error logs

### Need Help?
1. See `INTEGRATION_GUIDE.md`
2. See `DEPLOYMENT.md`
3. See `MIGRATION.md`
4. Review test files

---

**Status**: ✅ Complete and Ready for Production
**Version**: 1.0.0
**Last Updated**: May 27, 2024
