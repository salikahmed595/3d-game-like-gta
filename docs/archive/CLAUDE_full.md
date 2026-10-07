# CLAUDE.md — Sales Empire

## Project Overview

Sales Empire is a solo 3D sales gamification platform.

Its purpose is to convert real-world sales performance into visible, emotional, and rewarding progress inside a personalized 3D world.

The central product principle is:

> **Every sale builds your empire.**

A salesperson starts in a small office. As they make calls, book meetings, close deals, hit revenue targets, maintain streaks, and reach milestones, their in-game environment improves.

Real work should create visible game reactions such as:

- Character emotion changes
- Celebration animations
- XP gains
- Office upgrades
- Trophy unlocks
- Clothing unlocks
- Vehicle unlocks
- Boss damage
- Building progression
- Cinematic milestone moments

This is a business product first and a game second.

Do not build features merely because they are visually impressive. Every important feature must support one of these:

1. Sales motivation
2. Visible progress
3. Emotional reward
4. Business customization
5. Reliable performance tracking
6. A polished demo experience

---

# 1. Source of Truth

The primary product specification is:

`Sales_Empire_Complete_PRD.md`

Before implementing a new feature:

1. Read the relevant PRD section.
2. Check the existing architecture.
3. Reuse existing patterns.
4. Do not silently change product behavior.
5. If code and PRD conflict, prefer the PRD unless the implementation has clearly evolved and the change is intentional.

Do not invent large product features that are not present in the PRD.

Small implementation decisions are allowed when necessary.

---

# 2. Core Product Rule

Never make the product feel like a normal CRM dashboard.

The experience must feel like:

> “I achieved something in the real world, and my world changed because of it.”

Bad:

- Sale submitted
- Number changes from $10,000 to $12,000
- Nothing else happens

Good:

- Sale event arrives
- Phone rings
- Character checks phone
- Facial expression changes
- Sale value appears
- Sound plays
- XP increases
- Environment reacts
- Reward or progress animation occurs
- State persists

---

# 3. MVP Discipline

Do not overbuild.

The MVP is focused on one salesperson.

The MVP must prioritize:

- One custom 3D avatar
- One office environment
- Three office progression states
- Manual sale entry
- Generic webhook/API
- Revenue target
- XP and levels
- Milestones
- Trophy room
- One streak system
- Character reactions
- Basic facial emotions
- Sound
- Particles
- Camera reactions
- Persistent game state
- Simple admin dashboard

Do not prioritize before MVP completion:

- Multiplayer
- Open-world city exploration
- Full driving
- Large combat systems
- Complex inventory economy
- Social feeds
- Large chat systems
- PvP
- Employee-versus-employee battles
- Large AI-generated worlds

---

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

---

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

---

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

---

# 7. Game State Rules

There must be one clear source of truth for game state.

Do not keep important game progression only inside local component state.

Persist important state such as:

- Level
- XP
- Rank
- Current revenue
- Target
- Milestones
- Unlocks
- Office level
- Vehicle
- Outfit
- Streak
- Boss progress

Use server persistence for important progression.

Local Zustand state may mirror server state for responsive interaction.

---

# 8. Sales Event Rules

Every performance event must follow a controlled pipeline.

Required pipeline:

```text
Input
↓
Validation
↓
Authentication
↓
Duplicate Check
↓
Authorization
↓
KPI Mapping
↓
Reward Calculation
↓
Database Transaction
↓
Game Event
↓
Frontend Reaction
```

Never let the frontend directly award permanent XP or unlocks.

The server decides permanent rewards.

---

# 9. Duplicate Protection

Sales and KPI events must be idempotent.

Every external event should support:

```ts
externalId
source
userId
eventType
```

If the same valid external event is received twice, it must not:

- Double XP
- Double revenue
- Double unlock
- Double reward
- Double milestone

Use unique constraints where possible.

---

# 10. Manual Sale Entry Rules

Manual sale entry should support:

- Amount
- Currency
- Date
- Optional client name
- Optional note
- Event type

If manager approval is enabled:

```text
Submitted
→ Pending
→ Approved
→ Reward Triggered
```

Rejected events must not affect permanent game progress.

---

# 11. XP Rules

XP must be configurable.

Never hard-code the business logic across multiple components.

Use centralized configuration or database rules.

Example:

