#!/usr/bin/env python3
"""
Skill Refinement Loop - Iteratively test and fix Assistant Skills.

Multi-platform support for Confluence, JIRA, Splunk, and cross-platform scenarios.
Runs skill tests, collects failures, invokes a fix agent to make changes,
then re-tests until all pass or max attempts reached.

Usage:
    python skill-refine-loop.py --scenario page --platform confluence
    python skill-refine-loop.py --scenario issue --platform jira
    python skill-refine-loop.py --scenario sre --platform splunk
    python skill-refine-loop.py --scenario incident-response --platform cross-platform
    python skill-refine-loop.py --scenario page --platform confluence --max-attempts 5 --verbose
"""

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

# =============================================================================
# Configuration
# =============================================================================

AS_DEMO_PATH = Path(__file__).parent.parent

# Base path for skills repositories (default: parent of as-demo)
# Can be overridden with SKILLS_BASE_PATH environment variable
SKILLS_BASE_PATH = Path(os.environ.get("SKILLS_BASE_PATH", AS_DEMO_PATH.parent))

# Platform-specific configuration
# Each platform can override its path with {PLATFORM}_SKILLS_PATH env var
# Otherwise defaults to SKILLS_BASE_PATH / {default_subdir}
PLATFORM_CONFIG = {
    "confluence": {
        "skills_path_env": "CONFLUENCE_SKILLS_PATH",
        "default_subdir": "Confluence-Assistant-Skills",
        "plugin_name": "confluence-assistant-skills",
        "lib_name": "confluence-as",
        "lib_package": "confluence_as",
        "env_vars": ["CONFLUENCE_API_TOKEN", "CONFLUENCE_EMAIL", "CONFLUENCE_SITE_URL"],
        "mock_env_var": "CONFLUENCE_MOCK_MODE",
        "scenarios_path": "confluence",
    },
    "jira": {
        "skills_path_env": "JIRA_SKILLS_PATH",
        "default_subdir": "Jira-Assistant-Skills",
        "plugin_name": "jira-assistant-skills",
        "lib_name": "jira-as",
        "lib_package": "jira_as",
        "env_vars": ["JIRA_API_TOKEN", "JIRA_EMAIL", "JIRA_SITE_URL"],
        "mock_env_var": "JIRA_MOCK_MODE",
        "scenarios_path": "jira",
    },
    "splunk": {
        "skills_path_env": "SPLUNK_SKILLS_PATH",
        "default_subdir": "Splunk-Assistant-Skills",
        "plugin_name": "splunk-assistant-skills",
        "lib_name": "splunk-as",
        "lib_package": "splunk_as",
        "env_vars": ["SPLUNK_URL", "SPLUNK_USERNAME", "SPLUNK_PASSWORD", "SPLUNK_HEC_TOKEN"],
        "mock_env_var": "SPLUNK_MOCK_MODE",
        "scenarios_path": "splunk",
    },
}

# Cross-platform requires all platforms
CROSS_PLATFORM_REQUIRED = ["confluence", "jira", "splunk"]


def get_skills_path(platform: str) -> Path:
    """Get the skills repository path for a platform.

    Resolution order:
    1. {PLATFORM}_SKILLS_PATH env var (e.g., CONFLUENCE_SKILLS_PATH)
    2. SKILLS_BASE_PATH / {default_subdir}
    3. {as-demo parent} / {default_subdir}
    """
    config = PLATFORM_CONFIG.get(platform)
    if not config:
        raise ValueError(f"Unknown platform: {platform}")

    env_var = config["skills_path_env"]
    if env_var in os.environ:
        return Path(os.environ[env_var])

    return SKILLS_BASE_PATH / config["default_subdir"]


def get_required_platforms(platform: str) -> list[str]:
    """Get list of required platforms for a given platform mode."""
    if platform in ("cross-platform", "all"):
        return CROSS_PLATFORM_REQUIRED
    return [platform]


# =============================================================================
# Test Runner
# =============================================================================


