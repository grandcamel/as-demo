# Queue Manager Dockerfile
# Supports Confluence, JIRA, and Splunk Assistant Skills
# Multi-stage build: dev for development, production for deployment

# =============================================================================
# Base stage with common dependencies
# =============================================================================
FROM node:20-slim AS base

# Install Docker CLI and other dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    docker.io \
    python3 \
    python3-pip \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install ttyd from GitHub releases (not available in Debian bookworm repos)
RUN curl -fsSL -o /usr/local/bin/ttyd \
    https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64 \
    && chmod +x /usr/local/bin/ttyd

# Install Python dependencies for all platform cleanup scripts
RUN pip3 install --break-system-packages --no-cache-dir \
    confluence-as>=0.1.0 \
    jira-as>=0.1.0 \
    requests \
    opentelemetry-api \
    opentelemetry-sdk \
    opentelemetry-exporter-otlp

WORKDIR /app

# =============================================================================
# Development stage
# =============================================================================
FROM base AS dev

# Copy package files
COPY package*.json ./

# Install all dependencies including devDependencies
RUN npm install

# Copy application (will be overridden by volume mount in dev)
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]

# =============================================================================
# Production stage
# =============================================================================
FROM base AS production

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy application
COPY . .

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -sf http://localhost:3000/api/health || exit 1

EXPOSE 3000

CMD ["node", "server.js"]
