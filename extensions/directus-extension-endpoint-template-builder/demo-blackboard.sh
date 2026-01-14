#!/bin/bash
# Demo script for Blackboard Architecture
# Run this to see the blackboard system in action

BASE_URL="http://localhost:8056"

echo "🔐 Getting auth token..."
AUTH_RESPONSE=$(curl -s "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}')
TOKEN=$(echo $AUTH_RESPONSE | jq -r '.data.access_token')
echo "   Token obtained: ${TOKEN:0:30}..."

echo ""
echo "📁 Creating a test project..."
PROJECT_RESPONSE=$(curl -s "$BASE_URL/items/tb_projects" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Blackboard Demo Project", "status": "active", "description": "Testing blackboard architecture"}')
PROJECT_ID=$(echo $PROJECT_RESPONSE | jq -r '.data.id')
echo "   Created project ID: $PROJECT_ID"

echo ""
echo "📝 Creating blackboard with user form data..."
# First check if tb_blackboards collection exists
BLACKBOARD_RESPONSE=$(curl -s "$BASE_URL/items/tb_blackboards" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"project_id\": $PROJECT_ID,
    \"entries\": {
      \"brand_name\": {
        \"key\": \"brand_name\",
        \"value\": \"Kenzai Puzzles\",
        \"source_type\": \"user_input\",
        \"source_id\": \"form_1\",
        \"priority\": 100,
        \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
      },
      \"industry\": {
        \"key\": \"industry\",
        \"value\": \"Toys for teens and adults\",
        \"source_type\": \"user_input\",
        \"source_id\": \"form_1\",
        \"priority\": 100,
        \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
      },
      \"target_audience\": {
        \"key\": \"target_audience\",
        \"value\": \"Puzzle enthusiasts aged 18-45\",
        \"source_type\": \"user_input\",
        \"source_id\": \"form_1\",
        \"priority\": 100,
        \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
      }
    },
    \"conflicts\": []
  }")
BLACKBOARD_ID=$(echo $BLACKBOARD_RESPONSE | jq -r '.data.id')
echo "   Created blackboard ID: $BLACKBOARD_ID"
echo ""
echo "   Blackboard entries:"
echo $BLACKBOARD_RESPONSE | jq '.data.entries'

echo ""
echo "🔍 Fetching blackboard state via API..."
curl -s "$BASE_URL/template-builder/blackboard/$PROJECT_ID" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo ""
echo "⚡ Simulating conflict: AI found 'Kenzai Cosmetics' instead of 'Kenzai Puzzles'..."
# Add a conflict to the blackboard
CONFLICT_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
curl -s -X PATCH "$BASE_URL/items/tb_blackboards/$BLACKBOARD_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"conflicts\": [
      {
        \"id\": \"$CONFLICT_ID\",
        \"type\": \"ambiguity\",
        \"keys_involved\": [\"brand_name\"],
        \"description\": \"Research found 'Kenzai Cosmetics' but you entered 'Kenzai Puzzles'. Are these the same company?\",
        \"options\": [
          {
            \"id\": \"use_user_input\",
            \"label\": \"Kenzai Puzzles (what I entered)\",
            \"description\": \"Use what I entered in the form\",
            \"writes\": {
              \"brand_entity\": \"Kenzai Puzzles\",
              \"brand_entity_verified\": true,
              \"disambiguation\": \"Not Kenzai Cosmetics\"
            }
          },
          {
            \"id\": \"use_research\",
            \"label\": \"Kenzai Cosmetics (from research)\",
            \"description\": \"Use what the research found\",
            \"writes\": {
              \"brand_entity\": \"Kenzai Cosmetics\"
            }
          }
        ],
        \"status\": \"pending\",
        \"created_by_task\": \"research_task_1\"
      }
    ]
  }" | jq .

echo ""
echo "📋 Getting pending conflicts..."
curl -s "$BASE_URL/template-builder/conflicts/$PROJECT_ID" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo ""
echo "✅ Resolving conflict (choosing user input)..."
curl -s -X POST "$BASE_URL/template-builder/resolve-conflict" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"projectId\": $PROJECT_ID,
    \"conflictId\": \"$CONFLICT_ID\",
    \"optionId\": \"use_user_input\"
  }" | jq .

echo ""
echo "📋 Final blackboard state:"
curl -s "$BASE_URL/template-builder/blackboard/$PROJECT_ID" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo ""
echo "🎉 Demo complete!"
echo ""
echo "What you saw:"
echo "  1. Created a project with user form data (priority 100)"
echo "  2. AI research task found conflicting entity name"
echo "  3. Conflict was surfaced for HITL resolution"
echo "  4. User chose their original input"
echo "  5. Blackboard was updated with verified value"
