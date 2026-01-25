#!/bin/bash
# =============================================================================
# AS-Demo Production Health Check Script
# =============================================================================
# Validates that all services are running correctly.
#
# Usage:
#   ./healthcheck.sh              Local health check (localhost:8080)
#   ./healthcheck.sh --production Production health check (demo.assistant-skills.dev)
#   ./healthcheck.sh --url URL    Custom URL health check
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
BASE_URL="${BASE_URL:-http://localhost:8080}"
PRODUCTION_URL="https://demo.assistant-skills.dev"
TIMEOUT=10
VERBOSE=false

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED++))
}
log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED++))
}
log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNINGS++))
}

# Check landing page
check_landing_page() {
    log_info "Checking landing page..."

    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$BASE_URL/" 2>/dev/null || echo "000")

    if [[ "$response" == "200" ]]; then
        log_pass "Landing page responds (HTTP $response)"
    else
        log_fail "Landing page failed (HTTP $response)"
    fi
}

# Check health endpoint
check_health_endpoint() {
    log_info "Checking /api/health endpoint..."

    local response
    response=$(curl -s --max-time "$TIMEOUT" "$BASE_URL/api/health" 2>/dev/null || echo '{}')

    local status
    status=$(echo "$response" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")

    if [[ "$status" == "ok" ]]; then
        log_pass "Health endpoint: status=$status"
    else
        log_fail "Health endpoint: status=$status"
        [[ "$VERBOSE" == "true" ]] && echo "  Response: $response"
    fi
}

# Check ready endpoint
check_ready_endpoint() {
    log_info "Checking /api/health/ready endpoint..."

    local response
    response=$(curl -s --max-time "$TIMEOUT" "$BASE_URL/api/health/ready" 2>/dev/null || echo '{}')

    local status
    status=$(echo "$response" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")

    local redis_status
    redis_status=$(echo "$response" | jq -r '.redis // "unknown"' 2>/dev/null || echo "unknown")

    if [[ "$status" == "ok" && "$redis_status" == "healthy" ]]; then
        log_pass "Ready endpoint: status=$status, redis=$redis_status"
    elif [[ "$status" == "ok" ]]; then
        log_warn "Ready endpoint: status=$status, redis=$redis_status"
    else
        log_fail "Ready endpoint: status=$status, redis=$redis_status"
        [[ "$VERBOSE" == "true" ]] && echo "  Response: $response"
    fi
}

# Check status endpoint
check_status_endpoint() {
    log_info "Checking /api/status endpoint..."

    local response
    response=$(curl -s --max-time "$TIMEOUT" "$BASE_URL/api/status" 2>/dev/null || echo '{}')

    local enabled_platforms
    enabled_platforms=$(echo "$response" | jq -r '.enabled_platforms | length // 0' 2>/dev/null || echo "0")

    local configured_platforms
    configured_platforms=$(echo "$response" | jq -r '.configured_platforms | length // 0' 2>/dev/null || echo "0")

    if [[ "$enabled_platforms" -gt 0 && "$configured_platforms" -gt 0 ]]; then
        log_pass "Status endpoint: $enabled_platforms enabled, $configured_platforms configured"
    elif [[ "$enabled_platforms" -gt 0 ]]; then
        log_warn "Status endpoint: $enabled_platforms enabled, $configured_platforms configured (missing configs?)"
    else
        log_fail "Status endpoint: No platforms enabled"
        [[ "$VERBOSE" == "true" ]] && echo "  Response: $response"
    fi
}

# Check WebSocket endpoint (connection test only)
check_websocket() {
    log_info "Checking WebSocket endpoint..."

    # Try to connect to WebSocket (simple HTTP upgrade check)
    local ws_url
    if [[ "$BASE_URL" == https://* ]]; then
        ws_url="${BASE_URL/https:/wss:}/api/ws"
    else
        ws_url="${BASE_URL/http:/ws:}/api/ws"
    fi

    # Use curl to test WebSocket upgrade
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" \
        -H "Connection: Upgrade" \
        -H "Upgrade: websocket" \
        -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
        -H "Sec-WebSocket-Version: 13" \
        -H "Origin: $BASE_URL" \
        "$BASE_URL/api/ws" 2>/dev/null || echo "000")

    # 101 = Switching Protocols (WebSocket upgrade successful)
    # 400 = Bad Request (might be missing headers but endpoint exists)
    if [[ "$response" == "101" ]]; then
        log_pass "WebSocket endpoint: upgrade successful"
    elif [[ "$response" == "400" || "$response" == "426" ]]; then
        log_pass "WebSocket endpoint: reachable (HTTP $response)"
    else
        log_fail "WebSocket endpoint: failed (HTTP $response)"
    fi
}

# Check SSL certificate (production only)
check_ssl_certificate() {
    if [[ "$BASE_URL" != https://* ]]; then
        log_info "Skipping SSL check (not HTTPS)"
        return
    fi

    log_info "Checking SSL certificate..."

    local domain
    domain=$(echo "$BASE_URL" | sed -E 's|https://([^/]+).*|\1|')

    local expiry
    expiry=$(echo | openssl s_client -servername "$domain" -connect "$domain:443" 2>/dev/null | \
        openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || echo "")

    if [[ -n "$expiry" ]]; then
        local expiry_epoch
        expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$expiry" +%s 2>/dev/null || echo "0")
        local now_epoch
        now_epoch=$(date +%s)
        local days_remaining=$(( (expiry_epoch - now_epoch) / 86400 ))

        if [[ $days_remaining -gt 30 ]]; then
            log_pass "SSL certificate: valid, expires in $days_remaining days"
        elif [[ $days_remaining -gt 7 ]]; then
            log_warn "SSL certificate: expires in $days_remaining days (renewal recommended)"
        elif [[ $days_remaining -gt 0 ]]; then
            log_warn "SSL certificate: expires in $days_remaining days (URGENT renewal needed)"
        else
            log_fail "SSL certificate: expired"
        fi
    else
        log_fail "SSL certificate: could not retrieve certificate info"
    fi
}

# Check HSTS header
check_hsts_header() {
    if [[ "$BASE_URL" != https://* ]]; then
        return
    fi

    log_info "Checking HSTS header..."

    local hsts
    hsts=$(curl -sI --max-time "$TIMEOUT" "$BASE_URL/" 2>/dev/null | grep -i "strict-transport-security" || echo "")

    if [[ -n "$hsts" ]]; then
        log_pass "HSTS header present"
        [[ "$VERBOSE" == "true" ]] && echo "  $hsts"
    else
        log_warn "HSTS header missing"
    fi
}

# Check Redis connectivity (via Docker)
check_redis_docker() {
    log_info "Checking Redis (Docker)..."

    local redis_ping
    redis_ping=$(docker exec as-demo-redis redis-cli ping 2>/dev/null || echo "")

    if [[ "$redis_ping" == "PONG" ]]; then
        log_pass "Redis: responding to ping"
    else
        log_fail "Redis: not responding"
    fi
}

# Check container health status
check_container_health() {
    log_info "Checking container health status..."

    local containers=("as-demo-nginx" "as-demo-queue" "as-demo-redis" "as-demo-lgtm")

    for container in "${containers[@]}"; do
        local status
        status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "not_found")

        case "$status" in
            "healthy")
                log_pass "Container $container: healthy"
                ;;
            "unhealthy")
                log_fail "Container $container: unhealthy"
                ;;
            "starting")
                log_warn "Container $container: starting"
                ;;
            "not_found")
                log_warn "Container $container: not found"
                ;;
            *)
                log_warn "Container $container: status=$status"
                ;;
        esac
    done
}

# Check platform connectivity
check_platforms() {
    log_info "Checking platform connectivity..."

    local response
    response=$(curl -s --max-time "$TIMEOUT" "$BASE_URL/api/status" 2>/dev/null || echo '{}')

    local configured
    configured=$(echo "$response" | jq -r '.configured_platforms[]? // empty' 2>/dev/null)

    if [[ -z "$configured" ]]; then
        log_warn "No platforms configured"
        return
    fi

    for platform in $configured; do
        log_pass "Platform '$platform': configured"
    done
}

# Print summary
print_summary() {
    echo ""
    echo "=============================================="
    echo "Health Check Summary"
    echo "=============================================="
    echo -e "Passed:   ${GREEN}$PASSED${NC}"
    echo -e "Failed:   ${RED}$FAILED${NC}"
    echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"
    echo "=============================================="

    if [[ $FAILED -gt 0 ]]; then
        echo -e "${RED}Overall: UNHEALTHY${NC}"
        return 1
    elif [[ $WARNINGS -gt 0 ]]; then
        echo -e "${YELLOW}Overall: DEGRADED${NC}"
        return 0
    else
        echo -e "${GREEN}Overall: HEALTHY${NC}"
        return 0
    fi
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --production)
            BASE_URL="$PRODUCTION_URL"
            shift
            ;;
        --url)
            BASE_URL="$2"
            shift 2
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            echo "AS-Demo Health Check Script"
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --production     Check production URL (demo.assistant-skills.dev)"
            echo "  --url URL        Check custom URL"
            echo "  --verbose, -v    Show detailed output"
            echo "  --help, -h       Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Main execution
echo "=============================================="
echo "AS-Demo Health Check"
echo "URL: $BASE_URL"
echo "=============================================="
echo ""

# Run checks
check_landing_page
check_health_endpoint
check_ready_endpoint
check_status_endpoint
check_websocket
check_ssl_certificate
check_hsts_header

# Docker-specific checks (only if running locally)
if docker ps &>/dev/null; then
    check_redis_docker
    check_container_health
fi

check_platforms

# Print summary
print_summary