```ts
type KpiRule = {
  eventType: PerformanceEventType;
  xp: number;
  multiplier?: number;
};
```

Reward calculation must be deterministic.

The same approved event with the same rule set should produce the same result.

---

# 12. Level Rules

Level calculation must live in one shared place.

Do not implement different level formulas in different components.

Prefer:

```ts
getLevelFromXp(totalXp)
getXpRequiredForLevel(level)
getLevelProgress(totalXp)
```

Keep the algorithm easy to change later.

---

# 13. Character Animation Rules

The avatar should always feel alive.

Minimum states:

- Idle
- Walk
- Sit
- Stand
- Phone check
- Laptop typing
- Small celebration
- Big celebration
- Fist pump
- Confident walk
- Victory
- Wall punch

Use an animation state machine.

Do not trigger animations through random scattered booleans.

Example:

```ts
type CharacterAnimationState =
  | "idle"
  | "walk"
  | "sit"
  | "stand"
  | "phone-check"
  | "typing"
  | "celebrate-small"
  | "celebrate-big"
  | "fist-pump"
  | "confident-walk"
  | "victory"
  | "wall-punch";
```

Important animations should have:

- Start
- Active
- Completion
- Return state

Avoid animation deadlocks.

---

# 14. Facial Emotion Rules

Supported core emotional states:

```ts
type CharacterEmotion =
  | "neutral"
  | "focused"
  | "excited"
  | "happy"
  | "proud"
  | "frustrated"
  | "surprised"
  | "determined";
```

Facial changes must blend gradually.

Never instantly snap between dramatically different expressions if blendshapes are available.

Example after a large deal:

```text
neutral
→ surprised
→ excited
→ proud
→ neutral
```

If the model does not support facial blendshapes, use:

- Head movement
- Body language
- Camera
- Animation
- UI
- Sound

Do not block the project because facial rigging is unavailable.

---

# 15. Emotion Priority Rules

Important events should override idle behavior.

Suggested priority:

```text
Legendary milestone
Big deal
Level up
Office upgrade
Normal sale
Daily mission
Idle behavior
```

Do not let an idle animation interrupt a major celebration.

---

# 16. Camera Rules

The camera is part of the reward system.

Use:

- Default office camera
- Sale focus
- Big-sale orbit
- Upgrade reveal
- Boss camera
- Building reveal

Camera movements must:

- Be short
- Be smooth
- Never make the user nauseous
- Not clip through geometry
- Respect user input after cinematic completion

Avoid excessive camera shake.

---

# 17. Physics Rules

Physics should make achievement feel physical, not chaotic.

Good physics targets:

- Chair
- Papers
- Coffee cup
- Reward particles
- Wall debris
- Confetti
- Upgrade boxes

Avoid simulating unnecessary objects.

Do not make every object dynamic.

Use physics only where it improves feedback.

---

# 18. Office Progression Rules

The player's office is the primary visual progression system.

Required MVP stages:

1. Starter Office
2. Professional Office
3. Executive Office

Each stage should visibly differ.

Do not only swap textures.

Changes should include meaningful objects such as:

- Desk
- Chair
- Monitor
- Lighting
- Branding
- Wall decoration
- Trophy area
- Window/view
- Room size where practical

Office state must persist.

---

# 19. Unlock Rules

Every unlock needs:

- ID
- Name
- Category
- Requirement
- Permanent/unlocked state
- Optional animation
- Optional asset
- Optional rarity

Example:

```ts
type Unlock = {
  id: string;
  name: string;
  category: "office" | "outfit" | "vehicle" | "effect" | "trophy";
  requirementType: string;
  requirementValue: number;
  unlocked: boolean;
};
```

Never unlock permanent items only in frontend memory.

---

# 20. Reward Rules

Reward types:

- Common
- Rare
- Epic
- Legendary

Do not use random gambling-style mechanics involving money.

Variable rewards can be cosmetic surprises tied to legitimate achievements.

Players should understand what meaningful activity caused the reward.

---

# 21. Streak Rules

Streaks may reward:

- Daily call target
- Daily sale activity
- Weekly target
- Meeting-booking consistency

Do not use:

- Fake countdowns
- Artificial punishment
- Financial penalties
- Public humiliation

If a streak is lost, the experience should be neutral rather than insulting.

---

# 22. Boss Battle Rules

