# Deploying Colex Themes to Docker Server

## Prerequisites

- Theme extensions built locally (`dist/` folder exists in each theme directory)
- SSH access to your Docker server
- Directus running via Docker Compose

## Step 1: Build Extensions Locally

```bash
cd extensions/directus-extension-theme-claude-light
npm install && npm run build

cd ../directus-extension-theme-claude-dark
npm install && npm run build
```

## Step 2: Copy to Server

### Option A: SCP/SFTP

```bash
# Copy entire extension folders
scp -r extensions/directus-extension-theme-claude-light user@server:/path/to/directus/extensions/
scp -r extensions/directus-extension-theme-claude-dark user@server:/path/to/directus/extensions/
```

### Option B: Minimal Copy (dist only)

Only the built files are needed:

```bash
# Create directories on server first
ssh user@server "mkdir -p /path/to/directus/extensions/directus-extension-theme-claude-light/dist"
ssh user@server "mkdir -p /path/to/directus/extensions/directus-extension-theme-claude-dark/dist"

# Copy dist and package.json
scp extensions/directus-extension-theme-claude-light/dist/index.js user@server:/path/to/directus/extensions/directus-extension-theme-claude-light/dist/
scp extensions/directus-extension-theme-claude-light/package.json user@server:/path/to/directus/extensions/directus-extension-theme-claude-light/

scp extensions/directus-extension-theme-claude-dark/dist/index.js user@server:/path/to/directus/extensions/directus-extension-theme-claude-dark/dist/
scp extensions/directus-extension-theme-claude-dark/package.json user@server:/path/to/directus/extensions/directus-extension-theme-claude-dark/
```

## Step 3: Docker Compose Configuration

Ensure your `docker-compose.yml` mounts the extensions directory:

```yaml
services:
  directus:
    image: directus/directus:11
    volumes:
      - ./extensions:/directus/extensions
      # ... other volumes
    environment:
      EXTENSIONS_AUTO_RELOAD: "false"  # Set to "true" only in dev
```

## Step 4: Restart Directus

```bash
# On the server
cd /path/to/directus
docker-compose restart
```

Or if you need a full rebuild:

```bash
docker-compose down && docker-compose up -d
```

## Step 5: Verify Installation

1. Log into Directus admin
2. Go to **Settings** → **Appearance**
3. You should see **Colex Light** and **Colex Dark** in the theme dropdown

## Troubleshooting

### Themes not appearing

- Check extension directory permissions: `chmod -R 755 extensions/`
- Verify `package.json` has correct `directus:extension` config
- Check Directus logs: `docker-compose logs directus`

### Extension errors in logs

- Ensure `dist/index.js` exists in each theme folder
- Verify host compatibility in `package.json`: `"host": "^10.0.0 || ^11.0.0"`

## File Structure Required

```
extensions/
├── directus-extension-theme-claude-light/
│   ├── package.json
│   └── dist/
│       └── index.js
└── directus-extension-theme-claude-dark/
    ├── package.json
    └── dist/
        └── index.js
```

The `src/` folder and `node_modules/` are not needed on the server.
