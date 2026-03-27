# IMPLEMENT STAGE

You are in the IMPLEMENT stage of the development loop.

## Valid Stages Reference

| Stage | Next on Success | Next on Failure |
|-------|-----------------|-----------------|
| implement | test | (stays implement with TODOs) |
| test | review | implement |
| review | commit | implement |
| commit | (end - delete IN_PROGRESS.md) | (retry or manual) |
| blocked | manual_intervention | - |

## Context Files
- `@IN_PROGRESS.md` - Current task state (may not exist yet)
- `@IMPLEMENTATION_PLAN.md` - Prioritized task list
- `specs/` - Specification files

## Reference: Codebase Structure
- `packages/marketing/src/*` - Next JS marketing site
- `packages/api/src/*` - API server (hono) (routes, services, db schema)
- `packages/app/src/*` - React (vite) dashboard (pages, components)
- `packages/admin/src/*` - React (vite) admin panel
- `packages/shared/src/*` - Shared TypeScript types

## Instructions

### Step 0: Check Lock

If file `AUTOMATION_LOCK` exists:
1. Read its timestamp
2. If timestamp is less than 1 hour old: **EXIT** (another agent is working)
3. If timestamp is stale (>1 hour), proceed (previous agent likely crashed)

Create or update `AUTOMATION_LOCK` with current ISO timestamp before proceeding.

### Step 1: Determine Current Task

**If IN_PROGRESS.md does NOT exist:**
1. Read IMPLEMENTATION_PLAN.md
2. Select the highest priority uncompleted item
3. Create IN_PROGRESS.md with this structure:

```markdown
# Current Task Progress

## Active Task
- **IMPLEMENTATION_PLAN Item**: [Copy the item text]
- **Spec File**: [Path to spec file, if applicable]
- **Stage**: implement
- **Started**: [ISO 8601 timestamp]
- **Last Heartbeat**: [ISO 8601 timestamp]
- **Inner Loop Count**: 1

## Stage Status
- [ ] implement - In progress
- [ ] test - Pending
- [ ] review - Pending

## TODOs (feed back to implement)
[Empty initially]

## Files Modified
Format: `path/to/file.ts (action)` where action is: new, modified, deleted

Example:
- packages/backend/src/routes/dashboard.ts (modified)
- supabase/migrations/014_xxx.sql (new)

## Iteration Log
- Loop 1: Starting implementation

## Blockers
(none)
```

**If IN_PROGRESS.md EXISTS:**
1. Read the TODOs section for items to address
2. Continue implementation from where it left off
3. Update **Last Heartbeat** timestamp

### Step 1.5: Verify Prerequisites

If IMPLEMENTATION_PLAN.md shows this task has dependencies:
1. Check all blocking tasks are marked COMPLETE
2. If dependencies incomplete, select next unblocked task instead
3. If no unblocked tasks available, set Stage to `blocked` and EXIT

### Step 2: Understand Before Coding

CRITICAL: Search the codebase BEFORE making changes.
- Use up to 500 Explore agents in parallel to understand existing patterns
- Use a Plan agent for complex architectural decisions
- Do NOT assume functionality is missing - verify with code search first
- Follow existing code patterns and conventions

Update **Last Heartbeat** timestamp after completing research.

### Step 3: Implement the Functionality

- Address ALL items in the TODOs section (if any)
- Write complete implementations - no placeholders or stubs
- Prefer editing existing files over creating new ones
- Keep changes focused - don't over-engineer
- Always consider code organsisation/consistant patterns
- Use a team of agents to work on the tasks, and you become the overseer/lead engineer
- Be careful not to introduce security vulnerabilities

Update **Last Heartbeat** timestamp periodically during long implementations.

### Step 4: Update IN_PROGRESS.md

When implementation is complete:
1. Mark completed TODOs with [x]
2. Add any new files to "Files Modified" section using the format:
   - `path/to/file.ts (action)` where action is: new, modified, deleted
3. Update "Stage Status" - check implement, leave test unchecked
4. Set `**Stage**: test`
5. Increment "Inner Loop Count"
6. Update **Last Heartbeat** timestamp
7. Add entry to "Iteration Log" describing what was done

### Step 5: EXIT

**STOP HERE.** Do not:
- Run tests (that's the TEST stage)
- Commit anything (that's the COMMIT stage)
- Review code quality (that's the REVIEW stage)

### EXIT
STOP processing. The orchestration layer will:
1. Re-read IN_PROGRESS.md (or detect its absence)
2. Determine stage from file content
3. Route to appropriate PROMPT_*.md
4. Start new agent session

The loop will invoke the TEST stage next.

## Guidelines

1. Single sources of truth - no migrations/adapters for compatibility
2. Implement functionality completely - placeholders waste effort
3. When you discover issues, add them to IN_PROGRESS.md TODOs for tracking
4. Keep IN_PROGRESS.md current - it's your state persistence across crashes
5. When authoring documentation, capture the why — tests and implementation importance
6. You may add extra logging if required to debug issues
7. For any bugs you notice, resolve them or document them in IN_PROGRESS.md TODOs even if unrelated to current work
8. When you learn something new about how to run the application, update AGENTS.md but keep it brief and operational only
9. Update **Last Heartbeat** at the start of each major step for crash detection
