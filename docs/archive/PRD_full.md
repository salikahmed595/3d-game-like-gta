# Sales Empire — Complete Product Requirements Document (PRD)

**Version:** 1.0  
**Product Type:** B2B SaaS + Custom 3D Solo Sales Gamification Platform  
**Primary User:** Individual salesperson  
**Primary Buyer:** Sales managers, founders, call centers, agencies, dealerships, real-estate firms, recruitment firms, SaaS companies, insurance teams, high-ticket sales organizations  
**Core Promise:** **Every real sale builds the player’s 3D empire.**

---

## 1. Executive Summary

Sales Empire is a solo 3D gamification platform that transforms real-world sales performance into visible, emotional, and rewarding progress inside a personalized 3D world.

Instead of seeing only numbers such as:

- $18,750 revenue
- 24 calls
- 5 meetings
- 3 closed deals

the salesperson sees those achievements physically change their world.

The player starts in a small, basic office. As they make calls, book meetings, close deals, hit targets, maintain streaks, and reach milestones, they unlock better furniture, premium offices, clothing, cars, trophies, boss battles, buildings, skyscrapers, and prestige ranks.

The player’s avatar can resemble the real salesperson. Their name, company, branding, and achievements appear inside the game. Their world grows because of their real performance.

The product is intentionally **solo**, not multiplayer. The goal is to create emotional attachment, ownership, motivation, and visible progress without relying on public competition.

---

## 2. Product Vision

### Vision

Create the most engaging solo sales-performance experience by making real-world achievement feel like building a personal empire.

### Product Statement

> **Your CRM tracks sales. Sales Empire makes you want to beat the target.**

### Core Design Principle

Every important number should become something visible, physical, or emotional inside the game.

Examples:

- $1,000 sale → desk upgrade
- $5,000 sale → premium office section
- 7-day streak → fire aura
- Monthly target → destroy milestone wall
- $100,000 lifetime revenue → skyscraper
- Largest-ever deal → permanent trophy
- 100 meetings → premium vehicle unlock

---

## 3. Problem Statement

Traditional sales dashboards are useful for reporting but weak at creating emotion.

Common problems:

1. Sales targets are represented only as numbers.
2. Feedback is delayed.
3. Repetitive work becomes boring.
4. Progress is difficult to feel emotionally.
5. Motivation often depends on manager pressure.
6. Rewards can feel disconnected from daily work.
7. Dashboards are designed for analysis, not engagement.
8. Individual salespeople often do not feel personal ownership over company targets.

---

## 4. Product Goals

### Primary Goals

- Increase emotional engagement with sales targets.
- Make progress visually satisfying.
- Give immediate feedback after meaningful achievements.
- Encourage consistent performance.
- Make KPIs feel tangible.
- Create a strong sense of ownership.
- Create a product businesses can justify paying $1,000+ for.

### Secondary Goals

- Support custom 3D avatars.
- Support company branding.
- Support manual, API, webhook, and CRM-based event input.
- Make the experience highly demoable.
- Keep sessions short enough that the game supports work instead of distracting from it.

### Non-Goals for MVP

- Full open-world gameplay
- Multiplayer
- Real-time employee-versus-employee competition
- Full driving simulation
- Complex RPG combat
- AAA graphics
- Large AI-generated worlds
- Large-scale social features

---

## 5. Target Customers

### Primary Buyer

Sales manager, founder, agency owner, call-center owner, dealership owner, real-estate company, recruitment firm, SaaS business, insurance firm, or high-ticket sales organization.

### Buyer Needs

- Better employee engagement
- Stronger focus on targets
- More visible progress
- Better adoption of KPIs
- Memorable company culture
- Faster recognition of achievement
- A unique performance product

### Primary User

A single salesperson.

### User Needs

- Clear goals
- Immediate feedback
- Visible rewards
- Personal progression
- Status
- Ownership
- A more interesting way to experience performance

---

## 6. Core Gameplay Loop

**Work → Achievement → Game Reaction → Reward → Visible Progress → New Goal → Repeat**

Example:

1. Salesperson closes a $2,000 deal.
2. CRM or admin sends the event.
3. Backend validates it.
4. In-game phone rings.
5. Avatar checks the phone.
6. Facial expression changes.
7. “DEAL CLOSED — $2,000” appears.
8. Sound plays.
9. XP and credits are awarded.
10. Environment reacts.
11. Office upgrade unlocks.
12. Next milestone becomes visible.

The reaction should happen within seconds whenever possible.

