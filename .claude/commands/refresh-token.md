---
description: Refresh the local Claude OAuth token
---

Run this command in your terminal to refresh the local OAuth token:

```bash
make refresh-token
```

If the Makefile target doesn't exist, manually update the token in `secrets/.env`:

```
CLAUDE_CODE_OAUTH_TOKEN=<new-token>
```

Then restart services to pick up the new token:

```bash
make restart-local
```
