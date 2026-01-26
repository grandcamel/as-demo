"""Multi-platform mock persistence patch for AS-Demo container.

This sitecustomize.py is automatically loaded by Python on startup.
It installs import hooks that patch mock clients for Confluence, JIRA,
and Splunk to use file-based persistence, allowing created resources
to persist across CLI invocations.

State files: /tmp/mock_state_{platform}.json (reset per scenario)

Environment variables:
    SKILL_TEST_PLATFORM: Platform(s) being tested (confluence|jira|splunk|all)
    {PLATFORM}_MOCK_MODE: Enable mock mode for specific platform (true/false)
    MOCK_STATE_FILE: Override default state file path

Supported platforms and their mock modules:
    - JIRA: jira_as.mock.base.MockJiraClientBase
    - Confluence: confluence_as.mock.base.MockConfluenceClientBase
    - Splunk: splunk_as.mock.base.MockSplunkClientBase (if available)
"""

import json
import os
import sys
from pathlib import Path
from typing import Any

# =============================================================================
# Configuration
# =============================================================================

# Platform detection from environment
PLATFORM = os.environ.get("SKILL_TEST_PLATFORM", "").lower()
PLATFORMS_UNDER_TEST = (
    ["confluence", "jira", "splunk"] if PLATFORM in ("all", "cross-platform")
    else [PLATFORM] if PLATFORM else []
)

# Default state file path (can be overridden)
def get_state_file(platform: str) -> Path:
    """Get the mock state file path for a platform."""
    override = os.environ.get("MOCK_STATE_FILE")
    if override:
        return Path(override)
    return Path(f"/tmp/mock_state_{platform}.json")


# =============================================================================
# Seed Data Exclusions (don't persist demo seed data)
# =============================================================================

# JIRA seed issues that should not be persisted
JIRA_SEED_KEYS = {
    "DEMO-84", "DEMO-85", "DEMO-86", "DEMO-87", "DEMO-91",
    "DEMOSD-1", "DEMOSD-2", "DEMOSD-3", "DEMOSD-4", "DEMOSD-5",
}

# Confluence seed pages/spaces that should not be persisted
CONFLUENCE_SEED_IDS = {
    "DEMO_SPACE", "DEMO_HOME", "CDEMO",
    # Add specific page IDs as needed
}

# Splunk typically doesn't have seed data that needs exclusion
SPLUNK_SEED_IDS: set[str] = set()


# =============================================================================
# State Persistence Functions
# =============================================================================

def _save_state(platform: str, data: dict, next_id: int) -> None:
    """Save mock state to file for a platform."""
    # Check if mock mode is enabled for this platform
    mock_env_var = f"{platform.upper()}_MOCK_MODE"
    if os.environ.get(mock_env_var, "").lower() != "true":
        return

    # Get seed exclusions for this platform
    seed_exclusions = {
        "jira": JIRA_SEED_KEYS,
        "confluence": CONFLUENCE_SEED_IDS,
        "splunk": SPLUNK_SEED_IDS,
    }.get(platform, set())

    state: dict[str, Any] = {
        "next_id": next_id,
        "data": {},
    }

    # Only save non-seed items
    for key, item in data.items():
        if key not in seed_exclusions:
            state["data"][key] = item

    try:
        state_file = get_state_file(platform)
        state_file.write_text(json.dumps(state, indent=2, default=str))
    except Exception:
        pass  # Silently fail - don't break CLI operations


def _load_state(platform: str) -> tuple[dict, int]:
    """Load mock state from file. Returns (data_dict, next_id)."""
    state_file = get_state_file(platform)
    if not state_file.exists():
        return {}, 100

    try:
        state = json.loads(state_file.read_text())
        return state.get("data", {}), state.get("next_id", 100)
    except Exception:
        return {}, 100


# =============================================================================
# Platform-Specific Patchers
# =============================================================================

def _wrap_with_persistence(platform: str, data_attr: str, next_id_attr: str):
    """Create a wrapper that saves state after method execution."""
    def decorator(original_method):
        def wrapper(self, *args, **kwargs):
            result = original_method(self, *args, **kwargs)
            _save_state(
                platform,
                getattr(self, data_attr),
                getattr(self, next_id_attr),
            )
            return result
        return wrapper
    return decorator


