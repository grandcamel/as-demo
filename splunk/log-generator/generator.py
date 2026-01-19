#!/usr/bin/env python3
"""
Real-time log generator for Splunk Demo.

Generates realistic log events for different personas:
- DevOps: CI/CD pipelines, deployments, container events
- SRE: Application errors, latency metrics, health checks
- Support: User sessions, tickets, feature usage
- Management: KPIs, compliance, capacity metrics

Sends events to Splunk via HTTP Event Collector (HEC).
"""

import os
import random
import signal
import time

from splunk_events import GENERATORS, HECClient

# Configuration from environment
EVENTS_PER_MINUTE = int(os.environ.get("EVENTS_PER_MINUTE", "60"))
ANOMALY_RATE = float(os.environ.get("ANOMALY_RATE", "0.05"))

# Initialize HEC client
hec = HECClient(default_host="log-generator")

# Global flag for graceful shutdown
running = True


def signal_handler(signum, frame):
    """Handle shutdown signals."""
    global running
    print("\nShutting down log generator...")
    running = False


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


def main():
    """Main event generation loop."""
    print("Starting log generator...")
    print(f"  HEC URL: {hec.url}")
    print(f"  Events/min: {EVENTS_PER_MINUTE}")
    print(f"  Anomaly rate: {ANOMALY_RATE * 100}%")

    # Wait for Splunk to be ready
    if not hec.wait_until_ready(max_retries=60, retry_interval=5):
        print("Warning: Could not verify HEC availability, proceeding anyway...")

    # Calculate sleep interval
    events_per_second = EVENTS_PER_MINUTE / 60
    batch_size = max(1, int(events_per_second))
    sleep_interval = batch_size / events_per_second

    event_count = 0
    error_count = 0
    start_time = time.time()

    print(f"Generating {batch_size} events every {sleep_interval:.2f}s")
    print("-" * 50)

    while running:
        # Generate batch of events
        events = []
        for _ in range(batch_size):
            # Select generator based on weights
            r = random.random()
            cumulative = 0
            for generator, weight in GENERATORS:
                cumulative += weight
                if r < cumulative:
                    events.append(generator(anomaly_rate=ANOMALY_RATE))
                    break

        # Send to HEC
        if hec.send(events):
            event_count += len(events)
        else:
            error_count += 1

        # Progress output every 100 events
        if event_count % 100 < batch_size:
            elapsed = time.time() - start_time
            rate = event_count / elapsed if elapsed > 0 else 0
            print(f"Events: {event_count:,} | Rate: {rate:.1f}/s | Errors: {error_count}")

        time.sleep(sleep_interval)

    print(f"\nShutdown complete. Total events: {event_count:,}")


if __name__ == "__main__":
    main()
