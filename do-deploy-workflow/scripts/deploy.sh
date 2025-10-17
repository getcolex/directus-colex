#!/bin/bash

# Set variables
DOCKER_IMAGE_NAME="your-docker-image-name"
DOCKER_REGISTRY="your-docker-registry"
DROPLET_IP="your-droplet-ip"
DROPLET_USER="your-droplet-username"

# Build the Docker image
docker build -t $DOCKER_IMAGE_NAME .

# Push the Docker image to the registry
docker tag $DOCKER_IMAGE_NAME $DOCKER_REGISTRY/$DOCKER_IMAGE_NAME
docker push $DOCKER_REGISTRY/$DOCKER_IMAGE_NAME

# SSH into the droplet and deploy the application
ssh $DROPLET_USER@$DROPLET_IP << EOF
  # Pull the latest Docker image
  docker pull $DOCKER_REGISTRY/$DOCKER_IMAGE_NAME

  # Stop and remove the existing container if it exists
  docker stop my-app || true
  docker rm my-app || true

  # Run the new container
  docker run -d --name my-app -p 80:80 $DOCKER_REGISTRY/$DOCKER_IMAGE_NAME
EOF

echo "Deployment to DigitalOcean droplet completed."