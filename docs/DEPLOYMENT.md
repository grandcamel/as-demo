# AS-Demo Production Deployment Guide

This guide covers deploying AS-Demo to production at `https://demo.assistant-skills.dev`.

## Prerequisites

- DigitalOcean droplet (or similar VPS) with:
  - 2+ vCPU
  - 8GB RAM (minimum for full platform support including Splunk)
  - 4GB RAM (minimum for Atlassian-only deployment)
  - 50GB disk
  - Ubuntu 22.04 LTS recommended
- Domain with DNS configured
- Platform credentials (Confluence, JIRA, Splunk)
- Claude authentication (OAuth token or API key)

## Infrastructure Costs

| Component                  | Monthly Cost |
| -------------------------- | ------------ |
| DigitalOcean Droplet (8GB) | $48          |
| Reserved IP (optional)     | $4           |
| Let's Encrypt SSL          | Free         |
| **Total**                  | $48-52       |

## Quick Start

```bash
# 1. Clone repository to server
git clone https://github.com/grandcamel/as-demo.git /opt/as-demo
cd /opt/as-demo

# 2. Initial server setup (Docker, certbot)
sudo ./scripts/deploy.sh --setup

# 3. Configure secrets
cp secrets/.env.production.example secrets/.env
# Edit secrets/.env with your credentials

# 4. Set up DNS
# Point A record: demo.assistant-skills.dev -> server IP
# Wait for DNS propagation (check with: dig demo.assistant-skills.dev)

# 5. Provision SSL certificate
sudo ./scripts/deploy.sh --ssl

# 6. Deploy
./scripts/deploy.sh
```

## Detailed Steps

### Step 1: Server Setup

```bash
# SSH into server
ssh root@your-server-ip

# Clone repository
git clone https://github.com/grandcamel/as-demo.git /opt/as-demo
cd /opt/as-demo

# Run setup (installs Docker, Docker Compose, certbot)
sudo ./scripts/deploy.sh --setup
```

### Step 2: Configure Environment

```bash
# Copy production template
cp secrets/.env.production.example secrets/.env

# Edit with your values
nano secrets/.env
```

**Required settings:**

```bash
# Generate secure session secret
SESSION_SECRET=$(openssl rand -base64 32)

# Claude authentication (at least one)
CLAUDE_CODE_OAUTH_TOKEN=your-oauth-token
# or
ANTHROPIC_API_KEY=your-api-key

# At least one platform
CONFLUENCE_API_TOKEN=xxx
CONFLUENCE_EMAIL=xxx
CONFLUENCE_SITE_URL=https://your-site.atlassian.net
```

### Step 3: DNS Configuration

Add an A record pointing your domain to the server IP:

```
demo.assistant-skills.dev -> 123.45.67.89
```

Verify DNS propagation:

```bash
dig demo.assistant-skills.dev +short
# Should return your server IP
```

### Step 4: SSL Certificate

```bash
# Provision Let's Encrypt certificate
sudo ./scripts/deploy.sh --ssl
```

This will:

1. Start a temporary nginx server
2. Request certificate via ACME challenge
3. Configure automatic renewal via cron

### Step 5: Deploy

```bash
# Full deployment
./scripts/deploy.sh

# Or with Splunk (requires 4GB+ RAM)
COMPOSE_PROFILES=full ./scripts/deploy.sh
```

## Verification

### Health Checks

```bash
# Quick health check
curl https://demo.assistant-skills.dev/api/health

# Full health check
./scripts/healthcheck.sh --production

# Or via Make
make health-prod
```

### Expected Responses

```bash
# /api/health
{"status":"ok","timestamp":"2024-01-15T10:30:00.000Z"}

# /api/health/ready
{"status":"ok","redis":"healthy","timestamp":"2024-01-15T10:30:00.000Z"}

# /api/status
{
  "enabled_platforms": ["confluence", "jira", "splunk"],
  "configured_platforms": ["confluence", "jira"],
  "queue_size": 0,
  "session_active": false
}
```

### WebSocket Test

```bash
# Using wscat
wscat -c wss://demo.assistant-skills.dev/api/ws
# Should receive: {"type":"status",...}
```

### SSL Verification

```bash
# Check certificate
echo | openssl s_client -servername demo.assistant-skills.dev \
  -connect demo.assistant-skills.dev:443 2>/dev/null | \
  openssl x509 -noout -dates

# Check HSTS header
curl -sI https://demo.assistant-skills.dev | grep -i strict
```

## Operations

### Update Deployment

```bash
cd /opt/as-demo
./scripts/deploy.sh --update
# Or: make deploy-update
```

### View Logs

```bash
# All logs
docker compose logs -f

# Queue manager only
docker compose logs -f queue-manager

# Nginx only
docker compose logs -f nginx
```