---

## 7. Starting Experience

The player starts with:

- Small office
- Basic chair
- Cheap desk
- Old laptop
- Empty walls
- Empty trophy shelf
- Basic clothing
- No premium vehicle
- No luxury objects
- Level 1 rank

The world should feel humble but not depressing.

### Idle Life System

The character should feel alive through:

- Natural blinking
- Breathing
- Looking at laptop
- Checking phone
- Sitting
- Standing
- Drinking coffee
- Stretching
- Looking out the window
- Small random movements

---

## 8. Long-Term Progression

The player eventually unlocks:

1. Starter Room
2. Professional Office
3. Executive Office
4. Agency Floor
5. Company Headquarters
6. Skyscraper
7. Multiple Buildings
8. City Empire
9. Prestige Ranks

### Example Level Structure

| Level | Unlock |
|---|---|
| 1 | Starter Room |
| 5 | Modern Desk |
| 10 | Professional Office |
| 15 | Better Clothing |
| 20 | Executive Office |
| 25 | First Vehicle |
| 30 | Agency Floor |
| 40 | Luxury Vehicle |
| 50 | Company HQ |
| 75 | Multiple Buildings |
| 100 | Full Empire |

---

## 9. Avatar System

Each user has one personalized 3D avatar.

### Required Avatar Features

- Custom appearance
- Branded T-shirt or polo
- Company logo
- Player name
- Idle animation
- Walking
- Sitting
- Standing
- Phone interaction
- Laptop typing
- Small celebration
- Big celebration
- Fist pump
- Confident walk
- Victory pose
- Wall-break animation
- Optional vehicle-entry animation

### Cosmetic Progression

Unlockable:

- T-shirts
- Polo shirts
- Jackets
- Business-casual outfits
- Suits
- Shoes
- Watches
- Accessories
- Premium effects
- Prestige outfits

---

## 10. Facial Emotion System

The character must not feel like a static NPC.

### Neutral

- Relaxed eyebrows
- Normal mouth
- Natural blinking
- Calm breathing

### Focused

- Slightly narrowed eyes
- Brows angled inward
- Slight forward lean
- Reduced random motion

### Excited

- Raised eyebrows
- Wider eyes
- Smile
- Faster head movement

### Happy

- Larger smile
- Raised cheeks
- Relaxed brows

### Proud

- Small controlled smile
- Chin slightly raised
- Shoulders back

### Frustrated

- Tight lips
- Brows inward
- Slight head shake

### Surprised

- Wide eyes
- Raised eyebrows
- Slightly open mouth

### Determined

- Focused eyes
- Tight jaw
- Upright posture

### Emotion Blending

Expressions should transition naturally.

Example:

**Neutral → Surprise → Excited → Proud → Neutral**

Avoid hard switching.

---

## 11. Body-Language System

### Low Activity State

- Slower movement
- More sitting
- Casual posture
- Looking at laptop
- Drinking coffee
- Looking around office

### High Performance State

- Faster walking
- Shoulders back
- Confident idle
- Stronger gestures
- More energetic celebration

### Near Target State

- More focused posture
- Looks toward target screen
- Checks phone
- Leans toward monitor
- Less casual idle behavior

---

## 12. Physics System

Success should physically affect the scene.

### Physics-Enabled Objects

- Chair
- Papers
- Coffee cup
- Phone
- Desk objects
- Upgrade crates
- Wall fragments
- Confetti
- Coins
- Reward particles

### Small Sale

- Phone vibration
- Small particle burst
- Light sound
- Tiny camera response

### Large Sale

- Chair rolls slightly
- Papers move
- Stronger particle effect
- Lighting pulse
- Cinematic camera movement

### Major Milestone

- Wall cracks
- Wall fragments fall
- Dust appears
- Locked door opens
- New office is revealed

Physics should be satisfying but controlled.

---

## 13. Office Upgrade System

### Tier 1 — Starter Room

- Basic desk
- Basic laptop
- Simple chair
- Empty walls
- Weak lighting

### Tier 2 — Professional Office

Example unlock: **$5,000 revenue**

- Better desk
- Better chair
- Better lighting
- Branded wall
- Larger monitor

### Tier 3 — Executive Office

Example unlock: **$20,000 revenue**

- Premium desk
- Large windows
- City view
- Multi-monitor setup
- Trophy shelf

### Tier 4 — Agency Floor

Example unlock: **$50,000 revenue**

- Larger office
- Meeting area
- Lounge
- Branded wall
- AI companion station

