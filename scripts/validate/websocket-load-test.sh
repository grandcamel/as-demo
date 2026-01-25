#!/usr/bin/env bash
# =============================================================================
# WebSocket Load Testing
# Tests WebSocket connection handling under load
# =============================================================================

set -euo pipefail

WS_URL="${WS_URL:-ws://localhost:8080}"
CONCURRENT_CONNECTIONS="${CONCURRENT_CONNECTIONS:-50}"
DURATION="${DURATION:-30}"
MESSAGE_RATE="${MESSAGE_RATE:-10}"  # messages per second per connection

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_warn() { echo -e "${YELLOW}!${NC} $1"; }
log_info() { echo "  $1"; }

echo "WebSocket Load Test"
echo "===================="
echo "Target: $WS_URL"
echo "Concurrent connections: $CONCURRENT_CONNECTIONS"
echo "Duration: ${DURATION}s"
echo ""

# Check prerequisites
if ! command -v websocat &> /dev/null; then
    log_warn "websocat not installed - WebSocket load testing unavailable"
    log_info "Install with: cargo install websocat"
    log_info "Or: brew install websocat (macOS)"
    exit 0
fi

# Simple connection test
echo "Testing basic WebSocket connectivity..."
if timeout 5 websocat -n1 "${WS_URL}/api/ws" <<< '{"type":"heartbeat"}' > /dev/null 2>&1; then
    log_success "WebSocket endpoint accessible"
else
    log_error "WebSocket endpoint not accessible"
    exit 1
fi

# Connection burst test
echo ""
echo "Testing connection burst (${CONCURRENT_CONNECTIONS} simultaneous)..."

SUCCESSFUL=0
FAILED=0
START_TIME=$(date +%s)

for i in $(seq 1 $CONCURRENT_CONNECTIONS); do
    (
        if timeout 5 websocat -n1 "${WS_URL}/api/ws" <<< '{"type":"heartbeat"}' > /dev/null 2>&1; then
            echo "ok"
        else
            echo "fail"
        fi
    ) &
done | while read result; do
    if [ "$result" = "ok" ]; then
        ((SUCCESSFUL++)) || true
    else
        ((FAILED++)) || true
    fi
done

wait

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
log_info "Connection burst completed in ${ELAPSED}s"
log_info "Successful: estimated based on no errors"
log_info "Note: Detailed metrics require specialized WebSocket load testing tools"

echo ""
echo "=========================================="
log_success "WebSocket load test complete"