### Restart Services

```bash
# Restart all
docker compose restart

# Restart specific service
docker compose restart queue-manager
```

### SSL Certificate Renewal

Certificates are automatically renewed via cron. Manual renewal:

```bash
./scripts/deploy.sh --renew
# Or: make ssl-renew
```

### Generate Invite

```bash
# Generate 24-hour invite
make invite LABEL="Demo User" EXPIRES=24

# Generate 1-hour invite
make invite LABEL="Quick Demo" EXPIRES=1
```

## Troubleshooting

### Health Endpoint Down

1. Check container status:

   ```bash
   docker compose ps
   ```

2. Check queue-manager logs:

   ```bash
   docker compose logs queue-manager --tail=100
   ```

3. Restart services:
   ```bash
   docker compose restart
   ```

### Redis Issues

1. Check Redis container:

   ```bash
   docker exec as-demo-redis redis-cli ping
   ```

2. Check Redis logs:

   ```bash
   docker compose logs redis
   ```

3. Restart Redis:
   ```bash
   docker compose restart redis
   ```

### SSL Certificate Issues

1. Check certificate status:

   ```bash
   certbot certificates
   ```

2. Force renewal:

   ```bash
   certbot renew --force-renewal
   docker compose restart nginx
   ```

3. Check nginx logs:
   ```bash
   docker compose logs nginx
   ```

### Container Issues

1. Check container health:

   ```bash
   docker inspect as-demo-queue --format='{{.State.Health.Status}}'
   ```

2. View container details:

   ```bash
   docker inspect as-demo-queue | jq '.[0].State'
   ```

3. Rebuild and restart:
   ```bash
   docker compose build queue-manager
   docker compose up -d queue-manager
   ```

### Queue Management

If queue is full:

1. Check queue status:

   ```bash
   curl https://demo.assistant-skills.dev/api/status | jq
   ```

2. End stuck sessions (via Redis):
   ```bash
   docker exec as-demo-redis redis-cli KEYS "session:*"
   # Carefully review before deleting
   ```

### Session Issues

1. Check session logs:

   ```bash
   docker compose logs queue-manager | grep -i session
   ```

2. Clear all sessions (emergency):
   ```bash
   docker exec as-demo-redis redis-cli FLUSHDB
   # WARNING: Clears all Redis data including queue
   ```

## Monitoring

### Grafana Dashboards

Access at: `https://demo.assistant-skills.dev/grafana/` (requires active session)

Available dashboards:

- **Demo Home**: Overview of sessions, queue, and status
- **Queue Operations**: Queue metrics and wait times
- **Session Analytics**: Session duration and user behavior
- **System Overview**: CPU, memory, container health

### Alert Rules

Alert rules are defined in `observability/alerting/health-alerts.yaml`:

| Alert                    | Condition               | Severity |
| ------------------------ | ----------------------- | -------- |
| Health Endpoint Down     | Non-200 for >1 minute   | Critical |
| Redis Unhealthy          | Unreachable for >30s    | Critical |
| Queue Near Capacity      | >80% full for 5 minutes | Warning  |
| High Session Timeouts    | >10% timeout rate       | Warning  |
| SSL Certificate Expiring | <14 days remaining      | Warning  |

### External Monitoring

Recommended external monitors:

- UptimeRobot or Pingdom for `https://demo.assistant-skills.dev/api/health`
- SSL certificate monitoring (many free services available)

## Security Checklist

- [ ] SESSION_SECRET is unique and secure (64+ characters)
- [ ] ALLOWED_ORIGINS matches production domain
- [ ] NODE_ENV=production is set
- [ ] COOKIE_SECURE=true is set
- [ ] SSL certificate is valid
- [ ] HSTS header is present
- [ ] Firewall allows only ports 80 and 443
- [ ] Platform API tokens have minimal required permissions
- [ ] Grafana is protected by session authentication

## Backup & Recovery

### Redis Data

```bash
# Backup
docker exec as-demo-redis redis-cli BGSAVE
docker cp as-demo-redis:/data/dump.rdb ./backup-$(date +%Y%m%d).rdb

# Restore
docker cp ./backup-YYYYMMDD.rdb as-demo-redis:/data/dump.rdb
docker compose restart redis
```

### Configuration

```bash
# Backup secrets
cp secrets/.env secrets/.env.backup-$(date +%Y%m%d)

# Backup compose overrides
cp docker-compose.override.yml backup/ 2>/dev/null || true
```

## Support

- GitHub Issues: https://github.com/grandcamel/as-demo/issues
- Documentation: https://github.com/grandcamel/as-demo/blob/main/CLAUDE.md

## References

- [Docker Documentation](https://docs.docker.com/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Grafana Alerting](https://grafana.com/docs/grafana/latest/alerting/)
