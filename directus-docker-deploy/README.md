# Directus Docker Deployment

This project provides a Docker-based deployment for Directus, a headless CMS. It includes configurations for Directus, Nginx as a reverse proxy, and PostgreSQL as the database.

## Prerequisites

- Docker installed on your machine.
- Docker Compose installed.
- Access to a DigitalOcean droplet or any other server where you can deploy Docker containers.

## Project Structure

- `docker-compose.yml`: Defines the services, networks, and volumes for the Directus application deployment.
- `.env.example`: Template for environment variables needed for the application.
- `.dockerignore`: Specifies files and directories to ignore when building Docker images.
- `directus/Dockerfile`: Instructions to build the Directus Docker image.
- `nginx/Dockerfile`: Instructions to build the Nginx Docker image.
- `nginx/nginx.conf`: Nginx configuration settings for routing requests to Directus.
- `postgres/init/01-init.sql`: SQL commands for initializing the PostgreSQL database.
- `scripts/backup.sh`: Shell script for backing up the Directus database or application data.

## Setup Instructions

1. **Clone the Repository**

   Clone this repository to your local machine or directly to your DigitalOcean droplet.

   ```bash
   git clone <repository-url>
   cd directus-docker-deploy
   ```

2. **Configure Environment Variables**

   Copy the `.env.example` file to `.env` and update the values as needed.

   ```bash
   cp .env.example .env
   ```

3. **Build and Run the Containers**

   Use Docker Compose to build and run the services defined in `docker-compose.yml`.

   ```bash
   docker-compose up -d
   ```

4. **Access Directus**

   Once the containers are running, you can access the Directus application by navigating to `http://<your-droplet-ip>:<port>` in your web browser.

## Backup Instructions

To back up the Directus database or application data, run the backup script:

```bash
bash scripts/backup.sh
```

## Additional Notes

- Ensure that your droplet has sufficient resources to run the Directus application, Nginx, and PostgreSQL.
- For production environments, consider securing your application with HTTPS and configuring proper firewall rules.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.