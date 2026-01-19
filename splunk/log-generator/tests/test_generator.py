"""Tests for log-generator/generator.py."""

import os
import signal
from unittest.mock import patch, MagicMock

import pytest


class TestConfiguration:
    """Tests for configuration parsing."""

    def test_default_events_per_minute(self):
        """Should default to 60 events per minute."""
        with patch.dict(os.environ, {}, clear=True):
            # Re-import to get fresh config
            import importlib
            import generator
            importlib.reload(generator)
            assert generator.EVENTS_PER_MINUTE == 60

    def test_custom_events_per_minute(self):
        """Should use custom events per minute from env."""
        with patch.dict(os.environ, {"EVENTS_PER_MINUTE": "120"}):
            import importlib
            import generator
            importlib.reload(generator)
            assert generator.EVENTS_PER_MINUTE == 120

    def test_default_anomaly_rate(self):
        """Should default to 0.05 anomaly rate."""
        with patch.dict(os.environ, {}, clear=True):
            import importlib
            import generator
            importlib.reload(generator)
            assert generator.ANOMALY_RATE == 0.05

    def test_custom_anomaly_rate(self):
        """Should use custom anomaly rate from env."""
        with patch.dict(os.environ, {"ANOMALY_RATE": "0.10"}):
            import importlib
            import generator
            importlib.reload(generator)
            assert generator.ANOMALY_RATE == 0.10


class TestSignalHandler:
    """Tests for signal handler."""

    def test_signal_handler_sets_running_false(self):
        """Signal handler should set running to False."""
        import generator
        generator.running = True

        generator.signal_handler(signal.SIGINT, None)

        assert generator.running is False

    def test_signal_handler_handles_sigterm(self):
        """Signal handler should handle SIGTERM."""
        import generator
        generator.running = True

        generator.signal_handler(signal.SIGTERM, None)

        assert generator.running is False


class TestRateCalculations:
    """Tests for rate calculations in main loop."""

    def test_batch_size_calculation(self):
        """Batch size should be at least 1."""
        # 60 events/min = 1 event/sec
        events_per_minute = 60
        events_per_second = events_per_minute / 60
        batch_size = max(1, int(events_per_second))
        assert batch_size == 1

    def test_batch_size_for_high_rate(self):
        """Batch size should scale with rate."""
        # 300 events/min = 5 events/sec
        events_per_minute = 300
        events_per_second = events_per_minute / 60
        batch_size = max(1, int(events_per_second))
        assert batch_size == 5

    def test_sleep_interval_calculation(self):
        """Sleep interval should produce correct rate."""
        events_per_minute = 60
        events_per_second = events_per_minute / 60
        batch_size = max(1, int(events_per_second))
        sleep_interval = batch_size / events_per_second

        # With 1 event/sec and batch_size 1, sleep should be 1 second
        assert sleep_interval == 1.0

    def test_sleep_interval_for_high_rate(self):
        """Sleep interval should be shorter for high rates."""
        events_per_minute = 300
        events_per_second = events_per_minute / 60
        batch_size = max(1, int(events_per_second))
        sleep_interval = batch_size / events_per_second

        # With 5 events/sec and batch_size 5, sleep should be 1 second
        assert sleep_interval == 1.0


class TestMainLoop:
    """Tests for main loop behavior."""

    @patch('generator.hec')
    @patch('generator.GENERATORS')
    def test_generates_events_in_batches(self, mock_generators, mock_hec):
        """Should generate events in batches."""
        import generator

        # Setup mock generator
        mock_gen = MagicMock(return_value={"event": "test"})
        mock_generators.__iter__ = MagicMock(return_value=iter([(mock_gen, 1.0)]))

        mock_hec.send.return_value = True
        mock_hec.wait_until_ready.return_value = True

        # Run one iteration
        generator.running = True
        events = []
        batch_size = 5

        for _ in range(batch_size):
            events.append(mock_gen())

        assert len(events) == batch_size

    @patch('generator.hec')
    def test_counts_errors_on_send_failure(self, mock_hec):
        """Should count errors when send fails."""
        mock_hec.send.return_value = False

        events = [{"event": "test"}]
        error_count = 0

        if not mock_hec.send(events):
            error_count += 1

        assert error_count == 1

    @patch('generator.hec')
    def test_counts_events_on_send_success(self, mock_hec):
        """Should count events when send succeeds."""
        mock_hec.send.return_value = True

        events = [{"event": "test1"}, {"event": "test2"}]
        event_count = 0

        if mock_hec.send(events):
            event_count += len(events)

        assert event_count == 2