def run_skill_test(
    scenario: str,
    platform: str,
    model: str = "sonnet",
    judge_model: str = "haiku",
    prompt_index: int | None = None,
    fix_context: bool = False,
    verbose: bool = False,
    conversation: bool = True,
    fail_fast: bool = True,
    checkpoint_file: str | None = None,
    fork_from: int | None = None,
    mock_mode: bool = False,
) -> tuple[bool, dict | None]:
    """
    Run skill test with local source mounts.

    Returns: (all_passed, fix_context_or_none)
    """
    required_platforms = get_required_platforms(platform)

    # Build docker command
    cmd = ["docker", "run", "--rm"]

    # Add environment variables for all required platforms
    for p in required_platforms:
        config = PLATFORM_CONFIG[p]
        for var in config["env_vars"]:
            cmd.extend(["-e", f"{var}={os.environ.get(var, '')}"])
        # Enable mock mode if requested
        if mock_mode:
            cmd.extend(["-e", f"{config['mock_env_var']}=true"])

    # Set platform under test
    cmd.extend(["-e", f"SKILL_TEST_PLATFORM={platform}"])

    # Add credential mounts
    secrets_dir = AS_DEMO_PATH / "secrets"
    if (secrets_dir / ".credentials.json").exists():
        cmd.extend(["-v", f"{secrets_dir}/.credentials.json:/home/devuser/.claude/.credentials.json:ro"])
    if (secrets_dir / ".claude.json").exists():
        cmd.extend(["-v", f"{secrets_dir}/.claude.json:/home/devuser/.claude/.claude.json:ro"])

    # Add volume mounts for each platform's plugin and library
    for p in required_platforms:
        config = PLATFORM_CONFIG[p]
        skills_path = get_skills_path(p)

        # Find plugin path
        plugin_path = skills_path / "plugins" / config["plugin_name"]
        if not plugin_path.exists():
            plugin_path = skills_path / config["plugin_name"]

        # Library path
        lib_path = skills_path / config["lib_name"]

        if plugin_path.exists():
            cmd.extend([
                "-v",
                f"{plugin_path}:/home/devuser/.claude/plugins/cache/{config['plugin_name']}/{config['plugin_name']}/dev:ro",
            ])

        if lib_path.exists():
            cmd.extend(["-v", f"{lib_path}:/opt/{config['lib_name']}:ro"])

    # Ensure checkpoint directory exists on host
    checkpoint_dir = Path("/tmp/checkpoints")
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    cmd.extend(["-v", "/tmp/checkpoints:/tmp/checkpoints"])

    # Add entrypoint and image
    cmd.extend([
        "--entrypoint", "bash",
        "as-demo-container:latest",
        "-c",
    ])

    # Build the inner command
    # Install all required platform libraries
    lib_installs = []
    symlink_cmds = []
    for p in required_platforms:
        config = PLATFORM_CONFIG[p]
        lib_path = f"/opt/{config['lib_name']}"
        lib_installs.append(f"pip install -q -e {lib_path} 2>/dev/null")
        # Remove version symlink and replace with dev
        plugin_cache = f"/home/devuser/.claude/plugins/cache/{config['plugin_name']}/{config['plugin_name']}"
        symlink_cmds.append(f"rm -f {plugin_cache}/*[0-9]* 2>/dev/null; ln -sf dev {plugin_cache}/latest 2>/dev/null")

    install_cmd = "; ".join(lib_installs)
    symlink_cmd = "; ".join(symlink_cmds)

    # Determine scenario path
    if platform in ("cross-platform", "all"):
        scenario_path = f"/workspace/scenarios/cross-platform/{scenario}.prompts"
    else:
        scenario_path = f"/workspace/scenarios/{PLATFORM_CONFIG[platform]['scenarios_path']}/{scenario}.prompts"

    inner_cmd = (
        f"{install_cmd}; "
        f"{symlink_cmd}; "
        "mkdir -p /tmp/checkpoints; "
        f"python /workspace/skill-test.py {scenario_path} "
        f"--model {model} --judge-model {judge_model}"
    )

    # Add conversation mode and fail-fast for checkpoint-based iteration
    if conversation:
        inner_cmd += " --conversation"
    if fail_fast:
        inner_cmd += " --fail-fast"
    if checkpoint_file:
        inner_cmd += f" --checkpoint-file {checkpoint_file}"
    if fork_from is not None:
        inner_cmd += f" --fork-from {fork_from}"
    if prompt_index is not None:
        inner_cmd += f" --prompt-index {prompt_index}"
    if fix_context:
        skills_paths = ",".join(str(get_skills_path(p)) for p in required_platforms)
        inner_cmd += f" --fix-context {skills_paths}"
    if verbose:
        inner_cmd += " --verbose"
    if mock_mode:
        inner_cmd += " --mock"

    cmd.append(inner_cmd)

    if verbose:
        print(f"Running: docker run ... (scenario={scenario}, platform={platform})")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600,  # 10 minute timeout
        )
    except subprocess.TimeoutExpired:
        print("Error: Test timed out")
        return False, None
    except Exception as e:
        print(f"Error running test: {e}")
        return False, None

    # Parse output
    if fix_context:
        # Output is fix context JSON
        stdout = result.stdout.strip()

        # Try to parse the whole stdout as JSON
        try:
            ctx = json.loads(stdout)
            if isinstance(ctx, dict):
                if ctx.get("status") == "all_passed":
                    return True, None
                return False, ctx
        except json.JSONDecodeError:
            pass

        # Find JSON object in output
        brace_idx = stdout.find("{")
        if brace_idx >= 0:
            try:
                ctx = json.loads(stdout[brace_idx:])
                if isinstance(ctx, dict):
                    if ctx.get("status") == "all_passed":
                        return True, None
                    return False, ctx
            except json.JSONDecodeError:
                pass

        print("Error: Could not parse fix context from output")
        if verbose:
            print(f"stdout length: {len(result.stdout)}")
            print(f"stderr length: {len(result.stderr)}")
            print(f"stdout (last 2000 chars): {result.stdout[-2000:]}")
            print(f"stderr (last 500 chars): {result.stderr[-500:]}")
        return False, None
    else:
        # Check exit code for pass/fail
        return result.returncode == 0, None


