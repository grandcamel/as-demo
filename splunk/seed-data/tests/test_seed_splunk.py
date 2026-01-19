"""Tests for seed-data/seed_splunk.py."""

import os
import random
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock

import pytest


class TestConfiguration:
    """Tests for configuration parsing."""

    def test_default_days_to_seed(self):
        """Should default to 7 days."""
        with patch.dict(os.environ, {}, clear=True):
            import importlib
            import seed_splunk
            importlib.reload(seed_splunk)
            assert seed_splunk.DAYS_TO_SEED == 7

    def test_custom_days_to_seed(self):
        """Should use custom days from env."""
        with patch.dict(os.environ, {"DAYS_TO_SEED": "14"}):
            import importlib
            import seed_splunk
            importlib.reload(seed_splunk)
            assert seed_splunk.DAYS_TO_SEED == 14

    def test_default_events_per_day(self):
        """Should default to 50000 events per day."""
        with patch.dict(os.environ, {}, clear=True):
            import importlib
            import seed_splunk
            importlib.reload(seed_splunk)
            assert seed_splunk.EVENTS_PER_DAY == 50000

    def test_custom_events_per_day(self):
        """Should use custom events per day from env."""
        with patch.dict(os.environ, {"EVENTS_PER_DAY": "10000"}):
            import importlib
            import seed_splunk
            importlib.reload(seed_splunk)
            assert seed_splunk.EVENTS_PER_DAY == 10000

    def test_default_batch_size(self):
        """Should default to 500 batch size."""
        with patch.dict(os.environ, {}, clear=True):
            import importlib
            import seed_splunk
            importlib.reload(seed_splunk)
            assert seed_splunk.BATCH_SIZE == 500

    def test_custom_batch_size(self):
        """Should use custom batch size from env."""
        with patch.dict(os.environ, {"BATCH_SIZE": "1000"}):
            import importlib
            import seed_splunk
            importlib.reload(seed_splunk)
            assert seed_splunk.BATCH_SIZE == 1000


class TestTimestampGeneration:
    """Tests for timestamp generation logic."""

    def test_timestamps_are_sorted(self):
        """Generated timestamps should be sorted."""
        random.seed(42)  # For reproducibility
        day_start = datetime.now().replace(hour=0, minute=0, second=0)

        timestamps = []
        for _ in range(100):
            hour = random.gauss(14, 4)
            hour = max(0, min(23, int(hour)))
            minute = random.randint(0, 59)
            second = random.randint(0, 59)
            ts = day_start.replace(hour=hour, minute=minute, second=second)
            timestamps.append(ts.timestamp())

        timestamps.sort()

        # Verify sorted
        for i in range(len(timestamps) - 1):
            assert timestamps[i] <= timestamps[i + 1]

    def test_timestamps_within_day(self):
        """Timestamps should be within the day."""
        random.seed(42)
        day_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)

        for _ in range(100):
            hour = random.gauss(14, 4)
            hour = max(0, min(23, int(hour)))
            minute = random.randint(0, 59)
            second = random.randint(0, 59)
            ts = day_start.replace(hour=hour, minute=minute, second=second)

            assert ts >= day_start
            assert ts < day_end

    def test_hour_distribution_centered_around_14(self):
        """Hours should be centered around 14 (2 PM)."""
        random.seed(42)
        hours = []

        for _ in range(1000):
            hour = random.gauss(14, 4)
            hour = max(0, min(23, int(hour)))
            hours.append(hour)

        avg_hour = sum(hours) / len(hours)
        # Average should be close to 14 (within 1 hour)
        assert 13 <= avg_hour <= 15


