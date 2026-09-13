# TBCE — Tools, Branches, Code, Everything

This document preserves the product vision and V1/V2 roadmap. It describes the intended product, not a claim that every feature is implemented. Milestones 0 and 1 form the initial implementation; see [verification results](verification.md) and [remaining work](remaining-work.md) for current status and limitations.

## Product vision

TBCE is a desktop development environment focused on:

- Code editing
- Project structure
- Reusable stacks
- Architecture templates
- Git workflows
- Repository visibility
- Issue and pull request tracking
- Project progress
- Development tooling

The long-term goal is to make TBCE a project-centric development cockpit rather than simply another text editor.

AI agents are planned for V2. V1 should be useful without any AI features.

## Core product idea

TBCE should answer this question:

> Can I create, understand, manage, and develop a software project from one place?

The application should combine:

- Editor
- Terminal
- Git
- GitHub
- Project templates
- Architecture presets
- Issues
- Pull requests
- Branches
- Progress tracking

into one environment.

## Technology stack

Use:

- Tauri
- Rust
- React
- TypeScript
- Monaco Editor
- SQLite
- Git CLI
- GitHub REST and/or GraphQL APIs
- Vite

Avoid Electron unless a major blocker appears. Do not build a custom text editor engine. Use Monaco.

## Language responsibilities

### TypeScript

Use TypeScript for:

- React UI
- State management
- Editor integration
- Project dashboard
- Git visualizations
- Issue views
- Pull request views
- Stack configuration UI
- Architecture configuration UI
- Settings
- GitHub data presentation

### Rust

Use Rust for:

- Filesystem operations
- Process execution
- Terminal sessions
- Git execution
- Native OS integration
- SQLite access where appropriate
- Secure local operations

Rust should expose clean commands/services to the frontend. Do not put native logic directly inside random UI components.

## Repository rules

- Project name: **TBCE**
- Meaning: **Tools, Branches, Code, Everything**
- Suggested repository: `tbce`
- Suggested application identifier: `com.tbce.app`

Do not add Codex, OpenAI, ChatGPT, AI systems, automated tools, or models as contributors, authors, co-authors, maintainers, owners, or copyright holders.

Do not add `Co-authored-by: Codex` or any equivalent attribution to Git commits. Do not modify the configured Git author identity unless explicitly requested. The human repository owner should remain the project owner.

## Project metadata

Each TBCE project may contain:

```text
.tbce/
    project.json
```

Example:

```json
{
  "schemaVersion": 1,
  "name": "Example Project",
  "stack": "nextjs-typescript",
  "architecture": "modular-monolith",
  "defaultBranch": "main",
  "commands": {
    "install": "npm install",
    "dev": "npm run dev",
    "build": "npm run build",
    "test": "npm test"
  }
}
```

Keep this format versioned. Future versions may add:

- Agent configuration
- Task metadata
- Workspace configuration
- Architecture rules
- Project progress data

## Major systems

TBCE should eventually contain:

1. Desktop shell
2. Workspace system
3. File explorer
4. Code editor
5. Terminal
6. Project metadata
7. Stack system
8. Architecture system
9. Local Git
10. Git UI
11. GitHub integration
12. Issues
13. Pull requests
14. Project dashboard
15. Progress tracking
16. Settings
17. Template/plugin system
18. AI agents in V2

## V1 roadmap

### Phase 1 — Foundation

#### Milestone 0 — Repository setup

**Goal:** Create a clean production-ready foundation.

Implement:

- Tauri application
- React frontend
- TypeScript
- Vite
- Rust backend
- ESLint
- Formatting
- Basic tests
- README
- Git repository
- `.gitignore`
- Documentation structure

Suggested project structure:

```text
tbce/
├── src/
│   ├── app/
│   ├── components/
│   ├── editor/
│   ├── explorer/
│   ├── terminal/
│   ├── projects/
│   ├── templates/
│   ├── architecture/
│   ├── git/
│   ├── github/
│   ├── dashboard/
│   ├── settings/
│   ├── stores/
│   ├── hooks/
│   ├── types/
│   └── utils/
├── src-tauri/
│   └── src/
│       ├── commands/
│       ├── filesystem/
│       ├── process/
│       ├── git/
│       ├── project/
│       └── database/
├── templates/
├── architectures/
├── docs/
└── tests/
```

Avoid unnecessary abstraction. Build clean boundaries, but don't overengineer.

### Phase 2 — Basic editor

#### Milestone 1 — File explorer + Monaco

**Goal:** TBCE should work as a basic editor.

Implement:

- Open folder
- Display directory tree
- Expand folders
- Collapse folders
- Open files
- Monaco Editor
- Edit files
- Save files
- Multiple tabs
- Dirty file indicators
- Close tabs
- Unsaved-change handling

File explorer actions:

- Create file
- Create folder
- Rename
- Delete
- Refresh

Basic keyboard shortcuts:

- Save
- Save all
- Close tab
- Open file
- Toggle terminal later

**Success condition:** A developer can open a local codebase and edit it comfortably.

### Phase 3 — Terminal

#### Milestone 2 — Integrated terminal

**Goal:** Allow developers to work without leaving TBCE.

Implement:

- Terminal panel
- Start shell from project directory
- stdin
- stdout
- stderr
- Stop process
- Restart process

Later support:

- Multiple terminal tabs
- Terminal names
- Command history

The terminal/process backend must be reusable by future AI systems.

### Phase 4 — Project awareness

#### Milestone 3 — Project system

**Goal:** TBCE should understand projects rather than just folders.

Implement:

- Create project
- Open project
- Recent projects
- Project settings
- `.tbce/project.json` detection
- Convert existing folder into TBCE project

Project model should expose:

- Name
- Path
- Stack
- Architecture
- Git repository
- Commands
- Metadata

Keep project logic in a `ProjectService`.

### Phase 5 — Stack templates

#### Milestone 4 — Saved stacks

**Goal:** Allow users to create projects from reusable development stacks.

Stacks must be data-driven. Example:

```json
{
  "id": "nextjs-typescript",
  "name": "Next.js + TypeScript",
  "languages": ["typescript"],
  "frameworks": ["nextjs"],
  "commands": {
    "install": "npm install",
    "dev": "npm run dev",
    "build": "npm run build"
  }
}
```

Initial stacks:

- React + TypeScript
- Next.js + TypeScript
- React + FastAPI
- Rust + Tauri
- Empty TypeScript
- Empty Rust

Creation flow:

```text
New Project
→ Choose Stack
→ Choose Architecture
→ Name Project
→ Choose Location
→ Configure
→ Create
```

Support custom projects too.

### Phase 6 — Architecture templates

#### Milestone 5 — Saved architectures

**Goal:** Allow project structure to be predefined.

Initial presets:

- Simple
- MVC
- Layered
- Clean Architecture
- Modular Monolith

Example:

```text
src/
├── domain/
├── application/
├── infrastructure/
└── presentation/
```

Architecture definitions should support:

- Folder structure
- Description
- Recommended boundaries
- Generated starter files
- Future validation rules

Do not implement advanced rule enforcement yet.

### Phase 7 — Local Git

#### Milestone 6 — Git backend

**Goal:** TBCE should fully understand local repository state.

Use local Git CLI initially. Implement:

- Detect Git repository
- Initialize repo
- Clone repo
- Current branch
- Branch list
- Create branch
- Checkout branch
- Delete branch
- Git status
- Changed files
- Staged files
- Stage
- Unstage
- Stage all
- Commit
- Fetch
- Pull
- Push
- Commit history
- Ahead/behind state
- Diff

Create a dedicated `GitService`. Conceptual API:

```text
getStatus()
getBranches()
createBranch()
checkoutBranch()
stage()
unstage()
commit()
pull()
push()
fetch()
getHistory()
getDiff()
```

UI code must not directly execute Git commands.

### Phase 8 — Git UI

#### Milestone 7 — Source control panel

