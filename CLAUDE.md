# CLAUDE.md

This file provides guidance to Claude Code when working with the as-demo project.

## Project Overview

**AS-Demo** is a unified demo platform combining three Assistant Skills demos (Confluence, JIRA, Splunk) into a single deployment. The key value is **cross-platform scenarios** that demonstrate real-world automation workflows like incident response, change management, and SRE on-call operations.

### Architecture

```
as-demo/
├── .claude/                    # Claude Code plugin
│   ├── plugin.json             # Plugin manifest
│   ├── agents/
│   │   └── code-reviewer.md    # Security & code review agent
│   └── commands/
│       └── invite.md           # /invite slash command
├── .github/workflows/
│   └── ci.yml                  # GitHub Actions CI/CD
├── docker-compose.yml          # Production orchestration (profiles for Splunk)
├── docker-compose.dev.yml      # Development overrides
├── Makefile                    # Dev/deploy/test targets
├── queue-manager/              # Node.js WebSocket server (multi-platform)
│   ├── Dockerfile              # Multi-stage build (dev/production)
│   ├── lib/                    # Embedded shared library
│   │   ├── index.js            # @demo-platform/queue-manager-core
│   │   ├── session.js
│   │   ├── rate-limit.js
│   │   ├── env-file.js
│   │   └── metrics.js
│   ├── config/
│   │   ├── index.js            # Multi-platform config loader
│   │   ├── platforms/          # Platform-specific configs
│   │   │   ├── confluence.js
│   │   │   ├── jira.js
│   │   │   └── splunk.js
│   │   └── cross-platform.js   # Cross-platform scenarios
│   ├── services/               # Session, queue, invite, state
│   └── handlers/               # WebSocket
├── demo-container/             # Unified container with ALL plugins
│   ├── Dockerfile              # Multi-plugin installation
│   ├── entrypoint.sh           # Platform-aware menu
│   ├── autoplay.sh             # Automated demo playback
│   ├── skill-test.py           # Skill testing framework
│   └── scenarios/
│       ├── cross-platform/     # Cross-platform workflows
│       ├── confluence/         # Confluence scenarios
│       ├── jira/               # JIRA scenarios
│       └── splunk/             # Splunk scenarios
├── landing-page/               # Platform selector + scenario browser
├── nginx/                      # Reverse proxy
│   ├── nginx.conf              # Main config with security headers
│   ├── demo.conf               # HTTP config (development)
│   ├── ssl.conf                # HTTPS config (production)
│   └── dev.conf                # Development overrides
├── splunk/                     # Splunk-specific services
│   ├── apps/demo_app/          # Splunk app
│   ├── log-generator/          # Sample log generator
│   └── seed-data/              # Demo data
├── scripts/                    # Deployment & seed scripts
│   ├── deploy.sh               # Production deployment script
│   ├── healthcheck.sh          # Health verification script
│   ├── confluence_base.py      # Confluence API client
│   ├── seed_confluence_sandbox.py
│   ├── cleanup_confluence_sandbox.py
│   ├── jira_base.py            # JIRA API client
│   ├── seed_jira_sandbox.py
│   ├── cleanup_jira_sandbox.py
│   └── otel_setup.py           # OpenTelemetry setup
├── docs/
│   └── DEPLOYMENT.md           # Production deployment guide
└── observability/              # LGTM stack
    ├── dashboards/
    │   ├── demo-home.json
    │   ├── queue-operations.json
    │   ├── session-analytics.json
    │   ├── skill-test-results.json
    │   ├── nginx-access-logs.json
    │   └── system-overview.json
    ├── grafana-dashboards.yaml
    └── promtail-config.yaml
```

### Key Services

| Service       | Port                                          | Purpose                                |
| ------------- | --------------------------------------------- | -------------------------------------- |
| nginx         | 80, 443 (8080 in dev)                         | Reverse proxy, SSL, static content     |
| queue-manager | 3000                                          | WebSocket, session management, invites |
| redis         | 6379                                          | Session state, queue, invite tokens    |
| lgtm          | 3001 (Grafana), 3100 (Loki), 4317/4318 (OTLP) | Grafana, Loki, Tempo (LGTM stack)      |
| splunk        | 8000, 8089                                    | Splunk Enterprise (profile: full)      |

## Development Commands

### Quick Start