Boss battles are milestone events, not the main gameplay loop.

Boss health should map to target completion.

Example:

```ts
bossHealthPercent =
  100 - Math.min((currentRevenue / targetRevenue) * 100, 100);
```

Use backend-authoritative values.

A deal can trigger an attack animation.

Target completion triggers:

- Final attack
- Boss defeat
- Celebration
- Reward
- Progression unlock

Do not build complex combat AI for MVP.

---

# 23. Trophy Rules

Trophies represent permanent achievement history.

Examples:

- First Deal
- First $10K
- Biggest Deal
- 10-Day Streak
- Personal Record
- 100 Meetings

Each trophy needs:

- Title
- Achievement type
- Value
- Date earned
- Visual asset/icon
- Optional metadata

Trophies should survive progression resets and prestige.

---

# 24. Audio Rules

Audio is important but optional for the user.

Required control:

- Mute
- Volume

Never autoplay extremely loud sounds.

Suggested categories:

- UI
- Sale
- Celebration
- Level up
- Upgrade
- Boss
- Ambient

Use reusable audio helpers.

Do not create separate ad hoc audio logic inside every component.

---

# 25. Performance Rules

The application must run well on ordinary business laptops.

Target:

- 30–60 FPS
- Fast interaction
- Reasonable initial load

Optimize:

- GLB assets
- Textures
- Draw calls
- Lighting
- Shadows
- Particle counts
- Physics objects
- Animation mixers

Prefer compressed assets.

Use:

- Lazy loading
- Suspense/loading states
- Asset preloading where useful
- LOD for large scenes if needed

Do not load the entire future game on first launch.

---

# 26. 3D Asset Rules

Preferred production format:

```text
.glb
```

Keep models organized.

Example:

```text
public/models/characters/
public/models/offices/
public/models/vehicles/
public/models/props/
public/animations/
```

Do not rename asset files casually if existing code references them.

When replacing assets, update references safely.

---

# 27. Lighting Rules

Prioritize good-looking performance over expensive realism.

Prefer:

- Baked lighting where possible
- Environment maps
- Limited dynamic lights
- Limited shadow casters

Avoid many real-time lights.

The game should look premium but still run smoothly.

---

# 28. UI Design Rules

The 3D scene is the hero.

UI should be minimal.

Primary HUD:

- Player/company name
- Current target
- Level/rank
- Next unlock
- Optional streak

Avoid:

- Dense dashboards over the 3D scene
- Huge navigation
- Spreadsheet-like visual overload
- Excessive modals

Use simple, modern business-game aesthetics.

---

# 29. Responsive Rules

Desktop is primary for MVP.

Still ensure:

- No broken layout at smaller widths
- Admin dashboard works on tablet
- Main game can display a simplified layout on mobile

Do not spend large development time on advanced mobile 3D before desktop MVP works.

---

# 30. Admin Dashboard Rules

Admin functionality must be practical, not game-like.

Admin should be able to:

- Manage player
- Configure targets
- Configure XP rules
- Configure milestones
- Approve manual events
- Upload branding
- View performance
- View game engagement
- Configure integrations

Do not hide business controls inside the 3D game world.

---

# 31. Branding Rules

Each business should be able to customize:

- Company name
- Logo
- Colors
- Building name
- Office signage
- Character clothing
- Currency
- Rank names
- Boss names

Brand customization should use reusable configuration.

Do not fork the codebase for each customer.

---

# 32. Multi-Tenant Rule

The architecture should be capable of supporting multiple organizations.

Every relevant record should be scoped by organization where appropriate.

Example:

```text
organization_id
user_id
```

Never rely only on frontend filtering for tenant separation.

Enforce tenant isolation server-side and in database policies.

---

# 33. Security Rules

Never expose secrets in frontend code.

Use environment variables.

Required protection:

- HTTPS
- Authentication
- Authorization
- Input validation
- Rate limiting
- Audit logs
- Server-side reward calculation
- Duplicate event prevention

If using Supabase:

- Enable Row Level Security
- Create explicit policies
- Never use service-role keys in client code

---

# 34. Validation Rules

Validate all external data.

Examples:

- Revenue amount must be numeric
- Revenue amount must be non-negative unless refund logic explicitly exists
- Currency must be supported
- Event type must be valid
- Date must be valid
- IDs must exist
- User must belong to organization

