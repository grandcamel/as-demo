---
description: 'Run skill test: PLATFORM=confluence|jira|splunk SCENARIO=name [MODEL=sonnet] [JUDGE_MODEL=haiku]'
arguments:
  - name: PLATFORM
    description: Platform to test (confluence, jira, splunk, cross-platform)
    required: true
  - name: SCENARIO
    description: Scenario name (e.g., page, issue, sre)
    required: true
  - name: MODEL
    description: Model to use (sonnet, haiku, opus)
    required: false
    default: sonnet
  - name: JUDGE_MODEL
    description: Judge model for evaluation
    required: false
    default: haiku
---

```bash
make test-skill-dev PLATFORM=$ARGUMENTS.PLATFORM SCENARIO=$ARGUMENTS.SCENARIO MODEL=$ARGUMENTS.MODEL JUDGE_MODEL=$ARGUMENTS.JUDGE_MODEL MAX_ATTEMPTS=1
```
