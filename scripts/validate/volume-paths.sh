#!/usr/bin/env bash
# =============================================================================
# Volume Path Validation
# Validates that all volume mount paths referenced in docker-compose exist
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_warn() { echo -e "${YELLOW}!${NC} $1"; }
log_info() { echo "  $1"; }

ERRORS=0
WARNINGS=0

echo "Validating volume mount paths..."
echo ""

# =============================================================================
# Required Directories
# =============================================================================

REQUIRED_DIRS=(
    "nginx"
    "nginx/nginx.conf"
    "nginx/demo.conf"
    "nginx/locations.include"
    "landing-page"
    "queue-manager"
    "demo-container"
    "scripts"
    "observability"
    "observability/grafana-dashboards.yaml"
    "observability/dashboards"
    "observability/promtail-config.yaml"
)

echo "Checking required paths..."

for path in "${REQUIRED_DIRS[@]}"; do
    FULL_PATH="${PROJECT_ROOT}/${path}"
    if [ -e "$FULL_PATH" ]; then
        log_success "$path exists"
    else
        log_error "$path missing"
        ((ERRORS++))
    fi
done

echo ""

# =============================================================================
# Optional/Profile-Specific Directories
# =============================================================================

OPTIONAL_DIRS=(
    "splunk"
    "splunk/apps/demo_app"
    "splunk/seed-data/data"
    "secrets"
)

echo "Checking optional paths (Splunk profile)..."

for path in "${OPTIONAL_DIRS[@]}"; do
    FULL_PATH="${PROJECT_ROOT}/${path}"
    if [ -e "$FULL_PATH" ]; then
        log_success "$path exists"
    else
        log_warn "$path missing (needed for Splunk profile)"
        ((WARNINGS++))
    fi
done

echo ""

# =============================================================================
# Runtime Directories (created at runtime)
# =============================================================================

RUNTIME_DIRS=(
    "session-env"
)

echo "Checking runtime directories..."

for path in "${RUNTIME_DIRS[@]}"; do
    FULL_PATH="${PROJECT_ROOT}/${path}"
    if [ -d "$FULL_PATH" ]; then
        log_success "$path exists"
    else
        log_info "$path will be created at runtime"
        # Try to create it
        mkdir -p "$FULL_PATH" 2>/dev/null && log_success "Created $path" || log_warn "Could not create $path"
    fi
done

echo ""

# =============================================================================
# Volume Mount Extraction from docker-compose
# =============================================================================

echo "Validating mounts from docker-compose.yml..."

# Extract volume mounts from compose file
if command -v docker &> /dev/null; then
    COMPOSE_VOLUMES=$(docker compose -f "${PROJECT_ROOT}/docker-compose.yml" config 2>/dev/null | \
        grep -E "^\s+- \./|^\s+- \.\.\/" | \
        sed 's/.*- //' | sed 's/:.*//' | sort -u) || COMPOSE_VOLUMES=""

    if [ -n "$COMPOSE_VOLUMES" ]; then
        for vol in $COMPOSE_VOLUMES; do
            # Handle relative paths
            if [[ "$vol" == ./* ]]; then
                FULL_PATH="${PROJECT_ROOT}/${vol#./}"
            else
                FULL_PATH="${PROJECT_ROOT}/${vol}"
            fi

            if [ -e "$FULL_PATH" ]; then
                log_success "Mount source exists: $vol"
            else
                log_warn "Mount source missing: $vol"
                ((WARNINGS++))
            fi
        done
    else
        log_info "Could not extract volume mounts (docker compose config may have failed)"
    fi
else
    log_warn "Docker not available, skipping compose volume extraction"
fi

echo ""

# =============================================================================
# File Permissions Check
# =============================================================================

echo "Checking file permissions..."

# Check that config files are readable
CONFIG_FILES=(
    "nginx/nginx.conf"
    "nginx/demo.conf"
    "observability/grafana-dashboards.yaml"
    "observability/promtail-config.yaml"
)

for file in "${CONFIG_FILES[@]}"; do
    FULL_PATH="${PROJECT_ROOT}/${file}"
    if [ -f "$FULL_PATH" ]; then
        if [ -r "$FULL_PATH" ]; then
            log_success "$file is readable"
        else
            log_error "$file is not readable"
            ((ERRORS++))
        fi
    fi
done

echo ""

# =============================================================================
# Summary
# =============================================================================

echo "----------------------------------------"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    log_success "All volume paths validated"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    log_warn "$WARNINGS warning(s), but no errors"
    exit 0
else
    log_error "$ERRORS error(s), $WARNINGS warning(s)"
    exit 1
fi
