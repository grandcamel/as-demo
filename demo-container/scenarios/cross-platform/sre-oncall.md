# SRE On-Call Workflow

This scenario demonstrates an on-call engineer handling alerts and creating follow-up tasks.

## Workflow Overview

1. **Splunk**: View critical alerts and their severity
2. **Confluence**: Check knowledge base for known issues
3. **JIRA**: Create follow-up task for monitoring improvements

## Example Prompts

### Step 1: Review Alerts in Splunk

```
Show me all critical alerts that fired in the last 4 hours.
Group them by severity and source.
```

### Step 2: Check Knowledge Base

```
Search Confluence for known issues related to these alerts.
Look for any documented workarounds or root cause analysis.
```

### Step 3: Create Follow-up Tasks

```
Create a follow-up task in JIRA to improve monitoring for these alerts.
Include recommendations based on what we found in the knowledge base.
```

## Combined Prompt (Advanced)

```
I'm on-call and received several critical alerts. Help me:
1. Get a summary of all alerts from the last 4 hours from Splunk
2. Check the Confluence knowledge base for any related known issues
3. Create a JIRA task for any monitoring improvements needed
```

## Expected Behavior

Claude will systematically work through each platform, gathering context and creating actionable follow-ups.