# =============================================================================
# Fix Agent
# =============================================================================


def _parse_fix_agent_output(output: str, default_session_id: str | None) -> str | None:
    """Extract session ID from fix agent JSON output."""
    try:
        output_data = json.loads(output)
        return output_data.get("session_id", default_session_id)
    except json.JSONDecodeError:
        return default_session_id


def _extract_text_from_output(output: str) -> str:
    """Extract text content from fix agent output."""
    try:
        output_data = json.loads(output)
        if isinstance(output_data.get("result"), str):
            return output_data["result"]
        if isinstance(output_data.get("content"), list):
            return "\n".join(
                block.get("text", "") for block in output_data["content"]
                if block.get("type") == "text"
            )
    except json.JSONDecodeError:
        pass
    return output


def run_fix_agent(
    fix_context: dict,
    platform: str,
    verbose: bool = False,
    session_id: str | None = None,
    attempt_history: list[dict] | None = None,
) -> dict:
    """
    Run the skill-fix agent to make changes based on failure context.

    Args:
        fix_context: Context about the failure from skill-test.py
        platform: The platform being tested
        verbose: Enable verbose output
        session_id: Optional session ID to continue previous fix session
        attempt_history: List of previous fix attempts for context

    Returns: {"success": bool, "files_changed": [...], "summary": "...", "session_id": "..."}
    """
    required_platforms = get_required_platforms(platform)
    failure = fix_context["failure"]

    # Build prompt header based on platform
    platform_name = platform.title() if platform != "cross-platform" else "Cross-Platform"
    prompt = f"""You are a skill refinement agent. A {platform_name} Assistant Skill test has failed and you need to fix it.

## Failure Details

**Prompt that failed:**
{failure['prompt_text']}

**Tools called:** {failure['tools_called']}

**Tool Assertions:**
{json.dumps(failure['tool_assertions'], indent=2)}

**Text Assertions:**
{json.dumps(failure['text_assertions'], indent=2)}

**Quality Rating:** {failure['quality']}
**Tool Accuracy:** {failure['tool_accuracy']}

**Judge Reasoning:**
{failure['reasoning']}

**Refinement Suggestion:**
{failure['refinement_suggestion']}

## Relevant Files

"""

    # Add paths for all platforms involved
    for p in required_platforms:
        config = PLATFORM_CONFIG[p]
        skills_path = get_skills_path(p)
        prompt += f"**{p.title()} skill files:** {skills_path}/{config['plugin_name']}/skills/\n"
        prompt += f"**{p.title()} library files:** {skills_path}/{config['lib_name']}/src/{config['lib_package']}/\n"

    prompt += "\nCurrent relevant file contents:\n"

    for path, content in fix_context.get("relevant_files", {}).items():
        prompt += f"\n### {path}\n```\n{content[:3000]}\n```\n"

    if fix_context.get("git_history"):
        prompt += "\n## Recent Git History\n"
        for commit in fix_context["git_history"]:
            prompt += f"- {commit['commit']}: {commit['message']}\n"

    # Add previous attempt history
    if attempt_history:
        prompt += "\n## Previous Fix Attempts (this session)\n"
        for h in attempt_history:
            prompt += f"- Attempt {h['attempt']}: "
            if h.get('files'):
                prompt += f"Changed {h['files']}, "
            prompt += f"Result: {h['result']}\n"
            if h.get('error_summary'):
                prompt += f"  Error: {h['error_summary']}\n"

    prompt += """

## Your Task

Analyze the failure and make targeted changes to fix it. Focus on:

1. **If tool selection is wrong**: Update the skill description to better trigger on this type of query
2. **If tool worked but output is wrong**: Check if the skill examples or instructions need improvement
3. **If there's an API error**: Check the library code for bugs

Make minimal, focused changes. Edit the actual files - do not just describe what to change.

After making changes, provide a brief summary of what you changed and why.
"""

    if verbose:
        print(f"Running fix agent with context for prompt: {failure['prompt_text'][:50]}...")
        if session_id:
            print(f"Continuing session: {session_id}")

    # Determine working directory - use first platform's skills path
    primary_skills_path = get_skills_path(required_platforms[0])

    # Run Claude to make the fixes
    cmd = [
        "claude",
        "-p", prompt,
        "--model", "sonnet",
        "--dangerously-skip-permissions",
        "--output-format", "json",
    ]

    if session_id:
        cmd.extend(["--resume", session_id])

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,
            cwd=str(primary_skills_path),
        )
    except subprocess.TimeoutExpired:
        return {"success": False, "files_changed": [], "summary": "Fix agent timed out", "session_id": session_id}
    except Exception as e:
        return {"success": False, "files_changed": [], "summary": f"Fix agent error: {e}", "session_id": session_id}

    # Parse output
    output = result.stdout
    new_session_id = _parse_fix_agent_output(output, session_id)
    output = _extract_text_from_output(output)

    # Look for file edit indicators
    files_changed = []
    if "Edit" in output or "edited" in output.lower() or "updated" in output.lower():
        file_patterns = re.findall(r'(?:skills/|lib/|src/)[^\s\'"]+\.(?:md|py)', output)
        files_changed = list(set(file_patterns))

    return {
        "success": result.returncode == 0,
        "files_changed": files_changed,
        "summary": output[-500:] if len(output) > 500 else output,
        "session_id": new_session_id,
    }


