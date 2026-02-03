# =============================================================================
# AS-Demo: Combined Assistant Skills Demo Platform
# =============================================================================
# Makefile for development, testing, and deployment
# =============================================================================

.PHONY: help dev dev-full prod prod-full down logs lint test clean build \
	validate validate-compose validate-health validate-integration validate-scenarios \
	validate-env validate-security validate-load validate-deps validate-drift \
	validate-container-security validate-images validate-secrets validate-ports \
	validate-volumes validate-platform \
	deploy deploy-setup deploy-ssl deploy-update ssl-renew health-prod deploy-status \
	test-skill-dev refine-skill test-skill-mock list-scenarios \
	start-local stop-local restart-local status-local health-local \
	queue-status-local queue-reset-local logs-errors-local traces-errors-local \
	generate-env generate-env-force shell

# Default target
help:
	@echo "AS-Demo: Combined Assistant Skills Demo Platform"
	@echo ""
	@echo "Development:"
	@echo "  make dev             Start local dev (Atlassian only)"
	@echo "  make dev-full        Start local dev (with Splunk)"
	@echo "  make down            Stop all services"
	@echo "  make logs            View all service logs"
	@echo "  make logs-queue      View queue manager logs"
	@echo ""
	@echo "Production (Local):"
	@echo "  make prod            Deploy production (Atlassian only)"
	@echo "  make prod-full       Deploy production (with Splunk)"
	@echo ""
	@echo "Production Deployment:"
	@echo "  make deploy          Full production deployment"
	@echo "  make deploy-setup    Initial server setup (Docker, certbot)"
	@echo "  make deploy-ssl      Let's Encrypt certificate provisioning"
	@echo "  make deploy-update   Pull latest and redeploy"
	@echo "  make ssl-renew       Renew SSL certificates"
	@echo "  make health-prod     Production health checks"
	@echo "  make deploy-status   Deployment status"
	@echo ""
	@echo "Testing:"
	@echo "  make test-confluence Test Confluence scenarios"
	@echo "  make test-jira       Test JIRA scenarios"
	@echo "  make test-splunk     Test Splunk scenarios"
	@echo "  make test-cross      Test cross-platform scenarios"
	@echo "  make test-all        Run all tests"
	@echo ""
	@echo "Skill Development:"
	@echo "  make test-skill-dev  Run skill test with verbose output"
	@echo "  make refine-skill    Run skill refinement loop"
	@echo "  make test-skill-mock Run skill test in mock mode"
	@echo "  make list-scenarios  List available scenarios"
	@echo "  (Use PLATFORM=confluence|jira|splunk|cross-platform SCENARIO=name)"
	@echo ""
	@echo "Validation:"
	@echo "  make validate        Run all validations"
	@echo "  make validate-compose    Docker Compose syntax check"
	@echo "  make validate-health     Health endpoint contract tests"
	@echo "  make validate-integration WebSocket, invite, Redis tests"
	@echo "  make validate-scenarios  Scenario file validation"
	@echo "  make validate-env        Environment variable checks"
	@echo "  make validate-security   Container security scanning"
	@echo "  make validate-load       Load/stress testing"
	@echo "  make validate-deps       Dependency audit (npm audit)"
	@echo "  make validate-drift      Configuration drift detection"
	@echo ""
	@echo "Build:"
	@echo "  make build           Build all containers"
	@echo "  make build-queue     Build queue manager"
	@echo "  make build-demo      Build demo container"
	@echo "  make shell           Interactive shell in demo container"
	@echo ""
	@echo "Utilities:"
	@echo "  make lint            Run linters"
	@echo "  make invite          Generate invite URL"
	@echo "  make status          Check service status"
	@echo "  make generate-env    Generate secrets/.env from env vars"
	@echo "  make env-splunk      Output Splunk env vars (use with eval)"
	@echo "  make env-splunk-show Show Splunk env vars"
	@echo "  make clean           Remove containers and volumes"

# =============================================================================
# Development
# =============================================================================

# Create network if it doesn't exist
network:
	@docker network inspect as-demo-network >/dev/null 2>&1 || \
		docker network create as-demo-network

# Start local development (Atlassian only)
dev: network
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
	@echo ""
	@echo "AS-Demo started at http://localhost:8080"
	@echo "Grafana at http://localhost:3001"

