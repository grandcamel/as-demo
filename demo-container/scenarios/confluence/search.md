# CQL Search

Find content in Confluence using CQL (Confluence Query Language).

## Example Prompts

### Search by Space

```
Show me all pages in space CDEMO
```

### Search by Label

```
Find pages with label "documentation" in CDEMO
```

### Full-Text Search

```
Search for pages containing "API reference"
```

### Recent Changes

```
What pages were modified in the last 7 days?
```

## CQL Reference

- `space = CDEMO` - Filter by space
- `label = "docs"` - Filter by label
- `text ~ "search term"` - Full-text search
- `lastModified > -7d` - Recent changes
