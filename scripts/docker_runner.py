#!/usr/bin/env python3
"""
Docker Runner - Centralized Docker command builder for AS-Demo.

Provides utilities for building Docker commands with platform-specific
environment variables, volume mounts, and configurations.

Usage:
    from docker_runner import DockerCommandBuilder

    builder = DockerCommandBuilder(platform="jira", scenario="issue")
    cmd = builder.build_run_command(
        entrypoint="python /workspace/skill-test.py /workspace/scenarios/jira/issue.prompts"
    )
    subprocess.run(cmd)
"""

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


# =============================================================================
# Platform Configuration
# =============================================================================

@dataclass
class PlatformConfig:
    """Configuration for a single platform."""
    name: str
    skills_path_env: str
    default_skills_path: str
    plugin_name: str
    lib_name: str
    lib_package: str
    env_vars: list[str]
    mock_env_var: str
    scenarios_subdir: str


PLATFORMS: dict[str, PlatformConfig] = {
    "confluence": PlatformConfig(
        name="confluence",
        skills_path_env="CONFLUENCE_SKILLS_PATH",
        default_skills_path="/Users/jasonkrueger/IdeaProjects/Confluence-Assistant-Skills",
        plugin_name="confluence-assistant-skills",
        lib_name="confluence-as",
        lib_package="confluence_as",
        env_vars=["CONFLUENCE_API_TOKEN", "CONFLUENCE_EMAIL", "CONFLUENCE_SITE_URL"],
        mock_env_var="CONFLUENCE_MOCK_MODE",
        scenarios_subdir="confluence",
    ),
    "jira": PlatformConfig(
        name="jira",
        skills_path_env="JIRA_SKILLS_PATH",
        default_skills_path="/Users/jasonkrueger/IdeaProjects/Jira-Assistant-Skills",
        plugin_name="jira-assistant-skills",
        lib_name="jira-as",
        lib_package="jira_as",
        env_vars=["JIRA_API_TOKEN", "JIRA_EMAIL", "JIRA_SITE_URL"],
        mock_env_var="JIRA_MOCK_MODE",
        scenarios_subdir="jira",
    ),
    "splunk": PlatformConfig(
        name="splunk",
        skills_path_env="SPLUNK_SKILLS_PATH",
        default_skills_path="/Users/jasonkrueger/IdeaProjects/Splunk-Assistant-Skills",
        plugin_name="splunk-assistant-skills",
        lib_name="splunk-as",
        lib_package="splunk_as",
        env_vars=["SPLUNK_URL", "SPLUNK_USERNAME", "SPLUNK_PASSWORD", "SPLUNK_HEC_TOKEN"],
        mock_env_var="SPLUNK_MOCK_MODE",
        scenarios_subdir="splunk",
    ),
}

CROSS_PLATFORM_REQUIRED = ["confluence", "jira", "splunk"]


# =============================================================================
# Utility Functions
# =============================================================================

def get_skills_path(platform: str) -> Path:
    """Get the skills repository path for a platform."""
    config = PLATFORMS.get(platform)
    if not config:
        raise ValueError(f"Unknown platform: {platform}")
    return Path(os.environ.get(config.skills_path_env, config.default_skills_path))


def get_required_platforms(platform: str) -> list[str]:
    """Get list of required platforms for a given platform mode."""
    if platform in ("cross-platform", "all"):
        return CROSS_PLATFORM_REQUIRED
    if platform in PLATFORMS:
        return [platform]
    raise ValueError(f"Unknown platform: {platform}")


def find_plugin_path(skills_path: Path, plugin_name: str) -> Path | None:
    """Find the plugin directory within a skills repository."""
    # Try plugins/<name> first
    path = skills_path / "plugins" / plugin_name
    if path.exists():
        return path
    # Fall back to <name> in root
    path = skills_path / plugin_name
    if path.exists():
        return path
    return None


def find_lib_path(skills_path: Path, lib_name: str) -> Path | None:
    """Find the library directory within a skills repository."""
    path = skills_path / lib_name
    return path if path.exists() else None


# =============================================================================
# Docker Command Builder
# =============================================================================