Prefer a schema validator such as Zod.

---

# 35. Error Handling Rules

Never silently swallow errors.

User-facing errors should be simple.

Developer logs should be useful.

Avoid exposing:

- Stack traces
- API secrets
- SQL details
- Internal identifiers unnecessarily

Game failures should degrade gracefully.

Example:

If an animation asset fails, the sale should still be recorded.

Business data reliability is more important than a visual effect.

---

# 36. Database Rules

Use clear migrations.

Never manually modify production schema without migration tracking.

Prefer:

- Foreign keys
- Unique constraints
- Indexes
- Timestamps
- Soft delete only where needed

Important operations such as reward awarding should be transactional.

---

# 37. Suggested Core Tables

Expected entities include:

- organizations
- users
- players
- avatars
- performance_events
- kpi_rules
- xp_transactions
- rewards
- unlocks
- achievements
- streaks
- offices
- inventory
- vehicles
- outfits
- boss_progress
- game_sessions
- integrations
- audit_logs

Do not create duplicate tables for equivalent concepts without a strong reason.

---

# 38. API Rules

Use consistent API responses.

Example success:

```json
{
  "success": true,
  "data": {}
}
```

Example error:

```json
{
  "success": false,
  "error": {
    "code": "DUPLICATE_EVENT",
    "message": "This sales event has already been processed."
  }
}
```

Use meaningful HTTP status codes.

---

# 39. Real-Time Event Rules

Real-time updates may use:

- Supabase Realtime
- WebSocket
- Server-Sent Events
- Polling fallback

The game should receive approved sales events quickly.

However:

Do not sacrifice correctness for instant animation.

Persist first, then celebrate.

---

# 40. Accessibility Rules

Where applicable:

- Buttons must be keyboard accessible
- Use semantic HTML
- Maintain readable contrast
- Provide mute controls
- Avoid essential information communicated only by color
- Provide text equivalent for important game state

Do not require precise 3D interaction to perform critical admin actions.

---

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

---

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

---

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

---

# 44. File Modification Rules

Before modifying a file:

1. Read the relevant file.
2. Understand existing patterns.
3. Check imported dependencies.
4. Make the smallest safe change.
5. Avoid unrelated refactors.

Do not rewrite large files unnecessarily.

Do not remove working functionality unless explicitly required.

---

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

---

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

---

# 47. Build Verification Rules

After significant changes:

- Run type checking
- Run lint
- Run tests
- Run production build where practical

Fix errors caused by your changes before stopping.

Do not leave obvious TypeScript errors.

---

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

---

# 49. Environment Variables

Use `.env` / platform environment configuration.

Never hard-code:

- Supabase service key
- Database password
- OAuth secret
- CRM tokens
- API keys

Maintain an `.env.example` with variable names but no secrets.

---

# 50. User Experience Rules

Every meaningful achievement should answer:

1. What happened?
2. Why did it happen?
3. What changed?
4. What is next?

Example:

```text
DEAL CLOSED
+$2,500

+400 XP

Executive Office
82% complete

$1,750 until next upgrade
```

---

# 51. Animation Duration Rules

Animations must not block work.

Suggested:

- Small sale reaction: 1–2 seconds
- Normal celebration: 2–4 seconds
- Major milestone: 5–8 seconds
- Legendary cinematic: maximum around 10–12 seconds

Allow skip for longer cinematics later if needed.

---

# 52. Psychological Design Rules

Allowed:

- Visible progress
- Goal gradients
- Immediate feedback
- Ownership
- Milestones
- Achievement status
- Transparent streaks
- Cosmetic rewards
- Narrative progression

Do not implement:

- Fake scarcity
- Fake countdowns
- Hidden punishment
- Manipulative financial loss
- Misleading reward probabilities
- Public shaming

The product should motivate through achievement, not deception.

---

# 53. Demo-First Rule

A polished demo is more important than dozens of unfinished features.

The demo should clearly show:

```text
Basic office
↓
Sale arrives
↓
Character reacts
↓
XP increases
↓
Environment upgrades
↓
Near-target state
↓
Final sale
↓
Major celebration
↓
Better office / empire reveal
```

If choosing between:

A) another feature

and

B) making the core demo feel premium

choose B until the demo is excellent.

---

# 54. Current Demo Identity

For the initial showcase, use:

**Brand:** Salik Builds

