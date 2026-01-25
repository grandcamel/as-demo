#!/bin/bash
# =============================================================================
# Container Security Validation
# Validates security configuration of running containers
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_success() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_info() { echo -e "       $1"; }

ERRORS=0
WARNINGS=0

# =============================================================================
# Container Name Mapping
# Maps service names to actual container names
# =============================================================================
declare -A CONTAINER_NAMES
CONTAINER_NAMES[queue-manager]="as-demo-queue"
CONTAINER_NAMES[nginx]="as-demo-nginx"
CONTAINER_NAMES[redis]="as-demo-redis"
CONTAINER_NAMES[lgtm]="as-demo-lgtm"

# =============================================================================
# Expected Security Configuration
# =============================================================================
declare -A EXPECTED_MEMORY
EXPECTED_MEMORY[queue-manager]="2147483648"  # 2GB in bytes
EXPECTED_MEMORY[nginx]="268435456"           # 256MB in bytes
EXPECTED_MEMORY[redis]="536870912"           # 512MB in bytes
EXPECTED_MEMORY[lgtm]="2147483648"           # 2GB in bytes

declare -A EXPECTED_CPUS
EXPECTED_CPUS[queue-manager]="2000000000"    # 2 CPUs in nanocpus
EXPECTED_CPUS[nginx]="500000000"             # 0.5 CPUs in nanocpus
EXPECTED_CPUS[redis]="500000000"             # 0.5 CPUs in nanocpus
EXPECTED_CPUS[lgtm]="1000000000"             # 1 CPU in nanocpus

declare -A EXPECTED_PIDS
EXPECTED_PIDS[queue-manager]="256"

declare -A EXPECTED_READONLY
EXPECTED_READONLY[nginx]="true"

declare -A EXPECTED_RESTART
EXPECTED_RESTART[queue-manager]="unless-stopped"
EXPECTED_RESTART[nginx]="unless-stopped"
EXPECTED_RESTART[redis]="unless-stopped"
EXPECTED_RESTART[lgtm]="unless-stopped"
EXPECTED_RESTART[seed-loader]="no"

# =============================================================================
# Security Check Functions
# =============================================================================

