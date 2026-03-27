# PLAN STAGE

You are in the PLAN stage of the development loop.

## Instructions

### Step 0: Check Lock

If file `AUTOMATION_LOCK` exists:
1. Read its timestamp
2. If timestamp is less than 1 hour old: **EXIT** (another agent is working)
3. If timestamp is stale (>1 hour), proceed (previous agent likely crashed)

Create or update `AUTOMATION_LOCK` with current ISO timestamp before proceeding.

### Step 1: Study Context

0a. Study @IMPLEMENTATION_PLAN.md.
0b. Read over the specs in /specs folder
0c. For reference, the application is a monorepo with source code in:
    - `packages/marketing/src/*` - Next JS marketing site
    - `packages/api/src/*` - API server (hono) (routes, services, db schema)
    - `packages/app/src/*` - React (vite) dashboard (pages, components)
    - `packages/admin/src/*` - React (vite) admin panel
    - `packages/shared/src/*` - Shared TypeScript types

### Step 2: Analyze and Plan

1. Study @IMPLEMENTATION_PLAN.md (if present; it may be incorrect) and use up to 500 Explore agents in parallel to study existing source code. Use a Plan agent to analyze findings, prioritize tasks, and create/update @IMPLEMENTATION_PLAN.md as a bullet point list sorted in priority of items yet to be implemented. Consider searching for TODO, minimal implementations and inconsistent patterns. Keep @IMPLEMENTATION_PLAN.md up to date with items considered complete/incomplete.

IMPORTANT: Plan only. Do NOT implement anything. Do NOT assume functionality is missing; confirm with code search first. Prefer consolidated, idiomatic implementations over ad-hoc copies.

ULTIMATE GOAL: We want to create a city exploring messaging app. Consider missing elements and plan accordingly. The main "project-spec.md" needs breaking down into easy to follow specifications for developers. DO not write any code - this is to make them have to do less "big picture" thinking, and provide a solid consistant framework for them to develop from. You are a proper development project manager. If planning tests - only plan for the backend. No tests are needed for anywhere else in the project.

Never create any other files other than within the /specs folder. Do not update any files unless in the /specs folder or IMPLEMENTATION_PLAN.md

Do not include time estimates or code samples. This is implementation and spec planning only.

### Step 3: EXIT

**STOP HERE** after updating IMPLEMENTATION_PLAN.md and any spec files.

### EXIT
STOP processing. The orchestration layer will:
1. Re-read IN_PROGRESS.md (or detect its absence)
2. Determine stage from file content
3. Route to appropriate PROMPT_*.md
4. Start new agent session

The next stage will be IMPLEMENT, which will pick up the highest priority task from IMPLEMENTATION_PLAN.md.
