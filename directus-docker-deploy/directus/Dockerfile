FROM node:14

# Set the working directory
WORKDIR /directus

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the Directus application
RUN npm run build

# Expose the port Directus runs on
EXPOSE 8055

# Start the Directus application
CMD ["npm", "start"]