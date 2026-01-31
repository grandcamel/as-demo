# JQL Search

Find issues in JIRA using JQL (JIRA Query Language).

## Example Prompts

### Search by Project

```
Show me all open issues in project DEMO
```

### Search by Assignee

```
Find issues assigned to me
```

### Complex Search

```
Find bugs created in the last week with priority High
```

### My Issues

```
What are my open issues sorted by priority?
```

## JQL Reference

- `project = DEMO` - Filter by project
- `assignee = currentUser()` - Your issues
- `status = "In Progress"` - Filter by status
- `priority = High` - Filter by priority
- `created > -7d` - Recent issues
