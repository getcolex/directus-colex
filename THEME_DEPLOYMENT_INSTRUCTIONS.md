# Colex Themes Deployment Guide

## Overview
This guide walks through deploying the Colex themes (Claude Light and Claude Dark) to your Directus instance running on DigitalOcean.

## Prerequisites
- SSH access to your DigitalOcean Droplet
- Git repository with themes committed
- Directus running via Docker Compose

## Deployment Steps

### Step 1: Pull Latest Changes on Droplet

```bash
cd /opt/directus-colex
git pull origin main
```

### Step 2: Create Extensions Directory Structure

```bash
# Create extensions directory if it doesn't exist
mkdir -p /opt/directus-colex/directus-docker-deploy/extensions

# Copy theme extensions from the cloned repo
cp -r extensions/directus-extension-theme-claude-light /opt/directus-colex/directus-docker-deploy/extensions/
cp -r extensions/directus-extension-theme-claude-dark /opt/directus-colex/directus-docker-deploy/extensions/

# Verify the structure
ls -la /opt/directus-colex/directus-docker-deploy/extensions/
```

### Step 3: Update Docker Compose Configuration

The docker-compose.yml needs to mount the extensions directory. Ensure it includes:

```yaml
services:
  directus:
    image: directus/directus:latest
    volumes:
      - uploads:/directus/uploads
      - extensions:/directus/extensions
      - ./extensions:/directus/extensions  # Mount local extensions
```

Use the provided `docker-compose.prod.yml`:

```bash
cd /opt/directus-colex/directus-docker-deploy

# Backup current compose file
cp docker-compose.yml docker-compose.yml.backup

# Use the production compose file or update existing one to include extensions volume
# Option 1: Use docker-compose.prod.yml
cp docker-compose.prod.yml docker-compose.yml

# Option 2: Manually add extensions volume to existing docker-compose.yml
```

### Step 4: Restart Directus

```bash
cd /opt/directus-colex/directus-docker-deploy

# Stop and remove old containers
docker compose down

# Start with new configuration
docker compose up -d

# Watch the logs for extensions loading
docker compose logs -f directus | grep -i extension
```

### Step 5: Verify Theme Installation

Wait ~30 seconds for Directus to fully start, then:

1. **Log into Directus Admin Panel:**
   - Go to https://app.getcolex.com
   - Login with your admin credentials

2. **Check Themes in Settings:**
   - Go to **Settings → Appearance**
   - Look for **Claude Light** and **Claude Dark** in the theme dropdown
   - The themes should be selectable

3. **Apply a Theme:**
   - Select **Claude Light** or **Claude Dark**
   - Click Save
   - Refresh the page to see the new theme applied

### Step 6: Verify Logs

Check if themes loaded properly:

```bash
docker compose logs directus | grep -A2 "Extensions loaded"
```

Expected output should show the themes loaded:
```
[HH:MM:SS.xxx] INFO: Extensions loaded
[HH:MM:SS.xxx] INFO: Loaded extensions: directus-extension-theme-claude-light, directus-extension-theme-claude-dark
```

## Troubleshooting

### Themes not appearing in Settings

1. **Check file permissions:**
   ```bash
   chmod -R 755 /opt/directus-colex/directus-docker-deploy/extensions/
   ```

2. **Verify dist files exist:**
   ```bash
   ls -la /opt/directus-colex/directus-docker-deploy/extensions/directus-extension-theme-claude-light/dist/
   ls -la /opt/directus-colex/directus-docker-deploy/extensions/directus-extension-theme-claude-dark/dist/
   ```

3. **Check Docker logs for errors:**
   ```bash
   docker compose logs directus | tail -100
   ```

4. **Restart containers:**
   ```bash
   docker compose restart directus
   ```

### Extension Loading Errors

If you see errors like "Cannot find module":

```bash
# Ensure node_modules are not in the extensions directory (only dist and package.json needed)
rm -rf /opt/directus-colex/directus-docker-deploy/extensions/*/node_modules/

# Restart
docker compose restart directus
```

## Rolling Back

If something goes wrong:

```bash
# Restore backup
cp docker-compose.yml.backup docker-compose.yml

# Restart with old configuration
docker compose restart

# Or restart from backup
docker compose down && docker compose up -d
```

## File Structure Required

```
/opt/directus-colex/directus-docker-deploy/
├── extensions/
│   ├── directus-extension-theme-claude-light/
│   │   ├── package.json
│   │   ├── dist/
│   │   │   └── index.js
│   │   └── src/
│   │       └── index.ts
│   └── directus-extension-theme-claude-dark/
│       ├── package.json
│       ├── dist/
│       │   └── index.js
│       └── src/
│           └── index.ts
├── docker-compose.yml
├── .env
└── ...
```

## Notes

- The `src/` folder and `node_modules/` are not needed on the server - only `dist/` and `package.json`
- Themes are loaded on Directus startup, so full restart required for changes
- Set `EXTENSIONS_AUTO_RELOAD: "false"` for production
- Use `EXTENSIONS_AUTO_RELOAD: "true"` only during development/testing
