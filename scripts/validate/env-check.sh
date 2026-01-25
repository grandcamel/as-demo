#!/bin/bash
# =============================================================================
# Environment Variable Validation
# Checks required environment variables for each platform
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${ENV_FILE:-${PROJECT_ROOT}/secrets/.env}"
CHECK_MODE="${CHECK_MODE:-local}"  # local, container, or both

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
# Required Variables by Category
# =============================================================================

# Core required variables (always needed)
CORE_VARS=(
    "SESSION_SECRET:Session token signing key"
)

# Platform-specific variables
CONFLUENCE_VARS=(
    "CONFLUENCE_API_TOKEN:Confluence API authentication token"
    "CONFLUENCE_EMAIL:Confluence account email"
    "CONFLUENCE_SITE_URL:Confluence site URL (https://xxx.atlassian.net)"
)

JIRA_VARS=(
    "JIRA_API_TOKEN:JIRA API authentication token"
    "JIRA_EMAIL:JIRA account email"
    "JIRA_SITE_URL:JIRA site URL (https://xxx.atlassian.net)"
)

SPLUNK_VARS=(
    "SPLUNK_URL:Splunk REST API URL"
    "SPLUNK_USERNAME:Splunk admin username"
    "SPLUNK_PASSWORD:Splunk admin password"
)

# Optional but recommended
OPTIONAL_VARS=(
    "CLAUDE_CODE_OAUTH_TOKEN:Claude Code authentication"
    "ENABLED_PLATFORMS:Comma-separated list of enabled platforms"
    "SESSION_TIMEOUT_MINUTES:Session timeout (default: 60)"
    "MAX_QUEUE_SIZE:Maximum queue size (default: 10)"
)

# =============================================================================
# Helper Functions
# =============================================================================

