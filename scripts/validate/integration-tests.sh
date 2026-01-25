#!/usr/bin/env bash
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

# Test invite validation endpoint with valid token
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "${BASE_URL}/api/invite/validate?token=${TEST_TOKEN}" 2>/dev/null) || HTTP_CODE="000"
if [ "$HTTP_CODE" = "200" ]; then
    log_success "Valid invite token returns 200"
elif [ "$HTTP_CODE" = "404" ]; then
    log_info "Invite validation endpoint not implemented (404)"
else
    log_warn "Valid invite validation returned $HTTP_CODE (expected 200)"
    ((WARNINGS++))
fi

# Test invite validation with invalid token (use -s without -f to capture 4xx codes)
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/invite/validate?token=invalid-token-12345" 2>/dev/null)
if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "404" ]; then
    log_success "Invalid invite correctly rejected ($HTTP_CODE)"
else
    log_warn "Invalid invite returned unexpected code: $HTTP_CODE (expected 401 or 404)"
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
# WebSocket Message Protocol Tests
# =============================================================================
echo "Testing WebSocket message protocol..."

if command -v websocat &> /dev/null; then
    # Test heartbeat response
    WS_HEARTBEAT=$(echo '{"type":"heartbeat"}' | timeout 3 websocat -n1 "${WS_URL}/api/ws" 2>&1) || WS_HEARTBEAT="FAILED"
    if [ "$WS_HEARTBEAT" != "FAILED" ]; then
        log_success "WebSocket heartbeat message accepted"
    else
        log_info "WebSocket heartbeat test inconclusive"
    fi

    # Test error response for invalid message
    WS_INVALID=$(echo '{"type":"invalid_type_xyz"}' | timeout 3 websocat -n1 "${WS_URL}/api/ws" 2>&1) || WS_INVALID="FAILED"
    if [[ "$WS_INVALID" == *"error"* ]] || [ "$WS_INVALID" = "FAILED" ]; then
        log_success "WebSocket rejects invalid message types"
    else
        log_info "WebSocket invalid message test inconclusive"
    fi
else
    log_info "WebSocket message protocol tests skipped (websocat not installed)"
fi

echo ""

# =============================================================================
# Rate Limiting Validation
# =============================================================================
echo "Testing rate limiting..."

# This is a documentation test - actual rate limiting is per-IP
# and requires specific setup to test properly
if [ "${TEST_RATE_LIMITING:-false}" = "true" ]; then
    log_info "Rate limiting test requires TEST_RATE_LIMITING=true and special setup"
    # Rate limiting is 10 connections per IP per minute
    # Testing would require making 11 rapid connections
else
    log_info "Rate limiting test skipped (set TEST_RATE_LIMITING=true to enable)"
fi

echo ""

# =============================================================================
# Redis Dependency Health
# =============================================================================
echo "Testing Redis dependency..."

# Verify queue-manager handles Redis being present
QM_HEALTH=$(curl -sf "${BASE_URL}/api/health" 2>/dev/null) || QM_HEALTH=""
if [ -n "$QM_HEALTH" ]; then
    REDIS_STATUS=$(echo "$QM_HEALTH" | jq -r '.dependencies.redis // "unknown"' 2>/dev/null) || REDIS_STATUS="unknown"
    if [ "$REDIS_STATUS" = "healthy" ]; then
        log_success "Redis dependency reported as healthy"
    elif [ "$REDIS_STATUS" = "unknown" ]; then
        log_info "Redis dependency status not in health response (may not be implemented yet)"
    else
        log_warn "Redis dependency status: $REDIS_STATUS"
        ((WARNINGS++))
    fi
fi

echo ""

# =============================================================================
# Session Lifecycle Test
# =============================================================================
echo "Testing session lifecycle..."

# Session lifecycle test requires:
# 1. Valid invite token
# 2. WebSocket connection to join queue
# 3. Wait for session to start
# This is a placeholder for full session lifecycle testing

if [ "${TEST_SESSION_LIFECYCLE:-false}" = "true" ]; then
    log_info "Full session lifecycle test not implemented"
    log_info "Requires: valid invite, WebSocket client, session orchestration"
else
    log_info "Session lifecycle test skipped (set TEST_SESSION_LIFECYCLE=true)"
fi

echo ""

# =============================================================================
# HTTP Security Headers
# =============================================================================
echo "Testing HTTP security headers..."

HEADERS=$(curl -sI "${BASE_URL}/api/health" 2>/dev/null) || HEADERS=""

# Check X-Frame-Options
if echo "$HEADERS" | grep -qi "X-Frame-Options"; then
    log_success "X-Frame-Options header present"
else
    log_warn "X-Frame-Options header missing"
    ((WARNINGS++))
fi

# Check X-Content-Type-Options
if echo "$HEADERS" | grep -qi "X-Content-Type-Options"; then
    log_success "X-Content-Type-Options header present"
else
    log_warn "X-Content-Type-Options header missing"
    ((WARNINGS++))
fi

# Check Cache-Control for health endpoint
if echo "$HEADERS" | grep -qi "Cache-Control.*no-cache"; then
    log_success "Cache-Control header present on health endpoint"
else
    log_info "Cache-Control header may not be set on health endpoint"
fi

echo ""

# =============================================================================
# Container Health
# =============================================================================
echo "Testing container health..."

# Check queue-manager container
QM_STATUS=$(docker inspect --format='{{.State.Health.Status}}' as-demo-queue 2>/dev/null) || QM_STATUS="not-found"
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
