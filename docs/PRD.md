# PRD: AS-Demo - Combined Assistant Skills Demo Platform

## Status: Implemented

**Implementation Date:** January 2026
**Location:** `/Users/jasonkrueger/IdeaProjects/as-demo/`

---

## Executive Summary

**as-demo** is a unified demo platform that combines three existing Assistant Skills demos (confluence-demo, jira-demo, splunk-demo) into a single deployment. The key value proposition is enabling **cross-platform scenarios** that leverage multiple services simultaneously - demonstrating real-world automation workflows like incident response, change management, and SRE on-call operations.

### Goals
1. **Cross-Platform Workflows** - Demonstrate automation spanning Confluence, JIRA, and Splunk
2. **Single Deployment** - Reduced operational overhead with unified infrastructure
3. **Consistent UX** - Same queue/session management across all services
4. **Realistic Use Cases** - Incident response, change management, SRE workflows

### Non-Goals
- Replacing individual demos (they remain for single-platform focused demos)
- Building new plugin functionality (uses existing plugins)
- Supporting additional platforms beyond the initial three

---

## Implemented Architecture

### Directory Structure

```
as-demo/
├── docker-compose.yml              # Production (profiles for Splunk)
├── docker-compose.dev.yml          # Development overrides
├── Makefile                        # Build/test/deploy targets
├── CLAUDE.md                       # Project documentation
├── package.json                    # Root workspace package.json
├── .gitignore
│
├── queue-manager/                  # Unified queue manager
│   ├── package.json                # Uses @demo-platform/queue-manager-core
│   ├── server.js                   # Main server
│   ├── instrumentation.js          # OpenTelemetry bootstrap
│   ├── config/
│   │   ├── index.js                # Multi-platform config loader
│   │   ├── metrics.js              # OpenTelemetry metrics
│   │   ├── cross-platform.js       # Cross-platform scenarios
│   │   └── platforms/
│   │       ├── confluence.js       # Confluence scenarios & credentials
│   │       ├── jira.js             # JIRA scenarios & credentials
│   │       └── splunk.js           # Splunk scenarios & credentials
│   ├── services/
│   │   ├── state.js                # Shared state management
│   │   ├── session.js              # Session lifecycle (multi-platform)
│   │   ├── queue.js                # Queue management
│   │   └── invite.js               # Invite validation
│   ├── routes/
│   │   ├── health.js               # Health + platform status
│   │   ├── session.js              # Session/cookie management
│   │   └── scenarios.js            # Scenario serving
│   ├── handlers/
│   │   └── websocket.js            # WebSocket handlers
│   ├── templates/
│   │   └── scenario.html           # Scenario page template
│   └── static/
│       └── scenario.css            # Scenario styles
│
├── demo-container/                 # Unified container with ALL plugins
│   ├── Dockerfile                  # Multi-plugin installation
│   ├── entrypoint.sh               # Platform-aware menu
│   ├── settings.json               # Claude bypass permissions
│   ├── motd                        # Welcome message
│   └── scenarios/
│       ├── cross-platform/         # Cross-platform scenarios
│       │   ├── incident-response.md
│       │   ├── sre-oncall.md
│       │   ├── change-management.md
│       │   └── knowledge-sync.md
│       ├── confluence/             # Confluence scenarios
│       │   ├── page.md
│       │   ├── search.md
│       │   ├── space.md
│       │   └── hierarchy.md
│       ├── jira/                   # JIRA scenarios
│       │   ├── issue.md
│       │   ├── search.md
│       │   ├── agile.md
│       │   └── jsm.md
│       └── splunk/                 # Splunk scenarios
│           ├── devops.md
│           ├── sre.md
│           ├── support.md
│           └── search.md
│
├── landing-page/                   # Unified landing page
│   ├── index.html                  # Platform selector + scenario browser
│   └── styles.css                  # Responsive styles
│
├── nginx/                          # Reverse proxy
│   ├── nginx.conf                  # Main config
│   ├── demo.conf                   # Production server block
│   ├── dev.conf                    # Development server block
│   └── locations.include           # Shared location blocks
│
├── observability/                  # Grafana/LGTM config
│   ├── grafana-dashboards.yaml     # Dashboard provisioning
│   ├── promtail-config.yaml        # Log collection
│   └── dashboards/
│       └── demo-home.json          # Placeholder dashboard
│
├── splunk/                         # Splunk-specific (profile: full)
│   ├── apps/demo_app/              # Splunk app (to be copied)
│   ├── log-generator/              # Log generator (to be copied)
│   └── seed-data/                  # Seed data loader (to be copied)
│
├── scripts/                        # Seed/cleanup scripts (to be added)
│
└── secrets/
    └── .env.example                # Environment template
```

