# Webhook Proxy Production Deployment Guide

**CRITICAL**: Read this entire document before deploying. Your job depends on it.

## What This Fixes

- ✅ **CORS errors completely bypassed** - Webhooks execute server-side
- ✅ **SSRF protection** - Blocks localhost, private IPs (IPv4 & IPv6)
- ✅ **Webhook tracking** - Status, response, and errors logged to task records
- ✅ **Timeout protection** - 30-second timeout prevents hung requests
- ✅ **Audit logging** - All webhook executions logged with user info

## Pre-Deployment Checklist

### 1. Database Migration (MANDATORY)

**⚠️ WARNING**: The webhook tracking fields MUST be added to the database BEFORE deploying the code, or webhook tracking will fail.

**On production database server:**

```bash
# Connect to PostgreSQL
psql -h <DB_HOST> -U directus -d directus

# Run migration
\i /path/to/migrations/add-webhook-tracking-fields.sql

# Verify fields were created
\d tasks

# You should see:
# - webhook_last_status (integer)
# - webhook_last_response (text)
# - webhook_last_error (text)
```

**Alternative**: If you have database access from your local machine:

```bash
# Copy migration to server
scp migrations/add-webhook-tracking-fields.sql root@64.227.151.81:/tmp/

# SSH to server
ssh root@64.227.151.81

# Run migration
docker exec -i directus-db psql -U directus -d directus < /tmp/add-webhook-tracking-fields.sql
```

### 2. Build Extensions Locally

Build and verify extensions work BEFORE deploying to production:

```bash
# Build webhook-proxy endpoint
cd extensions/directus-endpoint-webhook-proxy
npm install
npm run build

# Verify dist/index.js exists
ls -lh dist/index.js

# Build configurable-button display (with tracking updates)
cd ../directus-extension-configurable-button
npm install
npm run build

# Verify dist/index.js exists
ls -lh dist/index.js
```

### 3. Test Locally First

```bash
cd directus-docker-deploy
docker-compose restart directus
docker-compose logs -f directus | grep -i "webhook"

# Should see: "Loaded endpoint: webhook-proxy"

# Test the endpoint
curl -X POST http://localhost:8055/webhook-proxy \
  -H "Authorization: Bearer agency-os-static-token-12345" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://webhook.site/unique-id","method":"GET"}'

# Should get 200 OK with webhook response
```

## Production Deployment Steps

### Step 1: Copy Files to Production Server

```bash
# From your local machine
rsync -avz --progress \
  extensions/directus-endpoint-webhook-proxy/ \
  root@64.227.151.81:/opt/directus-colex/extensions/directus-endpoint-webhook-proxy/

rsync -avz --progress \
  extensions/directus-extension-configurable-button/ \
  root@64.227.151.81:/opt/directus-colex/extensions/directus-extension-configurable-button/
```

### Step 2: Build Extensions on Production

```bash
# SSH to production
ssh root@64.227.151.81

cd /opt/directus-colex/extensions/directus-endpoint-webhook-proxy

# Build webhook-proxy
docker run --rm -v $(pwd):/app -w /app node:22-alpine sh -c 'npm install && npm run build'

# Verify build succeeded
ls -lh dist/index.js

# Build configurable-button
cd ../directus-extension-configurable-button
docker run --rm -v $(pwd):/app -w /app node:22-alpine sh -c 'npm install && npm run build'

# Verify build succeeded
ls -lh dist/index.js
```

### Step 3: Update docker-compose.yml

```bash
cd /opt/directus-colex/directus-docker-deploy

# Check if webhook-proxy volume already exists
grep "webhook-proxy" docker-compose.yml

# If NOT found, add this line to the volumes section:
# - ../extensions/directus-endpoint-webhook-proxy:/directus/extensions/directus-endpoint-webhook-proxy
```

### Step 4: Deploy (Full Restart)

```bash
cd /opt/directus-colex/directus-docker-deploy

# Full restart to ensure clean state
docker compose down
docker compose up -d

# Wait for startup
sleep 15

# Check logs for webhook-proxy loading
docker compose logs directus | grep -i "webhook-proxy"

# Should see: "Loaded endpoint: webhook-proxy"
```

### Step 5: Verify Deployment