def _patch_jira_mock_client(cls) -> None:
    """Patch MockJiraClientBase for file-based persistence."""
    if getattr(cls, "_mock_persistence_patched", False):
        return

    original_init = cls.__init__

    def patched_init(self, *args, **kwargs):
        original_init(self, *args, **kwargs)
        persisted_data, next_id = _load_state("jira")
        if persisted_data:
            self._issues.update(persisted_data)
            self._next_issue_id = max(self._next_issue_id, next_id)

    cls.__init__ = patched_init

    # Wrap mutation methods
    wrapper = _wrap_with_persistence("jira", "_issues", "_next_issue_id")
    for method_name in ("create_issue", "update_issue", "transition_issue", "assign_issue"):
        if hasattr(cls, method_name):
            setattr(cls, method_name, wrapper(getattr(cls, method_name)))

    cls._mock_persistence_patched = True


def _patch_confluence_mock_client(cls) -> None:
    """Patch MockConfluenceClientBase for file-based persistence."""
    if getattr(cls, "_mock_persistence_patched", False):
        return

    original_init = cls.__init__

    def patched_init(self, *args, **kwargs):
        original_init(self, *args, **kwargs)
        persisted_data, next_id = _load_state("confluence")
        if persisted_data:
            self._pages.update(persisted_data)
            self._next_page_id = max(self._next_page_id, next_id)

    cls.__init__ = patched_init

    # Wrap mutation methods
    wrapper = _wrap_with_persistence("confluence", "_pages", "_next_page_id")
    for method_name in ("create_page", "update_page", "delete_page", "move_page"):
        if hasattr(cls, method_name):
            setattr(cls, method_name, wrapper(getattr(cls, method_name)))

    cls._mock_persistence_patched = True


def _patch_splunk_mock_client(cls) -> None:
    """Patch MockSplunkClientBase for file-based persistence."""
    if getattr(cls, "_mock_persistence_patched", False):
        return

    original_init = cls.__init__

    def patched_init(self, *args, **kwargs):
        original_init(self, *args, **kwargs)
        persisted_data, next_id = _load_state("splunk")
        if persisted_data:
            # Splunk mock structure may differ - adapt as needed
            if hasattr(self, "_saved_searches"):
                self._saved_searches.update(persisted_data)
            elif hasattr(self, "_jobs"):
                self._jobs.update(persisted_data)

    cls.__init__ = patched_init

    # Splunk mutation methods (adapt based on actual mock implementation)
    wrapper = _wrap_with_persistence("splunk", "_saved_searches", "_next_search_id")
    for method_name in ("create_saved_search", "update_saved_search", "delete_saved_search"):
        if hasattr(cls, method_name):
            setattr(cls, method_name, wrapper(getattr(cls, method_name)))

    cls._mock_persistence_patched = True


# =============================================================================
# Import Hook
# =============================================================================

# Map of module names to their patching functions and class names
MOCK_MODULE_CONFIG = {
    "jira_as.mock.base": {
        "class_name": "MockJiraClientBase",
        "patcher": _patch_jira_mock_client,
        "platform": "jira",
    },
    "confluence_as.mock.base": {
        "class_name": "MockConfluenceClientBase",
        "patcher": _patch_confluence_mock_client,
        "platform": "confluence",
    },
    "splunk_as.mock.base": {
        "class_name": "MockSplunkClientBase",
        "patcher": _patch_splunk_mock_client,
        "platform": "splunk",
    },
}


class MockPersistenceImportHook:
    """Import hook that patches mock clients when they're imported."""

    def find_module(self, fullname: str, path: Any = None) -> "MockPersistenceImportHook | None":
        """Return self if this is a module we want to patch."""
        if fullname in MOCK_MODULE_CONFIG:
            return self
        return None

    def load_module(self, fullname: str) -> Any:
        """Load the module and apply persistence patches."""
        config = MOCK_MODULE_CONFIG.get(fullname)
        if not config:
            return None

        # Check if already loaded
        if fullname in sys.modules:
            module = sys.modules[fullname]
            cls = getattr(module, config["class_name"], None)
            if cls and not getattr(cls, "_mock_persistence_patched", False):
                config["patcher"](cls)
            return module

        # Remove ourselves temporarily to avoid recursion
        sys.meta_path.remove(self)
        try:
            import importlib
            module = importlib.import_module(fullname)
            sys.modules[fullname] = module

            # Patch the class
            cls = getattr(module, config["class_name"], None)
            if cls:
                config["patcher"](cls)

            return module
        finally:
            # Re-add ourselves
            sys.meta_path.insert(0, self)


# =============================================================================
# Initialization
# =============================================================================

# Install the import hook
sys.meta_path.insert(0, MockPersistenceImportHook())  # type: ignore[arg-type]

# Debug output (only if verbose)
if os.environ.get("MOCK_VERBOSE", "").lower() == "true":
    print(f"[sitecustomize] Mock persistence enabled for platforms: {PLATFORMS_UNDER_TEST}", file=sys.stderr)
    print(f"[sitecustomize] State files: /tmp/mock_state_{{platform}}.json", file=sys.stderr)