```bash
# Start local development (Atlassian only)
make dev

# Start with Splunk (requires 4GB+ memory)
make dev-full

# Access at http://localhost:8080
# Grafana at http://localhost:3001

# Stop environment
make down
```

### Testing

```bash
# Test individual platforms
make test-confluence SCENARIO=page
make test-jira SCENARIO=issue
make test-splunk SCENARIO=sre

# Test cross-platform scenarios
make test-cross SCENARIO=incident-response

# Run all tests
make test-all
```

### Code Quality

```bash
# Run linters
make lint

# Auto-fix issues
make lint-fix
```

### Code Review

Use the `code-reviewer` agent for security and quality review:

```
Run a code-reviewer subagent on the as-demo project
```

This identifies security vulnerabilities, logic errors, and code quality issues with confidence-based filtering.

### Sandbox Management

```bash
# Seed demo data
make seed-confluence
make seed-jira

# Reset sandboxes
make reset-confluence
make reset-jira
```

## Cross-Platform Scenarios

| Scenario          | Flow                       | File                                     |
| ----------------- | -------------------------- | ---------------------------------------- |
| Incident Response | Splunk → Confluence → JIRA | cross-platform/incident-response.prompts |
| SRE On-Call       | Splunk alerts → KB → Tasks | cross-platform/sre-oncall.prompts        |
| Change Management | JIRA → Confluence → Splunk | cross-platform/change-management.prompts |
| Knowledge Sync    | JIRA → Confluence          | cross-platform/knowledge-sync.prompts    |

## How Claude Code Skills Work

### The Skill → Bash Pattern

Skills in Claude Code plugins are **documentation, not code execution**. When a user invokes a skill:

1. Claude reads the skill file (markdown with YAML frontmatter)
2. Claude loads context about what the skill does
3. Claude executes appropriate tools (usually Bash) based on that context

**Key insight**: Skills don't execute directly—they provide context that guides Claude's tool usage.

### Expected Tool Sequences

| Skill Type      | Tool Sequence                               |
| --------------- | ------------------------------------------- |
| Platform action | Skill → Read context → Bash (make/API call) |
| Testing         | Skill → Bash (make test-skill-dev)          |
| Deployment      | Skill → Bash (ssh + docker commands)        |
| Status check    | Skill → Bash (curl health endpoints)        |

### Skill Files Location

| Platform   | Location                                         |
| ---------- | ------------------------------------------------ |
| Confluence | `~/.claude/plugins/confluence-assistant-skills/` |
| JIRA       | `~/.claude/plugins/jira-assistant-skills/`       |
| Splunk     | `~/.claude/plugins/splunk-assistant-skills/`     |
| AS-Demo    | `.claude/` (local plugin in this repo)           |

### Test Expectations

When testing skills, expect tool call sequences, not direct skill execution:

- Correct: `Skill → Bash → output`
- Incorrect: `Skill → direct output`

The skill provides Claude with instructions; Claude then uses the appropriate tools to accomplish the task described in those instructions.

## Configuration

### Environment Variables (`secrets/.env`)

```bash
# Enabled platforms (comma-separated)
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
SPLUNK_HEC_TOKEN=demo-hec-token
```

### Skills Path Configuration

The `refine-skill` command needs to locate platform skills repositories. Paths are resolved in order:

1. Platform-specific env var (e.g., `CONFLUENCE_SKILLS_PATH`)
2. `SKILLS_BASE_PATH` + default subdirectory
3. `{as-demo parent}` + default subdirectory (automatic default)

| Variable                 | Purpose                             | Default                              |
| ------------------------ | ----------------------------------- | ------------------------------------ |
| `SKILLS_BASE_PATH`       | Base directory for all skills repos | Parent of as-demo directory          |
| `CONFLUENCE_SKILLS_PATH` | Confluence skills repo path         | `{base}/Confluence-Assistant-Skills` |
| `JIRA_SKILLS_PATH`       | JIRA skills repo path               | `{base}/Jira-Assistant-Skills`       |
| `SPLUNK_SKILLS_PATH`     | Splunk skills repo path             | `{base}/Splunk-Assistant-Skills`     |

```bash
# Example: Override base path for all platforms
SKILLS_BASE_PATH=/opt/skills make refine-skill PLATFORM=jira SCENARIO=issue

# Example: Override single platform
CONFLUENCE_SKILLS_PATH=/home/user/my-confluence make refine-skill PLATFORM=confluence SCENARIO=page
```