check_resource_limits() {
    local service="$1"
    local container="${CONTAINER_NAMES[$service]:-as-demo-$service}"

    echo ""
    echo "Checking resource limits for ${service}..."

    # Check if container exists
    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        log_warn "${container} container not running, skipping"
        ((WARNINGS++))
        return
    fi

    # Get container inspect data
    local INSPECT
    INSPECT=$(docker inspect "$container" 2>/dev/null) || {
        log_error "Failed to inspect ${container}"
        ((ERRORS++))
        return
    }

    # Check memory limit
    local EXPECTED_MEM="${EXPECTED_MEMORY[$service]:-}"
    if [ -n "$EXPECTED_MEM" ]; then
        local ACTUAL_MEM
        ACTUAL_MEM=$(echo "$INSPECT" | jq -r '.[0].HostConfig.Memory')
        if [ "$ACTUAL_MEM" = "$EXPECTED_MEM" ]; then
            log_success "Memory limit: $(numfmt --to=iec "$ACTUAL_MEM" 2>/dev/null || echo "$ACTUAL_MEM")"
        elif [ "$ACTUAL_MEM" = "0" ]; then
            log_error "Memory limit not set (expected $(numfmt --to=iec "$EXPECTED_MEM" 2>/dev/null || echo "$EXPECTED_MEM"))"
            ((ERRORS++))
        else
            log_warn "Memory limit drift: $(numfmt --to=iec "$ACTUAL_MEM" 2>/dev/null || echo "$ACTUAL_MEM") (expected $(numfmt --to=iec "$EXPECTED_MEM" 2>/dev/null || echo "$EXPECTED_MEM"))"
            ((WARNINGS++))
        fi
    fi

    # Check CPU limit
    local EXPECTED_CPU="${EXPECTED_CPUS[$service]:-}"
    if [ -n "$EXPECTED_CPU" ]; then
        local ACTUAL_CPU
        ACTUAL_CPU=$(echo "$INSPECT" | jq -r '.[0].HostConfig.NanoCpus')
        if [ "$ACTUAL_CPU" = "$EXPECTED_CPU" ]; then
            local CPU_CORES
            CPU_CORES=$(awk "BEGIN {printf \"%.1f\", $ACTUAL_CPU / 1000000000}")
            log_success "CPU limit: ${CPU_CORES} cores"
        elif [ "$ACTUAL_CPU" = "0" ]; then
            local EXPECTED_CORES
            EXPECTED_CORES=$(awk "BEGIN {printf \"%.1f\", $EXPECTED_CPU / 1000000000}")
            log_error "CPU limit not set (expected ${EXPECTED_CORES} cores)"
            ((ERRORS++))
        else
            local ACTUAL_CORES EXPECTED_CORES
            ACTUAL_CORES=$(awk "BEGIN {printf \"%.1f\", $ACTUAL_CPU / 1000000000}")
            EXPECTED_CORES=$(awk "BEGIN {printf \"%.1f\", $EXPECTED_CPU / 1000000000}")
            log_warn "CPU limit drift: ${ACTUAL_CORES} cores (expected ${EXPECTED_CORES} cores)"
            ((WARNINGS++))
        fi
    fi

    # Check PID limit
    local EXPECTED_PID="${EXPECTED_PIDS[$service]:-}"
    if [ -n "$EXPECTED_PID" ]; then
        local ACTUAL_PIDS
        ACTUAL_PIDS=$(echo "$INSPECT" | jq -r '.[0].HostConfig.PidsLimit')
        if [ "$ACTUAL_PIDS" = "$EXPECTED_PID" ]; then
            log_success "PID limit: $ACTUAL_PIDS"
        elif [ "$ACTUAL_PIDS" = "0" ] || [ "$ACTUAL_PIDS" = "null" ] || [ "$ACTUAL_PIDS" = "-1" ]; then
            log_error "PID limit not set (expected $EXPECTED_PID)"
            ((ERRORS++))
        else
            log_warn "PID limit drift: $ACTUAL_PIDS (expected $EXPECTED_PID)"
            ((WARNINGS++))
        fi
    fi
}

check_security_options() {
    local service="$1"
    local container="${CONTAINER_NAMES[$service]:-as-demo-$service}"

    echo ""
    echo "Checking security options for ${service}..."

    # Check if container exists
    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        log_warn "${container} container not running, skipping"
        ((WARNINGS++))
        return
    fi

    # Get container inspect data
    local INSPECT
    INSPECT=$(docker inspect "$container" 2>/dev/null) || {
        log_error "Failed to inspect ${container}"
        ((ERRORS++))
        return
    }

    # Check no-new-privileges
    local NO_NEW_PRIV
    NO_NEW_PRIV=$(echo "$INSPECT" | jq -r '.[0].HostConfig.SecurityOpt[]? | select(. == "no-new-privileges:true" or . == "no-new-privileges")' 2>/dev/null) || NO_NEW_PRIV=""
    if [ -n "$NO_NEW_PRIV" ]; then
        log_success "no-new-privileges enabled"
    else
        log_error "no-new-privileges not enabled"
        ((ERRORS++))
    fi

    # Check cap_drop ALL
    local CAP_DROP
    CAP_DROP=$(echo "$INSPECT" | jq -r '.[0].HostConfig.CapDrop[]?' 2>/dev/null) || CAP_DROP=""
    if echo "$CAP_DROP" | grep -qi "all"; then
        log_success "cap_drop: ALL"
    else
        log_error "cap_drop ALL not set"
        ((ERRORS++))
    fi

    # Check cap_add for required capabilities
    local CAP_ADD
    CAP_ADD=$(echo "$INSPECT" | jq -r '.[0].HostConfig.CapAdd[]?' 2>/dev/null) || CAP_ADD=""
    local REQUIRED_CAPS=("CHOWN" "SETUID" "SETGID")
    for cap in "${REQUIRED_CAPS[@]}"; do
        if echo "$CAP_ADD" | grep -q "^${cap}$"; then
            log_success "cap_add: $cap"
        else
            log_warn "cap_add: $cap not explicitly added (may be inherited)"
            ((WARNINGS++))
        fi
    done
}