Create a visual Git panel. Example:

```text
SOURCE CONTROL

Branch:
feature/auth

Changes
M src/auth.ts
A src/user.ts

Staged
M src/database.ts

Commit message
[................]

[ Commit ]

Branches
main
feature/auth
fix/navbar
```

Use Monaco Diff Editor for diffs where practical.

### Phase 9 — GitHub

#### Milestone 8 — GitHub connection

**Goal:** Connect local projects with remote repository context.

Start only with GitHub. Do not support GitLab and Bitbucket yet.

Authentication should eventually use OAuth or another secure method. Never store secrets in the repository.

Display:

- Repository name
- Owner
- Description
- Default branch
- Branches
- Commits
- Issues
- Pull requests
- Repository activity

Suggested tabs:

- Overview
- Code
- Branches
- Issues
- Pull Requests
- Commits

### Phase 10 — Issues

#### Milestone 9 — GitHub issues

Implement:

- List issues
- Open issue
- Closed issues
- Labels
- Assignees
- Milestones
- Issue body

Actions:

- Create issue
- Close issue
- Reopen issue

Comments and advanced metadata can come later. Keep GitHub models separate from generic TBCE models.

### Phase 11 — Pull requests

#### Milestone 10 — Pull request viewer

Implement:

- List PRs
- View PR
- Source branch
- Target branch
- Changed files
- CI/check state
- PR description

Later:

- Create PR
- Review PR
- Merge PR

Do not rebuild the entire GitHub interface. Focus on useful repository context.

### Phase 12 — Project dashboard

#### Milestone 11 — Project overview

This should become one of TBCE's core features. Example:

```text
TBCE Project

Repository
owner/project

Branch
feature/auth

Local Changes
3 files

Issues
12 open

Pull Requests
3 open

Build
Passing

Recent Commits
...
```

Dashboard sections:

- Repository summary
- Git state
- Branch state
- Recent commits
- Issues
- Pull requests
- Commands
- Milestones
- Project progress
- Recent activity

### Phase 13 — Progress tracking

#### Milestone 12 — Project progress

**Goal:** Show meaningful progress.

Do not calculate progress from number of commits. Use:

- Issues
- Milestones
- Explicit tasks
- Completed work items

Example:

```text
Authentication      100%
Teams                 70%
Permissions           30%
Dashboard             20%
```

Project representation:

```text
Project
├── Authentication
│   ├── Login
│   ├── Register
│   └── OAuth
├── Teams
│   ├── Create Team
│   └── Invitations
└── Permissions
    ├── Roles
    └── Policies
```

Allow issues to map into these areas.

### Phase 14 — Project commands

#### Milestone 13 — Command system

Projects should define common commands. Example:

```text
Dev
npm run dev

Build
npm run build

Test
npm test

Lint
npm run lint
```

Display them as clickable actions. Commands should use the same `ProcessService` as the terminal. Future AI agents should also use this same system.

### Phase 15 — Settings

#### Milestone 14 — Settings system

Implement:

- Theme
- Editor font size
- Tab size
- Word wrap
- Terminal shell
- Git configuration display
- Project settings
- GitHub account

Keep settings simple initially.

### Phase 16 — Stabilization

#### Milestone 15 — Architecture cleanup

Before beginning AI work, review the codebase. Critical services should exist independently:

- `ProjectService`
- `FileSystemService`
- `ProcessService`
- `TerminalService`
- `GitService`
- `GitHubService`
- `TemplateService`
- `ArchitectureService`

Correct pattern:

```text
UI
→ service
→ native/backend operation
```

Wrong pattern:

```text
UI component
→ shell command directly
```

This separation is required for V2.

## V1 completion criteria

V1 is complete when a developer can:

1. Install TBCE.
2. Open a project.
3. Create a new project.
4. Choose a stack.
5. Choose an architecture.
6. Browse files.
7. Edit code.
8. Save code.
9. Use a terminal.
10. Run project commands.
11. Initialize Git.
12. Clone a repo.
13. Create and switch branches.
14. Stage files.
15. Commit.
16. Pull and push.
17. View diffs.
18. Connect GitHub.
19. View issues.
20. View pull requests.
21. View commits.
22. View project progress.
23. Understand project state from one dashboard.