## Deployment Modes

| Mode               | Command                               | Services                          |
| ------------------ | ------------------------------------- | --------------------------------- |
| Atlassian Only     | `docker compose up -d`                | nginx, queue-manager, redis, lgtm |
| Full (with Splunk) | `docker compose --profile full up -d` | + splunk, log-generator           |
| Development        | `make dev`                            | Hot reload, debug logging         |

## Multi-Platform Configuration

The queue-manager uses a modular config system with validation:

```javascript
// config/index.js
const VALID_PLATFORMS = ['confluence', 'jira', 'splunk'];
const ENABLED_PLATFORMS = (process.env.ENABLED_PLATFORMS || 'confluence,jira,splunk')
  .split(',')
  .map((p) => p.trim().toLowerCase())
  .filter((p) => VALID_PLATFORMS.includes(p));

// Validates at least one platform is enabled
if (ENABLED_PLATFORMS.length === 0) {
  console.error('FATAL: No valid platforms enabled');
  process.exit(1);
}
```

Cross-platform scenarios validate their platform requirements at load time:

```javascript
// config/cross-platform.js
validateScenarios() {
  for (const [key, scenario] of Object.entries(this.SCENARIO_NAMES)) {
    const invalid = scenario.requiredPlatforms.filter(p => !VALID_PLATFORMS.includes(p));
    if (invalid.length > 0) {
      throw new Error(`Scenario '${key}' has invalid platform requirements`);
    }
  }
}
```

## Security Considerations

### Session Management

- `SESSION_SECRET` must be set in production
- Session tokens use HMAC-SHA256 signatures
- Credentials passed via `--env-file` (not visible in `ps aux`)
- Env file cleanup prevents double-cleanup race condition

### WebSocket Security

- Origin header required in production (prevents CSRF bypass)
- Origin validation against `ALLOWED_ORIGINS` whitelist
- Rate limiting: 10 connections per IP per minute

### Container Security

- Memory limit: 2GB, CPU limit: 2 cores, PID limit: 256
- Capabilities dropped except CHOWN, SETUID, SETGID, DAC_OVERRIDE
- AppArmor and Seccomp profiles enabled (`docker-default`)
- Read-only root filesystem with tmpfs for /tmp and /home

### Input Validation

- Path traversal protection using `path.relative()` (cross-platform safe)
- Invite tokens validated via regex: `[A-Za-z0-9_-]{4,64}`
- HTML template substitution uses `escapeHtml()` to prevent XSS
- Client-side innerHTML sanitized with `escapeHtml()`

### Rate Limiting

- WebSocket: 10 connections per IP per minute
- Invite validation: 10 failed attempts per IP per hour
- Atomic reconnection lock prevents TOCTOU race condition

### HTTP Security Headers

- X-Frame-Options: SAMEORIGIN
- X-Content-Type-Options: nosniff
- X-XSS-Protection: 1; mode=block
- HSTS: Ready to enable when SSL configured

## Shared Library

The shared library `@demo-platform/queue-manager-core` is embedded in `queue-manager/lib/`:

```javascript
const {
  generateSessionToken,
  createSessionEnvFile,
  createConnectionRateLimiter,
  createInviteRateLimiter,
  createMetrics,
} = require('@demo-platform/queue-manager-core');
```

This avoids runtime dependency on the external `demo-platform-shared` repository.

## CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/ci.yml`) includes:

| Job              | Description                          |
| ---------------- | ------------------------------------ |
| lint             | ESLint for JS, Ruff for Python       |
| nodejs-tests     | Config load verification, unit tests |
| docker-build     | Build demo-container with caching    |
| validate-compose | Syntax check docker-compose files    |
| security-scan    | npm audit, Bandit for Python         |

## Grafana Dashboards

| Dashboard          | Purpose                                |
| ------------------ | -------------------------------------- |
| demo-home          | Overview: sessions, queue size, status |
| queue-operations   | Queue metrics, wait times              |
| session-analytics  | Session duration, user behavior        |
| skill-test-results | Test pass/fail metrics                 |
| nginx-access-logs  | Request logs, response codes           |
| system-overview    | CPU, memory, container health          |

## Related Projects