# Start local development with Splunk
dev-full: network
	docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile full up -d
	@echo ""
	@echo "AS-Demo (full) started at http://localhost:8080"
	@echo "Splunk at http://localhost:8000"
	@echo "Grafana at http://localhost:3001"

# Stop all services
down:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile full down

# =============================================================================
# Local Development Aliases (for slash commands)
# =============================================================================

# Aliases for consistent naming
start-local: dev
stop-local: down

restart-local:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml restart

status-local:
	@docker compose -f docker-compose.yml -f docker-compose.dev.yml ps
	@echo ""
	@echo "Health:"
	@curl -sf http://localhost:8080/api/health | jq . 2>/dev/null || echo "Queue manager not responding"

health-local:
	@echo "Checking local health..."
	@echo -n "Landing page: " && (curl -sf http://localhost:8080/health > /dev/null && echo "OK" || echo "FAILED")
	@echo -n "Queue manager: " && (curl -sf http://localhost:8080/api/status > /dev/null && echo "OK" || echo "FAILED")
	@echo -n "Queue status: " && curl -s http://localhost:8080/api/status | jq -c

queue-status-local:
	@curl -s http://localhost:8080/api/status | jq .

queue-reset-local:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml restart queue-manager
	@echo "Queue manager restarted. Active sessions disconnected."

logs-errors-local:
	@docker compose -f docker-compose.yml -f docker-compose.dev.yml logs --tail=100 2>&1 | grep -iE 'error|failed|exception' || echo "No errors found"

traces-errors-local:
	@curl -s "http://localhost:3200/api/search" --data-urlencode "q={status=error}" --data-urlencode "limit=20" | jq . 2>/dev/null || echo "Tempo not responding"

# =============================================================================
# Production
# =============================================================================

prod: network
	docker compose up -d

prod-full: network
	docker compose --profile full up -d

# =============================================================================
# Deployment (Production Server)
# =============================================================================

# Full production deployment
deploy:
	@./scripts/deploy.sh

# Initial server setup (Docker, certbot)
deploy-setup:
	@./scripts/deploy.sh --setup

# Let's Encrypt certificate provisioning
deploy-ssl:
	@./scripts/deploy.sh --ssl

# Pull latest and redeploy
deploy-update:
	@./scripts/deploy.sh --update

# Renew SSL certificates
ssl-renew:
	@./scripts/deploy.sh --renew

# Production health checks
health-prod:
	@./scripts/healthcheck.sh --production

# Deployment status
deploy-status:
	@./scripts/deploy.sh --status

# =============================================================================
# Logs
# =============================================================================

logs:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile full logs -f

logs-queue:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f queue-manager

logs-errors:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile full logs -f 2>&1 | grep -i error

# =============================================================================
# Build
# =============================================================================

build: build-queue build-demo

build-queue:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml build queue-manager

build-demo:
	docker build -t as-demo-container:latest ./demo-container

# Run interactive shell in demo container (bypass queue/web)
shell: build-demo
	docker run -it --rm \
		--env-file secrets/.env \
		--network as-demo-network \
		as-demo-container:latest

# =============================================================================
# Testing
# =============================================================================

# Test Confluence scenarios
test-confluence:
	@echo "Testing Confluence scenario: $(SCENARIO)"
	docker run --rm --network as-demo-network \
		-e TERM=xterm \
		-e CONFLUENCE_API_TOKEN \
		-e CONFLUENCE_EMAIL \
		-e CONFLUENCE_SITE_URL \
		-v $(PWD)/demo-container/scenarios:/workspace/scenarios:ro \
		as-demo-container:latest \
		python3 /workspace/skill-test.py --scenario confluence/$(SCENARIO) --platform confluence

# Test JIRA scenarios
test-jira:
	@echo "Testing JIRA scenario: $(SCENARIO)"
	docker run --rm --network as-demo-network \
		-e TERM=xterm \
		-e JIRA_API_TOKEN \
		-e JIRA_EMAIL \
		-e JIRA_SITE_URL \
		-v $(PWD)/demo-container/scenarios:/workspace/scenarios:ro \
		as-demo-container:latest \
		python3 /workspace/skill-test.py --scenario jira/$(SCENARIO) --platform jira

# Test Splunk scenarios
test-splunk:
	@echo "Testing Splunk scenario: $(SCENARIO)"
	docker run --rm --network as-demo-network \
		-e TERM=xterm \
		-e SPLUNK_URL \
		-e SPLUNK_USERNAME \
		-e SPLUNK_PASSWORD \
		-v $(PWD)/demo-container/scenarios:/workspace/scenarios:ro \
		as-demo-container:latest \
		python3 /workspace/skill-test.py --scenario splunk/$(SCENARIO) --platform splunk

# Test cross-platform scenarios
test-cross:
	@echo "Testing cross-platform scenario: $(SCENARIO)"
	docker run --rm --network as-demo-network \
		-e TERM=xterm \
		-e CONFLUENCE_API_TOKEN \
		-e CONFLUENCE_EMAIL \
		-e CONFLUENCE_SITE_URL \
		-e JIRA_API_TOKEN \
		-e JIRA_EMAIL \
		-e JIRA_SITE_URL \
		-e SPLUNK_URL \
		-e SPLUNK_USERNAME \
		-e SPLUNK_PASSWORD \
		-v $(PWD)/demo-container/scenarios:/workspace/scenarios:ro \
		as-demo-container:latest \
		python3 /workspace/skill-test.py --scenario cross-platform/$(SCENARIO) --platform all

# Test all scenarios (parallel where possible)
test-all:
	@echo "Running all tests..."
	$(MAKE) test-confluence SCENARIO=page
	$(MAKE) test-jira SCENARIO=issue
	$(MAKE) test-splunk SCENARIO=sre
	$(MAKE) test-cross SCENARIO=incident-response

# =============================================================================
# Skill Development Testing
# =============================================================================

# Default values for skill testing
PLATFORM ?= confluence
SCENARIO ?= page
MODEL ?= opus
JUDGE_MODEL ?= opus
MAX_ATTEMPTS ?= 3
MOCK ?=

# Run skill test with verbose output (for development)
# Usage: make test-skill-dev PLATFORM=jira SCENARIO=issue
test-skill-dev:
	@echo "Running skill test (dev mode): $(PLATFORM)/$(SCENARIO)"
	python demo-container/skill-refine-loop.py \
		--scenario $(SCENARIO) \
		--platform $(PLATFORM) \
		--max-attempts 1 \
		--model $(MODEL) \
		--judge-model $(JUDGE_MODEL) \
		--verbose

# Run skill refinement loop (iterative fix cycle)
# Usage: make refine-skill PLATFORM=confluence SCENARIO=page MAX_ATTEMPTS=5 MOCK=true
refine-skill:
	@echo "Running skill refinement loop: $(PLATFORM)/$(SCENARIO)$(if $(filter true,$(MOCK)), [MOCK],)"
	python demo-container/skill-refine-loop.py \
		--scenario $(SCENARIO) \
		--platform $(PLATFORM) \
		--max-attempts $(MAX_ATTEMPTS) \
		--model $(MODEL) \
		--judge-model $(JUDGE_MODEL) \
		$(if $(filter true,$(MOCK)),--mock,) \
		--verbose

# Run skill test with mock mode (no real API calls)
# Usage: make test-skill-mock PLATFORM=jira SCENARIO=issue
test-skill-mock:
	@echo "Running skill test (mock mode): $(PLATFORM)/$(SCENARIO)"
	python demo-container/skill-refine-loop.py \
		--scenario $(SCENARIO) \
		--platform $(PLATFORM) \
		--max-attempts 1 \
		--model $(MODEL) \
		--judge-model $(JUDGE_MODEL) \
		--mock \
		--verbose

# List all available scenarios by platform
list-scenarios:
	@echo "Available scenarios:"
	@echo ""
	@echo "Confluence:"
	@ls -1 demo-container/scenarios/confluence/*.md 2>/dev/null | xargs -n1 basename | sed 's/.md//'
	@echo ""
	@echo "JIRA:"
	@ls -1 demo-container/scenarios/jira/*.md 2>/dev/null | xargs -n1 basename | sed 's/.md//'
	@echo ""
	@echo "Splunk:"
	@ls -1 demo-container/scenarios/splunk/*.md 2>/dev/null | xargs -n1 basename | sed 's/.md//'
	@echo ""
	@echo "Cross-platform (with .prompts files):"
	@ls -1 demo-container/scenarios/cross-platform/*.prompts 2>/dev/null | xargs -n1 basename | sed 's/.prompts//'

# Validate platform configuration
validate-platform:
	@python scripts/docker_runner.py --platform $(PLATFORM) --validate

# =============================================================================
# Linting
# =============================================================================

lint:
	cd queue-manager && npm run lint

lint-fix:
	cd queue-manager && npm run lint:fix

# =============================================================================
# Utilities
# =============================================================================

# Set Splunk environment variables for local as-demo-splunk instance
# Usage: eval $(make env-splunk)
env-splunk:
	@echo "export SPLUNK_SITE_URL=https://localhost"
	@echo "export SPLUNK_URL=https://localhost:8089"
	@echo "export SPLUNK_USERNAME=admin"
	@echo "export SPLUNK_PASSWORD=DemoPass123!"
	@echo "export SPLUNK_HEC_TOKEN=demo-hec-token-12345"
	@echo "export SPLUNK_VERIFY_SSL=false"

# Print Splunk env vars (human readable)
env-splunk-show:
	@echo "Splunk environment variables for local instance:"
	@echo "  SPLUNK_SITE_URL=https://localhost"
	@echo "  SPLUNK_URL=https://localhost:8089"
	@echo "  SPLUNK_USERNAME=admin"
	@echo "  SPLUNK_PASSWORD=DemoPass123!"
	@echo "  SPLUNK_HEC_TOKEN=demo-hec-token-12345"
	@echo "  SPLUNK_VERIFY_SSL=false"
	@echo ""
	@echo "To set in current shell: eval \$$(make env-splunk)"

# Generate secrets/.env from environment variables
generate-env:
	@./scripts/generate-env.sh

# Force regenerate secrets/.env
generate-env-force:
	@./scripts/generate-env.sh --force

# Check service status
status:
	@docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile full ps
	@echo ""
	@curl -s http://localhost:8080/api/health | jq . 2>/dev/null || echo "Queue manager not responding"

# Generate invite URL (creates invite directly in Redis)
# Usage: make invite [LABEL="My Label"] [EXPIRES=24] (hours, default 24)
LABEL ?= CLI Invite
EXPIRES ?= 24
invite:
	@TOKEN=$$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 16); \
	EXPIRES_AT=$$(date -u -v+$(EXPIRES)H +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "+$(EXPIRES) hours" +"%Y-%m-%dT%H:%M:%SZ"); \
	CREATED_AT=$$(date -u +"%Y-%m-%dT%H:%M:%SZ"); \
	TTL_SECONDS=$$(($(EXPIRES) * 3600)); \
	INVITE_JSON="{\"token\":\"$$TOKEN\",\"label\":\"$(LABEL)\",\"createdAt\":\"$$CREATED_AT\",\"expiresAt\":\"$$EXPIRES_AT\",\"maxUses\":1,\"useCount\":0,\"status\":\"active\"}"; \
	docker exec as-demo-redis redis-cli SET "invite:$$TOKEN" "$$INVITE_JSON" EX $$TTL_SECONDS > /dev/null && \
	echo "" && \
	echo "Invite created:" && \
	echo "  Token:   $$TOKEN" && \
	echo "  Label:   $(LABEL)" && \
	echo "  Expires: $$EXPIRES_AT" && \
	echo "" && \
	echo "URL: http://localhost:8080/?invite=$$TOKEN"

# List all active invites
invite-list:
	@echo "Active invites:"
	@docker exec as-demo-redis redis-cli KEYS "invite:*" | while read key; do \
		if [ -n "$$key" ]; then \
			data=$$(docker exec as-demo-redis redis-cli GET "$$key"); \
			echo "$$data" | jq -r '"  - \(.token) [\(.status)] \(.label) (expires: \(.expiresAt))"' 2>/dev/null; \
		fi; \
	done || echo "  (none)"

# Queue status
queue-status:
	@curl -s http://localhost:8080/api/status | jq .

# =============================================================================
# Cleanup
# =============================================================================

clean:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile full down -v
	rm -rf session-env/*
	@echo "Cleaned up containers and volumes"

clean-all: clean
	docker network rm as-demo-network 2>/dev/null || true
	docker rmi as-demo-container:latest 2>/dev/null || true
	@echo "Removed network and images"

# =============================================================================
# Seed Data
# =============================================================================

seed-confluence:
	python3 scripts/seed_confluence_sandbox.py

seed-jira:
	python3 scripts/seed_jira_sandbox.py

reset-confluence:
	python3 scripts/cleanup_confluence_sandbox.py

reset-jira:
	python3 scripts/cleanup_jira_sandbox.py

# =============================================================================
# Health Check
# =============================================================================

health:
	@echo "Checking health..."
	@curl -sf http://localhost:8080/api/health && echo "Queue Manager: OK" || echo "Queue Manager: FAILED"
	@curl -sf http://localhost:3001/api/health && echo "Grafana: OK" || echo "Grafana: FAILED"
	@docker compose exec redis redis-cli ping && echo "Redis: OK" || echo "Redis: FAILED"

# =============================================================================
# Validation Suite
# =============================================================================

# Run all validations
validate: validate-compose validate-volumes validate-health validate-env validate-scenarios validate-deps
	@echo ""
	@echo "All validations complete"

# Validate Docker Compose syntax
validate-compose:
	@echo "Validating Docker Compose configuration..."
	@docker compose config -q && echo "docker-compose.yml is valid"
	@docker compose -f docker-compose.yml -f docker-compose.dev.yml config -q && echo "docker-compose.dev.yml overlay is valid"
	@echo "Validating with Splunk profile..."
	@docker compose --profile full config -q && echo "docker-compose.yml with --profile full is valid"
	@docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile full config -q && echo "Full stack with dev overlay is valid"

# Validate volume mount paths
validate-volumes:
	@echo "Validating volume paths..."
	@./scripts/validate/volume-paths.sh

# Check for port conflicts
validate-ports:
	@echo "Checking for port conflicts..."
	@PORTS="80 443 3000 3001 6379 8000 8080"; \
	for port in $$PORTS; do \
		if lsof -i :$$port > /dev/null 2>&1; then \
			echo "Warning: Port $$port is in use"; \
			lsof -i :$$port | head -2; \
		else \
			echo "✓ Port $$port is available"; \
		fi; \
	done

# Validate health endpoint contracts
validate-health:
	@echo "Validating health endpoint contracts..."
	@./scripts/validate/health-contract.sh

# Run integration tests (WebSocket, invite flow, Redis)
validate-integration:
	@echo "Running integration tests..."
	@./scripts/validate/integration-tests.sh

# Validate scenario files
validate-scenarios:
	@echo "Validating scenario files..."
	@./scripts/validate/scenario-files.sh

# Validate environment variables
validate-env:
	@echo "Validating environment variables..."
	@./scripts/validate/env-check.sh

# Security scanning (npm audit, pip-audit, bandit)
validate-security: validate-container-security
	@echo "Running security scans..."
	@cd queue-manager && npm audit --audit-level=high || true
	@pip-audit 2>/dev/null || echo "pip-audit not installed, skipping Python audit"
	@bandit -r scripts/ -ll 2>/dev/null || echo "bandit not installed, skipping Python security scan"

# Container security validation
validate-container-security:
	@echo "Validating container security constraints..."
	@./scripts/validate/container-security.sh 2>/dev/null || echo "container-security.sh not found or failed"

# Validate container images can be pulled/built
validate-images:
	@echo "Validating container images..."
	@docker compose config --images | while read img; do \
		echo "Checking $$img..."; \
		docker image inspect "$$img" > /dev/null 2>&1 || \
		docker pull "$$img" 2>/dev/null || \
		echo "  Warning: Cannot pull $$img (may need build)"; \
	done
	@echo "Building local images..."
	@docker compose build --quiet 2>/dev/null || echo "Build failed or no buildable images"

# Check for secrets in codebase
validate-secrets:
	@echo "Scanning for secrets..."
	@if command -v gitleaks > /dev/null 2>&1; then \
		gitleaks detect --source . --no-git -v 2>&1 | head -20 || true; \
	else \
		echo "gitleaks not installed, using basic patterns..."; \
		grep -rn --include="*.js" --include="*.py" --include="*.sh" \
			-E "(password|secret|token|api_key)\s*[:=]\s*['\"][^'\"]{8,}" . 2>/dev/null | \
			grep -v "node_modules" | grep -v ".env.example" | head -10 || echo "No obvious secrets found"; \
	fi

# Run load/stress tests
validate-load:
	@echo "Running load tests..."
	@./scripts/validate/load-test.sh

# Dependency audit (npm audit, pip-audit)
validate-deps:
	@echo "Auditing dependencies..."
	@cd queue-manager && npm audit --audit-level=moderate || true

# Configuration drift detection
validate-drift:
	@echo "Checking configuration drift..."
	@./scripts/validate/config-drift.sh