# =============================================================================
# Main Loop
# =============================================================================


def run_refinement_loop(
    scenario: str,
    platform: str,
    max_attempts: int = 3,
    model: str = "sonnet",
    judge_model: str = "haiku",
    verbose: bool = False,
    mock_mode: bool = False,
) -> bool:
    """
    Run the refinement loop until all tests pass or max attempts reached.

    Uses checkpoint-based iteration:
    - Fail-fast: Stop at first failing prompt
    - Fork from checkpoint: On retry, skip passed prompts
    - Single fix session: Maintain context across fix attempts

    Returns: True if all tests pass, False otherwise
    """
    print(f"{'=' * 70}")
    print("SKILL REFINEMENT LOOP (with checkpoint-based iteration)")
    print(f"{'=' * 70}")
    print(f"Scenario: {scenario}")
    print(f"Platform: {platform}")

    required_platforms = get_required_platforms(platform)
    for p in required_platforms:
        print(f"  {p.title()} skills: {get_skills_path(p)}")

    print(f"Max attempts: {max_attempts}")
    print(f"Model: {model}, Judge: {judge_model}")
    print(f"Mock mode: {mock_mode}")
    print(f"{'=' * 70}")
    print()

    # State for checkpoint-based iteration
    checkpoint_file = f"/tmp/checkpoints/{platform}_{scenario}.json"
    fix_session_id: str | None = None
    attempt_history: list[dict] = []
    last_failing_prompt_index: int | None = None

    for attempt in range(1, max_attempts + 1):
        print(f"[Attempt {attempt}/{max_attempts}]")
        print("-" * 40)

        # Determine if we should fork from checkpoint
        fork_from: int | None = None
        prompt_index: int | None = None

        if attempt > 1 and last_failing_prompt_index is not None:
            if last_failing_prompt_index > 0:
                fork_from = last_failing_prompt_index - 1
                prompt_index = last_failing_prompt_index
                print(f"Forking from checkpoint {fork_from}, running prompt {prompt_index}")
            else:
                prompt_index = 0
                print("First prompt failed, running from start")

        # Run test with fix context output
        all_passed, fix_ctx = run_skill_test(
            scenario=scenario,
            platform=platform,
            model=model,
            judge_model=judge_model,
            fix_context=True,
            verbose=verbose,
            conversation=True,
            fail_fast=True,
            checkpoint_file=checkpoint_file,
            fork_from=fork_from,
            prompt_index=prompt_index,
            mock_mode=mock_mode,
        )

        if all_passed:
            print()
            print(f"{'=' * 70}")
            print(f"SUCCESS: All tests passed on attempt {attempt}")
            print(f"{'=' * 70}")
            return True

        if not fix_ctx:
            print("Error: Test failed but no fix context available")
            continue

        failure = fix_ctx.get("failure", {})
        last_failing_prompt_index = failure.get("prompt_index")
        print(f"Failed at prompt {last_failing_prompt_index}: {failure.get('prompt_text', 'unknown')[:60]}...")
        print(f"Quality: {failure.get('quality', 'unknown')}")
        print(f"Refinement suggestion: {failure.get('refinement_suggestion', 'none')[:100]}...")
        print()

        # Run fix agent with session continuity
        print("Running fix agent...")
        if fix_session_id:
            print(f"Continuing fix session: {fix_session_id[:20]}...")
        fix_result = run_fix_agent(
            fix_ctx,
            platform,
            verbose=verbose,
            session_id=fix_session_id,
            attempt_history=attempt_history,
        )

        fix_session_id = fix_result.get("session_id", fix_session_id)

        attempt_history.append({
            "attempt": attempt,
            "files": fix_result["files_changed"],
            "result": "still failing",
            "error_summary": failure.get('refinement_suggestion', '')[:100],
        })

        if fix_result["files_changed"]:
            print(f"Files changed: {fix_result['files_changed']}")
        else:
            print("No files changed (fix may have failed)")

        print(f"Summary: {fix_result['summary'][:200]}...")
        print()

    print(f"{'=' * 70}")
    print(f"FAILED: Max attempts ({max_attempts}) reached without passing all tests")
    print(f"{'=' * 70}")
    return False