### Tier 5 — Company HQ

Example unlock: **$100,000+ revenue**

- Reception
- Executive office
- Boardroom
- Vehicle parking
- Premium architecture

### Tier 6 — Skyscraper Empire

- Branded skyscraper
- Rooftop
- Luxury garage
- City-wide branding
- Prestige visuals

---

## 14. Revenue-to-Game Conversion

Admin configures how real work maps to rewards.

Example:

- 1 call = 5 XP
- 1 qualified meeting = 50 XP
- 1 sale = 200 XP
- $100 revenue = 100 XP
- Daily target = 100 bonus XP
- Monthly target = 5,000 bonus XP

Example configuration:

```json
{
  "call_completed": 5,
  "qualified_meeting": 50,
  "deal_closed": 200,
  "revenue_per_100": 100,
  "daily_target": 100,
  "monthly_target": 5000
}
```

---

## 15. Daily Mission System

Each day should have only a few clear missions.

Example:

**TODAY'S MISSION**

- Complete 30 calls
- Book 3 meetings
- Close $2,500
- Maintain 5-day streak

Do not overload the player with too many tasks.

---

## 16. Streak System

Supported streaks:

- Call target streak
- Meeting-booking streak
- Sales-day streak
- Weekly target streak

### Visual Representation

- Fire
- Aura
- Lighting effect
- Badge
- Special office effect

Example:

**7 DAY STREAK 🔥**

### Ethical Rule

No fake deadlines.
No financial punishment.
No public humiliation.
No deceptive loss mechanics.

---

## 17. Milestone System

Examples:

- First Sale
- First $1,000
- First $10,000
- 10 Deals Closed
- 100 Calls
- 50 Meetings
- $100,000 Lifetime Revenue
- Largest Deal
- Personal-Best Month

Each milestone includes:

- Name
- Icon
- Sound
- Animation
- Reward
- Trophy
- Date achieved

---

## 18. Trophy Room

Achievements live physically inside a 3D trophy room.

Examples:

- First Deal
- $10K Month
- $50K Month
- 10-Day Streak
- Biggest Deal
- Personal Record
- 100 Meetings
- Target Crusher

Clicking a trophy shows:

- Achievement name
- Date
- Metric
- Value
- Optional description

---

## 19. Boss Battle System

Bosses represent major business targets.

### Example Bosses

**The Doubter** — $10,000 target  
**The Competitor** — $25,000 target  
**The Market** — $50,000 target  
**The Giant** — $100,000 target

Boss health represents the remaining target.

Example:

Monthly target: $25,000  
Current revenue: $18,750  
Boss remaining HP: 25%

Every sale triggers an attack.

When the target is reached:

- Cinematic attack
- Boss defeat
- Confetti
- Special sound
- Reward
- New environment unlock

Bosses should be used only for major milestones.

---

## 20. Environmental Storytelling

### Early Stage

- Empty shelves
- Small workspace
- Basic equipment

### Mid Stage

- Awards
- Better furniture
- Larger monitors
- Company branding
- Better city view

### Late Stage

- Trophy collection
- Premium vehicles
- Large company logo
- Skyscraper
- Luxury office

---

## 21. AI Companion

Optional small robot or AI assistant.

### Purpose

- React to progress
- Celebrate
- Point toward targets
- Show milestone reminders
- Provide light guidance

### Example Behavior

Sale:
- Celebrates

Near Target:
- Points toward progress board

Idle:
- Performs quiet background behavior

Level Up:
- Visually upgrades

The companion must not interrupt constantly.

---

## 22. Vehicle Reward System

Vehicle progression:

1. No vehicle
2. Basic sedan
3. Premium sedan
4. SUV
5. Sports car
6. Luxury car
7. Supercar

MVP does not require driving.

Reward cinematic:

**Garage opens → character walks to car → enters → engine starts → vehicle exits**

---

## 23. Clothing Progression

Example:

- Level 1: Branded T-shirt
- Level 10: Polo shirt
- Level 20: Premium polo
- Level 30: Jacket
- Level 40: Business casual
- Level 50: Executive outfit
- Prestige: Special premium outfit

---

## 24. Reward Rarity System

Reward tiers:

- Common
- Rare
- Epic
- Legendary

Examples:

Small sale → Common  
Large deal → Rare  
Personal best → Epic  
Major record → Legendary

Rewards should be linked to understandable achievements, not hidden gambling mechanics.

---

## 25. Supported Sales Events

