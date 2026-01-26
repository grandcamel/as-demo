---
description: "Generate a local invite URL. Optional: EXPIRES=24 LABEL='Description'"
arguments:
  - name: LABEL
    description: Label for the invite (e.g., "Demo for Acme Corp")
    required: false
    default: "Local Invite"
  - name: EXPIRES
    description: Hours until invite expires
    required: false
    default: "24"
---

```bash
make invite LABEL='$ARGUMENTS.LABEL' EXPIRES=$ARGUMENTS.EXPIRES
```
