# =============================================================================
# AS-Demo: Combined Assistant Skills Demo Platform
# =============================================================================
# Makefile for development, testing, and deployment
# =============================================================================

.PHONY: help dev dev-full prod prod-full down logs lint test clean build \
	validate validate-compose validate-health validate-integration validate-scenarios \
	validate-env validate-security validate-load validate-deps validate-drift

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
	@echo "Production:"
	@echo "  make prod            Deploy production (Atlassian only)"
	@echo "  make prod-full       Deploy production (with Splunk)"
	@echo ""
	@echo "Testing:"
	@echo "  make test-confluence Test Confluence scenarios"
	@echo "  make test-jira       Test JIRA scenarios"
	@echo "  make test-splunk     Test Splunk scenarios"
	@echo "  make test-cross      Test cross-platform scenarios"
	@echo "  make test-all        Run all tests"
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
	@echo ""
	@echo "Utilities:"
	@echo "  make lint            Run linters"
	@echo "  make invite          Generate invite URL"
	@echo "  make status          Check service status"
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
# Production
# =============================================================================

prod: network
	docker compose up -d

prod-full: network
	docker compose --profile full up -d

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
# Linting
# =============================================================================

lint:
	cd queue-manager && npm run lint

lint-fix:
	cd queue-manager && npm run lint:fix

# =============================================================================
# Utilities
# =============================================================================

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
validate: validate-compose validate-health validate-env validate-scenarios validate-deps
	@echo ""
	@echo "All validations complete"

# Validate Docker Compose syntax
validate-compose:
	@echo "Validating Docker Compose configuration..."
	@docker compose config -q && echo "docker-compose.yml is valid"
	@docker compose -f docker-compose.yml -f docker-compose.dev.yml config -q && echo "docker-compose.dev.yml overlay is valid"

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
validate-security:
	@echo "Running security scans..."
	@cd queue-manager && npm audit --audit-level=high || true
	@pip-audit 2>/dev/null || echo "pip-audit not installed, skipping Python audit"
	@bandit -r scripts/ -ll 2>/dev/null || echo "bandit not installed, skipping Python security scan"

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