@dataclass
class DockerCommandBuilder:
    """Builder for Docker run commands with platform-specific configuration."""

    platform: str
    image: str = "as-demo-container:latest"
    project_root: Path = field(default_factory=lambda: Path(__file__).parent.parent)

    # Options
    remove: bool = True
    network: str | None = None
    workdir: str | None = None
    mock_mode: bool = False

    # Skills path overrides (platform -> path)
    skills_paths: dict[str, Path] = field(default_factory=dict)

    # Additional configuration
    extra_env_vars: dict[str, str] = field(default_factory=dict)
    extra_volumes: list[tuple[str, str, str]] = field(default_factory=list)  # (host, container, mode)

    def _get_skills_path(self, platform: str) -> Path:
        """Get skills path with optional override."""
        if platform in self.skills_paths:
            return self.skills_paths[platform]
        return get_skills_path(platform)

    def build_env_args(self) -> list[str]:
        """Build environment variable arguments."""
        args: list[str] = []
        required_platforms = get_required_platforms(self.platform)

        for p in required_platforms:
            config = PLATFORMS[p]

            # Add platform env vars
            for var in config.env_vars:
                value = os.environ.get(var, "")
                args.extend(["-e", f"{var}={value}"])

            # Add mock mode env var if enabled
            if self.mock_mode:
                args.extend(["-e", f"{config.mock_env_var}=true"])

        # Add platform under test
        args.extend(["-e", f"SKILL_TEST_PLATFORM={self.platform}"])

        # Add extra env vars
        for key, value in self.extra_env_vars.items():
            args.extend(["-e", f"{key}={value}"])

        return args

    def build_volume_args(self) -> list[str]:
        """Build volume mount arguments."""
        args: list[str] = []
        required_platforms = get_required_platforms(self.platform)

        # Credential mounts
        secrets_dir = self.project_root / "secrets"
        if (secrets_dir / ".credentials.json").exists():
            args.extend(["-v", f"{secrets_dir}/.credentials.json:/home/devuser/.claude/.credentials.json:ro"])
        if (secrets_dir / ".claude.json").exists():
            args.extend(["-v", f"{secrets_dir}/.claude.json:/home/devuser/.claude/.claude.json:ro"])

        # Platform plugin and library mounts
        for p in required_platforms:
            config = PLATFORMS[p]
            skills_path = self._get_skills_path(p)

            # Plugin mount
            plugin_path = find_plugin_path(skills_path, config.plugin_name)
            if plugin_path:
                container_path = f"/home/devuser/.claude/plugins/cache/{config.plugin_name}/{config.plugin_name}/dev"
                args.extend(["-v", f"{plugin_path}:{container_path}:ro"])

            # Library mount
            lib_path = find_lib_path(skills_path, config.lib_name)
            if lib_path:
                args.extend(["-v", f"{lib_path}:/opt/{config.lib_name}:ro"])

        # Checkpoint directory (for persistence across container runs)
        checkpoint_dir = Path("/tmp/checkpoints")
        checkpoint_dir.mkdir(parents=True, exist_ok=True)
        args.extend(["-v", "/tmp/checkpoints:/tmp/checkpoints"])

        # Extra volumes
        for host, container, mode in self.extra_volumes:
            args.extend(["-v", f"{host}:{container}:{mode}"])

        return args

    def build_lib_install_command(self) -> str:
        """Build command to install platform libraries in container."""
        required_platforms = get_required_platforms(self.platform)
        installs = []

        for p in required_platforms:
            config = PLATFORMS[p]
            installs.append(f"pip install -q -e /opt/{config.lib_name} 2>/dev/null")

        return "; ".join(installs)

    def build_symlink_command(self) -> str:
        """Build command to set up plugin symlinks in container."""
        required_platforms = get_required_platforms(self.platform)
        cmds = []

        for p in required_platforms:
            config = PLATFORMS[p]
            plugin_cache = f"/home/devuser/.claude/plugins/cache/{config.plugin_name}/{config.plugin_name}"
            cmds.append(f"rm -f {plugin_cache}/*[0-9]* 2>/dev/null; ln -sf dev {plugin_cache}/latest 2>/dev/null")

        return "; ".join(cmds)

    def build_run_command(
        self,
        entrypoint: str | None = None,
        command: str | None = None,
        use_bash_wrapper: bool = True,
    ) -> list[str]:
        """
        Build the complete docker run command.

        Args:
            entrypoint: Command to run in the container
            command: Alternative to entrypoint (passed after image)
            use_bash_wrapper: Wrap command in bash -c for lib installs

        Returns:
            List of command arguments for subprocess.run()
        """
        cmd = ["docker", "run"]

        if self.remove:
            cmd.append("--rm")

        if self.network:
            cmd.extend(["--network", self.network])

        if self.workdir:
            cmd.extend(["-w", self.workdir])

        # Add environment and volume args
        cmd.extend(self.build_env_args())
        cmd.extend(self.build_volume_args())

        # Handle entrypoint/command
        if use_bash_wrapper and entrypoint:
            # Wrap in bash -c with lib installs
            setup_cmd = self.build_lib_install_command()
            symlink_cmd = self.build_symlink_command()
            inner_cmd = f"{setup_cmd}; {symlink_cmd}; mkdir -p /tmp/checkpoints; {entrypoint}"

            cmd.extend(["--entrypoint", "bash", self.image, "-c", inner_cmd])
        elif entrypoint:
            # Direct entrypoint
            cmd.extend(["--entrypoint", entrypoint, self.image])
            if command:
                cmd.append(command)
        else:
            # Just image with optional command
            cmd.append(self.image)
            if command:
                cmd.append(command)

        return cmd

    def get_scenario_path(self, scenario: str) -> str:
        """Get the container path for a scenario file."""
        if self.platform in ("cross-platform", "all"):
            return f"/workspace/scenarios/cross-platform/{scenario}.prompts"
        config = PLATFORMS[self.platform]
        return f"/workspace/scenarios/{config.scenarios_subdir}/{scenario}.prompts"