### Docker Compose Services

```yaml
services:
  # Core (always running)
  nginx:           # Reverse proxy (80, 443 / 8080 dev)
  queue-manager:   # WebSocket server (3000)
  redis:           # State store (6379)
  lgtm:            # Grafana + Loki + Tempo (3001 dev)
  redis-exporter:  # Redis metrics
  promtail:        # Log collection

  # Splunk (profile: "splunk" or "full")
  splunk:          # Splunk Enterprise (8000, 8089)
  log-generator:   # Demo log generation
  seed-loader:     # Initial data seeding
```

### Deployment Modes

| Mode | Command | Services |
|------|---------|----------|
| Atlassian Only | `make dev` | nginx, queue-manager, redis, lgtm |
| Full (with Splunk) | `make dev-full` | + splunk, log-generator, seed-loader |
| Production | `make prod` or `make prod-full` | Same, without dev overrides |

---

## Cross-Platform Scenarios (Implemented)

### 1. Incident Response (Splunk → Confluence → JIRA)

**File:** `scenarios/cross-platform/incident-response.md`

**Flow:**
1. Query Splunk for error patterns (500 errors in payment service)
2. Find relevant runbook in Confluence (payment service troubleshooting)
3. Create P1 incident ticket in JIRA with error details and runbook link

### 2. SRE On-Call (Splunk → Confluence → JIRA)

**File:** `scenarios/cross-platform/sre-oncall.md`

**Flow:**
1. View critical alerts from Splunk
2. Check Confluence knowledge base for known issues
3. Create follow-up task in JIRA for monitoring improvements

### 3. Change Management (JIRA → Confluence → Splunk)

**File:** `scenarios/cross-platform/change-management.md`

**Flow:**
1. Create change request in JIRA for production deployment
2. Update Confluence deployment log with change details
3. Set up Splunk monitoring for deployment errors

### 4. Knowledge Sync (JIRA → Confluence)

**File:** `scenarios/cross-platform/knowledge-sync.md`

**Flow:**
1. Find all resolved bugs from last sprint in JIRA
2. Create release notes page in Confluence with fix summaries

---

## Multi-Platform Configuration (Implemented)

### Config Loader Pattern

```javascript
// config/index.js
const ENABLED_PLATFORMS = (process.env.ENABLED_PLATFORMS || 'confluence,jira,splunk')
  .split(',').map(p => p.trim().toLowerCase());

const platforms = {};
if (ENABLED_PLATFORMS.includes('confluence')) {
  platforms.confluence = require('./platforms/confluence');
}
if (ENABLED_PLATFORMS.includes('jira')) {
  platforms.jira = require('./platforms/jira');
}
if (ENABLED_PLATFORMS.includes('splunk')) {
  platforms.splunk = require('./platforms/splunk');
}
```

### Session Environment (Multi-Platform)

```javascript
// services/session.js
function createSessionEnvFile(sessionId) {
  const envVars = config.getAllEnvVars(); // Combines all platform envs
  return coreCreateEnvFile(sessionId, envVars, { ... });
}
```

### Platform Config Pattern

```javascript
// config/platforms/confluence.js
module.exports = {
  API_TOKEN: process.env.CONFLUENCE_API_TOKEN || '',
  EMAIL: process.env.CONFLUENCE_EMAIL || '',
  SITE_URL: process.env.CONFLUENCE_SITE_URL || '',

  SCENARIO_NAMES: {
    'page': { file: 'confluence/page.md', title: 'Page Management', icon: '📝' },
    // ...
  },

  getEnvVars() {
    return {
      CONFLUENCE_API_TOKEN: this.API_TOKEN,
      CONFLUENCE_EMAIL: this.EMAIL,
      CONFLUENCE_SITE_URL: this.SITE_URL,
      CONFLUENCE_PROFILE: 'demo'
    };
  },

  isConfigured() {
    return !!(this.API_TOKEN && this.EMAIL && this.SITE_URL);
  }
};
```

---

## Environment Variables