- Call completed
- Qualified lead
- Meeting booked
- Proposal sent
- Deal closed
- Revenue recorded
- Upsell
- Renewal
- Daily goal achieved
- Weekly goal achieved
- Monthly goal achieved
- Personal record
- Streak maintained

---

## 26. Game Event Engine

```text
CRM / Manual Event
        ↓
Backend Validation
        ↓
Duplicate Check
        ↓
KPI Mapping
        ↓
Reward Calculation
        ↓
Game Event Created
        ↓
Frontend Receives Event
        ↓
Animation + Sound
        ↓
XP + Currency
        ↓
World Update
        ↓
Progress Saved
```

---

## 27. Game Currency

Use one simple currency:

**Empire Credits**

Earned through performance.

Used for:

- Furniture
- Decorations
- Clothing
- Cars
- Visual effects
- Office upgrades

Do not add paid loot boxes or microtransactions in the MVP.

---

## 28. XP and Rank System

XP represents long-term progress.

Example:

Calls → low XP  
Meetings → medium XP  
Sales → high XP  
Revenue milestones → high XP  
Personal records → major XP

### Possible Ranks

1. Rookie
2. Closer
3. Deal Maker
4. High Performer
5. Sales Pro
6. Elite Closer
7. Rainmaker
8. Founder I
9. Founder II
10. Tycoon
11. Magnate
12. Empire Legend

Admin can rename ranks.

---

## 29. Prestige System

After reaching max level:

- User keeps trophies and history
- Receives prestige badge
- Unlocks new building skin
- Unlocks premium outfit
- Unlocks special aura
- Unlocks advanced boss series

Prestige extends the product lifecycle.

---

## 30. Camera System

### Default Camera
Third-person office camera.

### Sale Camera
Quick focus toward character.

### Big Sale Camera
Cinematic orbit.

### Upgrade Camera
Moves toward upgraded object.

### Boss Camera
More dramatic angle.

### Building Unlock
Camera pulls outside the building.

Cinematics should remain short.

---

## 31. Sound Design

Required:

- Phone ring
- Sale confirmation
- Coin / credit sound
- XP sound
- Level-up sound
- Upgrade sound
- Big-sale sound
- Target-achieved music
- Boss attack
- Boss defeat
- Trophy sound
- Construction
- Car engine
- Confetti

Mute control is mandatory.

---

## 32. Visual Effects

Possible:

- Confetti
- Particle bursts
- Floating XP
- Money particles
- Light pulses
- Dust
- Wall destruction
- Sparks
- Aura
- Fire streak
- Construction effects

Effect intensity should scale with achievement importance.

---

## 33. Main HUD

Keep the UI minimal.

Example:

**Top Left:** SALIK BUILDS  
**Top Center:** $18,750 / $20,000  
**Top Right:** LEVEL 17 — CLOSER  
**Bottom:** NEXT UNLOCK: EXECUTIVE OFFICE — $1,250 LEFT

The 3D environment should remain the main interface.

---

## 34. Admin Dashboard

### User Management

- Add user
- Edit user
- Disable user
- Assign avatar
- Reset password

### KPI Configuration

- Monthly target
- Weekly target
- Daily target
- Calls
- Meetings
- Proposals
- Revenue
- Deals

### Reward Configuration

- XP weights
- Milestones
- Level unlocks
- Boss targets

### Branding

- Company name
- Logo
- Colors
- Office signage
- Character clothing

### Data Input

- Manual entry
- Generic webhook
- REST API
- CRM connections

### Reporting

- Revenue
- Activity
- Game engagement
- Last login
- Milestones
- Target progress

---

## 35. Manual Sale Entry

For businesses without CRM integration.

Fields:

- Deal amount
- Client name optional
- Date
- Deal type
- Notes

Optional approval:

**Player submits → manager approves → reward triggers**

---

## 36. CRM and API Integration

Future integrations:

- HubSpot
- Salesforce
- Pipedrive
- Zoho
- Close
- GoHighLevel
- Custom CRM

MVP should support:

1. Manual event entry
2. Generic webhook
3. REST API

Example:

```http
POST /api/events
```

```json
{
  "user_id": "user_123",
  "event_type": "deal_closed",
  "amount": 2500,
  "currency": "USD",
  "source": "crm",
  "external_id": "deal_789"
}
```

---

## 37. Duplicate and Fraud Protection

Required:

- Unique external event IDs
- Duplicate detection
- Server-side validation
- Admin approval for manual entries
- Audit logs
- Role-based permissions

---

## 38. Psychological Design Principles

