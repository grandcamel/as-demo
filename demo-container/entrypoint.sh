#!/bin/bash
# =============================================================================
# AS-Demo Container Entrypoint
# =============================================================================
# Combined demo for Confluence, JIRA, and Splunk Assistant Skills.
# Displays welcome message, verifies connections, and starts session timer.
# =============================================================================

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Session timeout (default: 60 minutes)
SESSION_TIMEOUT_MINUTES="${SESSION_TIMEOUT_MINUTES:-60}"
SESSION_TIMEOUT_SECONDS=$((SESSION_TIMEOUT_MINUTES * 60))

# Parse enabled platforms (default: all)
ENABLED_PLATFORMS="${ENABLED_PLATFORMS:-confluence,jira,splunk}"

# =============================================================================
# Restore pre-installed home directory content for read-only filesystem
# When container runs with --tmpfs /home/devuser, this restores Claude config
# =============================================================================
if [ -d /opt/devuser-home ] && [ ! -f /home/devuser/.restored ]; then
    cp -a /opt/devuser-home/. /home/devuser/
    touch /home/devuser/.restored
fi

# Setup Claude authentication
# OAuth token requires .claude.json with hasCompletedOnboarding and bypassPermissionsModeAccepted
if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
    mkdir -p /home/devuser/.claude
    CLAUDE_JSON="/home/devuser/.claude/.claude.json"
    if [ -f "$CLAUDE_JSON" ]; then
        # Merge settings into existing file
        jq '. + {hasCompletedOnboarding: true, bypassPermissionsModeAccepted: true}' "$CLAUDE_JSON" > "${CLAUDE_JSON}.tmp" && mv "${CLAUDE_JSON}.tmp" "$CLAUDE_JSON"
    else
        # Create new file
        echo '{"hasCompletedOnboarding": true, "bypassPermissionsModeAccepted": true}' > "$CLAUDE_JSON"
    fi
    chmod 600 "$CLAUDE_JSON"
fi

# Display welcome message
clear
cat /etc/motd

# Verify Claude credentials
echo -e "${CYAN}Checking connections...${NC}"

if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
    echo -e "  ${GREEN}✓${NC} Claude OAuth token configured"
elif [ -n "${ANTHROPIC_API_KEY:-}" ]; then
    echo -e "  ${GREEN}✓${NC} Claude API key configured"
else
    echo -e "  ${YELLOW}⚠${NC} No Claude credentials (set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY)"
fi

# Verify Confluence connection
if [[ "$ENABLED_PLATFORMS" == *"confluence"* ]]; then
    if [ -n "$CONFLUENCE_API_TOKEN" ] && [ -n "$CONFLUENCE_EMAIL" ] && [ -n "$CONFLUENCE_SITE_URL" ]; then
        echo -e "  ${GREEN}✓${NC} Confluence credentials configured"
        if curl -sf -u "${CONFLUENCE_EMAIL}:${CONFLUENCE_API_TOKEN}" \
            "${CONFLUENCE_SITE_URL}/wiki/api/v2/spaces?limit=1" > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓${NC} Connected to Confluence ($(echo $CONFLUENCE_SITE_URL | sed 's|https://||'))"
        else
            echo -e "  ${YELLOW}⚠${NC} Confluence connection test failed"
        fi
    else
        echo -e "  ${YELLOW}⚠${NC} Confluence credentials not configured"
    fi
fi

# Verify JIRA connection
if [[ "$ENABLED_PLATFORMS" == *"jira"* ]]; then
    if [ -n "$JIRA_API_TOKEN" ] && [ -n "$JIRA_EMAIL" ] && [ -n "$JIRA_SITE_URL" ]; then
        echo -e "  ${GREEN}✓${NC} JIRA credentials configured"
        if curl -sf -u "${JIRA_EMAIL}:${JIRA_API_TOKEN}" \
            "${JIRA_SITE_URL}/rest/api/3/myself" > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓${NC} Connected to JIRA ($(echo $JIRA_SITE_URL | sed 's|https://||'))"
        else
            echo -e "  ${YELLOW}⚠${NC} JIRA connection test failed"
        fi
    else
        echo -e "  ${YELLOW}⚠${NC} JIRA credentials not configured"
    fi
fi

