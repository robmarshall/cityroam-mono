# TEST STAGE

You are in the TEST stage of the development loop.

Tests should only be created for the backend project. None of the other projects need tests. This is important.

## Context Files
- `@IN_PROGRESS.md` - Current task state (MUST exist)

## Instructions

### Step 0: Check Lock

If file `AUTOMATION_LOCK` exists:
1. Read its timestamp
2. If timestamp is less than 1 hour old: **EXIT** (another agent is working)
3. If timestamp is stale (>1 hour), proceed (previous agent likely crashed)

Create or update `AUTOMATION_LOCK` with current ISO timestamp before proceeding.

### Step 1: Verify Stage

Read IN_PROGRESS.md and verify:
- `**Stage**: test` is set
- The file exists (if not, something went wrong - report error and exit)

Update **Last Heartbeat** timestamp.

### Step 1.5: Verify Build

Run the build to ensure code compiles:

```bash
npm run build
```

**If build FAILS:**
1. Analyze the build errors carefully
2. Update IN_PROGRESS.md:
   - Add build errors to "TODOs" section with clear descriptions:
     ```markdown
     ## TODOs (feed back to implement)
     - [ ] Build: [specific file:line] - [description of build error]
     ```
   - Set `**Stage**: implement` (loop back)
   - Add to "Iteration Log": "Build failed - [summary of errors]"
3. EXIT

**If build PASSES:** Continue to Step 2.

### Step 2: Run Tests

**If both or unclear:**
```bash
npm test
```

Also run type checking:
```bash
npm run typecheck
```

### Step 3: Analyze Results

**If ALL tests PASS and type checking succeeds:**
1. Update IN_PROGRESS.md:
   - Set `**Stage**: review`
   - Update "Stage Status" - check test
   - Update **Last Heartbeat** timestamp
   - Add to "Iteration Log": "Tests passed, typecheck passed"
2. EXIT

**If tests FAIL or type checking fails:**
1. Analyze the failures carefully
2. Create specific, actionable fix items
3. Update IN_PROGRESS.md:
   - Add failure items to "TODOs" section with clear descriptions:
     ```markdown
     ## TODOs (feed back to implement)
     - [ ] Fix: [specific file:line] - [description of what needs fixing]
     - [ ] Fix: [another specific issue]
     ```
   - Set `**Stage**: implement` (loop back)
   - Update **Last Heartbeat** timestamp
   - Add to "Iteration Log": "Tests failed - [summary of failures]"
4. EXIT

### Step 4: EXIT

**STOP HERE.** Do not:
- Fix the code yourself (that's the IMPLEMENT stage)
- Commit anything (that's the COMMIT stage)
- Review beyond test results (that's the REVIEW stage)

### EXIT
STOP processing. The orchestration layer will:
1. Re-read IN_PROGRESS.md (or detect its absence)
2. Determine stage from file content
3. Route to appropriate PROMPT_*.md
4. Start new agent session

The loop will invoke the appropriate next stage.

## Guidelines

1. Be specific in failure analysis - include file paths and line numbers
2. Group related failures into single TODOs where appropriate
3. If tests unrelated to current work fail, still add them to TODOs - they must be resolved before commit
4. Do not skip failing tests - all tests must pass
5. Build verification catches compile errors early, before running tests
