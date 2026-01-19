# Knowledge Sync Workflow

This scenario demonstrates syncing resolved issues to release documentation.

## Workflow Overview

1. **JIRA**: Find all resolved bugs from last sprint
2. **Confluence**: Create release notes page with fix summaries

## Example Prompts

### Step 1: Query Resolved Issues

```
Search JIRA for all bugs resolved in the last sprint.
Include the summary, fix version, and resolution notes.
```

### Step 2: Generate Release Notes

```
Create a release notes page in Confluence with:
- Version number and release date
- Summary of bug fixes from JIRA
- Any known issues still open
```

## Combined Prompt (Advanced)

```
Generate release notes for version 2.5.0:
1. Get all resolved bugs from JIRA for the last sprint
2. Create a release notes page in Confluence with the fix summaries
```

## Expected Behavior

Claude will:
1. Query JIRA for resolved issues using JQL
2. Format the results into release note content
3. Create or update a Confluence page with the information