# Verify Splunk connection
if [[ "$ENABLED_PLATFORMS" == *"splunk"* ]]; then
    if [ -n "$SPLUNK_URL" ] && [ -n "$SPLUNK_USERNAME" ] && [ -n "$SPLUNK_PASSWORD" ]; then
        echo -e "  ${GREEN}✓${NC} Splunk credentials configured"
        if curl -sf -k -u "${SPLUNK_USERNAME}:${SPLUNK_PASSWORD}" \
            "${SPLUNK_URL}/services/server/info" > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓${NC} Connected to Splunk"
        else
            echo -e "  ${YELLOW}⚠${NC} Splunk connection test failed"
        fi
    else
        echo -e "  ${YELLOW}⚠${NC} Splunk credentials not configured"
    fi
fi

echo ""
echo -e "${CYAN}Session Info:${NC}"
echo -e "  Duration:  ${SESSION_TIMEOUT_MINUTES} minutes"
echo -e "  Started:   $(date '+%H:%M:%S %Z')"
echo -e "  Platforms: ${ENABLED_PLATFORMS}"
echo ""

# Start session timer in background
(
    # Warning at 5 minutes remaining
    warning_time=$((SESSION_TIMEOUT_SECONDS - 300))
    if [ $warning_time -gt 0 ]; then
        sleep $warning_time
        echo ""
        echo -e "${YELLOW}╔══════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${YELLOW}║  ⏰ 5 MINUTES REMAINING - Your session will end soon          ║${NC}"
        echo -e "${YELLOW}╚══════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        sleep 300
    else
        sleep $SESSION_TIMEOUT_SECONDS
    fi

    # Session timeout
    echo ""
    echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ⏱️  SESSION TIMEOUT - Your 1-hour demo has ended             ║${NC}"
    echo -e "${RED}║                                                               ║${NC}"
    echo -e "${RED}║  Thank you for trying AS-Demo!                                ║${NC}"
    echo -e "${RED}║  Visit: github.com/grandcamel/as-demo                         ║${NC}"
    echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Give user a moment to see the message, then exit
    sleep 5
    kill -TERM $$ 2>/dev/null
) &

# Trap to clean up timer on exit
cleanup() {
    # Kill all background jobs
    jobs -p | xargs -r kill 2>/dev/null
}
trap cleanup EXIT

# Display pre-installed CLI versions (installed at image build time for read-only filesystem)
echo -e "${CYAN}Installing Assistant Skills CLIs...${NC}"

if [[ "$ENABLED_PLATFORMS" == *"confluence"* ]]; then
    CLI_VERSION=$(pip show confluence-as 2>/dev/null | grep Version | cut -d' ' -f2)
    if [ -n "$CLI_VERSION" ]; then
        echo -e "  ${GREEN}✓${NC} confluence CLI v${CLI_VERSION}"
    else
        echo -e "  ${YELLOW}⚠${NC} Confluence CLI not available"
    fi
fi

if [[ "$ENABLED_PLATFORMS" == *"jira"* ]]; then
    CLI_VERSION=$(pip show jira-as 2>/dev/null | grep Version | cut -d' ' -f2)
    if [ -n "$CLI_VERSION" ]; then
        echo -e "  ${GREEN}✓${NC} jira CLI v${CLI_VERSION}"
    else
        echo -e "  ${YELLOW}⚠${NC} JIRA CLI not available"
    fi
fi

if [[ "$ENABLED_PLATFORMS" == *"splunk"* ]]; then
    CLI_VERSION=$(pip show splunk-as 2>/dev/null | grep Version | cut -d' ' -f2)
    if [ -n "$CLI_VERSION" ]; then
        echo -e "  ${GREEN}✓${NC} splunk CLI v${CLI_VERSION}"
    else
        echo -e "  ${YELLOW}⚠${NC} Splunk CLI not available"
    fi
fi

# Display pre-installed plugin versions (installed at image build time)
echo -e "${CYAN}Installing Claude plugins...${NC}"

if [[ "$ENABLED_PLATFORMS" == *"confluence"* ]]; then
    INSTALLED_VERSION=$(cat ~/.claude/plugins/cache/*/confluence-assistant-skills/*/.claude-plugin/plugin.json 2>/dev/null | jq -r '.version' | head -1)
    if [ -n "$INSTALLED_VERSION" ]; then
        echo -e "  ${GREEN}✓${NC} Confluence plugin v${INSTALLED_VERSION}"
    else
        echo -e "  ${YELLOW}⚠${NC} Confluence plugin failed"
    fi
