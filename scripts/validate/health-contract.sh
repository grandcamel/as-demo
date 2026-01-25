#!/usr/bin/env bash
# =============================================================================
# Health Contract Validation
# Validates /api/health, /api/health/live, /api/health/ready, and /api/status
# JSON response schemas
# =============================================================================

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
VERBOSE="${VERBOSE:-false}"
RESPONSE_TIME_THRESHOLD="${RESPONSE_TIME_THRESHOLD:-0.1}"

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

# Helper function to check response time
check_response_time() {
    local endpoint="$1"
    local response_time="$2"
    local threshold="$RESPONSE_TIME_THRESHOLD"

    # Compare using bc for floating point comparison
    if echo "$response_time < $threshold" | bc -l | grep -q 1; then
        log_success "$endpoint response time: ${response_time}s (threshold: ${threshold}s)"
        return 0
    else
        log_error "$endpoint response time: ${response_time}s exceeds threshold: ${threshold}s"
        return 1
    fi
}

# =============================================================================
# /api/health endpoint validation
# =============================================================================
echo "Validating /api/health endpoint..."

# Capture response and response time
HEALTH_OUTPUT=$(curl -sf -w "\n%{time_total}" "${BASE_URL}/api/health" 2>/dev/null) || {
    log_error "/api/health endpoint not responding"
    exit 1
}

HEALTH_RESPONSE=$(echo "$HEALTH_OUTPUT" | sed '$d')
HEALTH_TIME=$(echo "$HEALTH_OUTPUT" | tail -n 1)

# Validate response time
if ! check_response_time "/api/health" "$HEALTH_TIME"; then
    ((ERRORS++))
fi

# Validate required fields (use 'has' to check presence, not value)
for field in status timestamp enabled_platforms configured_platforms dependencies; do
    if echo "$HEALTH_RESPONSE" | jq -e "has(\"$field\")" > /dev/null 2>&1; then
        if [ "$VERBOSE" = "true" ]; then
            VALUE=$(echo "$HEALTH_RESPONSE" | jq -r ".$field")
            log_success "health.$field present: $VALUE"
        else
            log_success "health.$field present"
        fi
    else
        log_error "health.$field missing"
        ((ERRORS++))
    fi
done

# Validate dependencies.redis field
if echo "$HEALTH_RESPONSE" | jq -e ".dependencies.redis" > /dev/null 2>&1; then
    REDIS_STATUS=$(echo "$HEALTH_RESPONSE" | jq -r '.dependencies.redis')
    if [[ "$REDIS_STATUS" =~ ^(healthy|unhealthy)$ ]]; then
        log_success "health.dependencies.redis has valid value: $REDIS_STATUS"
    else
        log_error "health.dependencies.redis has invalid value: $REDIS_STATUS (expected: healthy|unhealthy)"
        ((ERRORS++))
    fi
else
    log_error "health.dependencies.redis missing"
    ((ERRORS++))
fi

# Validate status is 'ok' or known value
STATUS=$(echo "$HEALTH_RESPONSE" | jq -r '.status')
if [[ "$STATUS" =~ ^(ok|degraded|error)$ ]]; then
    log_success "health.status has valid value: $STATUS"
else
    log_error "health.status has invalid value: $STATUS (expected: ok|degraded|error)"
    ((ERRORS++))
fi

# Validate timestamp is ISO format
TIMESTAMP=$(echo "$HEALTH_RESPONSE" | jq -r '.timestamp')
if [[ "$TIMESTAMP" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2} ]]; then
    log_success "health.timestamp is valid ISO format"
else
    log_error "health.timestamp is not valid ISO format: $TIMESTAMP"
    ((ERRORS++))
fi

# Validate platforms are arrays
for field in enabled_platforms configured_platforms; do
    if echo "$HEALTH_RESPONSE" | jq -e ".$field | type == \"array\"" > /dev/null 2>&1; then
        COUNT=$(echo "$HEALTH_RESPONSE" | jq ".$field | length")
        log_success "health.$field is array with $COUNT items"
    else
        log_error "health.$field is not an array"
        ((ERRORS++))
    fi
done

echo ""

# =============================================================================
# /api/health/live endpoint validation
# =============================================================================
echo "Validating /api/health/live endpoint..."

LIVE_OUTPUT=$(curl -sf -w "\n%{time_total}" "${BASE_URL}/api/health/live" 2>/dev/null) || {
    log_error "/api/health/live endpoint not responding"
    ((ERRORS++))
}

if [ -n "${LIVE_OUTPUT:-}" ]; then
    LIVE_RESPONSE=$(echo "$LIVE_OUTPUT" | sed '$d')
    LIVE_TIME=$(echo "$LIVE_OUTPUT" | tail -n 1)

    # Validate response time
    if ! check_response_time "/api/health/live" "$LIVE_TIME"; then
        ((ERRORS++))
    fi

    # Validate required fields
    for field in status timestamp; do
        if echo "$LIVE_RESPONSE" | jq -e "has(\"$field\")" > /dev/null 2>&1; then
            log_success "live.$field present"
        else
            log_error "live.$field missing"
            ((ERRORS++))
        fi
    done

    # Validate status is 'ok'
    LIVE_STATUS=$(echo "$LIVE_RESPONSE" | jq -r '.status')
    if [ "$LIVE_STATUS" = "ok" ]; then
        log_success "live.status is 'ok'"
    else
        log_error "live.status is not 'ok': $LIVE_STATUS"
        ((ERRORS++))
    fi
