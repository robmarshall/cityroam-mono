# REVIEW STAGE

You are in the REVIEW stage of the development loop.

## Context Files
- `@IN_PROGRESS.md` - Current task state (MUST exist)
- `@IMPLEMENTATION_PLAN.md` - For recording learnings

## Instructions

### Step 0: Check Lock

If file `AUTOMATION_LOCK` exists:
1. Read its timestamp
2. If timestamp is less than 1 hour old: **EXIT** (another agent is working)
3. If timestamp is stale (>1 hour), proceed (previous agent likely crashed)

Create or update `AUTOMATION_LOCK` with current ISO timestamp before proceeding.

### Step 1: Verify Stage

Read IN_PROGRESS.md and verify:
- `**Stage**: review` is set
- The file exists (if not, something went wrong - report error and exit)

Update **Last Heartbeat** timestamp.

### Step 2: Review Changes

Read ALL files listed in "Files Modified" section and check for:

Use a team of agents to look over these files, and you should be the lead engineer.

**Security Issues:**
- Command injection, XSS, SQL injection (OWASP top 10)
- Exposed secrets or credentials
- Missing input validation at system boundaries

**Code Quality:**
- Incomplete implementations or placeholders
- Missing error handling for likely failure modes
- Inconsistent patterns vs existing codebase
- Over-engineering beyond requirements
- Always consider code organsisation/consistant patterns

**Spec Compliance:**
- If a spec file is referenced, verify all requirements are met
- Check edge cases mentioned in the spec

Update **Last Heartbeat** timestamp after review.

### Step 3: Update IMPLEMENTATION_PLAN.md

Record any learnings or discoveries:
- Patterns that should be followed in future work
- Issues found that affect other items
- Dependencies between items discovered during implementation

### Step 4: Determine Outcome

**If issues found:**
1. Update IN_PROGRESS.md:
   - Add issues to "TODOs" section with clear descriptions:
     ```markdown
     ## TODOs (feed back to implement)
     - [ ] Review: [specific file:line] - [description of issue]
     - [ ] Review: [another issue]
     ```
   - Set `**Stage**: implement` (loop back)
   - Update **Last Heartbeat** timestamp
   - Add to "Iteration Log": "Review found issues - [summary]"
2. EXIT

**If review passes:**
1. Update IN_PROGRESS.md:
   - Set `**Stage**: commit`
   - Update "Stage Status" - check review
   - Update **Last Heartbeat** timestamp
   - Add to "Iteration Log": "Review passed"
2. EXIT

### Step 5: EXIT

**STOP HERE.** Do not:
- Fix code yourself (that's the IMPLEMENT stage)
- Run tests (that was the TEST stage)
- Commit anything (that's the COMMIT stage)

### EXIT
STOP processing. The orchestration layer will:
1. Re-read IN_PROGRESS.md (or detect its absence)
2. Determine stage from file content
3. Route to appropriate PROMPT_*.md
4. Start new agent session

The loop will invoke the appropriate next stage.

## Guidelines

1. Be thorough but practical - focus on real issues, not style preferences
2. Reference specific files and lines when creating TODOs
3. Consider the "why" - does this change make sense for the overall goal?
4. Don't flag things that work correctly, even if you'd do them differently
5. Keep IMPLEMENTATION_PLAN.md learnings brief and actionable
6. For any bugs you notice during review, document them in IN_PROGRESS.md TODOs even if unrelated to current work