fi

if [[ "$ENABLED_PLATFORMS" == *"jira"* ]]; then
    INSTALLED_VERSION=$(cat ~/.claude/plugins/cache/*/jira-assistant-skills/*/.claude-plugin/plugin.json 2>/dev/null | jq -r '.version' | head -1)
    if [ -n "$INSTALLED_VERSION" ]; then
        echo -e "  ${GREEN}✓${NC} JIRA plugin v${INSTALLED_VERSION}"
    else
        echo -e "  ${YELLOW}⚠${NC} JIRA plugin failed"
    fi
fi

if [[ "$ENABLED_PLATFORMS" == *"splunk"* ]]; then
    INSTALLED_VERSION=$(cat ~/.claude/plugins/cache/*/splunk-assistant-skills/*/.claude-plugin/plugin.json 2>/dev/null | jq -r '.version' | head -1)
    if [ -n "$INSTALLED_VERSION" ]; then
        echo -e "  ${GREEN}✓${NC} Splunk plugin v${INSTALLED_VERSION}"
    else
        echo -e "  ${YELLOW}⚠${NC} Splunk plugin failed"
    fi
fi

echo ""
echo -e "${YELLOW}Press Enter to continue...${NC}"
read -r

# =============================================================================
# Interactive Startup Menu
# =============================================================================

show_menu() {
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║              AS-Demo: Combined Assistant Skills               ║${NC}"
    echo -e "${CYAN}╠══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║${NC}  ${GREEN}1)${NC} ${PURPLE}Cross-Platform Scenarios${NC} (Confluence + JIRA + Splunk)    ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  ${GREEN}2)${NC} ${BLUE}Confluence Scenarios${NC}                                     ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  ${GREEN}3)${NC} ${BLUE}JIRA Scenarios${NC}                                           ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  ${GREEN}4)${NC} ${BLUE}Splunk Scenarios${NC}                                         ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  ${GREEN}5)${NC} Start Claude (interactive mode)                          ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  ${GREEN}6)${NC} Start Bash Shell                                         ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  ${GREEN}q)${NC} Exit                                                     ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

show_cross_platform_menu() {
    echo ""
    echo -e "${PURPLE}Cross-Platform Scenarios:${NC}"
    echo -e "  ${GREEN}1)${NC} Incident Response  - Splunk alerts -> Confluence runbook -> JIRA ticket"
    echo -e "  ${GREEN}2)${NC} SRE On-Call        - Alert triage with KB and task creation"
    echo -e "  ${GREEN}3)${NC} Change Management  - JIRA change request -> Confluence docs -> Splunk monitoring"
    echo -e "  ${GREEN}4)${NC} Knowledge Sync     - JIRA resolved issues -> Confluence release notes"
    echo -e "  ${GREEN}b)${NC} Back to main menu"
    echo ""
}

show_confluence_menu() {
    echo ""
    echo -e "${BLUE}Confluence Scenarios:${NC}"
    echo -e "  ${GREEN}1)${NC} Page Management    - Create, read, update, delete pages"
    echo -e "  ${GREEN}2)${NC} Search & CQL       - Find content, build queries"
    echo -e "  ${GREEN}3)${NC} Space Management   - Create and manage spaces"
    echo -e "  ${GREEN}4)${NC} Content Hierarchy  - Navigate page trees"
    echo -e "  ${GREEN}b)${NC} Back to main menu"
    echo ""
}

show_jira_menu() {
    echo ""
    echo -e "${BLUE}JIRA Scenarios:${NC}"
    echo -e "  ${GREEN}1)${NC} Issue Management   - Create, update, transition issues"
    echo -e "  ${GREEN}2)${NC} Search & JQL       - Find issues with queries"
    echo -e "  ${GREEN}3)${NC} Agile & Sprints    - Sprint management, backlog"
    echo -e "  ${GREEN}4)${NC} Service Desk       - JSM workflows"
    echo -e "  ${GREEN}b)${NC} Back to main menu"
    echo ""
}

show_splunk_menu() {
    echo ""
    echo -e "${BLUE}Splunk Scenarios:${NC}"
    echo -e "  ${GREEN}1)${NC} DevOps Engineer    - Deployment monitoring, CI/CD"
    echo -e "  ${GREEN}2)${NC} SRE / On-Call      - Alert management, incident response"
    echo -e "  ${GREEN}3)${NC} Support Engineer   - Log analysis, troubleshooting"
    echo -e "  ${GREEN}4)${NC} Search Basics      - SPL queries and visualizations"
    echo -e "  ${GREEN}b)${NC} Back to main menu"
    echo ""
}

view_scenario() {
    local file="$1"
    if [ -f "$file" ]; then
        clear
        # Use glow for beautiful markdown rendering
        glow -p "$file"
    else
        echo -e "${RED}Scenario file not found: $file${NC}"
        sleep 2
    fi
}

cross_platform_loop() {
    while true; do
        clear
        cat /etc/motd
        show_cross_platform_menu
        read -rp "Select scenario: " choice
        case $choice in
            1) view_scenario "/workspace/scenarios/cross-platform/incident-response.md" ;;
            2) view_scenario "/workspace/scenarios/cross-platform/sre-oncall.md" ;;
            3) view_scenario "/workspace/scenarios/cross-platform/change-management.md" ;;
            4) view_scenario "/workspace/scenarios/cross-platform/knowledge-sync.md" ;;
            b|B) return ;;
            *) echo -e "${YELLOW}Invalid option${NC}"; sleep 1 ;;
        esac
    done
}