# =============================================================================
# Convenience Functions
# =============================================================================

def build_skill_test_command(
    platform: str,
    scenario: str,
    model: str = "sonnet",
    judge_model: str = "haiku",
    verbose: bool = False,
    mock_mode: bool = False,
    conversation: bool = True,
    fail_fast: bool = True,
    checkpoint_file: str | None = None,
    fork_from: int | None = None,
    prompt_index: int | None = None,
    fix_context: str | None = None,
) -> list[str]:
    """
    Build a Docker command for running skill-test.py.

    Convenience wrapper around DockerCommandBuilder.
    """
    builder = DockerCommandBuilder(
        platform=platform,
        mock_mode=mock_mode,
    )

    scenario_path = builder.get_scenario_path(scenario)

    # Build skill-test.py command
    test_cmd = f"python /workspace/skill-test.py {scenario_path}"
    test_cmd += f" --model {model} --judge-model {judge_model}"

    if conversation:
        test_cmd += " --conversation"
    if fail_fast:
        test_cmd += " --fail-fast"
    if verbose:
        test_cmd += " --verbose"
    if mock_mode:
        test_cmd += " --mock"
    if checkpoint_file:
        test_cmd += f" --checkpoint-file {checkpoint_file}"
    if fork_from is not None:
        test_cmd += f" --fork-from {fork_from}"
    if prompt_index is not None:
        test_cmd += f" --prompt-index {prompt_index}"
    if fix_context:
        test_cmd += f" --fix-context {fix_context}"

    return builder.build_run_command(entrypoint=test_cmd)


def validate_platform_setup(platform: str) -> dict[str, Any]:
    """
    Validate that a platform is properly configured.

    Returns dict with validation results.
    """
    result: dict[str, Any] = {
        "platform": platform,
        "valid": True,
        "errors": [],
        "warnings": [],
    }

    required_platforms = get_required_platforms(platform)

    for p in required_platforms:
        config = PLATFORMS[p]
        skills_path = get_skills_path(p)

        # Check skills path exists
        if not skills_path.exists():
            result["errors"].append(f"{p}: Skills path does not exist: {skills_path}")
            result["valid"] = False
            continue

        # Check plugin exists
        plugin_path = find_plugin_path(skills_path, config.plugin_name)
        if not plugin_path:
            result["errors"].append(f"{p}: Plugin not found in {skills_path}")
            result["valid"] = False

        # Check library exists
        lib_path = find_lib_path(skills_path, config.lib_name)
        if not lib_path:
            result["warnings"].append(f"{p}: Library not found at {skills_path}/{config.lib_name}")

        # Check env vars
        for var in config.env_vars:
            if not os.environ.get(var):
                result["warnings"].append(f"{p}: Environment variable {var} not set")

    return result


# =============================================================================
# CLI (for testing)
# =============================================================================

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Docker Runner CLI")
    parser.add_argument("--platform", required=True, choices=list(PLATFORMS.keys()) + ["cross-platform", "all"])
    parser.add_argument("--validate", action="store_true", help="Validate platform setup")
    parser.add_argument("--show-command", action="store_true", help="Show example docker command")
    parser.add_argument("--scenario", default="test", help="Scenario name for example command")
    args = parser.parse_args()

    if args.validate:
        result = validate_platform_setup(args.platform)
        print(f"Platform: {result['platform']}")
        print(f"Valid: {result['valid']}")
        if result["errors"]:
            print("Errors:")
            for e in result["errors"]:
                print(f"  - {e}")
        if result["warnings"]:
            print("Warnings:")
            for w in result["warnings"]:
                print(f"  - {w}")

    if args.show_command:
        cmd = build_skill_test_command(
            platform=args.platform,
            scenario=args.scenario,
            verbose=True,
        )
        print("\nDocker command:")
        print(" ".join(cmd))