fi

echo ""

# =============================================================================
# /api/health/ready endpoint validation
# =============================================================================
echo "Validating /api/health/ready endpoint..."

READY_OUTPUT=$(curl -sf -w "\n%{time_total}" "${BASE_URL}/api/health/ready" 2>/dev/null) || {
    log_error "/api/health/ready endpoint not responding"
    ((ERRORS++))
}

if [ -n "${READY_OUTPUT:-}" ]; then
    READY_RESPONSE=$(echo "$READY_OUTPUT" | sed '$d')
    READY_TIME=$(echo "$READY_OUTPUT" | tail -n 1)

    # Validate response time
    if ! check_response_time "/api/health/ready" "$READY_TIME"; then
        ((ERRORS++))
    fi

    # Validate required fields
    for field in status timestamp dependencies; do
        if echo "$READY_RESPONSE" | jq -e "has(\"$field\")" > /dev/null 2>&1; then
            log_success "ready.$field present"
        else
            log_error "ready.$field missing"
            ((ERRORS++))
        fi
    done

    # Validate status is valid
    READY_STATUS=$(echo "$READY_RESPONSE" | jq -r '.status')
    if [[ "$READY_STATUS" =~ ^(ok|error)$ ]]; then
        log_success "ready.status has valid value: $READY_STATUS"
    else
        log_error "ready.status has invalid value: $READY_STATUS (expected: ok|error)"
        ((ERRORS++))
    fi

    # Validate dependencies.redis field
    if echo "$READY_RESPONSE" | jq -e ".dependencies.redis" > /dev/null 2>&1; then
        REDIS_STATUS=$(echo "$READY_RESPONSE" | jq -r '.dependencies.redis')
        if [[ "$REDIS_STATUS" =~ ^(healthy|unhealthy)$ ]]; then
            log_success "ready.dependencies.redis has valid value: $REDIS_STATUS"
        else
            log_error "ready.dependencies.redis has invalid value: $REDIS_STATUS (expected: healthy|unhealthy)"
            ((ERRORS++))
        fi
    else
        log_error "ready.dependencies.redis missing"
        ((ERRORS++))
    fi
fi

echo ""

# =============================================================================
# /api/status endpoint validation
# =============================================================================
echo "Validating /api/status endpoint..."

STATUS_RESPONSE=$(curl -sf "${BASE_URL}/api/status" 2>/dev/null) || {
    log_error "/api/status endpoint not responding"
    exit 1
}

# Validate required fields (use 'has' to check presence, not value)
for field in queue_size session_active estimated_wait max_queue_size enabled_platforms configured_platforms; do
    if echo "$STATUS_RESPONSE" | jq -e "has(\"$field\")" > /dev/null 2>&1; then
        if [ "$VERBOSE" = "true" ]; then
            VALUE=$(echo "$STATUS_RESPONSE" | jq -r ".$field")
            log_success "status.$field present: $VALUE"
        else
            log_success "status.$field present"
        fi
    else
        log_error "status.$field missing"
        ((ERRORS++))
    fi
done

# Validate numeric fields
for field in queue_size max_queue_size; do
    VALUE=$(echo "$STATUS_RESPONSE" | jq -r ".$field")
    if [[ "$VALUE" =~ ^[0-9]+$ ]]; then
        log_success "status.$field is number: $VALUE"
    else
        log_error "status.$field is not a number: $VALUE"
        ((ERRORS++))
    fi
done

# Validate session_active is boolean
SESSION_ACTIVE=$(echo "$STATUS_RESPONSE" | jq -r '.session_active')
if [[ "$SESSION_ACTIVE" =~ ^(true|false)$ ]]; then
    log_success "status.session_active is boolean: $SESSION_ACTIVE"
else
    log_error "status.session_active is not boolean: $SESSION_ACTIVE"
    ((ERRORS++))
fi

# Validate estimated_wait is string
ESTIMATED_WAIT=$(echo "$STATUS_RESPONSE" | jq -r '.estimated_wait')
if [ -n "$ESTIMATED_WAIT" ] && [ "$ESTIMATED_WAIT" != "null" ]; then
    log_success "status.estimated_wait is string: $ESTIMATED_WAIT"
else
    log_error "status.estimated_wait is missing or null"
    ((ERRORS++))
fi

echo ""

# =============================================================================
# Summary
# =============================================================================
echo ""
log_info "Note: /api/health returns 503 when Redis is down (degraded state)."
log_info "This cannot be easily tested without stopping Redis during the test."
echo ""

if [ $ERRORS -eq 0 ]; then
    log_success "All health contract validations passed"
    exit 0
else
    log_error "$ERRORS validation(s) failed"
    exit 1
fi
