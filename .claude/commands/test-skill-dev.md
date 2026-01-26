---
description: "Fast skill test with verbose output: PLATFORM=confluence|jira|splunk SCENARIO=name"
arguments:
  - name: PLATFORM
    description: Platform to test (confluence, jira, splunk, cross-platform)
    required: true
  - name: SCENARIO
    description: Scenario name (e.g., page, issue, sre)
    required: true
---

```bash
make test-skill-dev PLATFORM=$ARGUMENTS.PLATFORM SCENARIO=$ARGUMENTS.SCENARIO
```
