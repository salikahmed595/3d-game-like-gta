# PRD — Progression
> XP/KPI mapping, missions, streaks, milestones, trophies, bosses, rarity, currency, ranks, prestige

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

## 15. Daily Mission System

Each day should have only a few clear missions.

Example:

**TODAY'S MISSION**

- Complete 30 calls
- Book 3 meetings
- Close $2,500
- Maintain 5-day streak

Do not overload the player with too many tasks.

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

## 29. Prestige System

After reaching max level:

- User keeps trophies and history
- Receives prestige badge
- Unlocks new building skin
- Unlocks premium outfit
- Unlocks special aura
- Unlocks advanced boss series

Prestige extends the product lifecycle.
