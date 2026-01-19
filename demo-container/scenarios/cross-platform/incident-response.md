# Incident Response Workflow

This scenario demonstrates a cross-platform incident response workflow spanning Splunk, Confluence, and JIRA.

## Workflow Overview

1. **Splunk**: Query for error patterns (500 errors in payment service)
2. **Confluence**: Find relevant runbook (payment service troubleshooting)
3. **JIRA**: Create P1 incident ticket with error details and runbook link

## Example Prompts

### Step 1: Investigate with Splunk

```
Search Splunk for 500 errors in the payment service in the last hour.
Show me the error rate trend and top error messages.
```

### Step 2: Find Runbook in Confluence

```
Search Confluence for "payment service runbook" or "payment troubleshooting guide".
Show me the runbook content.
```

### Step 3: Create Incident in JIRA

```
Create a P1 incident ticket in JIRA for the payment service errors.
Include:
- Summary: Payment service 500 errors spike
- Description: Link to the Splunk search and Confluence runbook
- Priority: Highest
- Labels: incident, payment-service
```

## Combined Prompt (Advanced)

```
There's a spike in 500 errors in the payment service.
1. Search Splunk for payment service errors in the last hour
2. Find the payment service runbook in Confluence
3. Create a P1 incident ticket in JIRA with the error details and runbook link
```

## Expected Behavior

Claude will:
1. Query Splunk using the `/splunk-search` skill
2. Search Confluence using the `/confluence-search` skill
3. Create a JIRA issue using the `/jira-issue` skill
4. Link all the information together coherently
