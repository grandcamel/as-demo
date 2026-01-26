---
description: Reset the production queue by restarting queue-manager
---

Reset the production queue by running:

```bash
ssh root@143.110.131.254 "cd /opt/as-demo && docker compose restart queue-manager"
```

This will:
- Disconnect any active sessions
- Clear the in-memory queue
- Redis data (invites) will persist
