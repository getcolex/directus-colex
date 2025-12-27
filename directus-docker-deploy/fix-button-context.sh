#!/bin/bash

# Script to force update button_context for all tasks in a project

PROJECT_ID="20131104-933a-4868-93c5-0675e34b4bf9"
AUTH_TOKEN="Bearer Rv1bjBdsXianqJtr4CIAfZIp56b_gklm"

echo "Fetching tasks for project $PROJECT_ID..."

# Get all task IDs for the project
TASK_IDS=$(curl -s -H "Authorization: $AUTH_TOKEN" "http://localhost:8055/items/tasks?filter[project_id][_eq]=$PROJECT_ID&fields=id" | jq -r '.data[].id')

if [ -z "$TASK_IDS" ]; then
    echo "No tasks found for project $PROJECT_ID"
    exit 1
fi

echo "Found $(echo "$TASK_IDS" | wc -l) tasks"
echo ""

# For each task, trigger an update to refresh button_context
for TASK_ID in $TASK_IDS; do
    echo "Updating task $TASK_ID..."
    
    # Get current task data
    TASK=$(curl -s -H "Authorization: $AUTH_TOKEN" "http://localhost:8055/items/tasks/$TASK_ID")
    
    # Extract status
    STATUS=$(echo "$TASK" | jq -r '.data.status')
    NAME=$(echo "$TASK" | jq -r '.data.name')
    BUTTON_CTX_STATUS=$(echo "$TASK" | jq -r '.data.button_context.status // "null"')
    
    echo "  Task: $NAME"
    echo "  Current Status: $STATUS"
    echo "  Button Context Status: $BUTTON_CTX_STATUS"
    
    # Trigger update by patching the task (this will fire the populate-button-context hook)
    # We just update updated_at to current time to trigger the hook without changing data
    curl -s -X PATCH "http://localhost:8055/items/tasks/$TASK_ID" \
        -H "Authorization: $AUTH_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"updated_at\": \"$(date -u +%Y-%m-%dT%H:%M:%S)\"}" > /dev/null
    
    echo "  ✓ Updated"
    echo ""
done

echo "Done! All tasks updated."
