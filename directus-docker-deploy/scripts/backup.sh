#!/bin/bash

# Define the backup directory and filename
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/directus_backup_$TIMESTAMP.sql"

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

# Execute the backup command
docker exec -t directus_postgres_1 pg_dumpall -c -U your_db_user > $BACKUP_FILE

# Print a message indicating the backup was successful
echo "Backup completed: $BACKUP_FILE"