## V2 — AI agents

AI is intentionally postponed until the core application is stable. Do not build only an AI chat sidebar. Agents should use TBCE's project infrastructure.

### V2 Milestone 1 — Agent tool layer

Create controlled internal tools. Possible tools:

```text
read_file
write_file
search_files
run_command
git_status
git_diff
git_create_branch
git_commit
run_tests
get_project_structure
get_architecture
get_issue
```

AI providers must not receive unrestricted native access. All actions pass through TBCE-controlled APIs.

### V2 Milestone 2 — Single coding agent

Workflow:

```text
User enters task
→ Agent analyzes project
→ Agent creates plan
→ Agent creates branch/worktree
→ Agent edits
→ Agent runs tests
→ Agent provides summary
→ User reviews
```

Never modify main automatically by default.

### V2 Milestone 3 — Git worktrees

Use worktrees to isolate AI work. Example:

```text
project/
    main/

.tbce/
    worktrees/
        auth-agent/
        test-agent/
```

Branches:

```text
main
├── agent/auth
├── agent/tests
└── agent/dashboard
```

This allows concurrent agents safely.

### V2 Milestone 4 — Agent UI

Example:

```text
AGENTS

Authentication Agent
Working

Task
Implement OAuth

Branch
agent/oauth

Changed Files
7

Tests
12/12 passing

Actions

View Changes
Stop
Review
Create PR
Merge
```

Require explicit user control for dangerous actions.

### V2 Milestone 5 — Multiple agents

Later support:

- Coding Agent
- Testing Agent
- Review Agent
- Documentation Agent
- Architecture Agent

Do not start with a swarm. First make one agent reliable.

### V2 Milestone 6 — Agent task lifecycle

States:

- Pending
- Planning
- Working
- Testing
- Review Required
- Completed
- Failed
- Cancelled

Track:

- Task
- Branch
- Files changed
- Commands executed
- Tests
- Timestamps
- Status

Agent work should be auditable.

## Security requirements

From the beginning:

- Never commit API keys.
- Never commit access tokens.
- Store credentials securely.
- Validate filesystem paths.
- Prevent path traversal.
- Treat shell execution as privileged.
- Confirm destructive actions.
- Protect branch deletion.
- Protect force push.
- Protect `reset --hard`.
- Protect project deletion.

Future AI features must follow the same security model.

## Development strategy

Do not build every milestone at once. Use:

```text
Feature
→ Test
→ Integrate
→ Commit
```

Keep the app runnable after every milestone. Use feature branches for major changes. Keep main stable.

## Initial Codex task

Codex should begin with **Milestone 0 and Milestone 1 only**. That means:

- Initialize TBCE
- Configure Tauri
- Configure React + TypeScript
- Configure Rust backend
- Add Monaco
- Add basic project shell
- Add file explorer
- Open files
- Edit files
- Save files
- Support editor tabs

Do not start GitHub, issue tracking, progress tracking, architecture validation, or AI agents until the foundation works.

After completing the initial milestone:

1. Build the app.
2. Run linting.
3. Run tests.
4. Resolve compiler errors.
5. Verify opening folders.
6. Verify opening files.
7. Verify editing files.
8. Verify saving files.
9. Update README.
10. Document remaining work.

Use normal human project commit messages such as:

```text
feat: initialize TBCE desktop application
feat: add Monaco workspace
feat: add file explorer
```

Do not mention Codex, OpenAI, ChatGPT, or AI in contributor metadata or commit authorship.

## Product identity

- Name: **TBCE**
- Meaning: **Tools, Branches, Code, Everything**
- Possible tagline: **Everything your project needs, in one place.**
- Alternative: **Code. Structure. Ship.**

The name should normally be displayed simply as TBCE. The full expansion does not need to appear everywhere.