| Project              | Purpose                                     |
| -------------------- | ------------------------------------------- |
| confluence-demo      | Standalone Confluence demo                  |
| jira-demo            | Standalone JIRA demo                        |
| splunk-demo          | Standalone Splunk demo                      |
| demo-platform-shared | Source of shared queue-manager-core library |

## Troubleshooting

### Container fails to start

```bash
docker info  # Check Docker is running
lsof -i :3000 -i :8080  # Check port conflicts
make logs  # View logs
```

### Queue-manager module not found

The shared library must be embedded in `queue-manager/lib/`. If missing:

```bash
# Copy from demo-platform-shared
cp -r ../demo-platform-shared/packages/queue-manager-core/lib/* queue-manager/lib/
```

### Nginx upstream error

If you see "upstream may not have port" errors, ensure `nginx/dev.conf` has separate upstream blocks for each port:

```nginx
upstream queue-manager { server queue-manager:3000; }
upstream terminal { server queue-manager:7681; }
```

### Plugin installation fails

```bash
# Clear plugin cache and reinstall
rm -rf ~/.claude/plugins
# Plugins are reinstalled on container start
```

### Splunk resource issues

```bash
# Splunk requires 4GB+ memory
# Run Atlassian-only mode if resources are limited:
make dev  # Without --profile full
```

### Health endpoint shows missing platforms

The health endpoint shows `enabled_platforms` (from ENABLED_PLATFORMS env) vs `configured_platforms` (platforms with valid credentials). If a platform is enabled but not configured, set its environment variables.

### Docker exit code 125 in ttyd logs

Exit code 125 means Docker daemon couldn't start the container. Check:

```bash
# View ttyd stderr in queue-manager logs
docker logs as-demo-queue 2>&1 | grep ttyd

# Common causes:
# 1. --env-file path not accessible (use container path, not host path)
# 2. Image not found
# 3. Invalid docker run options
# 4. Resource limits exceeded

# Test docker command directly from queue-manager:
docker exec as-demo-queue docker run --rm -e TERM=xterm as-demo-container:latest echo test
```

## Mock Mode Debugging

Mock mode allows testing skill behavior without connecting to real APIs. Each platform can be configured independently.

### Enabling Mock Mode

Set environment variables before running tests:

```bash
# Enable per-platform
export CONFLUENCE_MOCK_MODE=true
export JIRA_MOCK_MODE=true
export SPLUNK_MOCK_MODE=true
```

### Verification Workflow

1. Check environment: `echo $CONFLUENCE_MOCK_MODE` (should be `true`)
2. Check state file: `cat /tmp/mock_state_confluence.json`
3. Check import hooks: `python -c "import sitecustomize; print('OK')"`
4. Run minimal test: `python -c "from confluence_as.client import get_confluence_client; c = get_confluence_client(); print(c)"`
5. Check logs for mock activation messages
6. Verify PYTHONPATH includes `/workspace/patches`

### Common Error Patterns

| Error                         | Cause               | Fix                             |
| ----------------------------- | ------------------- | ------------------------------- |
| `ConnectionError` to real API | Mock not activated  | Check `*_MOCK_MODE=true`        |
| `FileNotFoundError` state     | State file missing  | Run seed or create empty `{}`   |
| `ImportError` sitecustomize   | PYTHONPATH wrong    | Add `/workspace/patches`        |
| `AttributeError` on mock      | Mock API incomplete | Update mock client              |
| Stale data in responses       | Old state file      | Delete `/tmp/mock_state_*.json` |

### State File Locations

| Platform   | State File                        |
| ---------- | --------------------------------- |
| Confluence | `/tmp/mock_state_confluence.json` |
| JIRA       | `/tmp/mock_state_jira.json`       |
| Splunk     | `/tmp/mock_state_splunk.json`     |

### Debugging Tips

- Mock state persists between test runs—delete state files for clean slate
- Mock mode doesn't load seed data automatically; run seed scripts first
- Mock clients may lag behind real API changes—check for missing methods
- Use `--verbose` flag with skill tests to see mock activation logs

## Adding New Cross-Platform Scenarios

1. Create scenario files:
   - `demo-container/scenarios/cross-platform/<name>.md` (documentation)
   - `demo-container/scenarios/cross-platform/<name>.prompts` (test prompts)

2. Add to `queue-manager/config/cross-platform.js`:

