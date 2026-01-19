#!/usr/bin/env python3
"""
Splunk Demo Data Seeder.

Seeds historical data into Splunk for the demo environment.
Creates 7 days of realistic log data across all indexes.

This runs once at startup to populate initial data, then exits.
"""

import os
import random
import sys
import time
from datetime import datetime, timedelta

from splunk_events import generate_event, HECClient

# Configuration from environment
DAYS_TO_SEED = int(os.environ.get("DAYS_TO_SEED", "7"))
EVENTS_PER_DAY = int(os.environ.get("EVENTS_PER_DAY", "50000"))
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "500"))

# Initialize HEC client
hec = HECClient(default_host="seed-data", timeout=30)


def seed_historical_data():
    """Seed historical data into Splunk."""
    print("=" * 60)
    print("Splunk Demo Data Seeder")
    print("=" * 60)
    print(f"  HEC URL: {hec.url}")
    print(f"  Days to seed: {DAYS_TO_SEED}")
    print(f"  Events per day: {EVENTS_PER_DAY:,}")
    print(f"  Total events: {DAYS_TO_SEED * EVENTS_PER_DAY:,}")
    print(f"  Batch size: {BATCH_SIZE}")
    print("=" * 60)

    if not hec.wait_until_ready(max_retries=120, retry_interval=5):
        sys.exit(1)

    # Calculate time range
    now = datetime.now()
    start_time = now - timedelta(days=DAYS_TO_SEED)

    # Define anomaly windows (simulate past incidents)
    anomaly_windows = []
    for day in range(1, DAYS_TO_SEED):
        if random.random() < 0.3:
            window_start = start_time + timedelta(days=day, hours=random.randint(8, 18))
            window_end = window_start + timedelta(hours=random.randint(1, 3))
            anomaly_windows.append((window_start.timestamp(), window_end.timestamp()))
            print(f"Anomaly window: {window_start.strftime('%Y-%m-%d %H:%M')} - {window_end.strftime('%H:%M')}")

    total_events = 0
    error_count = 0
    start = time.time()

    for day in range(DAYS_TO_SEED):
        day_start = start_time + timedelta(days=day)

        print(f"\nSeeding day {day + 1}/{DAYS_TO_SEED}: {day_start.strftime('%Y-%m-%d')}")

        # Generate timestamps for this day (distributed throughout the day)
        timestamps = []
        for _ in range(EVENTS_PER_DAY):
            hour = random.gauss(14, 4)
            hour = max(0, min(23, int(hour)))
            minute = random.randint(0, 59)
            second = random.randint(0, 59)
            ts = day_start.replace(hour=hour, minute=minute, second=second)
            timestamps.append(ts.timestamp())

        timestamps.sort()

        # Generate and send events in batches
        batch = []
        day_events = 0

        for ts in timestamps:
            # Check if timestamp is in anomaly window
            in_anomaly = any(ws <= ts <= we for ws, we in anomaly_windows)
            anomaly_rate = 0.30 if in_anomaly else 0.03

            event = generate_event(timestamp=ts, anomaly_rate=anomaly_rate)
            batch.append(event)

            if len(batch) >= BATCH_SIZE:
                if hec.send(batch):
                    total_events += len(batch)
                    day_events += len(batch)
                else:
                    error_count += 1

                batch = []

                if day_events % 10000 == 0:
                    elapsed = time.time() - start
                    rate = total_events / elapsed if elapsed > 0 else 0
                    print(f"  Progress: {day_events:,}/{EVENTS_PER_DAY:,} | Total: {total_events:,} | Rate: {rate:.0f}/s")

        # Send remaining batch
        if batch:
            if hec.send(batch):
                total_events += len(batch)
            else:
                error_count += 1

    # Final summary
    elapsed = time.time() - start
    print("\n" + "=" * 60)
    print("Seeding Complete!")
    print("=" * 60)
    print(f"  Total events: {total_events:,}")
    print(f"  Errors: {error_count}")
    print(f"  Duration: {elapsed/60:.1f} minutes")
    print(f"  Rate: {total_events/elapsed:.0f} events/second")
    print("=" * 60)


if __name__ == "__main__":
    seed_historical_data()
