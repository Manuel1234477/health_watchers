# API Keys Module - Migration Guide

## Overview

This guide helps you migrate from JWT-only authentication to a system that supports both JWT and API key authentication with scope-based access control.

## Migration Timeline

- **Phase 1**: Deploy API key module (non-breaking)
- **Phase 2**: Create API keys for existing integrations
- **Phase 3**: Migrate integrations to use API keys
- **Phase 4**: Monitor and optimize

## Phase 1: Deployment (Non-Breaking)

### Step 1: Deploy the Module

The API key module is deployed alongside existing JWT authentication. No changes to existing integrations are required.

```bash
# Build and test
npm run build
npm test -- api-keys

# Deploy
npm start
```

### Step 2: Verify Deployment

```bash
# Check health
curl http://localhost:4000/health

# Verify JWT still works
curl http://localhost:4000/api/v1/patients \
  -H "Authorization: Bearer <jwt_token>"

# Verify API key endpoints exist
curl http://localhost:4000/api/v1/api-keys/scopes \
  -H "Authorization: Bearer <jwt_token>"
```

### Step 3: Create Initial API Keys

Create API keys for your existing integrations:

```bash
# Lab System
curl -X POST http://localhost:4000/api/v1/api-keys \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Lab System",
    "scopes": ["patients:read", "encounters:read"],
    "expiresAt": "2025-12-31T23:59:59Z"
  }'

# Billing System
curl -X POST http://localhost:4000/api/v1/api-keys \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Billing System",
    "scopes": ["payments:read", "payments:write"],
    "expiresAt": "2025-12-31T23:59:59Z"
  }'
```

## Phase 2: Integration Migration

### Step 1: Identify Integrations

List all third-party systems that access your API:

| System | Current Auth | Required Scopes | Status |
|--------|--------------|-----------------|--------|
| Lab System | JWT | patients:read, encounters:read | Pending |
| Billing System | JWT | payments:read, payments:write | Pending |
| Reporting System | JWT | patients:read, encounters:read, payments:read | Pending |

### Step 2: Determine Required Scopes

For each integration, determine the minimum scopes needed:

```bash
# Lab System - only needs to read patient and encounter data
scopes: ["patients:read", "encounters:read"]

# Billing System - needs to read and create payments
scopes: ["payments:read", "payments:write"]

# Reporting System - needs read-only access to all data
scopes: ["patients:read", "encounters:read", "payments:read"]
```

### Step 3: Create API Keys

Create API keys with appropriate scopes:

```bash
# Create Lab System API key
LAB_KEY=$(curl -s -X POST http://localhost:4000/api/v1/api-keys \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Lab System",
    "scopes": ["patients:read", "encounters:read"],
    "expiresAt": "2025-12-31T23:59:59Z"
  }' | jq -r '.data.key')

echo "Lab System API Key: $LAB_KEY"
```

### Step 4: Update Integration Configuration

Update each integration to use the API key:

**Before (JWT)**
```env
HEALTH_WATCHERS_AUTH_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**After (API Key)**
```env
HEALTH_WATCHERS_API_KEY=hw_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

### Step 5: Update Integration Code

**Python Example**

Before:
```python
import requests
import jwt

token = jwt.encode(payload, secret, algorithm="HS256")
headers = {"Authorization": f"Bearer {token}"}
response = requests.get("http://api/patients", headers=headers)
```

After:
```python
import requests
import os

api_key = os.getenv("HEALTH_WATCHERS_API_KEY")
headers = {"Authorization": f"Bearer {api_key}"}
response = requests.get("http://api/patients", headers=headers)
```

**JavaScript Example**

Before:
```javascript
const token = jwt.sign(payload, secret);
const response = await fetch("http://api/patients", {
  headers: { "Authorization": `Bearer ${token}` }
});
```

After:
```javascript
const apiKey = process.env.HEALTH_WATCHERS_API_KEY;
const response = await fetch("http://api/patients", {
  headers: { "Authorization": `Bearer ${apiKey}` }
});
```

### Step 6: Test Integration

```bash
# Test with API key
curl http://localhost:4000/api/v1/patients \
  -H "Authorization: Bearer $LAB_KEY"

# Verify scope restrictions
# This should fail with 403
curl -X POST http://localhost:4000/api/v1/patients \
  -H "Authorization: Bearer $LAB_KEY" \
  -H "Content-Type: application/json" \
  -d '{"firstName": "John"}'
```

### Step 7: Monitor Integration

```bash
# Check API key usage
curl http://localhost:4000/api/v1/api-keys/{id}/usage \
  -H "Authorization: Bearer <jwt_token>"

# Look for errors in logs
grep "Lab System" logs/app.log
```

## Phase 3: Gradual Rollout

### Option A: Parallel Running (Recommended)

Run both JWT and API key authentication simultaneously:

1. Deploy API key module
2. Create API keys for integrations
3. Update integrations to use API keys
4. Monitor for issues
5. Keep JWT as fallback for 30 days
6. Disable JWT for third-party systems (keep for internal use)

### Option B: Big Bang Migration

Migrate all integrations at once:

1. Deploy API key module
2. Create API keys for all integrations
3. Update all integrations simultaneously
4. Monitor closely
5. Rollback if issues occur

### Option C: Phased Rollout

Migrate integrations one at a time:

