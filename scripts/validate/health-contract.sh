#!/bin/bash
# =============================================================================
# Health Contract Validation
# Validates /api/health and /api/status JSON response schemas
# =============================================================================

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
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

# =============================================================================
# /api/health endpoint validation
# =============================================================================
echo "Validating /api/health endpoint..."

HEALTH_RESPONSE=$(curl -sf "${BASE_URL}/api/health" 2>/dev/null) || {
    log_error "/api/health endpoint not responding"
    exit 1
}

# Validate required fields (use 'has' to check presence, not value)
for field in status timestamp enabled_platforms configured_platforms; do
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
if [ $ERRORS -eq 0 ]; then
    log_success "All health contract validations passed"
    exit 0
else
    log_error "$ERRORS validation(s) failed"
    exit 1
fi
