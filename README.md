# Assistant Skills Demo - Unified Platform

One-click live demo combining [Confluence](https://github.com/grandcamel/confluence-assistant-skills), [JIRA](https://github.com/grandcamel/jira-assistant-skills), and [Splunk](https://github.com/grandcamel/splunk-assistant-skills) Assistant Skills with cross-platform automation scenarios.

## Features

- **Web Terminal**: Browser-based Claude Code terminal via ttyd
- **Queue System**: Single-user sessions with waitlist
- **Invite Access**: Token-based URLs for controlled demo access
- **Multi-Platform**: All three Assistant Skills plugins pre-installed
- **Cross-Platform Scenarios**: Real-world workflows spanning multiple platforms
- **Platform Selector**: Choose individual platform demos or cross-platform workflows
- **Hands-free Mode**: Claude runs with `--permission-mode bypassPermissions` for seamless demos
- **Auto-cleanup**: All sandboxes reset between sessions
- **Full Observability**: Integrated Grafana dashboards with metrics, traces, and logs

## Cross-Platform Scenarios

| Scenario | Flow | Description |
|----------|------|-------------|
| **Incident Response** | Splunk → Confluence → JIRA | Detect anomaly, document findings, create ticket |
| **SRE On-Call** | Splunk → Confluence → JIRA | Alert triage, KB lookup, task creation |
| **Change Management** | JIRA → Confluence → Splunk | Track change, update docs, verify deployment |
| **Knowledge Sync** | JIRA → Confluence | Sync issue details to documentation |

## Architecture

```
Internet --> nginx (SSL) --> DigitalOcean Droplet
    |
    +-- /                 --> Landing Page (Platform Selector)
    +-- /terminal         --> ttyd WebSocket
    +-- /api              --> Queue Manager
    +-- /scenarios        --> Cross-Platform Guides
    +-- /grafana          --> Observability Dashboards
    |
    Docker
    +-- demo-container (claude-devcontainer + ALL plugins)
    +-- queue-manager (Node.js + OpenTelemetry)
    +-- redis (queue state)
    +-- lgtm (Grafana, Prometheus, Tempo, Loki)
    +-- splunk (optional, --profile full)
    +-- log-generator (optional, --profile full)
    +-- demo-telemetry-network (external, shared with standalone containers)
```

## Quick Start (Local Development)

```bash
# Clone the repository
git clone https://github.com/grandcamel/as-demo.git
cd as-demo

# Copy example secrets
cp secrets/.env.example secrets/.env

# Edit secrets/.env with your credentials (Confluence, JIRA, Splunk)

# Set Claude authentication (one of):
export CLAUDE_CODE_OAUTH_TOKEN="..."  # From 'claude setup-token'
# OR
export ANTHROPIC_API_KEY="..."        # API key

# On macOS, you can store the token in Keychain for auto-retrieval:
security add-generic-password -a "$USER" -s "CLAUDE_CODE_OAUTH_TOKEN" -w "<token>"

# Start services (Atlassian only - Confluence + JIRA)
make dev

# Start with Splunk (requires 4GB+ RAM)
make dev-full

# Open http://localhost:8080
```

## Deployment Modes

| Mode | Command | Services | Memory |
|------|---------|----------|--------|
| Atlassian Only | `make dev` | nginx, queue-manager, redis, lgtm | 2GB |
| Full (with Splunk) | `make dev-full` | + splunk, log-generator | 6GB+ |
| Production | `make deploy` | SSL enabled | 4GB+ |

## Configuration

### Environment Variables (secrets/.env)

```bash
# Enabled Platforms (comma-separated)
ENABLED_PLATFORMS=confluence,jira,splunk

# Session Configuration
SESSION_TIMEOUT_MINUTES=60
MAX_QUEUE_SIZE=10
SESSION_SECRET=your-secure-random-string

# Claude Authentication (one required)
CLAUDE_CODE_OAUTH_TOKEN=...
# OR
ANTHROPIC_API_KEY=sk-ant-...

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

# Splunk (optional)
SPLUNK_URL=https://splunk:8089
SPLUNK_USERNAME=admin
SPLUNK_PASSWORD=DemoPass123!
SPLUNK_HEC_TOKEN=demo-hec-token

# Domain (for production)
DOMAIN=demo.assistant-skills.dev
```

### Claude Authentication

**macOS Keychain** (recommended):
```bash
security add-generic-password -a "$USER" -s "CLAUDE_CODE_OAUTH_TOKEN" -w "<token>"
```

**Linux (secret-tool)**:
```bash
secret-tool store --label="Claude Code OAuth" service CLAUDE_CODE_OAUTH_TOKEN username "$USER"
```

## Development

### Directory Structure

```
as-demo/
├── docker-compose.yml          # Production orchestration
├── docker-compose.dev.yml      # Development overrides
├── Makefile                    # Dev/deploy/test targets
├── queue-manager/              # Node.js WebSocket server (multi-platform)
│   ├── config/
│   │   ├── platforms/          # Platform-specific configs
│   │   └── cross-platform.js   # Cross-platform scenarios
│   └── lib/                    # Embedded shared library
├── demo-container/             # Unified container with ALL plugins
│   └── scenarios/
│       ├── cross-platform/     # Cross-platform workflows
│       ├── confluence/         # Confluence scenarios
│       ├── jira/               # JIRA scenarios
│       └── splunk/             # Splunk scenarios
├── landing-page/               # Platform selector + scenario browser
├── nginx/                      # Reverse proxy configuration
├── splunk/                     # Splunk-specific services
├── scripts/                    # Seed/cleanup scripts
├── observability/              # LGTM stack
│   └── dashboards/             # 6 Grafana dashboards
└── secrets/                    # Credentials (.gitignored)
```

### Make Commands

```bash
# Development
make dev              # Start local (Atlassian only)
make dev-full         # Start local with Splunk
make down             # Stop all services
make logs             # View logs
make health           # Check service health

# Testing
make test-confluence SCENARIO=page        # Test Confluence skills
make test-jira SCENARIO=issue             # Test JIRA skills
make test-splunk SCENARIO=sre             # Test Splunk skills
make test-cross SCENARIO=incident-response # Test cross-platform
make test-all                             # Run all tests
make lint                                 # Run linters

# Sandbox Management
make seed-confluence      # Seed Confluence demo data
make seed-jira            # Seed JIRA demo data
make reset-confluence     # Reset Confluence sandbox
make reset-jira           # Reset JIRA sandbox

# Invite Management
make invite               # Generate invite (default 48h)
make invite EXPIRES=7d    # Custom expiration
make invite-local         # Generate for local dev
make invite-list          # List all invites
make invite-revoke TOKEN=abc123

# Interactive Shell
make shell-demo           # Interactive demo container
make shell-demo PROMPT="..." MODEL=sonnet
```

## Platform Scenarios

### Confluence

| Scenario | Description |
|----------|-------------|
| page | Page CRUD, content creation |
| search | CQL queries, text search |
| space | Space management |
| hierarchy | Page tree navigation |

### JIRA

| Scenario | Description |
|----------|-------------|
| issue | Issue CRUD, transitions |
| search | JQL queries, filters |
| agile | Sprints, boards, epics |
| jsm | Service desk requests |

### Splunk

| Scenario | Description |
|----------|-------------|
| search | SPL queries, saved searches |
| sre | Error investigation, latency |
| devops | CI/CD, deployments |
| support | Customer sessions, tickets |

## Observability

Integrated LGTM stack accessible at `/grafana/` during active sessions.

### Grafana Dashboards

| Dashboard | Purpose |
|-----------|---------|
| Demo Home | Queue status, active sessions |
| Queue Operations | Queue metrics, wait times |
| Session Analytics | Session duration, user behavior |
| Skill Test Results | Test pass/fail, quality ratings |
| Nginx Access Logs | Request logs, traffic analysis |
| System Overview | Container health, error rates |

### Custom Metrics

| Metric | Description |
|--------|-------------|
| `as_demo_queue_size` | Current queue length |
| `as_demo_sessions_active` | Active session count |
| `as_demo_sessions_started_total` | Total sessions started |
| `as_demo_session_duration_seconds` | Session duration histogram |
| `as_demo_invites_validated_total` | Invite validation by status |

## Security

- **Session Management**: HMAC-SHA256 signed tokens, secure cookies
- **WebSocket Security**: Origin validation required in production
- **Container Security**: AppArmor, Seccomp, capability dropping, resource limits
- **Rate Limiting**: Connection and invite brute-force protection
- **Input Validation**: Path traversal protection, XSS prevention
- **Credential Protection**: Env files with 0600 permissions

## Troubleshooting

### Container fails to start

```bash
docker info                    # Check Docker is running
lsof -i :3000 -i :8080        # Check port conflicts
make logs                      # View container logs
```

### Platform not configured

The health endpoint shows `enabled_platforms` vs `configured_platforms`. If a platform is enabled but not configured, add its credentials to `secrets/.env`.

### Splunk resource issues

Splunk requires 4GB+ memory. Run Atlassian-only mode if resources are limited:
```bash
make dev  # Without --profile full
```

### Plugin installation fails

```bash
# Clear plugin cache and reinstall
rm -rf ~/.claude/plugins
# Plugins are reinstalled on container start
```

## Cost

| Item | Monthly |
|------|---------|
| DigitalOcean Droplet (8GB) | $48 |
| Reserved IP | $4 |
| Domain | ~$1 |
| **Total** | **~$53** |

## License

MIT License - see [LICENSE](LICENSE) for details.

## Related Projects

| Project | Purpose |
|---------|---------|
| [Confluence Assistant Skills](https://github.com/grandcamel/confluence-assistant-skills) | Confluence Claude Code plugin |
| [JIRA Assistant Skills](https://github.com/grandcamel/jira-assistant-skills) | JIRA Claude Code plugin |
| [Splunk Assistant Skills](https://github.com/grandcamel/splunk-assistant-skills) | Splunk Claude Code plugin |
| [confluence-demo](https://github.com/grandcamel/confluence-demo) | Standalone Confluence demo |
| [jira-demo](https://github.com/grandcamel/jira-demo) | Standalone JIRA demo |
| [splunk-demo](https://github.com/grandcamel/splunk-demo) | Standalone Splunk demo |
| [claude-devcontainer](https://github.com/grandcamel/claude-devcontainer) | Base container image |
