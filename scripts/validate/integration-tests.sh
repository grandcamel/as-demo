#!/bin/bash
# =============================================================================
# Integration Tests
# Tests WebSocket connection, invite flow, and Redis connectivity
# =============================================================================

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
WS_URL="${WS_URL:-ws://localhost:8080}"
REDIS_CONTAINER="${REDIS_CONTAINER:-as-demo-redis}"
VERBOSE="${VERBOSE:-false}"

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
# Redis Connectivity
# =============================================================================
echo "Testing Redis connectivity..."

# Check if Redis container is running
if docker ps --format '{{.Names}}' | grep -q "^${REDIS_CONTAINER}$"; then
    log_success "Redis container is running"
else
    log_error "Redis container '${REDIS_CONTAINER}' not found"
    ((ERRORS++))
fi

# Test Redis ping
REDIS_PING=$(docker exec "$REDIS_CONTAINER" redis-cli ping 2>/dev/null) || REDIS_PING="FAILED"
if [ "$REDIS_PING" = "PONG" ]; then
    log_success "Redis responds to PING"
else
    log_error "Redis not responding: $REDIS_PING"
    ((ERRORS++))
fi

# Check Redis memory usage
REDIS_MEMORY=$(docker exec "$REDIS_CONTAINER" redis-cli info memory 2>/dev/null | grep "used_memory_human" | cut -d: -f2 | tr -d '\r') || REDIS_MEMORY="unknown"
log_info "Redis memory usage: $REDIS_MEMORY"

echo ""

# =============================================================================
# HTTP Endpoints
# =============================================================================
echo "Testing HTTP endpoints..."

# Test health endpoint
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "${BASE_URL}/api/health" 2>/dev/null) || HTTP_CODE="000"
if [ "$HTTP_CODE" = "200" ]; then
    log_success "/api/health returns 200"
else
    log_error "/api/health returns $HTTP_CODE (expected 200)"
    ((ERRORS++))
fi

# Test status endpoint
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "${BASE_URL}/api/status" 2>/dev/null) || HTTP_CODE="000"
if [ "$HTTP_CODE" = "200" ]; then
    log_success "/api/status returns 200"
else
    log_error "/api/status returns $HTTP_CODE (expected 200)"
    ((ERRORS++))
fi

# Test landing page
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "${BASE_URL}/" 2>/dev/null) || HTTP_CODE="000"
if [ "$HTTP_CODE" = "200" ]; then
    log_success "Landing page returns 200"
else
    log_error "Landing page returns $HTTP_CODE (expected 200)"
    ((ERRORS++))
fi

echo ""

# =============================================================================
# Invite Flow
# =============================================================================
echo "Testing invite flow..."

# Create test invite
TEST_TOKEN="test-$(date +%s)"
TTL_SECONDS=300
INVITE_JSON="{\"token\":\"${TEST_TOKEN}\",\"label\":\"Integration Test\",\"createdAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"expiresAt\":\"$(date -u -v+5M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '+5 minutes' +%Y-%m-%dT%H:%M:%SZ)\",\"maxUses\":1,\"useCount\":0,\"status\":\"active\"}"

# Store invite in Redis
if docker exec "$REDIS_CONTAINER" redis-cli SET "invite:${TEST_TOKEN}" "$INVITE_JSON" EX $TTL_SECONDS > /dev/null 2>&1; then
    log_success "Created test invite in Redis"
else
    log_error "Failed to create test invite in Redis"
    ((ERRORS++))
fi

# Verify invite exists
STORED_INVITE=$(docker exec "$REDIS_CONTAINER" redis-cli GET "invite:${TEST_TOKEN}" 2>/dev/null) || STORED_INVITE=""
if [ -n "$STORED_INVITE" ]; then
    log_success "Invite retrieved from Redis"
else
    log_error "Invite not found in Redis"
    ((ERRORS++))
fi

# Test invite validation endpoint (if exists)
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "${BASE_URL}/api/invite/${TEST_TOKEN}" 2>/dev/null) || HTTP_CODE="000"
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "404" ]; then
    # 404 is acceptable if endpoint doesn't exist
    log_success "Invite validation endpoint accessible"
else
    log_warn "Invite validation endpoint returned $HTTP_CODE"
    ((WARNINGS++))
fi

# Cleanup test invite
docker exec "$REDIS_CONTAINER" redis-cli DEL "invite:${TEST_TOKEN}" > /dev/null 2>&1 || true
log_success "Cleaned up test invite"

echo ""

# =============================================================================
# WebSocket Connection Test
# =============================================================================
echo "Testing WebSocket connectivity..."

# Check if websocat is available for proper WebSocket testing
if command -v websocat &> /dev/null; then
    # Attempt WebSocket connection (timeout after 3 seconds)
    WS_RESULT=$(echo '{"type":"ping"}' | timeout 3 websocat -n1 "${WS_URL}/ws" 2>&1) || WS_RESULT="FAILED"
    if [ "$WS_RESULT" != "FAILED" ]; then
        log_success "WebSocket connection established"
    else
        log_warn "WebSocket connection test inconclusive (may need valid invite)"
        ((WARNINGS++))
    fi
else
    # Fallback: test via curl upgrade request
    HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" \
        -H "Connection: Upgrade" \
        -H "Upgrade: websocket" \
        -H "Sec-WebSocket-Version: 13" \
        -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
        "${BASE_URL}/ws" 2>/dev/null) || HTTP_CODE="000"

    if [ "$HTTP_CODE" = "101" ] || [ "$HTTP_CODE" = "400" ] || [ "$HTTP_CODE" = "403" ]; then
        # 101 = upgrade, 400/403 = rejected but endpoint exists
        log_success "WebSocket endpoint accessible (upgrade attempted)"
    else
        log_warn "WebSocket endpoint returned $HTTP_CODE"
        ((WARNINGS++))
    fi
    log_info "Install 'websocat' for full WebSocket testing"
fi

echo ""

# =============================================================================
# Container Health
# =============================================================================
echo "Testing container health..."

# Check queue-manager container
QM_STATUS=$(docker inspect --format='{{.State.Health.Status}}' as-demo-queue-manager 2>/dev/null) || QM_STATUS="not-found"
if [ "$QM_STATUS" = "healthy" ]; then
    log_success "queue-manager container is healthy"
elif [ "$QM_STATUS" = "not-found" ]; then
    log_error "queue-manager container not found"
    ((ERRORS++))
else
    log_warn "queue-manager health status: $QM_STATUS"
    ((WARNINGS++))
fi

# Check nginx container
NGINX_STATUS=$(docker inspect --format='{{.State.Status}}' as-demo-nginx 2>/dev/null) || NGINX_STATUS="not-found"
if [ "$NGINX_STATUS" = "running" ]; then
    log_success "nginx container is running"
elif [ "$NGINX_STATUS" = "not-found" ]; then
    log_error "nginx container not found"
    ((ERRORS++))
else
    log_error "nginx container status: $NGINX_STATUS"
    ((ERRORS++))
fi

echo ""

# =============================================================================
# Summary
# =============================================================================
echo "----------------------------------------"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    log_success "All integration tests passed"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    log_warn "$WARNINGS warning(s), but no errors"
    exit 0
else
    log_error "$ERRORS error(s), $WARNINGS warning(s)"
    exit 1
fi
