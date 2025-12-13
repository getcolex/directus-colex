# Production Sync Checklist

All changes needed to bring production (app.getcolex.com) to parity with local.

## Code Changes (Git)

### 1. Commit and Push Extension Changes

**Changed files**:
- `extensions/directus-extension-configurable-button/src/display.vue`
  - Line 356-357: Added `display_fields` and `needs_approval` to createEnhancedItem()
  - Line 613: Fixed action_type priority (button.action_type || item.action_type)

- `extensions/directus-hook-populate-button-context/index.js`
  - Line 17, 21: Added `needs_approval` to syncFields
  - Line 49: Added `needs_approval` to buildButtonContext()
  - Line 75: Added `needs_approval` to filter hook

**Deployment**:
```bash
git add extensions/
git commit -m "Fix button visibility and action_type priority

- Add display_fields and needs_approval to createEnhancedItem
- Fix action_type priority: button takes precedence over task
- Add needs_approval to button_context sync
- Enables See Outputs and Review Outputs buttons to work correctly"

git push origin feature/parijat
```

**On production server** (after push):
```bash
git pull
cd extensions/directus-extension-configurable-button && npm run build
cd ../directus-hook-populate-button-context && npm run build
docker-compose restart directus  # or systemctl restart directus
```

## Database/Schema Changes (API Calls)

### 2. Update Button Configurations

**Scripts to run** (in order):

```bash
# 1. Update "Run Task" button to generic (empty string)
# Button ID: 4afc5743-021f-4699-a9c1-00f9000e4c08
# action_type: "" (uses task's action_type)

# 2. Update "See Outputs" button visibility
# Button ID: 09b6caba-32c7-4f08-bba0-c1c97042a53a
node /tmp/update_prod_buttons_webhook.mjs

# 3. Update "Review Task Outputs" button visibility
# (included in update_prod_buttons_webhook.mjs)

# 4. Update "View Form" button visibility
# Button ID: b98d4604-b919-49d0-9d28-9f6039009287
# (already updated earlier - verify condition includes action_type=create_item_single)

# 5. Fix "Task Running" button
node /tmp/remove_disabled_prod.mjs
# Sets action_type="" and adds disabled_condition
```

### 3. Update Display Configuration

**Add "See Outputs" button to display**:
```bash
# Add button 09b6caba-32c7-4f08-bba0-c1c97042a53a to tasks.button_context display
# Script already created but may need to run
```

### 4. Update Field Dropdowns

```bash
# Update action_type dropdown (11 options, removed "disabled")
node /tmp/remove_disabled_prod.mjs

# Update status dropdown (5 options, removed "needs_review" and "updates_available")
node /tmp/remove_needs_review_prod.mjs

# Then create and run:
node /tmp/remove_updates_available_prod.mjs
```

Create `/tmp/remove_updates_available_prod.mjs`:
```javascript
const TOKEN = "INteF0APpirH3AmA69zffvvdmrA5PAdN";

const statusChoices = [
  { text: "New", value: "new" },
  { text: "Ready", value: "ready" },
  { text: "In Progress", value: "in_progress" },
  { text: "Awaiting Approval", value: "awaiting_approval" },
  { text: "Done", value: "done" }
];

const updateResp = await fetch('https://app.getcolex.com/fields/tasks/status', {
  method: 'PATCH',
  headers: {
    'Authorization': \`Bearer \${TOKEN}\`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    meta: { options: { choices: statusChoices } }
  })
});

console.log('Status:', updateResp.status);
```

### 5. Resync All Tasks (Optional but Recommended)

After deploying extensions, trigger button_context resync on all production tasks:

```javascript
// Create script to PATCH all tasks with their current status
// This ensures button_context gets populated with needs_approval field
const tasks = await fetch('https://app.getcolex.com/items/tasks?fields=id,status&limit=-1');
for (const task of tasks.data) {
  await fetch(`https://app.getcolex.com/items/tasks/${task.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: task.status })
  });
}
```

## Complete Production Deployment Sequence

```bash
# === LOCAL ===
# 1. Commit and push code
git add extensions/
git commit -m "Fix button visibility and action_type priority"
git push origin feature/parijat

# === PRODUCTION SERVER ===
# 2. Pull and rebuild extensions
git pull
cd extensions/directus-extension-configurable-button && npm run build
cd ../directus-hook-populate-button-context && npm run build
docker-compose restart directus

# === LOCAL (run API scripts against production) ===
# 3. Update dropdowns
node /tmp/remove_disabled_prod.mjs
node /tmp/remove_needs_review_prod.mjs
node /tmp/remove_updates_available_prod.mjs  # Create this first

# 4. Update button configs
node /tmp/update_prod_buttons_webhook.mjs

# 5. Update display config (if needed)
# Verify button_context display has all 6 buttons

# 6. Resync tasks (if needed)
# Create and run script to PATCH all tasks
```

## Summary of Changes

**Extension Changes** (deployed via git):
- ✅ Fixed createEnhancedItem to include display_fields and needs_approval
- ✅ Fixed action_type priority (button first, task fallback)
- ✅ Added needs_approval to button_context sync

**Button Changes** (API updates):
- ✅ Run Task: action_type="" (generic)
- ✅ See Outputs: visibility requires webhook + done + display_fields
- ✅ Review Task Outputs: visibility requires webhook + awaiting_approval + needs_approval + display_fields
- ✅ View Form: visibility requires create_item_single + done
- ✅ Task Running: action_type="" + disabled_condition
- ✅ Dependent: added to display config

**Dropdown Changes** (API updates):
- ✅ action_type: 11 options (removed "disabled")
- ✅ status: 5 options (removed "needs_review" and "updates_available")

## Verification Checklist

After deployment, verify on production:

- [ ] Extensions rebuilt and Directus restarted
- [ ] Task with status=done + action_type=webhook shows "See Outputs" button
- [ ] Task with status=awaiting_approval + needs_approval=true shows "Review Task Outputs"
- [ ] Clicking "See Outputs" opens review module (NOT webhook error)
- [ ] Clicking "Review Task Outputs" opens review module (NOT webhook error)
- [ ] "Run Task" button works on both webhook and create_item_single tasks
- [ ] action_type dropdown shows 11 options (no "disabled")
- [ ] status dropdown shows 5 options (no "needs_review", no "updates_available")

## Rollback Plan

**If issues occur**:

1. **Revert code**:
   ```bash
   git revert <commit-hash>
   git push
   # Pull and rebuild on production
   ```

2. **Restore button configs** (from backup):
   ```bash
   # Backup first:
   curl -H "Authorization: Bearer $TOKEN" \
     "https://app.getcolex.com/items/configurable_buttons?limit=-1" \
     > production_buttons_backup_$(date +%Y%m%d).json
   ```

3. **Restore dropdowns**:
   - Re-add "disabled", "needs_review", "updates_available" if needed
