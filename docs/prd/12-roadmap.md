# PRD — Roadmap
> MVP scope/story, phases, AI coach, acceptance criteria, demo sequence, build order, MVP definition

## 52. MVP Scope

### Character

- One 3D avatar
- Idle
- Walk
- Sale celebration
- Big celebration

### World

- Starter office
- Professional office
- Executive office

### Data

- Manual sale entry
- Generic webhook
- Revenue target

### Game

- XP
- Levels
- Progress bar
- Next unlock
- 5 milestones
- 3 office upgrades
- Basic trophy room
- One streak

### Effects

- Sale particle
- Sale sound
- Upgrade animation
- Confetti
- Basic camera movement

### Admin

- Login
- User configuration
- Target setup
- Manual sale approval
- Logo upload
- KPI settings

## 53. MVP User Story

A company purchases Sales Empire.

Admin:

1. Creates salesperson account.
2. Uploads company logo.
3. Sets monthly target to $25,000.
4. Adds salesperson avatar.
5. Selects milestones.

Salesperson logs in and sees the starter office.

They close a $3,000 sale.

Admin enters the sale or CRM sends it.

Game response:

- Phone rings
- Character checks phone
- Facial emotion changes
- Character celebrates
- $3,000 appears
- XP awarded
- Target becomes $3,000 / $25,000
- Desk upgrade unlocks

This is enough to demonstrate the core product.

## 54. Phase 2

Add:

- Boss battles
- AI companion
- Cars
- Character wardrobe
- More offices
- More animations
- Expanded trophy room
- HubSpot integration
- Pipedrive integration
- Slack integration
- Daily missions
- Weekly missions

## 55. Phase 3

Add:

- Skyscraper empire
- City progression
- Prestige system
- Advanced boss battles
- More personalized cinematics
- Company-specific worlds
- AI coach
- Mobile companion app

## 56. AI Coach — Future Feature

Optional.

Examples:

> “You're $1,250 away from your next office upgrade.”

> “You have booked 4 meetings this week. Your personal record is 6.”

Avoid aggressive or manipulative messaging.

## 62. Acceptance Criteria — Core MVP

### Sale Event

Given a valid sale event:

When backend receives it:

Then:

- Sale is stored
- Duplicate check occurs
- XP is calculated
- Target progress updates
- Frontend receives event
- Character celebration triggers
- Sound plays
- Reward effects trigger
- Progress persists after refresh

### Level Up

When XP crosses the level threshold:

- Level increases
- Level-up animation plays
- Unlocks are awarded
- Unlock remains permanent

### Office Upgrade

When milestone requirement is reached:

- Upgrade becomes available
- Environment changes
- New state persists
- Camera highlights the upgrade

## 65. Demo Version

Before building the complete SaaS, create one polished demo.

### Demo Character

Salik Builds avatar.

### Demo Target

$25,000 monthly sales.

### Demo Sequence

1. Character sits in starter office.
2. Deal event: +$1,500.
3. Character celebrates.
4. Desk upgrades.
5. Deal event: +$4,000.
6. Environment improves.
7. Revenue reaches $23,500.
8. Near-target mode activates.
9. Final +$1,500 sale.
10. Target achieved.
11. Character destroys target wall.
12. Executive office is revealed.
13. Camera exits building.
14. Building displays **SALIK BUILDS**.
15. End screen:

> **Your sales built this.**

Then:

> **Turn your targets into a 3D empire.**

## 66. Recommended Demo Technology

### Frontend

- React
- React Three Fiber
- Three.js
- Drei
- Zustand
- Framer Motion

### Backend

- Supabase
- PostgreSQL
- Edge Functions or Node.js API

### Assets

- GLB avatar
- Mixamo-compatible animations
- Blender for editing
- Properly licensed free environment assets

### Deployment

- Vercel frontend
- Supabase backend

## 67. Recommended Build Order

### Sprint 1

- Load avatar
- Load environment
- Animation system
- Basic HUD

### Sprint 2

- Performance event API
- XP
- Revenue target
- Sale animation

### Sprint 3

- Office progression
- Unlock system
- Save/load

### Sprint 4

- Facial emotions
- Camera cinematics
- Sound
- Particles

### Sprint 5

- Admin dashboard
- Manual sale entry
- Branding

### Sprint 6

- Demo polish
- Performance optimization
- Deployment

## 69. Final MVP Definition

The MVP is complete when:

1. One salesperson can log in.
2. Their custom 3D character appears.
3. Their monthly target is visible.
4. A real or manually entered sale can be submitted.
5. The sale updates the target.
6. Avatar emotionally reacts.
7. XP is awarded.
8. A reward can unlock.
9. Office visually upgrades.
10. Progress survives logout.
11. Admin can configure targets.
12. Experience is polished enough for a 30–60 second sales demo.