Use behavioral design without deceptive dark patterns.

### Goal Gradient

Intensity increases as the player approaches the target.

70% → normal  
85% → subtle glow  
95% → stronger environment  
100% → cinematic reward

### Immediate Feedback

Important achievements should receive feedback quickly.

### Ownership

Use:

- Real name
- Custom avatar
- Company branding
- Personal office
- Personal trophies

### Visible Progress

Show incomplete construction.

Example:

An office expansion can visibly appear 80% complete.

### Status

Use:

- Ranks
- Trophies
- Vehicles
- Premium clothing
- Building size

### Commitment

As the player builds the world, ownership increases.

### Narrative Progress

**Nobody → Professional → Closer → Leader → Empire Builder**

---

## 39. Ethical Boundaries

Do not use:

- Fake urgency
- False scarcity
- Fake sales
- Public humiliation
- Financial punishment
- Misleading odds
- Forced spending
- Harassment-style notifications

The product should motivate using progress, ownership, feedback, and rewards.

---

## 40. Emotional Experience Map

| Situation | Intended Emotion | Game Reaction |
|---|---|---|
| No Activity | Calm | Normal idle office |
| First Activity | Momentum | Small positive response |
| Sale | Achievement | Celebration |
| Big Sale | Excitement | Cinematic + upgrade |
| Near Goal | Focus | Increased intensity |
| Goal Reached | Victory | Major unlock |
| Personal Record | Pride | Legendary reward |

---

## 41. First-Time User Experience

1. User logs in.
2. Avatar appears.
3. Name/company appears inside environment.
4. Short camera introduction.
5. Monthly target appears.
6. Message:

> **Your real sales build this world.**

7. Next unlock is shown.
8. User enters normal game view.

Target onboarding time: under 60 seconds.

---

## 42. Daily Return Flow

1. Character enters office.
2. Lights turn on.
3. Daily progress appears.
4. Daily mission appears.
5. Next unlock is shown.
6. User continues normal work.

Recommended interaction:

- Morning: 1–2 minutes
- After key sales: 20–60 seconds
- End of day: 1–3 minutes

---

## 43. Technical Architecture

### Recommended Frontend

- React
- React Three Fiber
- Three.js
- Drei
- Zustand
- Framer Motion
- GLB / GLTF assets

### Backend

- Node.js
- Next.js API / Fastify / Express
- PostgreSQL
- Supabase optional
- Redis optional for real-time events

### Storage

- Supabase Storage
- Cloudflare R2
- AWS S3

### Authentication

- Email/password
- Magic link optional
- Google OAuth optional

---

## 44. 3D Asset Requirements

Preferred format:

**GLB / GLTF**

Character requirements:

- Rig
- Skeleton
- Compatible animations
- Facial blendshapes if available
- PBR materials

### Optimization

Target:

- Character under 15–25 MB where possible
- Compressed textures
- Meshopt or Draco where appropriate
- Reusable environment assets
- Lazy loading
- LOD for larger scenes

---

## 45. Animation Requirements

MVP animations:

1. Idle
2. Walking
3. Sit down
4. Stand up
5. Phone check
6. Laptop typing
7. Small celebration
8. Big celebration
9. Fist pump
10. Confident walk
11. Wall punch
12. Victory pose

Future:

- Car entry
- Boss combat
- Advanced facial sequences

---

## 46. Core Game State

Example:

```json
{
  "player": {
    "id": "123",
    "name": "Salik",
    "level": 17,
    "xp": 7400,
    "rank": "Closer",
    "streak": 4
  },
  "performance": {
    "monthly_target": 20000,
    "monthly_revenue": 18750,
    "calls": 250,
    "meetings": 42,
    "sales": 14
  },
  "empire": {
    "office_level": 3,
    "building_level": 1,
    "vehicle_id": "car_02",
    "outfit_id": "outfit_04"
  }
}
```

---

## 47. Database Entities

Core tables:

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

---

## 48. Analytics

### Business Metrics

- Revenue
- Deals
- Meetings
- Calls
- Target completion

### Game Metrics

- Sessions
- Session length
- Daily active users
- Reward views
- Upgrade interactions
- Trophy interactions

### Behavioral Metrics

- Return frequency
- Goal completion rate
- Streak duration
- Performance before/after deployment

Do not claim the game improves sales until customer data supports that conclusion.

---

## 49. Manager ROI Dashboard

Show:

- User engagement
- Target progress
- Sales activity
- Game usage
- Milestones
- Performance trend

