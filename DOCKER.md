# Docker Development Guide

This document provides instructions for running the Gemini CLI OpenAI Worker in a Docker environment for local development.

## Prerequisites

- Docker and Docker Compose installed on your system
- A `.dev.vars` file with your environment variables (copy from `.dev.vars.example`)

## Quick Start

1. **Clone and setup the project:**
   ```bash
   git clone https://github.com/GewoonJaap/gemini-cli-openai
   cd gemini-cli-openai
   ```

2. **Create your environment file:**
   ```bash
   cp .dev.vars.example .dev.vars
   # Edit .dev.vars with your actual credentials
   ```

3. **Start the development environment:**
   ```bash
   npm run docker:dev
   ```

4. **Test the API:**
   ```bash
   curl http://localhost:8787/health
   curl http://localhost:8787/v1/models
   ```

## Available Docker Commands

| Command | Description |
|---------|-------------|
| `npm run docker:build` | Build the Docker image |
| `npm run docker:dev` | Build and start with logs (recommended for development) |
| `npm run docker:start` | Start existing containers |
| `npm run docker:stop` | Stop running containers |
| `npm run docker:clean` | Stop containers and remove volumes (clears KV data) |
| `npm run docker:logs` | View container logs |
| `npm run docker:shell` | Open a shell inside the container |

## How It Works

### Architecture

- **Container**: Alpine Linux with Node.js 20
- **Web Framework**: Hono running on Cloudflare Workers runtime (via miniflare)
- **Development Server**: Wrangler dev with miniflare for local simulation
- **Storage**: KV data persisted to Docker volume for data persistence

### File Structure in Container

```
/app/
├── src/                 # Your TypeScript source code
├── .dev.vars           # Environment variables (injected by wrangler)
├── wrangler.toml       # Cloudflare Worker configuration
├── package.json        # Node.js dependencies
└── .mf/kv/            # Persistent KV storage (Docker volume)
```

### Environment Variables

Your `.dev.vars` file is automatically loaded by `wrangler dev` inside the container. The following variables are supported:

- `GOOGLE_OAUTH_CREDS_JSON`: Required Google OAuth credentials
- `GEMINI_PROJECT_ID`: Optional Google Cloud Project ID
- `ENABLE_REAL_THINKING`: Enable real thinking mode
- `ENABLE_FAKE_THINKING`: Enable fake thinking for testing
- `STREAM_THINKING_AS_CONTENT`: Stream thinking as content
- `OPENAI_API_KEY`: Optional API key for authentication

### Persistent Data

KV data is stored in a Docker volume named `gemini_kv_data`, which persists across container restarts. To clear all data:

```bash
npm run docker:clean
```

## Development Workflow

### 1. Code Changes

The container mounts your local source code directory, so changes are reflected immediately thanks to wrangler's hot reloading:

1. Edit files in `src/`
2. Save changes
3. Container automatically restarts and reflects changes
4. Test at `http://localhost:8787`

### 2. Adding Dependencies

If you add new npm dependencies:

```bash
# Stop the container
npm run docker:stop

# Rebuild with new dependencies
npm run docker:dev
```

### 3. Debugging

#### View Logs
```bash
npm run docker:logs
```

#### Access Container Shell
```bash
npm run docker:shell
# Inside container:
# - Check environment: env
# - Test wrangler: wrangler --version
# - Check KV data: ls -la .mf/kv/
```

#### Test Endpoints
```bash
# Health check
curl http://localhost:8787/health

# OpenAI-compatible endpoints
curl http://localhost:8787/v1/models
curl -X POST http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{"model":"gemini-2.0-flash-exp","messages":[{"role":"user","content":"Hello!"}]}'

# Debug endpoints
curl http://localhost:8787/v1/debug/cache
curl http://localhost:8787/v1/token-test
```

## Troubleshooting

### Container Won't Start

1. **Check Docker is running:**
   ```bash
   docker --version
   docker-compose --version
   ```

2. **Check for port conflicts:**
   ```bash
   lsof -i :8787  # Check if port 8787 is in use
   ```

3. **View detailed logs:**
   ```bash
   docker-compose up --build
   ```

### Environment Variables Not Working

1. **Verify .dev.vars exists:**
   ```bash
   ls -la .dev.vars
   ```

2. **Check .dev.vars format:**
   - No spaces around the `=`
   - No quotes unless part of the value
   - JSON values should be on one line

3. **Test environment inside container:**
   ```bash
   npm run docker:shell
   cat .dev.vars
   ```

### KV Data Issues

1. **Check volume mount:**
   ```bash
   docker volume ls | grep gemini
   ```

2. **Inspect KV directory:**
   ```bash
   npm run docker:shell
   ls -la .mf/kv/
   ```

3. **Reset KV data:**
   ```bash
   npm run docker:clean
   npm run docker:dev
   ```

### Performance Issues

1. **Check resource usage:**
   ```bash
   docker stats
   ```

2. **Increase memory limits in docker-compose.yml:**
   ```yaml
   deploy:
     resources:
       limits:
         memory: 1G  # Increase from 512M
   ```

## Production Deployment

This Docker setup is designed for **local development only**. For production deployment:

1. Use the standard Cloudflare Workers deployment:
   ```bash
   npm run deploy
   ```

2. Set environment variables in Cloudflare Workers dashboard or wrangler.toml

3. Create production KV namespaces:
   ```bash
   wrangler kv namespace create GEMINI_CLI_KV --env production
   ```

## Security Notes

- `.dev.vars` is gitignored and should never be committed
- Docker containers run with standard user permissions
- KV data is stored locally and not encrypted at rest
- Use HTTPS in production with proper SSL certificates

## Advanced Configuration

### Custom Port

To use a different port:

1. Update `docker-compose.yml`:
   ```yaml
   ports:
     - "3000:8787"  # Use port 3000 on host
   ```

2. Access at `http://localhost:3000`

### Multiple Environments

Create different compose files:

```bash
# Development
docker-compose -f docker-compose.yml up

# Staging
docker-compose -f docker-compose.staging.yml up
```

### Integration with CI/CD

Example GitHub Actions workflow:

```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm run docker:build
      - run: npm run docker:dev &
      - run: sleep 10 && curl http://localhost:8787/health
```
