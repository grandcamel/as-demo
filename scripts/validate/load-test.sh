#!/bin/bash
# =============================================================================
# Load/Stress Testing
# Basic load testing for the as-demo platform
# =============================================================================

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
CONCURRENCY="${CONCURRENCY:-10}"
REQUESTS="${REQUESTS:-100}"
DURATION="${DURATION:-30}"
TEST_TYPE="${TEST_TYPE:-basic}"  # basic, sustained, spike

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_warn() { echo -e "${YELLOW}!${NC} $1"; }
log_info() { echo "  $1"; }

# =============================================================================
# Check Prerequisites
# =============================================================================
echo "Checking prerequisites..."

# Check if ab (Apache Bench) is available
if command -v ab &> /dev/null; then
    log_success "Apache Bench (ab) available"
    USE_AB=true
elif command -v hey &> /dev/null; then
    log_success "hey load tester available"
    USE_HEY=true
elif command -v curl &> /dev/null; then
    log_warn "Only curl available, using basic load test"
    USE_CURL=true
else
    log_error "No load testing tool found (install ab, hey, or curl)"
    exit 1
fi

# Verify target is responding
if ! curl -sf "${BASE_URL}/api/health" > /dev/null 2>&1; then
    log_error "Target ${BASE_URL} not responding"
    exit 1
fi
log_success "Target ${BASE_URL} is responding"

echo ""

# =============================================================================
# Test Functions
# =============================================================================

run_ab_test() {
    local endpoint="$1"
    local name="$2"

    echo "Testing $name..."
    ab -n "$REQUESTS" -c "$CONCURRENCY" -q "${BASE_URL}${endpoint}" 2>&1 | grep -E "(Requests per second|Time per request|Failed requests|Complete requests)" || true
    echo ""
}

run_hey_test() {
    local endpoint="$1"
    local name="$2"

    echo "Testing $name..."
    hey -n "$REQUESTS" -c "$CONCURRENCY" -q "${BASE_URL}${endpoint}" 2>&1 | grep -E "(Requests/sec|Average|Fastest|Slowest)" || true
    echo ""
}

run_curl_test() {
    local endpoint="$1"
    local name="$2"
    local success=0
    local failed=0
    local total_time=0

    echo "Testing $name (curl fallback, $REQUESTS requests)..."

    for ((i=1; i<=REQUESTS; i++)); do
        START=$(date +%s%N)
        if curl -sf -o /dev/null "${BASE_URL}${endpoint}" 2>/dev/null; then
            ((success++))
        else
            ((failed++))
        fi
        END=$(date +%s%N)
        ELAPSED=$(( (END - START) / 1000000 ))
        total_time=$((total_time + ELAPSED))

        # Progress indicator
        if (( i % 10 == 0 )); then
            echo -ne "\r  Progress: $i/$REQUESTS"
        fi
    done

    echo -e "\r  Progress: $REQUESTS/$REQUESTS"

    AVG_TIME=$((total_time / REQUESTS))
    RPS=$((REQUESTS * 1000 / total_time))

    log_info "Successful: $success"
    log_info "Failed: $failed"
    log_info "Average response time: ${AVG_TIME}ms"
    log_info "Requests/sec: ~$RPS"
    echo ""
}

run_test() {
    local endpoint="$1"
    local name="$2"

    if [ "${USE_AB:-false}" = "true" ]; then
        run_ab_test "$endpoint" "$name"
    elif [ "${USE_HEY:-false}" = "true" ]; then
        run_hey_test "$endpoint" "$name"
    else
        run_curl_test "$endpoint" "$name"
    fi
}

# =============================================================================
# Basic Load Test
# =============================================================================
if [ "$TEST_TYPE" = "basic" ] || [ "$TEST_TYPE" = "all" ]; then
    echo "=========================================="
    echo "Basic Load Test"
    echo "Concurrency: $CONCURRENCY"
    echo "Total Requests: $REQUESTS"
    echo "=========================================="
    echo ""

    run_test "/api/health" "Health Endpoint"
    run_test "/api/status" "Status Endpoint"
    run_test "/" "Landing Page"
fi

# =============================================================================
# Sustained Load Test
# =============================================================================
if [ "$TEST_TYPE" = "sustained" ] || [ "$TEST_TYPE" = "all" ]; then
    echo "=========================================="
    echo "Sustained Load Test"
    echo "Duration: ${DURATION}s"
    echo "Concurrency: $CONCURRENCY"
    echo "=========================================="
    echo ""

    if [ "${USE_HEY:-false}" = "true" ]; then
        echo "Running sustained test on /api/health..."
        hey -z "${DURATION}s" -c "$CONCURRENCY" -q "${BASE_URL}/api/health" 2>&1 | grep -E "(Requests/sec|Average|Fastest|Slowest|Status code)" || true
    elif [ "${USE_AB:-false}" = "true" ]; then
        echo "Running sustained test on /api/health..."
        ab -t "$DURATION" -c "$CONCURRENCY" -q "${BASE_URL}/api/health" 2>&1 | grep -E "(Requests per second|Time per request|Failed requests)" || true
    else
        log_warn "Sustained test requires 'ab' or 'hey'"
    fi
    echo ""
fi

# =============================================================================
# Spike Test
# =============================================================================
if [ "$TEST_TYPE" = "spike" ] || [ "$TEST_TYPE" = "all" ]; then
    echo "=========================================="
    echo "Spike Test"
    echo "Simulating traffic spike"
    echo "=========================================="
    echo ""

    # Baseline
    echo "Phase 1: Baseline (10 concurrent)..."
    CONCURRENCY=10 run_test "/api/health" "Baseline"

    # Spike
    echo "Phase 2: Spike (50 concurrent)..."
    CONCURRENCY=50 run_test "/api/health" "Spike"

    # Recovery
    echo "Phase 3: Recovery (10 concurrent)..."
    CONCURRENCY=10 run_test "/api/health" "Recovery"
fi

# =============================================================================
# Resource Check After Load
# =============================================================================
echo "=========================================="
echo "Post-Load Resource Check"
echo "=========================================="

# Check container stats
echo ""
echo "Container resource usage:"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null | grep -E "(NAME|as-demo)" || log_warn "Could not get container stats"

# Check health after load
echo ""
echo "Health check after load test..."
HEALTH=$(curl -sf "${BASE_URL}/api/health" 2>/dev/null) || HEALTH="FAILED"
if [ "$HEALTH" != "FAILED" ]; then
    STATUS=$(echo "$HEALTH" | jq -r '.status')
    SESSIONS=$(echo "$HEALTH" | jq -r '.session_count')
    log_success "Service healthy after load test (status: $STATUS, sessions: $SESSIONS)"
else
    log_error "Service not responding after load test"
fi

echo ""
echo "=========================================="
log_success "Load test complete"
