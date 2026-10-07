# Rules — Code
> Stack, architecture, TS, naming, comments, deps, testing, build, env, git, API invention

# 4. Recommended Technology Stack

Unless the repository already uses another approved stack, prefer:

## Frontend

- React
- TypeScript
- React Three Fiber
- Three.js
- Drei
- Zustand
- Framer Motion
- Tailwind CSS

## Backend

Prefer one of:

- Supabase
- Node.js API
- Next.js API routes / route handlers
- PostgreSQL

## Authentication

Prefer:

- Supabase Auth
- Email/password first
- Google OAuth only when needed

## Storage

Prefer:

- Supabase Storage
- Cloudflare R2
- AWS S3

## 3D Assets

Prefer:

- `.glb`
- `.gltf`

Avoid using FBX directly in production unless there is a strong reason.

# 5. Architecture Rules

Use clear separation between:

- Game rendering
- Game state
- Business state
- API logic
- Persistence
- Admin functionality
- 3D assets
- Animation logic
- UI

Suggested structure:

```text
src/
  app/
  components/
  game/
    character/
    environment/
    camera/
    effects/
    animations/
    systems/
    state/
  features/
    sales/
    xp/
    levels/
    milestones/
    streaks/
    rewards/
    bosses/
    office/
  lib/
  services/
  hooks/
  types/
  utils/

public/
  models/
  animations/
  textures/
  audio/
```

Do not put all game logic into one React component.

Do not put all Three.js logic into `App.tsx`.

Do not mix API calls directly into deeply nested 3D components.

# 6. TypeScript Rules

Use TypeScript for all new application code.

Avoid:

```ts
any
```

unless absolutely necessary.

Prefer explicit shared types.

Example:

```ts
export type PerformanceEventType =
  | "call_completed"
  | "qualified_lead"
  | "meeting_booked"
  | "proposal_sent"
  | "deal_closed"
  | "revenue_recorded"
  | "upsell"
  | "renewal"
  | "daily_goal_achieved"
  | "weekly_goal_achieved"
  | "monthly_goal_achieved"
  | "personal_record";
```

Keep core domain types in centralized files.

# 41. Code Quality Rules

Prefer:

- Small components
- Clear functions
- Reusable hooks
- Shared domain logic
- Explicit naming

Avoid:

- 1,000-line components
- Deep prop drilling
- Massive utility files
- Duplicate business logic
- Magic numbers
- Hidden side effects

If a value matters to game design, make it configurable.

# 42. Naming Rules

Use meaningful names.

Good:

```ts
calculateDealReward()
triggerSaleCelebration()
getOfficeTier()
applyCharacterEmotion()
```

Bad:

```ts
doThing()
handleStuff()
func1()
temp()
```

# 43. Comment Rules

Comment why, not what.

Bad:

```ts
// add 1 to level
level += 1;
```

Good:

```ts
// Preserve overflow XP so large deals can advance more than one level.
```

Do not over-comment obvious code.

# 44. File Modification Rules

Before modifying a file:

1. Read the relevant file.
2. Understand existing patterns.
3. Check imported dependencies.
4. Make the smallest safe change.
5. Avoid unrelated refactors.

Do not rewrite large files unnecessarily.

Do not remove working functionality unless explicitly required.

# 45. Dependency Rules

Before installing a package:

Ask:

- Is it necessary?
- Can existing dependencies solve this?
- Is it maintained?
- Is it too large?
- Does it create security risk?

Avoid dependency bloat.

Do not add several libraries that solve the same problem.

# 46. Testing Rules

Critical business logic must be testable.

Prioritize tests for:

- XP calculation
- Level calculation
- Duplicate events
- Reward unlocking
- Milestone detection
- Target completion
- Authorization
- Organization isolation

3D visual behavior can use lighter testing plus manual validation.

# 47. Build Verification Rules

After significant changes:

- Run type checking
- Run lint
- Run tests
- Run production build where practical

Fix errors caused by your changes before stopping.

Do not leave obvious TypeScript errors.

# 48. Console Rules

Remove unnecessary:

```ts
console.log()
```

before considering a feature finished.

Keep intentional structured logging where useful.

Never log:

- Passwords
- Tokens
- Secret keys
- Sensitive customer data

# 49. Environment Variables

Use `.env` / platform environment configuration.

Never hard-code:

- Supabase service key
- Database password
- OAuth secret
- CRM tokens
- API keys

Maintain an `.env.example` with variable names but no secrets.

# 67. Git Rules

Keep commits focused.

Do not commit:

- `.env`
- secrets
- huge unused assets
- generated build directories
- temporary files

Before destructive Git operations, verify intent.

Do not rewrite history unless explicitly requested.

# 69. Do Not Invent APIs

If an external CRM or platform API is involved:

- Check existing project documentation
- Use official API patterns
- Do not invent endpoint names
- Do not invent fields

If credentials are required, create configuration placeholders rather than hard-coding assumptions.
