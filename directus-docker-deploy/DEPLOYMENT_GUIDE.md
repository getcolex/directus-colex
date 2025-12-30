# Directus Colex Deployment Guide

This guide ensures safe deployment of Directus extensions and updates while preserving marketplace extensions.

## 📋 Prerequisites

- Access to server: `64.227.151.81`
- Repository: `getcolex/directus-colex`
- Branch: `feature/table_buttons`
- Docker and docker-compose installed on server

## 🏗️ Extension Architecture

### Extension Storage Locations:
- **Marketplace Extensions**: Stored in Docker volume `directus-docker-deploy_extensions` at `/.registry/`
- **Custom Extensions**: Bind-mounted from `./extensions/` directory
- **Combined**: Both appear in `/directus/extensions/` inside container

### Current Extensions:
#### Custom Extensions (8):
- `colex-button-display`
- `directus-extension-configurable-button`
- `directus-extension-json-interface`
- `directus-extension-review-module`
- `directus-extension-wcag-theme-colex-dark`
- `directus-extension-wcag-theme-colex-light`
- `directus-hook-populate-button-context`
- `directus-hook-task-dependency-v2`

#### Marketplace Extensions (9):
- `directus-extension-formula-interface`
- `@foreningen-folkemoedet/directus-extension-editorjs-interface`
- `@directus-labs/flow-trigger-bundle`
- `directus-extension-midnight-minimal-theme`
- `@directus-labs/field-comments`
- `@directus-labs/command-palette-module`
- `directus-extension-super-table`
- `directus-extension-refresh-on-changed`
- `directus-extension-flat-tabs-interface`

## 🚀 Standard Deployment Process

### 1. Local Development & Testing

```bash
# Navigate to local workspace
cd /Users/ayongargary/Documents/directus/directus

# Check current branch
git branch

# Ensure you're on the correct branch
git checkout feature/table_buttons

# Pull latest changes from remote (if working in team)
git pull origin feature/table_buttons

# Make your changes (add new extensions, update code, etc.)

# Stage your changes
git add .

# Commit with descriptive message
git commit -m "Description of changes made"

# Push to remote repository
git push origin feature/table_buttons
```

### 2. Server Deployment

```bash
# SSH into the server
ssh root@64.227.151.81

# Navigate to the project directory
cd /opt/directus-colex

# Pull latest changes from repository
git pull origin feature/table_buttons

# Navigate to docker deployment directory
cd directus-docker-deploy

# Check current container status
docker-compose ps

# Deploy the updates (SAFE - preserves volumes)
docker-compose down
docker-compose up -d

# Optional: Rebuild images if needed
# docker-compose down
# docker-compose up -d --build

# Check deployment status
docker-compose logs -f directus --tail 20
```

### 3. Verify Deployment

```bash
# Check that all extensions are loaded
docker-compose logs directus | grep "Loaded extensions" | tail -1

# Check service health
curl -s http://localhost:8055/server/info | head -5

# Exit SSH session
exit
```

## ✅ Safe Commands Reference

### ✅ SAFE Commands (Preserve Marketplace Extensions):
```bash
docker-compose down                    # Stop containers, keep volumes
docker-compose up -d                   # Start containers
docker-compose up -d --build          # Rebuild and start
docker-compose restart directus       # Restart service only
docker-compose logs -f directus       # View logs
```

### ⚠️ Commands Requiring Caution:
```bash
docker-compose down -v                # DANGER: Deletes ALL volumes including marketplace extensions
docker-compose down --volumes         # DANGER: Same as above
docker system prune -a --volumes      # DANGER: Deletes everything
```

## 🔧 Adding New Extensions

### For Custom Extensions:

1. **Copy extension to server:**
```bash
# From local machine
scp -r /path/to/new-extension root@64.227.151.81:/opt/directus-colex/directus-docker-deploy/extensions/

# Update docker-compose.yml to add volume mapping
# Add line like:
# - ./extensions/new-extension-name:/directus/extensions/new-extension-name
```

2. **Update local docker-compose.yml:**
```bash
# Edit docker-compose.yml locally
# Add the new extension volume mapping
# Commit and push changes
git add directus-docker-deploy/docker-compose.yml
git commit -m "Add new extension: extension-name"
git push origin feature/table_buttons
```

### For Marketplace Extensions:
1. Install via Directus admin interface at `http://64.227.151.81:8055`
2. Go to Settings → Extensions → Browse Marketplace
3. Install desired extensions
4. Extensions auto-reload due to `EXTENSIONS_AUTO_RELOAD: "true"`

## 🛠️ Troubleshooting

### Missing Extensions After Deployment:
```bash
# Check if volumes exist
docker volume ls | grep directus

# Check extension files
docker-compose exec directus ls -la /directus/extensions/

# Check logs for extension errors
docker-compose logs directus | grep -i "extension\|error"
```

### Extension Not Loading:
```bash
# Restart Directus service
docker-compose restart directus

# Force reload extensions
docker-compose down && docker-compose up -d

# Check extension file structure
docker-compose exec directus find /directus/extensions/extension-name -name "*.js" -o -name "package.json"
```

### Complete Reset (Last Resort):
```bash
# ⚠️ WARNING: This will delete all marketplace extensions and data
docker-compose down -v
docker-compose up -d
# You will need to reinstall all marketplace extensions manually
```

## 📋 Pre-Deployment Checklist

- [ ] Changes committed and pushed to `feature/table_buttons`
- [ ] SSH access to server confirmed
- [ ] Current deployment is working
- [ ] Backup important data if making major changes
- [ ] Team notified of deployment (if applicable)

## 📋 Post-Deployment Checklist

- [ ] All extensions loading correctly (17 total expected)
- [ ] No error messages in logs
- [ ] Directus admin interface accessible
- [ ] Key functionality tested
- [ ] Performance is acceptable

## 🔄 Rollback Process

If deployment fails:

```bash
# On server
cd /opt/directus-colex

# Rollback to previous commit
git log --oneline -5  # Find previous commit hash
git checkout <previous-commit-hash>

# Redeploy
cd directus-docker-deploy
docker-compose down
docker-compose up -d
```

## 📞 Emergency Contacts

- Server IP: `64.227.151.81`
- Directus Admin: `http://64.227.151.81:8055`
- Repository: `https://github.com/getcolex/directus-colex`

## 📝 Notes

- Always use the safe deployment commands to preserve marketplace extensions
- Marketplace extensions are stored in Docker volumes, not in git repository
- Custom extensions are version controlled and deployed via bind mounts
- The system supports 17+ extensions simultaneously
- Extensions auto-reload is enabled for development convenience

---

**Last Updated:** December 12, 2025  
**Version:** 1.0  
**Maintained by:** Development Team