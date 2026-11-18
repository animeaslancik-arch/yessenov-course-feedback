# Efficient project rules

1) On the first request, read `PROJECT_BRIEF.md`; do not re-read unrelated project files.
2) Use `rg` first and open only the relevant file or line range.
3) Do not read an entire file over 300 lines unless the task requires it.
4) Respect an explicitly named path; otherwise identify likely files before editing.
5) For a change affecting multiple files, make one short plan and then implement the agreed scope together.
6) Keep terminal output focused: show errors, summaries and changed-file names, not full logs.
7) Cap routine tool output around 4,000 tokens; expand only when diagnosing a specific failure.
8) Run the smallest relevant verification first; use the full test suite before deploys or broad refactors.
9) In the final response, state changed files, verification performed and any remaining limitation.
