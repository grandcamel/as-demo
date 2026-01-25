---
description: Generate a production invite URL for demo.assistant-skills.dev
arguments:
  - name: label
    description: Label for the invite (e.g., "Demo for Acme Corp")
    required: false
    default: "CLI Invite"
  - name: expires
    description: Hours until invite expires (e.g., 24, 48, 168 for 1 week)
    required: false
    default: "24"
allowed_tools:
  - Bash
---

Generate a production invite for AS-Demo.

Run the following command to create an invite on the production server:

```bash
ssh root@143.110.131.254 "cd /opt/as-demo && make invite LABEL='$ARGUMENTS.label' EXPIRES=$ARGUMENTS.expires"
```

After running, display the invite URL to the user in a clear format.
