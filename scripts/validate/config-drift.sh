#!/usr/bin/env bash
# =============================================================================
# Configuration Drift Detection
# Compares running container configuration vs expected configuration
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_warn() { echo -e "${YELLOW}!${NC} $1"; }
log_info() { echo "  $1"; }

ERRORS=0
WARNINGS=0

# =============================================================================
# Container Configuration Checks
# =============================================================================

# Container name mapping (service name -> actual container name)
declare -A CONTAINER_NAMES
CONTAINER_NAMES[queue-manager]="as-demo-queue"
CONTAINER_NAMES[nginx]="as-demo-nginx"
CONTAINER_NAMES[redis]="as-demo-redis"
CONTAINER_NAMES[lgtm]="as-demo-lgtm"

# Expected configuration values
declare -A EXPECTED_CONFIG
EXPECTED_CONFIG[queue-manager:memory]="2147483648"  # 2GB in bytes
EXPECTED_CONFIG[queue-manager:cpus]="2"
EXPECTED_CONFIG[queue-manager:pids_limit]="256"

check_container_config() {
    local container="$1"
    local full_name="${CONTAINER_NAMES[$container]:-as-demo-$container}"

    echo "Checking ${container} container configuration..."

    # Check if container exists
    if ! docker ps --format '{{.Names}}' | grep -q "^${full_name}$"; then
        log_warn "${full_name} container not running, skipping"
        ((WARNINGS++))
        return
    fi

    # Get container inspect data
    INSPECT=$(docker inspect "$full_name" 2>/dev/null) || {
        log_error "Failed to inspect ${full_name}"
        ((ERRORS++))
        return
    }

    # Check memory limit
    EXPECTED_MEM="${EXPECTED_CONFIG[${container}:memory]:-}"
    if [ -n "$EXPECTED_MEM" ]; then
        ACTUAL_MEM=$(echo "$INSPECT" | jq -r '.[0].HostConfig.Memory')
        if [ "$ACTUAL_MEM" = "$EXPECTED_MEM" ]; then
            log_success "Memory limit: $(numfmt --to=iec $ACTUAL_MEM 2>/dev/null || echo $ACTUAL_MEM)"
        elif [ "$ACTUAL_MEM" = "0" ]; then
            log_warn "Memory limit not set (expected $(numfmt --to=iec $EXPECTED_MEM 2>/dev/null || echo $EXPECTED_MEM))"
            ((WARNINGS++))
        else
            log_warn "Memory limit drift: $(numfmt --to=iec $ACTUAL_MEM 2>/dev/null || echo $ACTUAL_MEM) (expected $(numfmt --to=iec $EXPECTED_MEM 2>/dev/null || echo $EXPECTED_MEM))"
            ((WARNINGS++))
        fi
    fi

    # Check CPU limit
    EXPECTED_CPU="${EXPECTED_CONFIG[${container}:cpus]:-}"
    if [ -n "$EXPECTED_CPU" ]; then
        ACTUAL_CPU=$(echo "$INSPECT" | jq -r '.[0].HostConfig.NanoCpus')
        ACTUAL_CPU_CORES=$((ACTUAL_CPU / 1000000000))
        if [ "$ACTUAL_CPU_CORES" = "$EXPECTED_CPU" ]; then
            log_success "CPU limit: ${ACTUAL_CPU_CORES} cores"
        elif [ "$ACTUAL_CPU" = "0" ]; then
            log_warn "CPU limit not set (expected ${EXPECTED_CPU} cores)"
            ((WARNINGS++))
        else
            log_warn "CPU limit drift: ${ACTUAL_CPU_CORES} cores (expected ${EXPECTED_CPU})"
            ((WARNINGS++))
        fi
    fi

    # Check PID limit
    EXPECTED_PIDS="${EXPECTED_CONFIG[${container}:pids_limit]:-}"
    if [ -n "$EXPECTED_PIDS" ]; then
        ACTUAL_PIDS=$(echo "$INSPECT" | jq -r '.[0].HostConfig.PidsLimit')
        if [ "$ACTUAL_PIDS" = "$EXPECTED_PIDS" ]; then
            log_success "PID limit: $ACTUAL_PIDS"
        elif [ "$ACTUAL_PIDS" = "0" ] || [ "$ACTUAL_PIDS" = "null" ] || [ "$ACTUAL_PIDS" = "-1" ]; then
            log_warn "PID limit not set (expected $EXPECTED_PIDS)"
            ((WARNINGS++))
        else
            log_warn "PID limit drift: $ACTUAL_PIDS (expected $EXPECTED_PIDS)"
            ((WARNINGS++))
        fi
    fi

    # Check security options
    SECCOMP=$(echo "$INSPECT" | jq -r '.[0].HostConfig.SecurityOpt[]? | select(startswith("seccomp"))' 2>/dev/null) || SECCOMP=""
    if [ -n "$SECCOMP" ]; then
        log_success "Seccomp profile enabled"
    else
        log_warn "Seccomp profile not explicitly set"
        ((WARNINGS++))
    fi

    # Check read-only root filesystem
    READONLY=$(echo "$INSPECT" | jq -r '.[0].HostConfig.ReadonlyRootfs')
    if [ "$READONLY" = "true" ]; then
        log_success "Read-only root filesystem enabled"
    else
        log_info "Read-only root filesystem not enabled (may be intentional)"
    fi

    # Check restart policy
    RESTART_POLICY=$(echo "$INSPECT" | jq -r '.[0].HostConfig.RestartPolicy.Name')
    if [ "$RESTART_POLICY" = "unless-stopped" ] || [ "$RESTART_POLICY" = "always" ]; then
        log_success "Restart policy: $RESTART_POLICY"
    else
        log_warn "Restart policy: $RESTART_POLICY (consider 'unless-stopped')"
        ((WARNINGS++))
    fi

    echo ""
}

