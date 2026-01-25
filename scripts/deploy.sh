#!/bin/bash
# =============================================================================
# AS-Demo Production Deployment Script
# =============================================================================
# Usage:
#   ./deploy.sh            Full production deployment
#   ./deploy.sh --setup    Initial server setup (Docker, certbot)
#   ./deploy.sh --ssl      Let's Encrypt certificate provisioning
#   ./deploy.sh --update   Pull latest and redeploy
#   ./deploy.sh --renew    Renew SSL certificates
# =============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DOMAIN="${DOMAIN:-demo.assistant-skills.dev}"
EMAIL="${ADMIN_EMAIL:-admin@assistant-skills.dev}"
NETWORK_NAME="as-demo-network"
COMPOSE_PROFILES="${COMPOSE_PROFILES:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if running as root (for server setup)
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This operation requires root privileges"
        exit 1
    fi
}

# Validate environment
validate_env() {
    log_info "Validating environment..."

    # Check .env file exists
    if [[ ! -f "$PROJECT_DIR/secrets/.env" ]]; then
        log_error "secrets/.env not found. Copy from .env.production.example and configure."
        exit 1
    fi

    # Source env file
    set -a
    source "$PROJECT_DIR/secrets/.env"
    set +a

    # Check required variables
    local missing=()

    if [[ -z "${SESSION_SECRET:-}" || "${SESSION_SECRET}" == "change-me-in-production" ]]; then
        missing+=("SESSION_SECRET")
    fi

    if [[ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" && -z "${ANTHROPIC_API_KEY:-}" ]]; then
        missing+=("CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY")
    fi

    # Check at least one platform is configured
    local has_platform=false
    if [[ -n "${CONFLUENCE_API_TOKEN:-}" && -n "${CONFLUENCE_EMAIL:-}" && -n "${CONFLUENCE_SITE_URL:-}" ]]; then
        has_platform=true
    fi
    if [[ -n "${JIRA_API_TOKEN:-}" && -n "${JIRA_EMAIL:-}" && -n "${JIRA_SITE_URL:-}" ]]; then
        has_platform=true
    fi
    if [[ -n "${SPLUNK_PASSWORD:-}" ]]; then
        has_platform=true
    fi

    if [[ "$has_platform" == "false" ]]; then
        missing+=("At least one platform (Confluence, JIRA, or Splunk)")
    fi

    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "Missing required configuration:"
        for item in "${missing[@]}"; do
            echo "  - $item"
        done
        exit 1
    fi

    log_success "Environment validation passed"
}

# Initial server setup
setup_server() {
    log_info "Setting up server..."
    check_root

    # Update system
    log_info "Updating system packages..."
    apt-get update
    apt-get upgrade -y

    # Install Docker if not present
    if ! command -v docker &> /dev/null; then
        log_info "Installing Docker..."
        curl -fsSL https://get.docker.com -o get-docker.sh
        sh get-docker.sh
        rm get-docker.sh
        systemctl enable docker
        systemctl start docker
    else
        log_info "Docker already installed"
    fi

    # Install Docker Compose plugin if not present
    if ! docker compose version &> /dev/null; then
        log_info "Installing Docker Compose plugin..."
        apt-get install -y docker-compose-plugin
    else
        log_info "Docker Compose already installed"
    fi

    # Install certbot
    if ! command -v certbot &> /dev/null; then
        log_info "Installing certbot..."
        apt-get install -y certbot
    else
        log_info "Certbot already installed"
    fi

    # Install useful tools
    apt-get install -y curl jq htop

    # Create certbot directories
    mkdir -p /var/www/certbot
    mkdir -p /opt/as-demo/certbot/conf

    log_success "Server setup complete"
}

# Provision SSL certificate
provision_ssl() {
    log_info "Provisioning SSL certificate for $DOMAIN..."

    # Create certbot webroot directory
    mkdir -p /var/www/certbot

    # Check if certificate already exists
    if [[ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
        log_warn "Certificate already exists for $DOMAIN"
        read -p "Do you want to renew it? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            return 0
        fi
    fi

    # Start nginx with HTTP-only config for ACME challenge
    log_info "Starting nginx for ACME challenge..."

    # Create temporary HTTP-only nginx config
    cat > "$PROJECT_DIR/nginx/acme-temp.conf" << 'EOF'
server {
    listen 80;
    server_name _;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 200 'ACME challenge server';
        add_header Content-Type text/plain;
    }
}
EOF

    # Start nginx with temporary config
    docker run -d --name acme-nginx \
        -p 80:80 \
        -v "$PROJECT_DIR/nginx/acme-temp.conf:/etc/nginx/conf.d/default.conf:ro" \
        -v /var/www/certbot:/var/www/certbot \
        nginx:alpine

    # Give nginx time to start
    sleep 3

    # Run certbot
    log_info "Requesting certificate from Let's Encrypt..."
    certbot certonly --webroot \
        -w /var/www/certbot \
        -d "$DOMAIN" \
        --email "$EMAIL" \
        --agree-tos \
        --no-eff-email \
        --non-interactive

    # Stop temporary nginx
    docker stop acme-nginx
    docker rm acme-nginx
    rm -f "$PROJECT_DIR/nginx/acme-temp.conf"

    log_success "SSL certificate provisioned successfully"

    # Set up auto-renewal cron
    setup_ssl_renewal
}

# Set up SSL certificate auto-renewal
setup_ssl_renewal() {
    log_info "Setting up SSL certificate auto-renewal..."

    # Create renewal script
    cat > /etc/cron.daily/as-demo-ssl-renew << EOF
#!/bin/bash
cd $PROJECT_DIR
certbot renew --quiet
docker compose restart nginx 2>/dev/null || true
EOF
    chmod +x /etc/cron.daily/as-demo-ssl-renew

    log_success "SSL auto-renewal configured"
}

# Create Docker network
create_network() {
    log_info "Creating Docker network..."
    if ! docker network inspect "$NETWORK_NAME" &> /dev/null; then
        docker network create "$NETWORK_NAME"
        log_success "Network '$NETWORK_NAME' created"
    else
        log_info "Network '$NETWORK_NAME' already exists"
    fi
}

# Build containers
build_containers() {
    log_info "Building containers..."
    cd "$PROJECT_DIR"

    # Build queue manager
    docker compose build queue-manager

    # Build demo container
    docker build -t as-demo-container:latest ./demo-container

    log_success "Containers built successfully"
}

# Deploy services
deploy_services() {
    log_info "Deploying services..."
    cd "$PROJECT_DIR"

    # Determine compose profile args
    local profile_args=""
    if [[ -n "$COMPOSE_PROFILES" ]]; then
        profile_args="--profile $COMPOSE_PROFILES"
    fi

    # Use SSL config for production
    log_info "Configuring nginx for SSL..."
    cp nginx/ssl.conf nginx/production.conf

    # Export NODE_ENV for production mode
    export NODE_ENV=production

    # Deploy with docker compose
    docker compose $profile_args up -d

    log_success "Services deployed"
}

# Run health checks
run_health_checks() {
    log_info "Running health checks..."

    local max_attempts=30
    local attempt=1

    # Wait for services to be healthy
    while [[ $attempt -le $max_attempts ]]; do
        log_info "Health check attempt $attempt/$max_attempts..."

        if curl -sf "https://$DOMAIN/api/health" > /dev/null 2>&1; then
            log_success "Health check passed!"

            # Run full health check
            "$SCRIPT_DIR/healthcheck.sh" --production
            return 0
        fi

        sleep 5
        ((attempt++))
    done

    log_error "Health checks failed after $max_attempts attempts"
    return 1
}

# Update and redeploy
update_deploy() {
    log_info "Updating deployment..."
    cd "$PROJECT_DIR"

    # Pull latest code
    log_info "Pulling latest code..."
    git pull origin main

    # Rebuild containers
    build_containers

    # Restart services
    log_info "Restarting services..."
    docker compose down
    deploy_services

    # Health check
    run_health_checks

    log_success "Update complete"
}

# Renew SSL certificates
renew_ssl() {
    log_info "Renewing SSL certificates..."

    certbot renew

    # Restart nginx to pick up new certs
    docker compose restart nginx

    log_success "SSL certificates renewed"
}

# Show deployment status
show_status() {
    log_info "Deployment Status"
    echo ""

    cd "$PROJECT_DIR"
    docker compose ps

    echo ""
    log_info "Health Endpoints:"
    echo "  Landing:  https://$DOMAIN/"
    echo "  Health:   https://$DOMAIN/api/health"
    echo "  Ready:    https://$DOMAIN/api/health/ready"
    echo "  Status:   https://$DOMAIN/api/status"
    echo "  Grafana:  https://$DOMAIN/grafana/"
}

# Main deployment
main_deploy() {
    log_info "Starting AS-Demo production deployment..."

    validate_env
    create_network
    build_containers
    deploy_services

    log_info "Waiting for services to initialize..."
    sleep 10

    run_health_checks
    show_status

    log_success "Deployment complete!"
    echo ""
    echo "AS-Demo is now running at https://$DOMAIN"
}

# Print usage
usage() {
    echo "AS-Demo Production Deployment Script"
    echo ""
    echo "Usage: $0 [OPTION]"
    echo ""
    echo "Options:"
    echo "  (none)      Full production deployment"
    echo "  --setup     Initial server setup (Docker, certbot)"
    echo "  --ssl       Let's Encrypt certificate provisioning"
    echo "  --update    Pull latest and redeploy"
    echo "  --renew     Renew SSL certificates"
    echo "  --status    Show deployment status"
    echo "  --help      Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  DOMAIN          Domain name (default: demo.assistant-skills.dev)"
    echo "  ADMIN_EMAIL     Email for Let's Encrypt (default: admin@assistant-skills.dev)"
    echo "  COMPOSE_PROFILES Docker Compose profiles (e.g., 'full' for Splunk)"
}

# Parse arguments
case "${1:-}" in
    --setup)
        setup_server
        ;;
    --ssl)
        provision_ssl
        ;;
    --update)
        update_deploy
        ;;
    --renew)
        renew_ssl
        ;;
    --status)
        show_status
        ;;
    --help|-h)
        usage
        ;;
    "")
        main_deploy
        ;;
    *)
        log_error "Unknown option: $1"
        usage
        exit 1
        ;;
esac