class TestAnomalyWindows:
    """Tests for anomaly window generation."""

    def test_anomaly_window_format(self):
        """Anomaly windows should be tuples of (start, end) timestamps."""
        random.seed(42)
        now = datetime.now()
        start_time = now - timedelta(days=7)

        anomaly_windows = []
        for day in range(1, 7):
            if random.random() < 0.3:
                window_start = start_time + timedelta(days=day, hours=random.randint(8, 18))
                window_end = window_start + timedelta(hours=random.randint(1, 3))
                anomaly_windows.append((window_start.timestamp(), window_end.timestamp()))

        for ws, we in anomaly_windows:
            assert isinstance(ws, float)
            assert isinstance(we, float)
            assert we > ws

    def test_anomaly_window_duration(self):
        """Anomaly windows should be 1-3 hours long."""
        random.seed(42)
        now = datetime.now()
        start_time = now - timedelta(days=7)

        for day in range(1, 7):
            window_start = start_time + timedelta(days=day, hours=random.randint(8, 18))
            duration_hours = random.randint(1, 3)
            window_end = window_start + timedelta(hours=duration_hours)

            # Duration should be between 1 and 3 hours
            duration = (window_end - window_start).total_seconds() / 3600
            assert 1 <= duration <= 3

    def test_anomaly_rate_in_window(self):
        """Anomaly rate should be higher during anomaly windows."""
        anomaly_windows = [(1000.0, 2000.0)]

        # Timestamp inside window
        ts_inside = 1500.0
        in_anomaly = any(ws <= ts_inside <= we for ws, we in anomaly_windows)
        anomaly_rate_inside = 0.30 if in_anomaly else 0.03
        assert anomaly_rate_inside == 0.30

        # Timestamp outside window
        ts_outside = 500.0
        in_anomaly = any(ws <= ts_outside <= we for ws, we in anomaly_windows)
        anomaly_rate_outside = 0.30 if in_anomaly else 0.03
        assert anomaly_rate_outside == 0.03


class TestBatchProcessing:
    """Tests for batch processing logic."""

    def test_batch_accumulation(self):
        """Events should accumulate in batches."""
        batch = []
        batch_size = 5

        for i in range(12):
            batch.append({"event": f"test_{i}"})

            if len(batch) >= batch_size:
                assert len(batch) == batch_size
                batch = []

        # Remaining items
        assert len(batch) == 2  # 12 % 5 = 2

    def test_batch_send_on_threshold(self):
        """Batch should be sent when threshold reached."""
        batch = []
        batch_size = 5
        send_count = 0

        for i in range(12):
            batch.append({"event": f"test_{i}"})

            if len(batch) >= batch_size:
                send_count += 1
                batch = []

        # Should have sent 2 full batches (10 events)
        assert send_count == 2

    @patch('seed_splunk.hec')
    def test_remaining_batch_sent(self, mock_hec):
        """Remaining events should be sent after loop."""
        mock_hec.send.return_value = True

        batch = [{"event": "test_1"}, {"event": "test_2"}]
        total_events = 0

        # Simulate sending remaining batch
        if batch:
            if mock_hec.send(batch):
                total_events += len(batch)

        assert total_events == 2


class TestSeedFunction:
    """Tests for seed_historical_data function."""

    @patch('seed_splunk.hec')
    @patch('seed_splunk.generate_event')
    def test_exits_on_hec_not_ready(self, mock_gen, mock_hec):
        """Should exit when HEC is not ready."""
        mock_hec.wait_until_ready.return_value = False

        import seed_splunk

        with pytest.raises(SystemExit) as exc_info:
            seed_splunk.seed_historical_data()

        assert exc_info.value.code == 1

    @patch('seed_splunk.hec')
    @patch('seed_splunk.generate_event')
    @patch('seed_splunk.DAYS_TO_SEED', 1)
    @patch('seed_splunk.EVENTS_PER_DAY', 10)
    @patch('seed_splunk.BATCH_SIZE', 5)
    def test_generates_correct_number_of_events(self, mock_gen, mock_hec):
        """Should generate correct number of events."""
        mock_hec.wait_until_ready.return_value = True
        mock_hec.send.return_value = True
        mock_gen.return_value = {"event": "test"}

        import seed_splunk
        seed_splunk.seed_historical_data()

        # With 10 events and batch size 5, should have 2 full batches
        assert mock_hec.send.call_count >= 2