# =============================================================================
# Docker Compose Configuration Drift
# =============================================================================
echo "Checking Docker Compose configuration drift..."

# Compare current running config with compose file
COMPOSE_CONFIG=$(docker compose -f "${PROJECT_ROOT}/docker-compose.yml" config 2>/dev/null) || {
    log_error "Failed to parse docker-compose.yml"
    ((ERRORS++))
}

# Check for services defined in compose but not running
COMPOSE_SERVICES=$(echo "$COMPOSE_CONFIG" | grep -E "^  [a-z]" | grep -v ":" | tr -d ' ' | sort) || COMPOSE_SERVICES=""
RUNNING_SERVICES=$(docker compose -f "${PROJECT_ROOT}/docker-compose.yml" ps --format '{{.Service}}' 2>/dev/null | sort) || RUNNING_SERVICES=""

for service in $COMPOSE_SERVICES; do
    if echo "$RUNNING_SERVICES" | grep -q "^${service}$"; then
        log_success "Service '$service' is running"
    else
        log_info "Service '$service' not running (may be in different profile)"
    fi
done

echo ""

# =============================================================================
# Check Individual Containers
# =============================================================================
for container in queue-manager nginx redis; do
    check_container_config "$container"
done

# =============================================================================
# Network Configuration
# =============================================================================
echo "Checking network configuration..."

NETWORK_NAME="as-demo-network"
if docker network inspect "$NETWORK_NAME" > /dev/null 2>&1; then
    log_success "Network '$NETWORK_NAME' exists"

    # Check connected containers
    CONNECTED=$(docker network inspect "$NETWORK_NAME" --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null) || CONNECTED=""
    log_info "Connected containers: $CONNECTED"
else
    log_error "Network '$NETWORK_NAME' not found"
    ((ERRORS++))
fi

echo ""

# =============================================================================
# Volume Configuration
# =============================================================================
echo "Checking volume configuration..."

# Check for expected volumes
for volume in as-demo_redis-data as-demo_session-env; do
    if docker volume inspect "$volume" > /dev/null 2>&1; then
        log_success "Volume '$volume' exists"
    else
        log_info "Volume '$volume' not found (may use different naming)"
    fi
done

echo ""

# =============================================================================
# Image Version Drift
# =============================================================================
echo "Checking image versions..."

# Get running image versions
for container in queue-manager nginx redis; do
    full_name="${CONTAINER_NAMES[$container]:-as-demo-$container}"
    if docker ps --format '{{.Names}}' | grep -q "^${full_name}$"; then
        IMAGE=$(docker inspect --format '{{.Config.Image}}' "$full_name" 2>/dev/null) || IMAGE="unknown"
        CREATED=$(docker inspect --format '{{.Created}}' "$full_name" 2>/dev/null | cut -d'T' -f1) || CREATED="unknown"
        log_info "${container}: $IMAGE (created: $CREATED)"
    fi
done

echo ""

# =============================================================================
# Summary
# =============================================================================
echo "----------------------------------------"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    log_success "No configuration drift detected"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    log_warn "$WARNINGS configuration drift warning(s)"
    exit 0
else
    log_error "$ERRORS drift error(s), $WARNINGS warning(s)"
    exit 1
fi
