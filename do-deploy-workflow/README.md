# do-deploy-workflow

This project provides a workflow for deploying applications to DigitalOcean using Docker. It includes a GitHub Actions workflow, Docker configuration, and deployment scripts to streamline the process.

## Project Structure

- **.github/workflows/deploy-digitalocean.yml**: Defines the GitHub Actions workflow for building and deploying the application.
- **.do/app.yaml**: Configuration file for the DigitalOcean app, specifying environment variables and services.
- **docker/Dockerfile**: Instructions for building the Docker image for the application.
- **scripts/deploy.sh**: Shell script to automate the deployment process.
- **.dockerignore**: Specifies files and directories to ignore when building the Docker image.
- **docker-compose.yml**: Defines services, networks, and volumes for the application using Docker Compose.
- **.gitignore**: Lists files and directories to ignore in the Git repository.

## Setup Instructions

1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd do-deploy-workflow
   ```

2. **Configure DigitalOcean**
   - Create a DigitalOcean account and set up a droplet.
   - Configure your DigitalOcean API token and any necessary environment variables in `.do/app.yaml`.

3. **Build the Docker Image**
   - Navigate to the `docker` directory and build the image:
   ```bash
   docker build -t your-image-name .
   ```

4. **Run the Application Locally (Optional)**
   - Use Docker Compose to run the application locally:
   ```bash
   docker-compose up
   ```

5. **Deploy to DigitalOcean**
   - Run the deployment script:
   ```bash
   ./scripts/deploy.sh
   ```

## Usage

After deployment, your application will be accessible via the DigitalOcean droplet's IP address. You can manage and update your application using the provided scripts and workflows.

## Contributing

Feel free to submit issues or pull requests to improve the project. Please ensure that your contributions adhere to the project's coding standards and guidelines.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.