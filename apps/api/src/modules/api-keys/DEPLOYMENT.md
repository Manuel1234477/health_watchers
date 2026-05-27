# API Keys Module - Deployment Guide

## Pre-Deployment Checklist

### Code Quality
- [ ] Run TypeScript compiler: `npm run build`
- [ ] Run linter: `npm run lint` (if configured)
- [ ] Run tests: `npm test -- api-keys`
- [ ] Check test coverage: `npm test -- api-keys --coverage`
- [ ] Review code for security issues

### Dependencies
- [ ] Verify all dependencies are installed: `npm install`
- [ ] Check for security vulnerabilities: `npm audit`
- [ ] Update dependencies if needed: `npm update`

### Configuration
- [ ] Verify MongoDB connection string in `.env`
- [ ] Verify JWT secrets are configured
- [ ] Check API port configuration
- [ ] Verify CORS settings if needed

### Database
- [ ] Backup existing database
- [ ] Verify MongoDB is running
- [ ] Check database permissions
- [ ] Verify indexes will be created automatically

## Deployment Steps

### 1. Build the Application

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Verify build succeeded
ls -la dist/
```

### 2. Run Tests

```bash
# Run all tests
npm test

# Run API key tests specifically
npm test -- api-keys

# Run with coverage
npm test -- api-keys --coverage
```

### 3. Start the Application

```bash
# Development
npm run dev

# Production
npm start
```

### 4. Verify Deployment

```bash
# Check health endpoint
curl http://localhost:4000/health

# Get available scopes
curl http://localhost:4000/api/v1/api-keys/scopes \
  -H "Authorization: Bearer <jwt_token>"

# Create test API key
curl -X POST http://localhost:4000/api/v1/api-keys \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Key",
    "scopes": ["patients:read"]
  }'
```

## Environment Variables

Add these to your `.env` file:

```env
# Existing variables
API_PORT=4000
MONGO_URI=mongodb://localhost:27017/health_watchers
JWT_SECRET=your_jwt_secret_here

# API Key specific (optional, uses defaults)
# API_KEY_EXPIRATION_DAYS=365
# API_KEY_USAGE_LOG_RETENTION_DAYS=90
```

## Database Setup

### Automatic Index Creation

Indexes are created automatically when the application starts:

```typescript
// In api-key.model.ts
apiKeySchema.index({ keyPrefix: 1, isActive: 1, expiresAt: 1 });
apiKeySchema.index({ userId: 1, clinicId: 1, isActive: 1 });

// In api-key-usage.model.ts
apiKeyUsageSchema.index({ apiKeyId: 1, createdAt: -1 });
apiKeyUsageSchema.index({ scopeGranted: 1, createdAt: -1 });
apiKeyUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });
```

### Manual Index Creation (if needed)

```javascript
// Connect to MongoDB
use health_watchers

// Create indexes
db.apikeys.createIndex({ keyPrefix: 1, isActive: 1, expiresAt: 1 })
db.apikeys.createIndex({ userId: 1, clinicId: 1, isActive: 1 })

db.apikeyusages.createIndex({ apiKeyId: 1, createdAt: -1 })
db.apikeyusages.createIndex({ scopeGranted: 1, createdAt: -1 })
db.apikeyusages.createIndex({ createdAt: 1 }, { expireAfterSeconds: 7776000 })
```

## Monitoring

### Application Logs

Monitor these log patterns:

```bash
# API key authentication errors
grep "API key authentication error" logs/app.log

# Scope validation failures
grep "Insufficient scopes" logs/app.log

# Database errors
grep "Failed to" logs/app.log
```

### Database Monitoring

```javascript
// Check API key collection size
db.apikeys.stats()

// Check usage log collection size
db.apikeyusages.stats()

// Monitor index usage
db.apikeys.aggregate([{ $indexStats: {} }])

