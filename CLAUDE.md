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

`docs/prd/INDEX.md` (split PRD; read only the relevant file)

Before implementing a new feature:

1. Read the relevant PRD section.
2. Check the existing architecture.
3. Reuse existing patterns.
4. Do not silently change product behavior.
5. If code and PRD conflict, prefer the PRD unless the implementation has clearly evolved and the change is intentional.

Do not invent large product features that are not present in the PRD.

Small implementation decisions are allowed when necessary.

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

# 64. Business Reliability Rule

If forced to choose between:

- visual effect correctness
- sales data correctness

always protect sales data correctness.

A missing animation is recoverable.

Incorrect revenue or duplicated rewards damage trust.

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

# 81. Success Criterion

A potential customer should understand the product within 10 seconds of seeing the demo:

> **“Every time my salesperson closes a deal, their 3D empire grows.”**

If a feature makes this harder to understand, reconsider it.

# 84. Final Rule

Whenever there is uncertainty about what to build, return to this principle:

> **Real-world achievement must create a visible, emotional change in the 3D world.**

If a feature does not strengthen that loop or help a business deploy, manage, measure, or purchase the product, it is probably not an MVP priority.


# Detailed docs (read on demand — do NOT read all)
Load only the single file relevant to the current task. Section numbers are original.
- PRD index: docs/prd/INDEX.md (product spec split into 12 topic files; the PRD is the source of truth)
- docs/rules/code.md — stack, architecture, TS, naming, testing, build, env, git (§4-6,41-49,67,69)
- docs/rules/data.md — game state, event pipeline, duplicates, XP/levels, tenancy, security, DB, API, errors, offline (§7-12,32-39,57-60,65,66,72)
- docs/rules/character.md — animation, emotion, camera, event queue, game modes (§13-17,51,71,73-75,78)
- docs/rules/world.md — office, unlocks, rewards, bosses, trophies, audio, perf, 3D assets, lighting (§18-27,61,62,70,76,77)
- docs/rules/ux.md — HUD, responsive, admin, branding, a11y, copy, currency, pricing priorities (§28-31,40,50,52,54-56,63,79,80)
- docs/rules/done.md — definition of done, MVP checklist (§82,83)
