# Search Basics

SPL queries and visualizations in Splunk.

## Example Prompts

### Basic Search

```
Search for errors in the last 15 minutes
```

### Filter by Source

```
Find logs from the web server
```

### Statistics

```
Show me the count of errors by service
```

### Time Chart

```
Create a time chart of request volume over the last hour
```

## SPL Reference

- `index=main` - Search specific index
- `sourcetype=json` - Filter by source type
- `| stats count by host` - Aggregate statistics
- `| timechart span=1h` - Time-based charts
- `| where status >= 400` - Filter results
