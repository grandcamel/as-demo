#!/usr/bin/env python3
"""
Splunk event generators and HEC client for AS-Demo.

Provides realistic log event generation for different personas and
a simple HTTP Event Collector client.
"""

import json
import os
import random
import time
import urllib3
from datetime import datetime

import requests
from faker import Faker

# Disable SSL warnings for self-signed certs
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

fake = Faker()


class HECClient:
    """HTTP Event Collector client for Splunk."""

    def __init__(self, default_host="unknown", timeout=10):
        self.url = os.environ.get("SPLUNK_HEC_URL", "https://splunk:8088")
        self.token = os.environ.get("SPLUNK_HEC_TOKEN", "demo-hec-token-12345")
        self.default_host = default_host
        self.timeout = timeout
        self._endpoint = f"{self.url}/services/collector/event"

    def wait_until_ready(self, max_retries=60, retry_interval=5):
        """Wait for HEC endpoint to become available."""
        print(f"Waiting for HEC at {self.url}...")
        for i in range(max_retries):
            try:
                resp = requests.get(
                    f"{self.url}/services/collector/health",
                    headers={"Authorization": f"Splunk {self.token}"},
                    verify=False,
                    timeout=self.timeout
                )
                if resp.status_code in (200, 400):  # 400 means HEC is up but needs event
                    print(f"HEC ready after {i * retry_interval}s")
                    return True
            except requests.exceptions.RequestException:
                pass
            print(f"  Waiting... ({i + 1}/{max_retries})")
            time.sleep(retry_interval)
        print("HEC not available after maximum retries")
        return False

    def send(self, events):
        """Send events to HEC. Returns True on success."""
        if not events:
            return True

        try:
            # Build payload - multiple events in single request
            payload = ""
            for event in events:
                hec_event = {
                    "event": event.get("event", event),
                    "source": event.get("source", "as-demo"),
                    "sourcetype": event.get("sourcetype", "_json"),
                    "index": event.get("index", "main"),
                    "host": event.get("host", self.default_host),
                }
                if "time" in event:
                    hec_event["time"] = event["time"]
                payload += json.dumps(hec_event)

            resp = requests.post(
                self._endpoint,
                data=payload,
                headers={
                    "Authorization": f"Splunk {self.token}",
                    "Content-Type": "application/json",
                },
                verify=False,
                timeout=self.timeout
            )
            return resp.status_code == 200
        except requests.exceptions.RequestException as e:
            print(f"HEC send error: {e}")
            return False


# Event generators for different personas

def generate_devops_event(timestamp=None, anomaly_rate=0.05):
    """Generate DevOps/CI-CD related events."""
    is_anomaly = random.random() < anomaly_rate

    pipelines = ["api-service", "web-frontend", "data-processor", "auth-service", "notification-worker"]
    stages = ["build", "test", "security-scan", "deploy-staging", "deploy-prod"]

    pipeline = random.choice(pipelines)
    stage = random.choice(stages)

    if is_anomaly:
        status = random.choice(["failed", "failed", "timeout"])
        duration = random.randint(300, 1800)
        message = random.choice([
            f"Pipeline {pipeline} failed at {stage}: dependency resolution error",
            f"Pipeline {pipeline} timeout at {stage}: exceeded 30m limit",
            f"Pipeline {pipeline} failed: security vulnerability detected",
        ])
    else:
        status = "success"
        duration = random.randint(60, 300)
        message = f"Pipeline {pipeline} completed {stage} successfully"

    event = {
        "event": {
            "pipeline": pipeline,
            "stage": stage,
            "status": status,
            "duration_seconds": duration,
            "message": message,
            "commit": fake.sha1()[:8],
            "author": fake.user_name(),
        },
        "source": "cicd",
        "sourcetype": "cicd:pipeline",
        "index": "devops",
    }
    if timestamp:
        event["time"] = timestamp
    return event


def generate_sre_event(timestamp=None, anomaly_rate=0.05):
    """Generate SRE/application monitoring events."""
    is_anomaly = random.random() < anomaly_rate

    services = ["api-gateway", "user-service", "payment-service", "inventory-service", "search-service"]
    service = random.choice(services)

    if is_anomaly:
        level = random.choice(["ERROR", "ERROR", "CRITICAL"])
        latency = random.randint(2000, 10000)
        error_rate = random.uniform(5, 25)
        message = random.choice([
            f"High error rate detected: {error_rate:.1f}%",
            f"Service degradation: latency spike to {latency}ms",
            f"Connection pool exhausted",
            f"Database connection timeout",
            f"Memory usage critical: 95%",
        ])
    else:
        level = random.choice(["INFO", "INFO", "INFO", "DEBUG", "WARN"])
        latency = random.randint(10, 200)
        error_rate = random.uniform(0, 1)
        message = random.choice([
            f"Request processed successfully",
            f"Health check passed",
            f"Cache hit ratio: {random.randint(85, 99)}%",
            f"Processed {random.randint(100, 1000)} requests/min",
        ])

    event = {
        "event": {
            "service": service,
            "level": level,
            "latency_ms": latency,
            "error_rate": round(error_rate, 2),
            "message": message,
            "host": f"{service}-{random.randint(1,5)}",
            "region": random.choice(["us-east-1", "us-west-2", "eu-west-1"]),
        },
        "source": "application",
        "sourcetype": "app:metrics",
        "index": "main",
    }
    if timestamp:
        event["time"] = timestamp
    return event


