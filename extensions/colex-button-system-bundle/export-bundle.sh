#!/bin/bash
# Export colex-button-system-bundle for distribution
#
# This script creates both .tgz and .zip packages for easy distribution
# Includes only necessary files: package.json + dist/ folder

set -e  # Exit on error

BUNDLE_NAME="colex-button-system-bundle"
VERSION=$(node -p "require('./package.json').version")
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$SCRIPT_DIR"

echo "======================================================================"
echo "  📦 Exporting ${BUNDLE_NAME} v${VERSION}"
echo "======================================================================"
echo ""

# Ensure dist folder exists
if [ ! -d "dist" ]; then
  echo "❌ Error: dist/ folder not found"
  echo ""
  echo "Please build the extension first:"
  echo "  npm run build"
  exit 1
fi

# Method 1: NPM Pack (creates .tgz)
echo "Creating .tgz package..."
npm pack --quiet
echo "✅ Created: ${BUNDLE_NAME}-${VERSION}.tgz"

# Method 2: Create .zip from .tgz
echo ""
echo "Creating .zip package..."
tar -xzf "${BUNDLE_NAME}-${VERSION}.tgz"
zip -r -q "${BUNDLE_NAME}-${VERSION}.zip" package
rm -rf package
echo "✅ Created: ${BUNDLE_NAME}-${VERSION}.zip"

echo ""
echo "======================================================================"
echo "  ✅ Export complete!"
echo "======================================================================"
echo ""
echo "Created files in: $(pwd)"
echo "  • ${BUNDLE_NAME}-${VERSION}.tgz (npm package)"
echo "  • ${BUNDLE_NAME}-${VERSION}.zip (zip archive)"
echo ""
echo "Both packages contain:"
echo "  • package.json (extension manifest)"
echo "  • dist/app.js (52KB - frontend components)"
echo "  • dist/api.js (6.5KB - backend hooks & endpoints)"
echo ""
echo "======================================================================"
echo "  📋 Installation Instructions"
echo "======================================================================"
echo ""
echo "From .tgz (recommended):"
echo "  1. Extract:  tar -xzf ${BUNDLE_NAME}-${VERSION}.tgz"
echo "  2. Rename:   mv package ${BUNDLE_NAME}"
echo "  3. Install:  mv ${BUNDLE_NAME} /path/to/directus/extensions/"
echo "  4. Restart:  docker-compose restart directus"
echo ""
echo "From .zip:"
echo "  1. Extract:  unzip ${BUNDLE_NAME}-${VERSION}.zip"
echo "  2. Install:  mv ${BUNDLE_NAME} /path/to/directus/extensions/"
echo "  3. Restart:  docker-compose restart directus"
echo ""