confluence_loop() {
    while true; do
        clear
        cat /etc/motd
        show_confluence_menu
        read -rp "Select scenario: " choice
        case $choice in
            1) view_scenario "/workspace/scenarios/confluence/page.md" ;;
            2) view_scenario "/workspace/scenarios/confluence/search.md" ;;
            3) view_scenario "/workspace/scenarios/confluence/space.md" ;;
            4) view_scenario "/workspace/scenarios/confluence/hierarchy.md" ;;
            b|B) return ;;
            *) echo -e "${YELLOW}Invalid option${NC}"; sleep 1 ;;
        esac
    done
}

jira_loop() {
    while true; do
        clear
        cat /etc/motd
        show_jira_menu
        read -rp "Select scenario: " choice
        case $choice in
            1) view_scenario "/workspace/scenarios/jira/issue.md" ;;
            2) view_scenario "/workspace/scenarios/jira/search.md" ;;
            3) view_scenario "/workspace/scenarios/jira/agile.md" ;;
            4) view_scenario "/workspace/scenarios/jira/jsm.md" ;;
            b|B) return ;;
            *) echo -e "${YELLOW}Invalid option${NC}"; sleep 1 ;;
        esac
    done
}

splunk_loop() {
    while true; do
        clear
        cat /etc/motd
        show_splunk_menu
        read -rp "Select scenario: " choice
        case $choice in
            1) view_scenario "/workspace/scenarios/splunk/devops.md" ;;
            2) view_scenario "/workspace/scenarios/splunk/sre.md" ;;
            3) view_scenario "/workspace/scenarios/splunk/support.md" ;;
            4) view_scenario "/workspace/scenarios/splunk/search.md" ;;
            b|B) return ;;
            *) echo -e "${YELLOW}Invalid option${NC}"; sleep 1 ;;
        esac
    done
}

main_menu_loop() {
    while true; do
        clear
        cat /etc/motd
        show_menu
        read -rp "Select option: " choice
        case $choice in
            1)
                cross_platform_loop
                ;;
            2)
                confluence_loop
                ;;
            3)
                jira_loop
                ;;
            4)
                splunk_loop
                ;;
            5)
                clear
                echo -e "${GREEN}Starting Claude in interactive mode...${NC}"
                echo -e "${YELLOW}Tip: Type 'exit' or press Ctrl+C to return to menu${NC}"
                echo ""
                claude --dangerously-skip-permissions "Hello! I have access to Confluence, JIRA, and Splunk. What would you like to do?" || true
                ;;
            6)
                clear
                echo -e "${GREEN}Starting Bash shell...${NC}"
                echo -e "${YELLOW}Tip: Type 'exit' to return to menu${NC}"
                echo -e "${YELLOW}     Run 'claude --dangerously-skip-permissions' to start Claude${NC}"
                echo ""
                /bin/bash -l || true
                ;;
            q|Q)
                echo -e "${GREEN}Goodbye! Thanks for trying AS-Demo.${NC}"
                exit 0
                ;;
            *)
                echo -e "${YELLOW}Invalid option${NC}"
                sleep 1
                ;;
        esac
    done
}

# Start the interactive menu
main_menu_loop
