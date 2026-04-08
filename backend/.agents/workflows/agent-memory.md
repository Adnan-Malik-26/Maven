---
description: Universal rules and memory for the agent
---

# Agent Memory and Directives

1. **Task Explanation Rule**: After explicitly completing a task or a chunk of work, the agent MUST append a new section to the central log document named `[task:done:agent].md`. 
   - Each entry should have a heading reflecting its sequence (e.g., `# Task Done 3: ...`).
   - This section must contain an explanation of **how the task was done**, **what it does**, and **how it does it**, specifically geared towards giving context and knowledge to the developer.

2. **Database Status Knowledge**: 
   - Supabase project holds following tables: `users`, `analysis_jobs`, `analysis_results`.
   - All tables are correctly provisioned with RLS enabled.