```javascript
SCENARIO_NAMES: {
  '<name>': {
    file: 'cross-platform/<name>.md',
    title: 'Scenario Title',
    icon: '🔧',
    description: 'Platform A → Platform B → Platform C',
    requiredPlatforms: ['confluence', 'jira', 'splunk']
  }
}
```

3. Update landing page if needed in `landing-page/index.html`

4. Add test target to Makefile:

```makefile
test-<name>:
    $(MAKE) test-cross SCENARIO=<name>
```

## Production Deployment

### Live Environment

| Resource  | Value                                 |
| --------- | ------------------------------------- |
| URL       | https://demo.assistant-skills.dev     |
| Server IP | 143.110.131.254                       |
| Droplet   | DigitalOcean "demo" (8GB RAM, 4 vCPU) |
| Region    | sfo2 (San Francisco)                  |
| SSL       | Let's Encrypt (auto-renews)           |

### Deployment Commands

```bash
# SSH to production
ssh root@143.110.131.254

# Deploy from local
make deploy              # Full deployment
make deploy-update       # Pull latest and redeploy
make health-prod         # Run health checks
make deploy-status       # Check status

# On server
cd /opt/as-demo
docker compose ps        # Container status
docker compose logs -f   # View logs
```

### DigitalOcean Management (doctl)

```bash
# List droplets
doctl compute droplet list

# DNS records
doctl compute domain records list assistant-skills.dev

# Resize droplet (requires power off)
doctl compute droplet-action power-off <id> --wait
doctl compute droplet-action resize <id> --size s-4vcpu-8gb --wait
doctl compute droplet-action power-on <id> --wait

# Rename droplet/project
doctl compute droplet-action rename <id> --droplet-name <name>
doctl projects update <id> --name <name>
```

## Slash Commands

### /invite - Generate Production Invite

```bash
/invite                              # Default: 24h expiry
/invite label="Demo for Acme"        # Custom label
/invite expires=168                  # 1 week (hours)
/invite label="VIP" expires=48       # Both parameters
```

Runs: `ssh root@143.110.131.254 "cd /opt/as-demo && make invite LABEL='...' EXPIRES=..."`

## Lessons Learned & Common Pitfalls

### DNS & SSL Issues

**WHOIS Verification Blocks DNS**

- **Symptom**: SSL certificate fails with wrong IP in error message
- **Cause**: Namecheap requires WHOIS verification before pushing custom nameservers to registry
- **Diagnosis**: `dig NS domain.com @ns-tld1.charlestonroadregistry.com` shows `failed-whois-verification.namecheap.com`
- **Fix**: Complete WHOIS verification email from registrar

**Check DNS at Multiple Levels**

```bash
# Registry level (authoritative)
dig NS example.com @ns-tld1.charlestonroadregistry.com

# DigitalOcean nameserver
dig example.com @ns1.digitalocean.com

# Public resolvers (may be cached)
dig example.com @8.8.8.8
dig example.com @1.1.1.1
```

### nginx Configuration

**Upstream Port Error**

- **Error**: `upstream "name" may not have port`
- **Wrong**: `proxy_pass http://queue-manager:7681/;`
- **Right**: Create separate upstream block:

```nginx
upstream terminal { server queue-manager:7681; }
# Then use: proxy_pass http://terminal/;
```

**http2 Directive Deprecation**

- **Warning**: `listen ... http2` is deprecated
- **Fix**: Use `listen 443 ssl;` and add `http2 on;` directive separately

### Docker Compose v5

**pids_limit Conflict**

- **Error**: `can't set distinct values on 'pids_limit' and 'deploy.resources.limits.pids'`
- **Fix**: Use only one format, prefer `deploy.resources.limits.pids` for swarm compatibility

**Environment File Location**

- Docker Compose looks for `.env` in project root, not `secrets/.env`
- **Fix**: Symlink `ln -sf secrets/.env .env` or use `--env-file secrets/.env`

### Git & Empty Directories

**Empty Directories Not Tracked**

- Git doesn't track empty directories
- Dockerfiles with `COPY dir/` fail if directory is empty
- **Fix**: Add `.gitkeep` file to empty directories that must exist

### Server Deployment

**Docker Compose Plugin Installation**

- Ubuntu's docker.io package doesn't include compose plugin
- **Fix**: Add Docker's official apt repository:

```bash
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list
apt-get update && apt-get install -y docker-compose-plugin
```

**SSL Certificate Provisioning**