Future feature:

**Before Sales Empire vs After Sales Empire**

This should be observational unless a controlled experiment exists.

---

## 50. Customer Customization

Each customer can customize:

- Company logo
- Company colors
- Avatar
- Shirt
- Office branding
- Currency
- KPI names
- Targets
- Rewards
- Rank names
- Boss names
- Building name

Example:

**SALIK BUILDS HQ**

instead of a generic building.

---

## 51. Pricing Strategy

### Solo Custom Setup

**$999–$1,500**

Includes:

- 1 custom avatar
- Company branding
- Custom sales target
- Standard office progression
- Manual / API data input
- Hosted game

### Premium Custom Build

**$2,000–$5,000+**

Includes:

- Custom environment
- Advanced avatar
- CRM integration
- Custom milestones
- Custom bosses
- Custom office assets
- Custom vehicle rewards

### Monthly Hosting

**$99–$299/month**

Includes:

- Hosting
- Database
- Analytics
- Support
- Updates
- Integration maintenance

---

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

---

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

---

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

---

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

---

## 56. AI Coach — Future Feature

Optional.

Examples:

> “You're $1,250 away from your next office upgrade.”

> “You have booked 4 meetings this week. Your personal record is 6.”

Avoid aggressive or manipulative messaging.

---

## 57. Performance Requirements

Targets:

- Initial load under 5 seconds on average broadband
- Stable 30–60 FPS on typical business laptops
- Desktop responsive
- Graceful degradation on lower-end devices

Graphics settings:

- Low
- Medium
- High

---

## 58. Browser Support

Primary:

- Chrome
- Edge
- Safari
- Firefox

Desktop-first MVP.

Mobile can use a simplified experience later.

---

## 59. Security Requirements

- HTTPS
- Secure authentication
- Server-side event validation
- Password hashing
- Rate limiting
- Input validation
- Audit logs
- Role-based access control
- Secure API secrets
- No secrets exposed in frontend
- Row-level security if Supabase is used

---

## 60. Privacy Requirements

Store only necessary information.

Possible stored data:

- Name
- Email
- Performance metrics
- Game progress
- Avatar
- Company branding

Avoid storing unnecessary sensitive client/deal information.

Allow organization administrators to control retention.

---

## 61. User Roles

### Admin

Can:

- Configure targets
- Manage user
- Approve manual events
- Configure branding
- View analytics
- Configure rewards
- Manage integrations

### Player

Can:

- View game
- View progress
- View achievements
- Customize unlocked cosmetics
- Submit manual performance events if enabled

---

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

---

## 63. Product Success Metrics

### Customer Metrics

- Number of paid customers
- Setup revenue
- Monthly recurring revenue
- Renewal rate

### User Metrics

- Daily / weekly usage
- Milestones completed
- Target completion
- Streak participation
- Average session length

### Product Metrics

- Event delivery success
- Crash rate
- Load time
- Animation completion rate
- Integration reliability

---

## 64. Major Risks

### Risk 1 — Novelty Wears Off

Mitigation:

- Long-term progression
- New rewards
- Prestige
- Monthly themes
- Boss milestones

### Risk 2 — Too Much Game, Not Enough Business Value

Mitigation:

- Tie every reward to KPI progress
- Keep sessions short
- Give managers measurable analytics

### Risk 3 — Performance Problems

Mitigation:

- GLB optimization
- LOD
- compressed textures
- limited environment complexity

### Risk 4 — Employee Feels Manipulated

Mitigation:

- Transparent rules
- No fake urgency
- No humiliation
- User-controlled sound and effects

### Risk 5 — Fake Sales Data

Mitigation:

- CRM integration
- Manager approval
- Unique event IDs
- Audit logs

---

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

---

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

---

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

---

## 68. Core Differentiator

Sales Empire is not:

- A traditional CRM
- A spreadsheet dashboard
- A generic sales leaderboard
- A normal game

It is a **visual performance world connected to real business activity**.

Core selling idea:

> **Every sale physically builds your empire.**

---

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

---

## 70. Suggested Product Taglines

Primary:

**Every sale builds your empire.**

Alternatives:

- **Stop watching numbers. Start building your empire.**
- **Your performance. Your character. Your empire.**
- **Turn targets into a world worth building.**
- **Make progress impossible to ignore.**

---

## 71. Final Product Principle

The product should never feel like:

> “I entered a number and the dashboard changed.”

It should feel like:

> **“I achieved something in the real world, and my world changed because of it.”**
