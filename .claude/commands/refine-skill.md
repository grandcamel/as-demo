---
description: 'Iterative skill refinement loop: PLATFORM=confluence|jira|splunk SCENARIO=name [MAX_ATTEMPTS=3] [MOCK=true]'
arguments:
  - name: PLATFORM
    description: Platform to test (confluence, jira, splunk, cross-platform)
    required: true
  - name: SCENARIO
    description: Scenario name (e.g., page, issue, sre)
    required: true
  - name: MAX_ATTEMPTS
    description: Maximum refinement attempts
    required: false
    default: '3'
  - name: MOCK
    description: Enable mock mode (no real API calls)
    required: false
    default: ''
---

```bash
make refine-skill PLATFORM=$ARGUMENTS.PLATFORM SCENARIO=$ARGUMENTS.SCENARIO MAX_ATTEMPTS=$ARGUMENTS.MAX_ATTEMPTS MOCK=$ARGUMENTS.MOCK
```