- Stop nginx before running certbot standalone: `docker stop as-demo-nginx`
- Certbot needs port 80 for HTTP challenge
- After cert obtained, restart nginx with SSL config

**Deploying Code Changes to queue-manager**

- **Symptom**: Code changes don't take effect after `docker compose restart`
- **Cause**: Node.js code is copied into the image at build time (`COPY . .` in Dockerfile)
- **Wrong**: `docker compose restart queue-manager` (uses cached image with old code)
- **Right**: `docker compose up -d --build queue-manager` (rebuilds image with new code)
- **Key insight**: Restart only restarts the container with the existing image; rebuild is needed for code changes

### Docker-in-Docker Path Confusion

**env-file Path Must Be Container Path, Not Host Path**

- **Symptom**: Docker exits immediately with code 125, logs show "no such file or directory"
- **Cause**: When Docker CLI runs inside a container (via socket mount), `--env-file` path must be readable by the CLI inside that container
- **Wrong**: `--env-file /Users/jason/project/session-env/file.env` (host path)
- **Right**: `--env-file /run/session-env/file.env` (container path where file is mounted)
- **Key insight**: Docker CLI reads the env-file locally, then passes variables to the daemon. The CLI can't read host paths.

**TTY Flags with ttyd**

- **Symptom**: Docker exits with code 125 when spawned by ttyd
- **Cause**: Using `-it` flags when ttyd already provides terminal
- **Wrong**: `docker run --rm -it ...` (double TTY allocation)
- **Right**: `docker run --rm -i ...` (interactive only, ttyd handles terminal)

### Secrets Management

**Use `secret-get` for Local Secrets**

- Local secrets can be retrieved with `secret-get <KEY>` command
- Available: `CLAUDE_CODE_OAUTH_TOKEN`, `CONFLUENCE_API_TOKEN`, etc.
- Never commit actual secrets to git

### OAuth & Authentication

**OAuth Token Sourcing**

- Claude Code sources tokens from `~/.claude.json` or environment variables
- Container sessions use tokens passed via `--env-file`
- Token source order: env var → config file → prompt for login

**Token Expiration**

- OAuth tokens expire periodically
- **Symptom**: Skill tests fail with authentication errors
- **Fix**: Run `/refresh-token` (local) or `/refresh-prod-token` (production)

**Multi-Platform Token Management**

- Each platform (Confluence, JIRA, Splunk) requires separate credentials
- Confluence/JIRA use Atlassian API tokens with email
- Splunk uses username/password or HEC token
- Verify all required tokens are set before running cross-platform scenarios

### Testing & CLI

**Test CLI Directly First**

- Always test with `python skill-test.py` before testing in Docker
- This isolates environment issues from skill logic issues
- Docker adds layers of complexity (volumes, permissions, networking)

**Prompts Run Independently**

- Each prompt in a `.prompts` file starts with fresh Claude context
- State from previous prompts is NOT preserved
- Design prompts to be self-contained

**Conversation Context Reuse**

- Use `--fork-from <prompt_number>` to continue from specific prompt's context
- Useful for multi-step scenarios that build on previous responses
- Example: `make test-skill PLATFORM=jira SCENARIO=issue FORK_FROM=2`

**Semantic vs Exact Match Evaluation**

- LLM judge evaluates intent, not exact output match
- "Created issue ABC-123" matches expectation "should create an issue"
- Adjust expectations for semantic evaluation

**Test Result Variability**

- Same prompt may produce different tool sequences across runs
- LLM responses are non-deterministic by nature
- Write expectations that tolerate variation

**Tool Expectation Patterns**

- Expect `Skill → Bash` sequence, not direct skill execution
- Skills provide context; Claude executes tools based on that context
- Verify the right tools are called, not specific output text

**Skill Routing Failures**

- **Symptom**: Skill isn't triggered when invoked
- **Cause**: `plugin.json` globs don't match skill file path
- **Fix**: Check glob patterns in `plugin.json` against actual file locations

### Mock Mode

**Mock Mode Activation**

- Set `{PLATFORM}_MOCK_MODE=true` environment variable
- Must be set before Python interpreter starts
- Container must have mock patches in PYTHONPATH

**Mock State Persistence**

- State persists in `/tmp/mock_state_{platform}.json`
- Delete state files for clean test runs
- State accumulates across test runs within same container

**Mock vs Real API Errors**