Possible player display:

```text
SALIK BUILDS
AI CREATOR
```

The character may wear Salik Builds branded clothing.

Do not hard-code Salik Builds so deeply that customer branding becomes difficult later.

Use configuration.

---

# 55. Product Copy Rules

Keep copy:

- Short
- Strong
- Simple
- Easy English
- Motivational without sounding childish

Good:

```text
DEAL CLOSED
+$2,500

NEXT UPGRADE
Executive Office

$1,250 LEFT
```

Avoid long paragraphs inside gameplay.

---

# 56. Currency Rules

Support configurable currencies.

Examples:

- USD
- PKR
- GBP
- AED
- EUR

Use proper formatting.

Do not assume USD everywhere.

---

# 57. Date and Time Rules

Store timestamps in UTC.

Format for the user based on configured locale/timezone.

Do not use local browser time as the sole authority for streak logic.

---

# 58. Config-Driven Design

Business-specific values should be data, not code.

Examples:

- Revenue target
- XP multiplier
- Office thresholds
- Boss names
- Rank names
- Reward values
- Currency
- Company branding

Prefer configuration over conditionals like:

```ts
if (company === "CompanyA") ...
```

---

# 59. Save and Recovery Rules

Game progress should survive:

- Refresh
- Logout
- Browser restart
- Temporary connection loss

Do not rely only on localStorage for important business progression.

Local cache is acceptable for temporary UI state.

Server is authoritative.

---

# 60. Offline / Connection Failure

If the connection drops:

- Keep the scene usable
- Show a subtle connection state
- Do not fake confirmed sales
- Retry safe reads
- Queue only operations that can be safely reconciled
- Never double-process events after reconnect

---

# 61. Asset Failure Rules

If a model or animation fails:

- Show fallback
- Keep business data visible
- Log error
- Do not crash entire application

Examples:

Missing avatar:
→ use default avatar

Missing celebration animation:
→ use fallback particle/UI celebration

---

# 62. Loading Experience

Avoid blank screens.

Show:

- Branded loader
- Asset progress where useful
- Simple message

Example:

```text
Preparing your empire...
```

Do not fake progress percentages unless they reflect actual loading progress.

---

# 63. Empty States

Admin empty states should explain the next action.

Example:

```text
No sales events yet.

Add a sale manually or connect your CRM to start building the empire.
```

---

# 64. Business Reliability Rule

If forced to choose between:

- visual effect correctness
- sales data correctness

always protect sales data correctness.

A missing animation is recoverable.

Incorrect revenue or duplicated rewards damage trust.

---

# 65. Performance Event Auditability

Every permanent event should be traceable.

Store enough information to answer:

- Where did it come from?
- Who submitted it?
- When?
- Was it approved?
- What rewards did it generate?
- Was it duplicated?
- Was it later reversed?

---

# 66. Future Refund/Reversal Support

Design performance events so reversals can be supported later.

Do not simply delete historical sales.

Prefer event history.

Example future pattern:

```text
deal_closed +2500
deal_reversed -2500
```

Do not implement unless needed for MVP, but avoid architecture that makes it impossible.

---

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

---

# 68. Claude Code Working Rules

When working on this repository:

1. Inspect before editing.
2. Plan multi-file changes briefly.
3. Make the smallest coherent implementation.
4. Reuse existing utilities/components.
5. Keep the app runnable.
6. Verify changed functionality.
7. Report what changed clearly.

Do not claim a feature works if it has not been reasonably verified.

---

# 69. Do Not Invent APIs

If an external CRM or platform API is involved:

- Check existing project documentation
- Use official API patterns
- Do not invent endpoint names
- Do not invent fields

If credentials are required, create configuration placeholders rather than hard-coding assumptions.

---

# 70. Do Not Break Existing Assets

3D assets are expensive to recreate.

Before changing:

- Model path
- Animation name
- Skeleton mapping
- Material name
- Texture reference

verify dependencies.

Keep asset-loading code tolerant where possible.

---

# 71. Character Asset Naming Convention

Suggested:

```text
characters/
  salik/
    salik.glb

animations/
  idle.glb
  walk.glb
  phone-check.glb
  celebrate-small.glb
  celebrate-big.glb
  victory.glb
```

When Mixamo animation names are messy, normalize them in code or during asset preparation.

---

# 72. Game Event Naming Convention

