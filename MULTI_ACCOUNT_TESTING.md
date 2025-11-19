# Multi-Account Support Testing Guide

This document explains how to test the multi-account support feature for rate limiting avoidance.

## Setup for Testing

### 1. Prepare Multiple Google Accounts

You'll need at least 2 Google accounts authenticated with Gemini CLI:

```bash
# Account 1
gemini auth
# Copy ~/.gemini/oauth_creds.json to account1.json

# Account 2 (use different Google account)
# Delete ~/.gemini/oauth_creds.json first
gemini auth
# Copy ~/.gemini/oauth_creds.json to account2.json
```

### 2. Create Multi-Account Configuration

Combine the credentials into a JSON array:

```bash
# Create combined.json
echo '[' > combined.json
cat account1.json >> combined.json
echo ',' >> combined.json
cat account2.json >> combined.json
echo ']' >> combined.json

# Minify for environment variable (remove newlines and spaces)
cat combined.json | jq -c '.' > credentials.json
```

### 3. Configure Environment Variables

In your `.dev.vars` file:

```bash
# Multi-account credentials
GCP_SERVICE_ACCOUNT=<paste content from credentials.json>

# Enable multi-account rotation
ENABLE_MULTI_ACCOUNT=true

# Optional: Your API key
OPENAI_API_KEY=sk-your-test-key
```

## Testing Scenarios

### Test 1: Basic Account Rotation

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Make a request to the chat completions endpoint:
   ```bash
   curl -X POST http://localhost:8787/v1/chat/completions \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer sk-your-test-key" \
     -d '{
       "model": "gemini-2.5-flash",
       "messages": [{"role": "user", "content": "Hello"}]
     }'
   ```

3. Check the console logs - you should see:
   - `Loaded 2 accounts. Multi-account mode: true`
   - `Found available account at index X`

### Test 2: Rate Limit Fallback

To test rate limit handling, you would need to:

1. Generate enough requests to hit the rate limit on account 1
2. The system should automatically switch to account 2
3. Check logs for:
   - `Got rate limit error (429) for account 0`
   - `Marking account 0 as rate-limited`
   - `Switching from account 0 to account 1`

### Test 3: Account Health Tracking

1. Check the KV storage for account health data:
   ```bash
   wrangler kv:key list --binding=GEMINI_CLI_KV
   ```

2. You should see keys like:
   - `oauth_token_cache_account_0`
   - `oauth_token_cache_account_1`
   - `account_rotation_state`
   - `account_health_0` (if an account was rate-limited)

### Test 4: Single Account Compatibility

To verify backward compatibility:

1. Configure a single account (not an array):
   ```bash
   GCP_SERVICE_ACCOUNT={"access_token":"...","refresh_token":"...","scope":"...","token_type":"Bearer","id_token":"...","expiry_date":...}
   ENABLE_MULTI_ACCOUNT=false
   ```

2. The system should work exactly as before with no multi-account logic

## Monitoring in Production

When deployed to Cloudflare Workers, monitor the logs:

```bash
wrangler tail
```

Look for:
- Account rotation events
- Rate limit detections
- Successful failovers
- Account health updates

## Expected Behavior

### Normal Operation
- Requests use accounts in round-robin rotation
- Each account's token is cached independently
- Rotation state is persisted in KV storage

### Rate Limit Scenario
1. Request fails with HTTP 429 or 503
2. Current account is marked as rate-limited
3. System switches to next available account
4. Request is retried (up to 3 times)
5. Rate-limited account enters cooldown (60 seconds)

### All Accounts Rate-Limited
- System will return an error after exhausting all accounts
- Error message: "All accounts are rate-limited. Please try again later."

## Troubleshooting

### Issue: "Authentication failed"
- Verify all accounts have valid refresh tokens
- Check that credentials are properly formatted as JSON array
- Ensure `ENABLE_MULTI_ACCOUNT=true` is set

### Issue: Not switching accounts on rate limit
- Verify `ENABLE_MULTI_ACCOUNT=true` is set
- Check that you have multiple accounts in the array
- Review worker logs for error messages

### Issue: Accounts not recovering from rate limit
- Check KV storage TTL settings (default 60 seconds cooldown)
- Verify account health keys expire properly
- Review timestamp calculations in logs

## Performance Metrics

Expected improvements with N accounts:
- Rate limit capacity: ~N × single account limit
- Failover time: < 100ms (KV lookup + auth)
- Additional storage: ~1KB per account in KV
- Request overhead: Minimal (~10ms for account selection)