- Mock mode errors differ from actual API errors
- Test both modes for complete coverage
- Mock doesn't simulate rate limits or network latency

**Seed Data in Mock Mode**

- Mock mode doesn't load seed data by default
- Run seed scripts to populate mock state
- Or create `/tmp/mock_state_{platform}.json` with expected data

**Mock Client API Parity**

- Mock clients may lag behind real API changes
- Check for missing methods when mock tests fail
- Update mock implementations when adding new API features

### Telemetry & Observability

**OTEL Traces Flush Delay**

- Traces may take 10-30 seconds to appear in Tempo
- Don't expect immediate trace visibility after test completion
- Use `sleep 30` before querying traces in automated tests

**Tempo Port for Local Queries**

- Tempo needs port 3200 exposed for local trace queries
- Default LGTM stack exposes this via the lgtm container
- Query: `curl http://localhost:3200/api/traces/{traceId}`

**Skill Test Telemetry**

- Set `OTEL_EXPORTER_OTLP_ENDPOINT` for trace capture
- Default: `http://lgtm:4318` inside Docker network
- Local: `http://localhost:4318` when running outside Docker

**Loki Event Types (skill-test job)**

| Event                      | Description               | Key Fields                                        |
| -------------------------- | ------------------------- | ------------------------------------------------- |
| `prompt_start`             | Claude prompt begins      | prompt_text, model, prompt_index                  |
| `claude_request_start`     | Subprocess launched       | prompt_index, model                               |
| `tool_execution_start`     | Tool invoked              | tool_name, tool_index, tool_input                 |
| `tool_execution_end`       | Tool completed            | tool_name, tool_index, result_preview             |
| `claude_response_received` | Subprocess finished       | duration_seconds, exit_code                       |
| `prompt_complete`          | Full prompt cycle done    | prompt, response, tools_called, cost_usd          |
| `assertion_start`          | Assertions begin          | prompt_index                                      |
| `assertion_end`            | Assertions complete       | duration_seconds, assertion counts                |
| `assertion_failure`        | Assertions failed         | failed_tool_assertions, failed_text_assertions    |
| `judge_prompt`             | Judge prompt captured     | judge_prompt_full (8000 chars)                    |
| `judge_request_start`      | Judge subprocess launched | prompt_index, model                               |
| `judge_response_received`  | Judge returned            | duration_seconds, response_length                 |
| `judge_response_raw`       | Raw judge output          | judge_response_raw (5000 chars)                   |
| `judge_complete`           | Judge parsed              | quality, tool_accuracy, reasoning, confidence     |
| `judge_error`              | Judge failed              | error                                             |
| `judge_parse_error`        | JSON parse failed         | error, raw_output                                 |
| `checkpoint_save`          | Session saved             | prompt_index, session_id                          |
| `checkpoint_load`          | Session loaded            | prompt_index, session_id                          |
| `checkpoint_fork`          | Forking from checkpoint   | fork_from_prompt, target_prompt                   |
| `test_start`               | Test run begins           | scenario, prompt_count, model                     |
| `test_complete`            | Test run ends             | passed_count, quality distribution, durations     |
| `failure_detail`           | Prompt failed             | full prompt/response, all assertions, suggestions |

**Loki Event Types (skill-refine job)**

| Event                | Description            | Key Fields                                      |
| -------------------- | ---------------------- | ----------------------------------------------- |
| `refine_start`       | Refinement loop begins | scenario, platform, max_attempts, mock_mode     |
| `refine_attempt`     | Fix attempt starts     | attempt, fork_from, prompt_index                |
| `refine_fix_applied` | Files changed          | files_changed, failed_prompt, quality           |
| `refine_complete`    | Loop finished          | success, total_attempts, total_duration_seconds |

**Grafana Dashboard Reload**

- Dashboards need refresh after provisioning config changes
- Use Grafana API or restart container: `docker compose restart lgtm`
- Check `/var/lib/grafana/dashboards/` for provisioned files

**Loki Query for Stat Panels**

- Use `sum(count_over_time(...))` not raw log queries
- Stat panels expect single numeric values
- Example: `sum(count_over_time({job="demo"} |= "error" [1h]))`

**High Cardinality Label Warning**

- Avoid high-cardinality labels in custom metrics
- Labels like `user_id`, `session_id`, `trace_id` cause storage issues
- Use log lines for high-cardinality data, metrics for aggregates
