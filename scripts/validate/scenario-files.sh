#!/bin/bash
# =============================================================================
# Scenario Files Validation
# Validates scenario files exist and have proper structure
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCENARIOS_DIR="${PROJECT_ROOT}/demo-container/scenarios"
CONFIG_FILE="${PROJECT_ROOT}/queue-manager/config/cross-platform.js"

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
# Directory Structure
# =============================================================================
echo "Validating scenario directory structure..."

# Required platform directories
for platform in confluence jira splunk cross-platform; do
    PLATFORM_DIR="${SCENARIOS_DIR}/${platform}"
    if [ -d "$PLATFORM_DIR" ]; then
        FILE_COUNT=$(find "$PLATFORM_DIR" -name "*.md" -type f | wc -l | tr -d ' ')
        log_success "${platform}/ directory exists ($FILE_COUNT scenario files)"
    else
        log_error "${platform}/ directory missing"
        ((ERRORS++))
    fi
done

echo ""

# =============================================================================
# Cross-Platform Scenario Files
# =============================================================================
echo "Validating cross-platform scenarios..."

# Extract scenario files from config (look for 'file:' entries)
# Use portable grep/sed instead of grep -P (not available on macOS)
EXPECTED_SCENARIOS=$(grep "file:" "$CONFIG_FILE" 2>/dev/null | \
    sed -n "s/.*file:[[:space:]]*['\"]cross-platform\/\([^'\"]*\)['\"].*/\1/p") || EXPECTED_SCENARIOS=""

if [ -z "$EXPECTED_SCENARIOS" ]; then
    log_warn "Could not parse expected scenarios from config"
    ((WARNINGS++))
else
    for scenario in $EXPECTED_SCENARIOS; do
        SCENARIO_PATH="${SCENARIOS_DIR}/cross-platform/${scenario}"
        if [ -f "$SCENARIO_PATH" ]; then
            log_success "cross-platform/${scenario} exists"
        else
            log_error "cross-platform/${scenario} missing (referenced in config)"
            ((ERRORS++))
        fi
    done
fi

echo ""

# =============================================================================
# Scenario File Format Validation
# =============================================================================
echo "Validating scenario file format..."

# Check all .md files in scenarios directory
while IFS= read -r -d '' file; do
    RELATIVE_PATH="${file#$SCENARIOS_DIR/}"

    # Check file is not empty
    if [ ! -s "$file" ]; then
        log_error "${RELATIVE_PATH} is empty"
        ((ERRORS++))
        continue
    fi

    # Check for markdown heading (# Title)
    if grep -q "^# " "$file"; then
        TITLE=$(grep -m1 "^# " "$file" | sed 's/^# //')
        log_success "${RELATIVE_PATH} has title: ${TITLE:0:40}..."
    else
        log_warn "${RELATIVE_PATH} missing markdown title (# heading)"
        ((WARNINGS++))
    fi

    # Check for example prompts section
    if grep -qi "prompt\|example\|workflow" "$file"; then
        : # Has prompt/example content
    else
        log_warn "${RELATIVE_PATH} may be missing prompt examples"
        ((WARNINGS++))
    fi

done < <(find "$SCENARIOS_DIR" -name "*.md" -type f -print0)

echo ""

# =============================================================================
# Platform Scenario Consistency
# =============================================================================
echo "Checking platform scenario consistency..."

# Each platform should have standard scenarios
EXPECTED_PLATFORM_SCENARIOS=("page" "search" "issue" "sre")

for platform in confluence jira splunk; do
    PLATFORM_DIR="${SCENARIOS_DIR}/${platform}"
    if [ -d "$PLATFORM_DIR" ]; then
        FILE_COUNT=$(find "$PLATFORM_DIR" -name "*.md" -type f | wc -l | tr -d ' ')
        if [ "$FILE_COUNT" -gt 0 ]; then
            log_success "${platform}/ has $FILE_COUNT scenario(s)"

            # List scenarios for verbose output
            if [ "${VERBOSE:-false}" = "true" ]; then
                find "$PLATFORM_DIR" -name "*.md" -type f | while read -r f; do
                    log_info "  - $(basename "$f" .md)"
                done
            fi
        else
            log_warn "${platform}/ has no scenario files"
            ((WARNINGS++))
        fi
    fi
done

echo ""

# =============================================================================
# Config Sync Check
# =============================================================================
echo "Checking config sync..."

# Verify cross-platform.js exists and is valid JavaScript
if [ -f "$CONFIG_FILE" ]; then
    if node -e "require('$CONFIG_FILE')" 2>/dev/null; then
        log_success "cross-platform.js loads without errors"
    else
        log_error "cross-platform.js has syntax errors"
        ((ERRORS++))
    fi
else
    log_error "cross-platform.js config not found"
    ((ERRORS++))
fi

echo ""

# =============================================================================
# Summary
# =============================================================================
TOTAL_SCENARIOS=$(find "$SCENARIOS_DIR" -name "*.md" -type f | wc -l | tr -d ' ')
echo "----------------------------------------"
echo "Total scenario files: $TOTAL_SCENARIOS"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    log_success "All scenario validations passed"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    log_warn "$WARNINGS warning(s), but no errors"
    exit 0
else
    log_error "$ERRORS error(s), $WARNINGS warning(s)"
    exit 1
fi
