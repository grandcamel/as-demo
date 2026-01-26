---
description: Refresh the production Claude OAuth token
---

Run this command in your terminal to refresh the production OAuth token:

```bash
ssh -t root@143.110.131.254 "cd /opt/as-demo && make refresh-token"
```

If the Makefile target doesn't exist, SSH to the server and update manually:

```bash
ssh root@143.110.131.254 "cd /opt/as-demo && nano secrets/.env"
```

Then restart services:

```bash
ssh root@143.110.131.254 "cd /opt/as-demo && docker compose restart queue-manager"
```
