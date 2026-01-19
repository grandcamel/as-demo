# Change Management Workflow

This scenario demonstrates coordinated deployment with documentation and monitoring.

## Workflow Overview

1. **JIRA**: Create change request for production deployment
2. **Confluence**: Update deployment log with change details
3. **Splunk**: Set up monitoring for deployment errors

## Example Prompts

### Step 1: Create Change Request

```
Create a change request ticket in JIRA for deploying version 2.5.0 to production.
Include:
- Summary: Production deployment v2.5.0
- Components: Backend API, Database
- Risk Level: Medium
- Rollback Plan: Revert to v2.4.3
```

### Step 2: Update Documentation

```
Create or update the deployment log page in Confluence.
Include the change request number, deployment date, and what's changing.
```

### Step 3: Set Up Monitoring

```
Create a Splunk saved search to monitor for errors related to version 2.5.0.
Set it to alert if error rate exceeds 5% in any 5-minute window.
```

## Combined Prompt (Advanced)

```
I'm preparing a production deployment of v2.5.0. Help me:
1. Create a JIRA change request with deployment details
2. Update the Confluence deployment log
3. Set up Splunk monitoring for deployment errors
```
