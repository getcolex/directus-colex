#!/bin/bash

# Script to fix button_context by triggering updates via Directus API
# This will cause the populate-button-context hook to resync the data

AUTH_TOKEN="Bearer Rv1bjBdsXianqJtr4CIAfZIp56b_gklm"
API_URL="http://localhost:8055"

echo "======================================================================"
echo "Fixing button_context for all tasks..."
echo "======================================================================"
echo ""

# Get all tasks
echo "Fetching all tasks..."
TASKS=$(curl -s -H "Authorization: $AUTH_TOKEN" "$API_URL/items/tasks?fields=id,name,status&limit=1000")

# Extract task IDs
TASK_IDS=$(echo "$TASKS" | jq -r '.data[].id' 2>/dev/null)

if [ -z "$TASK_IDS" ]; then
    echo "❌ Failed to fetch tasks or no tasks found"
    echo "Response:"
    echo "$TASKS" | jq '.' 2>/dev/null || echo "$TASKS"
    exit 1
fi

TASK_COUNT=$(echo "$TASK_IDS" | wc -l)
echo "✓ Found $TASK_COUNT tasks"
echo ""

# Update each task to trigger the hook
COUNTER=0
for TASK_ID in $TASK_IDS; do
    COUNTER=$((COUNTER + 1))
    
    # Get task details
    TASK_DATA=$(echo "$TASKS" | jq -r ".data[] | select(.id == \"$TASK_ID\")")
    TASK_NAME=$(echo "$TASK_DATA" | jq -r '.name')
    TASK_STATUS=$(echo "$TASK_DATA" | jq -r '.status')
    
    echo "[$COUNTER/$TASK_COUNT] Updating: $TASK_NAME (Status: $TASK_STATUS)"
    
    # Trigger update by setting status to its current value
    # This will fire the populate-button-context hook which will resync button_context
    RESULT=$(curl -s -X PATCH "$API_URL/items/tasks/$TASK_ID" \
        -H "Authorization: $AUTH_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"status\": \"$TASK_STATUS\"}")
    
    # Check if successful
    if echo "$RESULT" | jq -e '.data.id' > /dev/null 2>&1; then
        echo "  ✓ Updated successfully"
    else
        echo "  ⚠ Update may have failed"
        echo "$RESULT" | jq '.errors[0].message' 2>/dev/null || echo "  $RESULT"
    fi
    
    # Small delay to avoid overwhelming the API
    sleep 0.1
done

echo ""
echo "======================================================================"
echo "✓ Completed! Updated $TASK_COUNT tasks."
echo "======================================================================"
echo ""
echo "Please refresh your browser to see the updated button contexts."
