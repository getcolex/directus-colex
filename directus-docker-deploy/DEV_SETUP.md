# Local Development Setup

Quick guide for running Directus locally for development.

## Prerequisites

- Docker Desktop installed
- Git

## Quick Start

### 1. Set Up Environment

```bash
cd directus-docker-deploy

# Copy dev environment template
cp .env.dev.example .env

# (Optional) Edit .env with your API keys if needed
# nano .env
```

### 2. Start Development Environment

```bash
# Start services
docker-compose -f docker-compose-dev.yml up -d

# Watch logs
docker-compose -f docker-compose-dev.yml logs -f
```

### 3. Access Directus

- **Admin UI**: http://localhost:8055/admin
- **Credentials**: admin@example.com / d1r3ctu5
- **Database**: localhost:5432 (user: directus, password: directus)

## Development Workflow

### Working on Extensions

Extensions are mounted from `../extensions/` and auto-reload when built:

```bash
# Make changes to extension source code
cd ../extensions/directus-extension-configurable-button

# Build extension (watch mode for auto-rebuild)
npm run dev

# Or one-time build
npm run build

# Directus will detect changes and reload automatically
```

### Database Operations

```bash
# Run migration
docker-compose -f docker-compose-dev.yml exec postgres psql -U directus -d directus -f /path/to/migration.sql

# Access PostgreSQL shell
docker-compose -f docker-compose-dev.yml exec postgres psql -U directus -d directus

# Reset database (WARNING: destroys all data)
docker-compose -f docker-compose-dev.yml down -v
docker-compose -f docker-compose-dev.yml up -d
```

### Restarting Services

```bash
# Restart Directus only
docker-compose -f docker-compose-dev.yml restart directus

# Restart all services
docker-compose -f docker-compose-dev.yml restart

# Full rebuild (if Dockerfile or dependencies changed)
docker-compose -f docker-compose-dev.yml down
docker-compose -f docker-compose-dev.yml up -d --build
```

### Viewing Logs

```bash
# All logs (follow)
docker-compose -f docker-compose-dev.yml logs -f

# Directus logs only
docker-compose -f docker-compose-dev.yml logs -f directus

# Last 100 lines
docker-compose -f docker-compose-dev.yml logs --tail=100 directus

# Search logs for errors
docker-compose -f docker-compose-dev.yml logs directus | grep -i error
```

### Stop Development Environment

```bash
# Stop services (keep data)
docker-compose -f docker-compose-dev.yml down

# Stop and remove volumes (destroys all data)
docker-compose -f docker-compose-dev.yml down -v
```

## Tips

1. **Use watch mode** when developing extensions: `npm run dev` instead of `npm run build`

2. **Keep logs visible** in a separate terminal: `docker-compose -f docker-compose-dev.yml logs -f directus`

3. **Database persists** between restarts (unless you use `down -v`)

4. **Extensions auto-reload** when built - no manual restart needed

5. **Use debug logging** - already enabled in dev config
