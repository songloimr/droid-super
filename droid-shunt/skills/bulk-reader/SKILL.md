---
name: bulk-reader
description: Delegate bulk file reading to the bulk-reader subagent. Use when you need to read files exceeding the shunt threshold (default 350 lines, configurable via SHUNT_MIN_LINES), answer a question across 3 or more files, or summarize a large diff.
---

# Bulk Reader

Delegate via the Task tool with `subagent_type: bulk-reader`. Put only the file paths and the question in the task description — never paste file content.

Each call is independent. To ask a follow-up, delegate again with the same paths.

Before using a specific line number or exact value in an edit, verify it yourself with a targeted read (offset/limit) — subagent summaries are not line-accurate.

Do not delegate: debugging, edits that need exact content, small files, or architectural decisions. Those need your own reasoning and exact context.