def generate_support_event(timestamp=None, anomaly_rate=0.05):
    """Generate support/user activity events."""
    is_anomaly = random.random() < anomaly_rate

    actions = ["login", "search", "view_product", "add_to_cart", "checkout", "support_ticket"]
    action = random.choice(actions)

    user_id = fake.uuid4()[:8]

    if is_anomaly:
        status = "error"
        response_time = random.randint(5000, 15000)
        message = random.choice([
            f"User session timeout",
            f"Payment processing failed",
            f"Feature unavailable due to service outage",
            f"Rate limit exceeded for user",
        ])
    else:
        status = "success"
        response_time = random.randint(100, 1500)
        message = f"User action completed: {action}"

    event = {
        "event": {
            "user_id": user_id,
            "action": action,
            "status": status,
            "response_time_ms": response_time,
            "message": message,
            "browser": random.choice(["Chrome", "Firefox", "Safari", "Edge"]),
            "platform": random.choice(["Windows", "macOS", "iOS", "Android"]),
        },
        "source": "user_activity",
        "sourcetype": "user:activity",
        "index": "main",
    }
    if timestamp:
        event["time"] = timestamp
    return event


def generate_security_event(timestamp=None, anomaly_rate=0.05):
    """Generate security/audit events."""
    is_anomaly = random.random() < anomaly_rate

    if is_anomaly:
        event_type = random.choice([
            "failed_login",
            "suspicious_activity",
            "blocked_request",
            "privilege_escalation_attempt"
        ])
        severity = random.choice(["high", "high", "critical"])
        message = random.choice([
            f"Multiple failed login attempts from {fake.ipv4()}",
            f"Suspicious API access pattern detected",
            f"Blocked SQL injection attempt",
            f"Unauthorized access attempt to admin endpoint",
        ])
    else:
        event_type = random.choice(["login_success", "password_change", "api_access", "audit_log"])
        severity = "info"
        message = f"Normal security event: {event_type}"

    event = {
        "event": {
            "event_type": event_type,
            "severity": severity,
            "source_ip": fake.ipv4(),
            "user": fake.user_name() if random.random() > 0.3 else None,
            "message": message,
            "geo": {
                "country": fake.country_code(),
                "city": fake.city(),
            },
        },
        "source": "security",
        "sourcetype": "security:audit",
        "index": "security",
    }
    if timestamp:
        event["time"] = timestamp
    return event


def generate_infrastructure_event(timestamp=None, anomaly_rate=0.05):
    """Generate infrastructure/system events."""
    is_anomaly = random.random() < anomaly_rate

    hosts = [f"srv-{i:03d}" for i in range(1, 20)]
    host = random.choice(hosts)

    if is_anomaly:
        cpu = random.randint(85, 100)
        memory = random.randint(85, 100)
        disk = random.randint(85, 100)
        status = "critical"
        message = random.choice([
            f"High CPU usage: {cpu}%",
            f"Memory pressure: {memory}% used",
            f"Disk space critical: {disk}% used",
            f"Network interface errors detected",
        ])
    else:
        cpu = random.randint(10, 60)
        memory = random.randint(30, 70)
        disk = random.randint(20, 60)
        status = "healthy"
        message = "System metrics normal"

    event = {
        "event": {
            "host": host,
            "cpu_percent": cpu,
            "memory_percent": memory,
            "disk_percent": disk,
            "status": status,
            "message": message,
            "uptime_hours": random.randint(1, 720),
        },
        "source": "infrastructure",
        "sourcetype": "infra:metrics",
        "index": "infrastructure",
    }
    if timestamp:
        event["time"] = timestamp
    return event


# Weighted generators for realistic distribution
GENERATORS = [
    (generate_sre_event, 0.35),           # 35% - application metrics
    (generate_devops_event, 0.20),        # 20% - CI/CD events
    (generate_support_event, 0.20),       # 20% - user activity
    (generate_infrastructure_event, 0.15),# 15% - infrastructure
    (generate_security_event, 0.10),      # 10% - security events
]


def generate_event(timestamp=None, anomaly_rate=0.05):
    """Generate a random event based on weighted distribution."""
    r = random.random()
    cumulative = 0
    for generator, weight in GENERATORS:
        cumulative += weight
        if r < cumulative:
            return generator(timestamp=timestamp, anomaly_rate=anomaly_rate)
    # Fallback
    return generate_sre_event(timestamp=timestamp, anomaly_rate=anomaly_rate)