# -----------------------------------------------------------------------------
# Email format validation
# -----------------------------------------------------------------------------
validate_email() {
    local var_name="$1"
    local value="${!var_name:-}"

    if [ -z "$value" ]; then
        return 0  # Skip if not set (already reported)
    fi

    if [[ "$value" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
        log_success "$var_name has valid email format"
    else
        log_error "$var_name has invalid email format: $value"
        ((ERRORS++))
    fi
}

# -----------------------------------------------------------------------------
# Atlassian URL format validation
# -----------------------------------------------------------------------------
validate_atlassian_url() {
    local var_name="$1"
    local value="${!var_name:-}"

    if [ -z "$value" ]; then
        return 0
    fi

    if [[ "$value" =~ \.atlassian\.net/?$ ]]; then
        log_success "$var_name is valid Atlassian URL"
    else
        log_warn "$var_name may not be an Atlassian Cloud URL: $value"
        ((WARNINGS++))
    fi
}

# -----------------------------------------------------------------------------
# SESSION_SECRET strength validation
# -----------------------------------------------------------------------------
validate_session_secret() {
    local value="${SESSION_SECRET:-}"

    if [ -z "$value" ]; then
        return 0
    fi

    if [ ${#value} -lt 32 ]; then
        log_error "SESSION_SECRET too short (${#value} chars, need 32+)"
        ((ERRORS++))
        return
    fi

    local weak_patterns=("change-me" "password" "secret123" "test" "example" "default")
    local lower_value=$(echo "$value" | tr '[:upper:]' '[:lower:]')
    for pattern in "${weak_patterns[@]}"; do
        if [[ "$lower_value" == *"$pattern"* ]]; then
            log_warn "SESSION_SECRET contains weak pattern: $pattern"
            ((WARNINGS++))
            return
        fi
    done

    log_success "SESSION_SECRET strength OK (${#value} chars)"
}

# -----------------------------------------------------------------------------
# Placeholder value detection
# -----------------------------------------------------------------------------
detect_placeholder() {
    local var_name="$1"
    local value="${!var_name:-}"

    if [ -z "$value" ]; then
        return 0
    fi

    local placeholders=("your-" "example" "change-me" "xxx" "TODO" "CHANGEME" "placeholder")
    local lower_value=$(echo "$value" | tr '[:upper:]' '[:lower:]')
    for placeholder in "${placeholders[@]}"; do
        if [[ "$lower_value" == *"$placeholder"* ]]; then
            log_error "$var_name appears to be a placeholder value"
            ((ERRORS++))
            return 1
        fi
    done
    return 0
}

# -----------------------------------------------------------------------------
# Numeric range validation
# -----------------------------------------------------------------------------
validate_numeric_range() {
    local var_name="$1"
    local min="$2"
    local max="$3"
    local value="${!var_name:-}"

    if [ -z "$value" ]; then
        return 0
    fi

    if ! [[ "$value" =~ ^[0-9]+$ ]]; then
        log_error "$var_name is not a valid number: $value"
        ((ERRORS++))
        return
    fi

    if [ "$value" -lt "$min" ] || [ "$value" -gt "$max" ]; then
        log_warn "$var_name=$value is outside recommended range ($min-$max)"
        ((WARNINGS++))
    else
        log_success "$var_name=$value is within valid range"
    fi
}

check_var() {
    local var_name="$1"
    local description="$2"
    local required="${3:-true}"
    local value=""

    # Check local environment first
    value="${!var_name:-}"

    # If not in environment, check .env file
    if [ -z "$value" ] && [ -f "$ENV_FILE" ]; then
        value=$(grep "^${var_name}=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'") || value=""
    fi

    if [ -n "$value" ]; then
        # Mask sensitive values
        if [[ "$var_name" =~ (TOKEN|PASSWORD|SECRET) ]]; then
            MASKED="${value:0:4}****${value: -4}"
            log_success "$var_name is set ($MASKED)"
        else
            log_success "$var_name is set ($value)"
        fi
        return 0
    else
        if [ "$required" = "true" ]; then
            log_error "$var_name not set - $description"
            return 1
        else
            log_warn "$var_name not set (optional) - $description"
            return 2
        fi
    fi
}

check_var_set() {
    local var_entry="$1"
    local required="${2:-true}"

    local var_name="${var_entry%%:*}"
    local description="${var_entry#*:}"

    check_var "$var_name" "$description" "$required"
    return $?
}

# =============================================================================
# Load .env file if exists
# =============================================================================
echo "Environment check mode: $CHECK_MODE"

if [ -f "$ENV_FILE" ]; then
    log_success ".env file found at $ENV_FILE"
    # Source the env file for local checks (in subshell to not pollute)
    set -a
    source "$ENV_FILE" 2>/dev/null || true
    set +a
else
    log_warn ".env file not found at $ENV_FILE"
    ((WARNINGS++))
fi

echo ""

# =============================================================================
# Core Variables
# =============================================================================
echo "Checking core variables..."

for var_entry in "${CORE_VARS[@]}"; do
    if ! check_var_set "$var_entry" "true"; then
        ((ERRORS++))
    fi
done

echo ""

# =============================================================================
# Determine Enabled Platforms
# =============================================================================
ENABLED_PLATFORMS="${ENABLED_PLATFORMS:-confluence,jira,splunk}"
echo "Enabled platforms: $ENABLED_PLATFORMS"
echo ""

# =============================================================================
# Platform-Specific Variables
# =============================================================================

# Confluence
if [[ "$ENABLED_PLATFORMS" == *"confluence"* ]]; then
    echo "Checking Confluence variables..."
    for var_entry in "${CONFLUENCE_VARS[@]}"; do
        if ! check_var_set "$var_entry" "true"; then
            ((ERRORS++))
        fi
    done
    echo ""
fi

# JIRA
if [[ "$ENABLED_PLATFORMS" == *"jira"* ]]; then
    echo "Checking JIRA variables..."
    for var_entry in "${JIRA_VARS[@]}"; do
        if ! check_var_set "$var_entry" "true"; then
            ((ERRORS++))
        fi
    done
    echo ""
fi

# Splunk
if [[ "$ENABLED_PLATFORMS" == *"splunk"* ]]; then
    echo "Checking Splunk variables..."
    for var_entry in "${SPLUNK_VARS[@]}"; do
        if ! check_var_set "$var_entry" "true"; then
            ((ERRORS++))
        fi
    done
    echo ""
fi

# =============================================================================
# Optional Variables
# =============================================================================
echo "Checking optional variables..."

for var_entry in "${OPTIONAL_VARS[@]}"; do
    result=0
    check_var_set "$var_entry" "false" || result=$?
    if [ $result -eq 2 ]; then
        ((WARNINGS++))
    fi
done

echo ""

# =============================================================================
# URL Format Validation
# =============================================================================
echo "Validating URL formats..."

validate_url() {
    local var_name="$1"
    local value="${!var_name:-}"

    if [ -z "$value" ]; then
        return 0  # Skip if not set (already reported above)
    fi

    if [[ "$value" =~ ^https?:// ]]; then
        log_success "$var_name has valid URL format"
    else
        log_error "$var_name has invalid URL format: $value"
        ((ERRORS++))
    fi
}

for url_var in CONFLUENCE_SITE_URL JIRA_SITE_URL SPLUNK_URL; do
    validate_url "$url_var"
done

echo ""

# =============================================================================
# Email Format Validation
# =============================================================================
echo "Validating email formats..."

for email_var in CONFLUENCE_EMAIL JIRA_EMAIL; do
    validate_email "$email_var"
done

echo ""

# =============================================================================
# Atlassian URL Validation
# =============================================================================
echo "Validating Atlassian URLs..."

for atlassian_var in CONFLUENCE_SITE_URL JIRA_SITE_URL; do
    validate_atlassian_url "$atlassian_var"
done

echo ""

# =============================================================================
# SESSION_SECRET Strength Validation
# =============================================================================
echo "Validating SESSION_SECRET strength..."

validate_session_secret

echo ""

# =============================================================================
# Placeholder Value Detection
# =============================================================================
echo "Checking for placeholder values..."

# Check all required variables for placeholder patterns
PLACEHOLDER_CHECK_VARS=(
    "SESSION_SECRET"
    "CONFLUENCE_API_TOKEN"
    "CONFLUENCE_EMAIL"
    "CONFLUENCE_SITE_URL"
    "JIRA_API_TOKEN"
    "JIRA_EMAIL"
    "JIRA_SITE_URL"
    "SPLUNK_URL"
    "SPLUNK_USERNAME"
    "SPLUNK_PASSWORD"
)

for var in "${PLACEHOLDER_CHECK_VARS[@]}"; do
    detect_placeholder "$var"
done

echo ""

# =============================================================================
# Claude Authentication Check
# =============================================================================
echo "Checking Claude authentication..."

CLAUDE_OAUTH="${CLAUDE_CODE_OAUTH_TOKEN:-}"
ANTHROPIC_KEY="${ANTHROPIC_API_KEY:-}"

if [ -n "$CLAUDE_OAUTH" ] || [ -n "$ANTHROPIC_KEY" ]; then
    if [ -n "$CLAUDE_OAUTH" ]; then
        log_success "CLAUDE_CODE_OAUTH_TOKEN is set"
    fi
    if [ -n "$ANTHROPIC_KEY" ]; then
        log_success "ANTHROPIC_API_KEY is set"
    fi
else
    log_warn "No Claude authentication configured (set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY)"
    ((WARNINGS++))
fi

echo ""

# =============================================================================
# Numeric Range Validation
# =============================================================================
echo "Validating numeric configuration values..."

validate_numeric_range "SESSION_TIMEOUT_MINUTES" 5 480
validate_numeric_range "MAX_QUEUE_SIZE" 1 100

echo ""

# =============================================================================
# Container Environment Check (if requested)
# =============================================================================
if [ "$CHECK_MODE" = "container" ] || [ "$CHECK_MODE" = "both" ]; then
    echo "Checking container environment..."

    CONTAINER="${CONTAINER:-as-demo-queue-manager}"

    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
        # Check a few key variables inside the container
        for var in SESSION_SECRET ENABLED_PLATFORMS; do
            CONTAINER_VALUE=$(docker exec "$CONTAINER" printenv "$var" 2>/dev/null) || CONTAINER_VALUE=""
            if [ -n "$CONTAINER_VALUE" ]; then
                log_success "$var is set in container"
            else
                log_warn "$var not set in container"
                ((WARNINGS++))
            fi
        done
    else
        log_warn "Container $CONTAINER not running, skipping container checks"
        ((WARNINGS++))
    fi

    echo ""
fi

# =============================================================================
# Summary
# =============================================================================
echo "----------------------------------------"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    log_success "All environment validations passed"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    log_warn "$WARNINGS warning(s), but no errors"
    exit 0
else
    log_error "$ERRORS error(s), $WARNINGS warning(s)"
    exit 1
fi
