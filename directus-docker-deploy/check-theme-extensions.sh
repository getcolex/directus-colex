#!/bin/bash

# Theme Extensions Diagnostic Script
# Run this on the server to check why theme extensions aren't working

echo "==================================================="
echo "Theme Extensions Diagnostic"
echo "==================================================="
echo ""

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo "ERROR: Run this from directus-docker-deploy directory"
    exit 1
fi

echo "1. Checking theme extension directories..."
echo "---------------------------------------------------"
if [ -d "extensions/directus-extension-wcag-theme-colex-light" ]; then
    echo "✓ Light theme directory exists"
else
    echo "✗ Light theme directory MISSING"
fi

if [ -d "extensions/directus-extension-wcag-theme-colex-dark" ]; then
    echo "✓ Dark theme directory exists"
else
    echo "✗ Dark theme directory MISSING"
fi

echo ""
echo "2. Checking built files (dist/index.js)..."
echo "---------------------------------------------------"
if [ -f "extensions/directus-extension-wcag-theme-colex-light/dist/index.js" ]; then
    SIZE=$(stat -f%z "extensions/directus-extension-wcag-theme-colex-light/dist/index.js" 2>/dev/null || stat -c%s "extensions/directus-extension-wcag-theme-colex-light/dist/index.js" 2>/dev/null)
    echo "✓ Light theme built: ${SIZE} bytes"
else
    echo "✗ Light theme dist/index.js MISSING"
fi

if [ -f "extensions/directus-extension-wcag-theme-colex-dark/dist/index.js" ]; then
    SIZE=$(stat -f%z "extensions/directus-extension-wcag-theme-colex-dark/dist/index.js" 2>/dev/null || stat -c%s "extensions/directus-extension-wcag-theme-colex-dark/dist/index.js" 2>/dev/null)
    echo "✓ Dark theme built: ${SIZE} bytes"
else
    echo "✗ Dark theme dist/index.js MISSING"
fi

echo ""
echo "3. Checking package.json files..."
echo "---------------------------------------------------"
if [ -f "extensions/directus-extension-wcag-theme-colex-light/package.json" ]; then
    echo "✓ Light theme package.json exists"
else
    echo "✗ Light theme package.json MISSING"
fi

if [ -f "extensions/directus-extension-wcag-theme-colex-dark/package.json" ]; then
    echo "✓ Dark theme package.json exists"
else
    echo "✗ Dark theme package.json MISSING"
fi

echo ""
echo "4. Checking Docker container status..."
echo "---------------------------------------------------"
docker-compose ps

echo ""
echo "5. Checking extensions inside container..."
echo "---------------------------------------------------"
echo "Extensions directory contents:"
docker-compose exec -T directus ls -la /directus/extensions/ | grep -E "wcag-theme|^total|^d"

echo ""
echo "Light theme files in container:"
docker-compose exec -T directus find /directus/extensions/directus-extension-wcag-theme-colex-light -type f 2>/dev/null || echo "Directory not found in container"

echo ""
echo "Dark theme files in container:"
docker-compose exec -T directus find /directus/extensions/directus-extension-wcag-theme-colex-dark -type f 2>/dev/null || echo "Directory not found in container"

echo ""
echo "6. Checking Directus logs for extension loading..."
echo "---------------------------------------------------"
docker-compose logs directus 2>&1 | grep -i "extension" | tail -20

echo ""
echo "7. Checking for errors..."
echo "---------------------------------------------------"
docker-compose logs directus 2>&1 | grep -i "error" | grep -i "theme\|extension" | tail -10

echo ""
echo "==================================================="
echo "Diagnostic complete!"
echo "==================================================="
