---
description: Check full production system status
---

Check production system status:

```bash
echo "=== Production Status ==="; echo -n "Health: "; (curl -sf https://demo.assistant-skills.dev/health > /dev/null && echo "OK" || echo "FAILED"); echo -n "Queue: "; curl -s https://demo.assistant-skills.dev/api/status | jq -c; echo "Containers:"; ssh root@143.110.131.254 "cd /opt/as-demo && docker compose ps --format 'table {{.Name}}\t{{.Status}}'"
```