1. Deploy API key module
2. Create API key for first integration
3. Update and test first integration
4. Monitor for 1 week
5. Repeat for next integration

## Phase 4: Monitoring and Optimization

### Monitor Usage

```bash
# Check API key usage patterns
curl http://localhost:4000/api/v1/api-keys/{id}/usage?limit=100 \
  -H "Authorization: Bearer <jwt_token>"

# Analyze scope usage
db.apikeyusages.aggregate([
  { $group: { _id: "$scopes", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
])

# Find failed scope checks
db.apikeyusages.find({ scopeGranted: false }).count()
```

### Optimize Scopes

If an integration is getting 403 errors:

```bash
# Check current scopes
curl http://localhost:4000/api/v1/api-keys/{id} \
  -H "Authorization: Bearer <jwt_token>"

# Update with additional scopes
curl -X PATCH http://localhost:4000/api/v1/api-keys/{id} \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "scopes": ["patients:read", "encounters:read", "payments:read"]
  }'
```

### Audit Access

```bash
# Find all requests from a specific integration
db.apikeyusages.find({ apiKeyId: ObjectId("...") })

# Find suspicious activity
db.apikeyusages.find({
  scopeGranted: false,
  createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) }
})

# Find requests from unusual IPs
db.apikeyusages.aggregate([
  { $group: { _id: "$ipAddress", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
])
```

## Rollback Plan

If issues occur during migration:

### Immediate Rollback

```bash
# Stop the application
npm stop

# Revert to previous version
git checkout <previous_commit>
npm install
npm run build
npm start

# Verify JWT still works
curl http://localhost:4000/api/v1/patients \
  -H "Authorization: Bearer <jwt_token>"
```

### Partial Rollback

If only some integrations have issues:

```bash
# Revoke problematic API key
curl -X DELETE http://localhost:4000/api/v1/api-keys/{id} \
  -H "Authorization: Bearer <jwt_token>"

# Integration falls back to JWT
# Update integration to use JWT temporarily
```

## Common Issues and Solutions

### Issue: Integration Getting 403 Errors

**Cause**: API key lacks required scopes

**Solution**:
```bash
# Check current scopes
curl http://localhost:4000/api/v1/api-keys/{id} \
  -H "Authorization: Bearer <jwt_token>"

# Update with required scopes
curl -X PATCH http://localhost:4000/api/v1/api-keys/{id} \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "scopes": ["patients:read", "encounters:read", "payments:read"]
  }'
```

### Issue: Integration Getting 401 Errors

**Cause**: API key is invalid, expired, or revoked

**Solution**:
```bash
# Check if key is active
curl http://localhost:4000/api/v1/api-keys/{id} \
  -H "Authorization: Bearer <jwt_token>"

# Check if key has expired
# If expired, create new key

# If revoked, reactivate or create new key
```

### Issue: Performance Degradation

**Cause**: Too many API key lookups

**Solution**:
1. Enable caching in production
2. Use Redis for API key cache
3. Optimize database indexes
4. Archive old usage logs

### Issue: Scope Validation Too Strict

**Cause**: Scope patterns don't match integration's endpoints

**Solution**:
1. Review SCOPE_ENDPOINT_MAP in constants/scopes.ts
2. Adjust patterns if needed
3. Add new scopes if required
4. Update integration to use correct endpoints

## Best Practices

### For Administrators

1. **Least Privilege**: Grant only minimum required scopes
2. **Expiration**: Set reasonable expiration dates (1 year)
3. **Monitoring**: Review usage logs regularly
4. **Rotation**: Rotate keys annually
5. **Revocation**: Revoke unused keys immediately

### For Integration Developers

1. **Secure Storage**: Store API keys in environment variables
2. **Error Handling**: Handle 401/403 errors gracefully
3. **Logging**: Log API key usage (without exposing full key)
4. **Retry Logic**: Implement exponential backoff
5. **Monitoring**: Alert on authentication failures

## Timeline Example

```
Week 1: Deploy API key module
        Create API keys for all integrations
        
Week 2: Migrate Lab System to API key
        Monitor for issues
        
Week 3: Migrate Billing System to API key
        Monitor for issues
        
Week 4: Migrate Reporting System to API key
        Monitor for issues
        
Week 5: Disable JWT for third-party systems
        Keep JWT for internal use
        
Week 6: Archive old JWT tokens
        Document new authentication method
```

## Verification Checklist

- [ ] API key module deployed successfully
- [ ] All integrations have API keys created
- [ ] All integrations updated to use API keys
- [ ] All integrations tested and working
- [ ] Usage logs show expected patterns
- [ ] No 403 errors from integrations
- [ ] No 401 errors from integrations
- [ ] Performance metrics stable
- [ ] Security audit passed
- [ ] Team trained on new system
- [ ] Documentation updated
- [ ] Monitoring alerts configured

## Support

### During Migration

- Monitor logs closely
- Check usage patterns
- Be ready to rollback
- Communicate with integration teams
- Document any issues

### After Migration

- Continue monitoring
- Review usage logs weekly
- Rotate keys annually
- Update documentation
- Plan for future enhancements

## Next Steps

1. Review this migration guide with your team
2. Create a migration timeline
3. Identify all integrations
4. Determine required scopes for each
5. Create API keys
6. Update integrations
7. Monitor and optimize
8. Document lessons learned
