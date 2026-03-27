# COMMIT STAGE

You are in the COMMIT stage of the development loop.

## Context Files
- `@IN_PROGRESS.md` - Current task state (MUST exist)
- `@IMPLEMENTATION_PLAN.md` - To mark item complete

## Instructions

### Step 0: Check Lock

If file `AUTOMATION_LOCK` exists:
1. Read its timestamp
2. If timestamp is less than 1 hour old: **EXIT** (another agent is working)
3. If timestamp is stale (>1 hour), proceed (previous agent likely crashed)

Create or update `AUTOMATION_LOCK` with current ISO timestamp before proceeding.

### Step 1: Verify Stage

Read IN_PROGRESS.md and verify:
- `**Stage**: commit` is set
- The file exists (if not, something went wrong - report error and exit)
- All TODOs are marked complete [x] (no pending items)

If there are pending TODOs, something went wrong. Set stage back to `implement` and EXIT.

Update **Last Heartbeat** timestamp.

### Step 2: Stage Files

Stage ONLY the files listed in "Files Modified" section:

```bash
git add [file1] [file2] ...
```

**Do NOT use `git add -A` or `git add .`** - only stage files from the task.

Also stage IN_PROGRESS.md changes if any, and IMPLEMENTATION_PLAN.md.

### Step 3: Create Commit

Create a commit with a descriptive message based on the "Active Task" section:

```bash
git commit -m "$(cat <<'EOF'
[Brief description of what was implemented]

Implements: [IMPLEMENTATION_PLAN item reference]
EOF
)"
```

Never include "co-authored by claude".

### Step 4: Push Changes

```bash
git push
```

### Step 5: Create Tag (if appropriate)

Check existing tags:
```bash
git tag --list --sort=-v:refname | head -5
```

If this is a significant milestone or the tests were previously failing and now pass:
- Increment the patch version (e.g., 0.0.1 -> 0.0.2)
- Create and push the tag:
```bash
git tag -a v0.0.X -m "Description of milestone"
git push origin v0.0.X
```

### Step 6: Update IMPLEMENTATION_PLAN.md

Mark the completed item in IMPLEMENTATION_PLAN.md:
- Move from active/pending to completed section, OR
- Add [COMPLETE] marker, OR
- Remove the item if it was a one-off fix

Commit this update:
```bash
git add IMPLEMENTATION_PLAN.md
git commit -m "Mark task complete in IMPLEMENTATION_PLAN.md"
git push
```

### Step 7: Delete IN_PROGRESS.md and Clean Up Lock

The task is fully complete. Remove the progress file and lock:

```bash
rm IN_PROGRESS.md
rm AUTOMATION_LOCK
git add IN_PROGRESS.md
git commit -m "Clear IN_PROGRESS.md - task complete"
git push
```

The push will fail due to auth. Don't worry about that. This will be dealt with later.

### Step 8: EXIT

**STOP HERE.**

### EXIT
STOP processing. The orchestration layer will:
1. Re-read IN_PROGRESS.md (or detect its absence)
2. Determine stage from file content
3. Route to appropriate PROMPT_*.md
4. Start new agent session

The next loop iteration will:
- See that IN_PROGRESS.md doesn't exist
- Pick up the next highest priority item from IMPLEMENTATION_PLAN.md
- Start fresh in the IMPLEMENT stage

## Guidelines

1. Commit messages should describe the "what" and "why", not the "how"
2. Keep commits atomic - one logical change per commit
3. Tags mark stable points - only tag when tests pass
4. Don't skip the push - the loop expects changes to be pushed
5. Verify each git command succeeds before proceeding
6. When IMPLEMENTATION_PLAN.md becomes large, periodically clean out completed items
7. Keep AGENTS.md operational only — status updates and progress notes belong in IMPLEMENTATION_PLAN.md
8. If there are any scripts still running when you have finished all your tasks, kill them before finishing
9. Always delete AUTOMATION_LOCK after successful completion to allow next task to proceed