```bash
# Enabled platforms
ENABLED_PLATFORMS=confluence,jira,splunk

# Session management
SESSION_TIMEOUT_MINUTES=60
MAX_QUEUE_SIZE=10
SESSION_SECRET=your-secure-random-string

# Claude Authentication
CLAUDE_CODE_OAUTH_TOKEN=...

# Confluence
CONFLUENCE_API_TOKEN=your-token
CONFLUENCE_EMAIL=your-email@example.com
CONFLUENCE_SITE_URL=https://your-site.atlassian.net
DEMO_SPACE_KEY=CDEMO

# JIRA
JIRA_API_TOKEN=your-token
JIRA_EMAIL=your-email@example.com
JIRA_SITE_URL=https://your-site.atlassian.net
DEMO_PROJECT_KEY=DEMO

# Splunk
SPLUNK_URL=https://splunk:8089
SPLUNK_USERNAME=admin
SPLUNK_PASSWORD=DemoPass123!
SPLUNK_HEC_TOKEN=demo-hec-token-12345
```

---

## Remaining Items

### To Copy from Existing Demos

1. **From confluence-demo:**
   - `demo-container/autoplay.sh`
   - `demo-container/skill-test.py`
   - `demo-container/patches/` (mock persistence)
   - `scripts/seed_demo_data.py` → `scripts/seed_confluence_sandbox.py`
   - `scripts/cleanup_demo_sandbox.py` → `scripts/cleanup_confluence_sandbox.py`

2. **From jira-demo:**
   - Seed/cleanup scripts
   - Additional scenario .prompts files

3. **From splunk-demo:**
   - `splunk/apps/demo_app/`
   - `splunk/log-generator/`
   - `splunk/seed-data/`
   - Seed scripts

### To Create

1. **Grafana Dashboards:**
   - `observability/dashboards/demo-home.json` (actual dashboard)
   - Queue metrics dashboard
   - Session analytics dashboard

2. **Test Infrastructure:**
   - `.prompts` files for automated testing
   - Mock API fixtures for each platform

3. **CI/CD:**
   - GitHub Actions workflow
   - Container build pipeline

---

## Verification Checklist

### Queue Manager
- [ ] `npm install` succeeds
- [ ] `node -e "require('./config')"` loads without error
- [ ] All three platform configs load conditionally
- [ ] Cross-platform scenarios filter by enabled platforms

### Demo Container
- [ ] `docker build -t as-demo-container:latest ./demo-container` succeeds
- [ ] All three plugins install in container
- [ ] Entrypoint menu shows all platform options
- [ ] Credentials passed correctly via env-file

### Docker Compose
- [ ] `make dev` starts Atlassian-only stack
- [ ] `make dev-full` starts full stack with Splunk
- [ ] Health endpoints return platform status
- [ ] WebSocket connections work

### Landing Page
- [ ] Platform badges show configured platforms
- [ ] Scenario grid shows all available scenarios
- [ ] Queue join/leave works
- [ ] Session starts correctly

---

## Success Criteria

1. **All three plugins install and function** in the unified demo container
2. **Cross-platform scenarios execute successfully** - Claude can seamlessly use Splunk, Confluence, and JIRA skills in sequence
3. **Deployment modes work** - Atlassian-only and full modes
4. **Existing scenarios preserved** - All individual platform scenarios remain functional
5. **Queue manager handles multi-platform credentials** securely via env files

---

## Risks & Mitigations

| Risk | Mitigation | Status |
|------|------------|--------|
| Plugin conflicts in single container | Plugins use separate namespaces | To Test |
| Credential complexity | Unified env file with clear sections | Implemented |
| Splunk resource requirements (4GB) | Profile-based deployment | Implemented |
| Cross-platform test flakiness | Mock modes for each platform | To Implement |

---

## Timeline (Completed)

| Phase | Duration | Deliverable | Status |
|-------|----------|-------------|--------|
| 1. Repository Setup | Day 1 | Directory structure | ✅ Complete |
| 2. Queue Manager | Days 2-3 | Multi-platform queue manager | ✅ Complete |
| 3. Demo Container | Days 4-5 | Unified container with all plugins | ✅ Complete |
| 4. Infrastructure | Day 6 | Docker Compose, nginx | ✅ Complete |
| 5. Landing Page | Day 7 | Unified UI | ✅ Complete |
| 6. Scenarios | Days 8-9 | Platform + cross-platform scenarios | ✅ Complete |
| 7. Documentation | Day 10 | CLAUDE.md, Makefile | ✅ Complete |

**Total Implementation Time:** ~10 days as estimated

---

## Related Projects

| Project | Repository | Purpose |
|---------|------------|---------|
| confluence-demo | local | Standalone Confluence demo |
| jira-demo | local | Standalone JIRA demo |
| splunk-demo | local | Standalone Splunk demo |
| demo-platform-shared | local | Shared queue-manager-core library |