// Check for expired keys
db.apikeys.find({ expiresAt: { $lt: new Date() } }).count()
```

### Metrics to Track

1. **API Key Usage**
   - Total API keys created
   - Active vs revoked keys
   - Keys by scope
   - Key expiration distribution

2. **Request Metrics**
   - Requests per API key
   - Success vs failure rate
   - Scope validation failures
   - Average response time

3. **Security Metrics**
   - Failed authentication attempts
   - Scope violations
   - Requests from unusual IPs
   - Unusual access patterns

## Troubleshooting

### API Key Not Working

1. **Check key format**
   ```bash
   # Should start with hw_
   echo $API_KEY | grep "^hw_"
   ```

2. **Verify key in database**
   ```javascript
   db.apikeys.findOne({ keyPrefix: "hw_a1b2c3d4" })
   ```

3. **Check expiration**
   ```javascript
   db.apikeys.findOne({ _id: ObjectId("...") }).expiresAt
   ```

4. **Check active status**
   ```javascript
   db.apikeys.findOne({ _id: ObjectId("...") }).isActive
   ```

### Scope Validation Failing

1. **Check API key scopes**
   ```bash
   curl http://localhost:4000/api/v1/api-keys/{id} \
     -H "Authorization: Bearer <jwt_token>"
   ```

2. **Verify endpoint pattern**
   ```javascript
   // Check SCOPE_ENDPOINT_MAP in constants/scopes.ts
   ```

3. **Check HTTP method**
   ```bash
   # Ensure method matches scope (GET for read, POST for write, etc.)
   ```

### Database Connection Issues

1. **Verify MongoDB is running**
   ```bash
   mongosh --eval "db.adminCommand('ping')"
   ```

2. **Check connection string**
   ```bash
   echo $MONGO_URI
   ```

3. **Verify credentials**
   ```bash
   mongosh "$MONGO_URI"
   ```

### Performance Issues

1. **Check index usage**
   ```javascript
   db.apikeys.aggregate([{ $indexStats: {} }])
   ```

2. **Monitor query performance**
   ```javascript
   db.setProfilingLevel(1, { slowms: 100 })
   db.system.profile.find().sort({ ts: -1 }).limit(10)
   ```

3. **Check collection size**
   ```javascript
   db.apikeys.stats()
   db.apikeyusages.stats()
   ```

## Rollback Plan

### If Deployment Fails

1. **Stop the application**
   ```bash
   npm stop
   # or
   kill <process_id>
   ```

2. **Restore previous version**
   ```bash
   git checkout <previous_commit>
   npm install
   npm run build
   npm start
   ```

3. **Verify rollback**
   ```bash
   curl http://localhost:4000/health
   ```

### If Database Migration Fails

1. **Restore database backup**
   ```bash
   mongorestore --uri="$MONGO_URI" backup/
   ```

2. **Verify data integrity**
   ```javascript
   db.apikeys.count()
   db.apikeyusages.count()
   ```

## Post-Deployment

### Verification

1. **Test API key creation**
   ```bash
   curl -X POST http://localhost:4000/api/v1/api-keys \
     -H "Authorization: Bearer <jwt_token>" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Test",
       "scopes": ["patients:read"]
     }'
   ```

2. **Test API key usage**
   ```bash
   curl http://localhost:4000/api/v1/patients \
     -H "Authorization: Bearer <api_key>"
   ```

3. **Test scope validation**
   ```bash
   # Should fail with 403
   curl -X POST http://localhost:4000/api/v1/patients \
     -H "Authorization: Bearer <read_only_key>" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```

4. **Check usage logs**
   ```bash
   curl http://localhost:4000/api/v1/api-keys/{id}/usage \
     -H "Authorization: Bearer <jwt_token>"
   ```

### Documentation

- [ ] Update team documentation
- [ ] Create runbook for common tasks
- [ ] Document scope assignments for integrations
- [ ] Set up monitoring alerts
- [ ] Create incident response procedures

### Team Communication

- [ ] Notify team of deployment
- [ ] Share API key documentation
- [ ] Provide example integrations
- [ ] Set up support channel for issues

## Maintenance

### Regular Tasks

**Daily**
- Monitor error logs
- Check for failed authentication attempts
- Review suspicious activity

**Weekly**
- Review API key usage patterns
- Check for unused keys
- Verify all integrations are working

**Monthly**
- Audit API key permissions
- Review and archive old logs
- Update documentation
- Plan key rotations

### Backup Strategy

```bash
# Daily backup
mongodump --uri="$MONGO_URI" --out=backup/$(date +%Y%m%d)

# Weekly backup to S3
aws s3 sync backup/ s3://backups/health-watchers/

# Verify backup
mongorestore --uri="$MONGO_URI" --dryRun backup/
```

## Scaling Considerations

### Horizontal Scaling

1. **Load Balancing**
   - Use sticky sessions for API key requests
   - Cache API key lookups across instances

2. **Database Replication**
   - Set up MongoDB replica set
   - Enable read replicas for usage logs

3. **Caching Layer**
   - Add Redis for API key caching
   - Cache scope validation results

### Vertical Scaling

1. **Database Optimization**
   - Increase MongoDB memory
   - Optimize indexes
   - Archive old usage logs

2. **Application Optimization**
   - Increase Node.js memory
   - Optimize middleware
   - Profile hot paths

## Security Hardening

### Before Production

- [ ] Enable HTTPS/TLS
- [ ] Set up rate limiting
- [ ] Configure CORS properly
- [ ] Enable request logging
- [ ] Set up intrusion detection
- [ ] Configure firewall rules
- [ ] Enable database encryption
- [ ] Set up audit logging

### Ongoing

- [ ] Monitor for security vulnerabilities
- [ ] Keep dependencies updated
- [ ] Review access logs regularly
- [ ] Rotate secrets periodically
- [ ] Conduct security audits
- [ ] Test incident response procedures

## Support

### Common Issues

See **Troubleshooting** section above.

### Getting Help

1. Check logs: `tail -f logs/app.log`
2. Review documentation: See `API_KEYS.md`
3. Check database: `mongosh $MONGO_URI`
4. Run tests: `npm test -- api-keys`

### Reporting Issues

Include:
- Error message and stack trace
- Steps to reproduce
- Expected vs actual behavior
- Environment details (Node version, MongoDB version, etc.)
- Relevant logs