```bash
# Test webhook-proxy endpoint
curl -X POST https://app.getcolex.com/webhook-proxy \
  -H "Authorization: Bearer INteF0APpirH3AmA69zffvvdmrA5PAdN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://httpbin.org/get","method":"GET"}'

# Should return 200 OK with httpbin response

# Test with actual task
# 1. Open https://app.getcolex.com/admin/content/tasks
# 2. Find any webhook task
# 3. Click "Run Task" button
# 4. Check task record for updated tracking fields:
#    - webhook_last_status should have HTTP status code
#    - webhook_last_response should have response body (truncated to 1000 chars)
#    - webhook_last_error should be null (if successful)
```

## Verification Checklist

After deployment, verify:

- [ ] Database migration applied successfully (fields exist in tasks table)
- [ ] Webhook-proxy extension loads without errors
- [ ] Configurable-button extension loads without errors
- [ ] `/webhook-proxy` endpoint returns 400 (not 404) when called with no parameters
- [ ] Test webhook task executes successfully
- [ ] Task record updates with `webhook_last_status`, `webhook_last_response`
- [ ] Webhook logs appear in Docker logs: `docker compose logs directus | grep "Webhook Proxy"`
- [ ] No CORS errors in browser console
- [ ] Webhooks execute from server IP, not browser IP

## Rollback Plan

If deployment fails:

```bash
# Option 1: Revert to previous commit
cd /opt/directus-colex
git log --oneline -5  # Find previous commit
git checkout <previous-commit-sha>
docker compose restart directus

# Option 2: Remove webhook-proxy extension
cd /opt/directus-colex/directus-docker-deploy
# Comment out webhook-proxy volume in docker-compose.yml
docker compose restart directus
```

## Monitoring Post-Deployment

```bash
# Watch webhook executions in real-time
docker compose logs -f directus | grep "Webhook Proxy"

# Check for errors
docker compose logs directus | grep -i "error" | grep -i "webhook"

# Check task tracking fields
curl -H "Authorization: Bearer INteF0APpirH3AmA69zffvvdmrA5PAdN" \
  "https://app.getcolex.com/items/tasks?filter[action_type][_eq]=webhook&fields=id,name,webhook_last_status,webhook_last_response,webhook_last_error&limit=10"
```

## Security Features

**SSRF Protection** (blocks these ranges):
- IPv4 localhost: `127.0.0.1`, `localhost`
- IPv6 localhost: `::1`, `[::1]`
- IPv4 private: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- IPv4 link-local: `169.254.0.0/16`
- IPv6 link-local: `fe80::/10`
- IPv6 unique local: `fc00::/7` (fc00::, fd00::)

**Timeout Protection**: 30-second timeout on all webhook requests

**Audit Logging**: All webhook executions logged with:
- URL called
- HTTP method
- User ID (from req.accountability)
- Response status
- Duration (ms)

## Troubleshooting

### Issue: "URL is required" error

**Cause**: Field mapping not working
**Fix**: Ensure configurable-button extension was rebuilt with field mapping code

### Issue: Tracking fields not updating

**Cause**: Migration not run or update code not deployed
**Fix**: Run migration, rebuild configurable-button extension

### Issue: 404 on /webhook-proxy

**Cause**: Extension not loaded or volume not mounted
**Fix**: Check docker-compose.yml has volume mount, check logs for "Loaded endpoint: webhook-proxy"

### Issue: Webhook timeout errors

**Cause**: External service taking >30 seconds
**Fix**: This is expected behavior - webhook should respond faster or increase timeout in code

### Issue: SSRF protection blocking valid URLs

**Cause**: URL looks like private IP or IPv6 private range
**Fix**: Use public DNS name instead of IP address

## Changes Made in This Release

1. **New Extension**: `directus-endpoint-webhook-proxy`
   - Server-side webhook execution to bypass CORS
   - SSRF protection (IPv4 + IPv6)
   - 30-second timeout
   - Structured logging

2. **Updated Extension**: `directus-extension-configurable-button`
   - Routes webhooks through `/webhook-proxy` endpoint
   - Updates tracking fields after webhook execution
   - Field mapping for webhook_url → url

3. **Database Changes**: 3 new fields in `tasks` collection
   - `webhook_last_status` (integer)
   - `webhook_last_response` (text, max 1000 chars)
   - `webhook_last_error` (text)

## Support

If deployment fails:
1. Check logs: `docker compose logs directus | tail -100`
2. Verify migration ran: `docker exec directus-db psql -U directus -d directus -c "\d tasks"`
3. Check extension files exist: `docker exec directus ls /directus/extensions/`
4. Contact developer with error logs

---

**Remember**: Migration MUST be run BEFORE deploying code. Test locally first. Have rollback plan ready.