# =============================================================================
# CLI
# =============================================================================


def main():
    parser = argparse.ArgumentParser(
        description="Skill Refinement Loop - Iteratively test and fix Assistant Skills",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python skill-refine-loop.py --scenario page --platform confluence
    python skill-refine-loop.py --scenario issue --platform jira
    python skill-refine-loop.py --scenario sre --platform splunk
    python skill-refine-loop.py --scenario incident-response --platform cross-platform
    python skill-refine-loop.py --scenario page --platform confluence --max-attempts 5 --mock
        """,
    )
    parser.add_argument("--scenario", required=True, help="Scenario name (e.g., page, issue, sre)")
    parser.add_argument(
        "--platform",
        required=True,
        choices=["confluence", "jira", "splunk", "cross-platform", "all"],
        help="Platform to test",
    )
    parser.add_argument("--max-attempts", type=int, default=3,
                        help="Maximum fix attempts before giving up (default: 3)")
    parser.add_argument("--model", default="sonnet", help="Model for running prompts (default: sonnet)")
    parser.add_argument("--judge-model", default="haiku", help="Model for LLM judge (default: haiku)")
    parser.add_argument("--mock", action="store_true", help="Enable mock mode for testing")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    args = parser.parse_args()

    # Validate skills paths for required platforms
    required_platforms = get_required_platforms(args.platform)
    for platform in required_platforms:
        skills_path = get_skills_path(platform)
        config = PLATFORM_CONFIG[platform]

        plugin_path = skills_path / "plugins" / config["plugin_name"]
        if not plugin_path.exists():
            plugin_path = skills_path / config["plugin_name"]

        if not plugin_path.exists():
            print(f"Error: {platform.title()} plugin not found at {skills_path}")
            print(f"  Expected: {skills_path}/plugins/{config['plugin_name']} or {skills_path}/{config['plugin_name']}")
            sys.exit(1)

    # Check environment for required platforms
    for platform in required_platforms:
        config = PLATFORM_CONFIG[platform]
        primary_env = config["env_vars"][0]  # e.g., JIRA_API_TOKEN
        if not os.environ.get(primary_env):
            print(f"Warning: {primary_env} not set for {platform}")

    success = run_refinement_loop(
        scenario=args.scenario,
        platform=args.platform,
        max_attempts=args.max_attempts,
        model=args.model,
        judge_model=args.judge_model,
        verbose=args.verbose,
        mock_mode=args.mock,
    )

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