Use consistent lowercase event identifiers:

```text
deal_closed
meeting_booked
qualified_lead
call_completed
daily_target_achieved
weekly_target_achieved
monthly_target_achieved
personal_record
level_up
office_upgrade
boss_defeated
```

Do not mix:

```text
dealClosed
DealClosed
DEAL_CLOSED
```

across persistence.

---

# 73. Animation Event Queue

Game reactions should use an event queue.

Example:

```text
Sale
↓
Sale celebration
↓
Level up
↓
Office upgrade
```

Do not run three overlapping cinematics simultaneously.

Priority and sequencing should be deterministic.

---

# 74. Suggested Event Queue Priority

Highest to lowest:

1. Legendary milestone
2. Boss defeat
3. Office tier upgrade
4. Level up
5. Large sale
6. Normal sale
7. Mission completion
8. Passive notification

Queue lower-priority events rather than dropping important state.

---

# 75. State Machine Recommendation

Prefer explicit game modes such as:

```ts
type GameMode =
  | "idle"
  | "sale-reaction"
  | "celebration"
  | "upgrade"
  | "boss-battle"
  | "cinematic";
```

Avoid uncontrolled overlap between:

- camera
- animation
- emotion
- UI overlays

---

# 76. Scene Optimization Budget

For MVP, keep scene complexity conservative.

Avoid:

- Massive city geometry
- Thousands of dynamic objects
- Excessive post-processing
- Many shadow-casting lights
- Very high-resolution textures everywhere

The product should run on office laptops, not only gaming PCs.

---

# 77. Post-Processing Rule

Use post-processing sparingly.

Good uses:

- Mild bloom for milestone moments
- Color grading
- Subtle depth effects

Avoid permanent heavy:

- Motion blur
- Extreme bloom
- Chromatic aberration
- Large depth-of-field

Clarity matters.

---

# 78. Accessibility Motion Rule

Add a reduced-motion option eventually.

If reduced motion is enabled:

- Minimize camera movement
- Disable unnecessary shake
- Shorten particles
- Preserve important textual feedback

---

# 79. Customer Deployment Rule

Do not create a separate code branch for every paying client.

Use:

```text
organization configuration
+
branding
+
assets
+
rules
```

One product should support many customers.

---

# 80. Pricing-Aware Engineering

Features that strengthen a $1,000+ sale should receive priority.

High-value:

- Custom avatar
- Company branding
- CRM/webhook integration
- Personalized environment
- Reliable event tracking
- Manager configuration
- Cinematic milestone moments

Lower priority:

- Decorative mini-games
- Complex combat
- Large maps
- Unrelated social features

---

# 81. Success Criterion

A potential customer should understand the product within 10 seconds of seeing the demo:

> **“Every time my salesperson closes a deal, their 3D empire grows.”**

If a feature makes this harder to understand, reconsider it.

---

# 82. Definition of Done

A feature is done when:

- It meets the PRD requirement.
- It works with real state.
- It persists where necessary.
- It handles errors.
- It does not break existing functionality.
- Type checking passes.
- Relevant tests pass.
- UI is understandable.
- No secrets are exposed.
- No obvious console errors remain.
- Performance is reasonable.

---

# 83. MVP Completion Checklist

The first sellable build requires:

- [ ] User authentication
- [ ] One player account
- [ ] Custom GLB avatar
- [ ] Avatar idle animation
- [ ] Avatar celebration
- [ ] Revenue target
- [ ] Current revenue
- [ ] Manual sale submission
- [ ] Admin sale approval
- [ ] Generic performance event API
- [ ] Duplicate protection
- [ ] XP calculation
- [ ] Level progression
- [ ] Three office tiers
- [ ] Office upgrade persistence
- [ ] Five milestones
- [ ] Trophy room
- [ ] One streak
- [ ] Sale sound
- [ ] Celebration particles
- [ ] Camera reaction
- [ ] Basic facial/emotional reaction
- [ ] Company branding
- [ ] Admin target configuration
- [ ] Production deployment
- [ ] Polished demo flow

---

# 84. Final Rule

Whenever there is uncertainty about what to build, return to this principle:

> **Real-world achievement must create a visible, emotional change in the 3D world.**

If a feature does not strengthen that loop or help a business deploy, manage, measure, or purchase the product, it is probably not an MVP priority.