check_readonly_filesystem() {
    local service="$1"
    local container="${CONTAINER_NAMES[$service]:-as-demo-$service}"

    # Only check services that should have read-only filesystem
    local EXPECTED_RO="${EXPECTED_READONLY[$service]:-}"
    if [ -z "$EXPECTED_RO" ]; then
        return
    fi

    echo ""
    echo "Checking read-only filesystem for ${service}..."

    # Check if container exists
    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        log_warn "${container} container not running, skipping"
        ((WARNINGS++))
        return
    fi

    # Get container inspect data
    local INSPECT
    INSPECT=$(docker inspect "$container" 2>/dev/null) || {
        log_error "Failed to inspect ${container}"
        ((ERRORS++))
        return
    }

    # Check read-only root filesystem
    local READONLY
    READONLY=$(echo "$INSPECT" | jq -r '.[0].HostConfig.ReadonlyRootfs')
    if [ "$READONLY" = "true" ]; then
        log_success "Read-only root filesystem enabled"
    else
        log_error "Read-only root filesystem not enabled"
        ((ERRORS++))
    fi

    # Check for tmpfs mounts (required for read-only containers)
    local TMPFS_MOUNTS
    TMPFS_MOUNTS=$(echo "$INSPECT" | jq -r '.[0].HostConfig.Tmpfs | keys[]?' 2>/dev/null) || TMPFS_MOUNTS=""
    if [ -n "$TMPFS_MOUNTS" ]; then
        log_success "tmpfs mounts configured: $(echo "$TMPFS_MOUNTS" | tr '\n' ' ')"
    else
        log_warn "No tmpfs mounts found (may cause issues with read-only filesystem)"
        ((WARNINGS++))
    fi
}

check_restart_policy() {
    local service="$1"
    local container="${CONTAINER_NAMES[$service]:-as-demo-$service}"

    local EXPECTED_POLICY="${EXPECTED_RESTART[$service]:-}"
    if [ -z "$EXPECTED_POLICY" ]; then
        return
    fi

    echo ""
    echo "Checking restart policy for ${service}..."

    # Check if container exists (for "no" restart policy, container may have exited)
    local CONTAINER_EXISTS
    CONTAINER_EXISTS=$(docker ps -a --format '{{.Names}}' | grep -c "^${container}$" || true)
    if [ "$CONTAINER_EXISTS" = "0" ]; then
        log_warn "${container} container not found, skipping"
        ((WARNINGS++))
        return
    fi

    # Get container inspect data
    local INSPECT
    INSPECT=$(docker inspect "$container" 2>/dev/null) || {
        log_error "Failed to inspect ${container}"
        ((ERRORS++))
        return
    }

    # Check restart policy
    local RESTART_POLICY
    RESTART_POLICY=$(echo "$INSPECT" | jq -r '.[0].HostConfig.RestartPolicy.Name')
    if [ "$RESTART_POLICY" = "$EXPECTED_POLICY" ]; then
        log_success "Restart policy: $RESTART_POLICY"
    else
        log_error "Restart policy: $RESTART_POLICY (expected $EXPECTED_POLICY)"
        ((ERRORS++))
    fi
}

# =============================================================================
# Main Execution
# =============================================================================

echo "============================================="
echo "Container Security Validation"
echo "============================================="

# Check core services
CORE_SERVICES=("queue-manager" "nginx" "redis" "lgtm")

for service in "${CORE_SERVICES[@]}"; do
    check_resource_limits "$service"
    check_security_options "$service"
    check_readonly_filesystem "$service"
    check_restart_policy "$service"
done

# Check seed-loader restart policy (special case - runs once)
check_restart_policy "seed-loader"

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "============================================="
echo "Summary"
echo "============================================="

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    log_success "All security checks passed"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    log_warn "$WARNINGS warning(s), 0 errors"
    exit 0
else
    log_error "$ERRORS error(s), $WARNINGS warning(s)"
    exit 1
fi
