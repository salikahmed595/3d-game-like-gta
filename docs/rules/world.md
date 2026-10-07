# Rules — World
> Office tiers, unlocks, rewards, streaks, bosses, trophies, audio, performance, 3D assets, lighting, loading, post-processing

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

# 20. Reward Rules

Reward types:

- Common
- Rare
- Epic
- Legendary

Do not use random gambling-style mechanics involving money.

Variable rewards can be cosmetic surprises tied to legitimate achievements.

Players should understand what meaningful activity caused the reward.

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

# 27. Lighting Rules

Prioritize good-looking performance over expensive realism.

Prefer:

- Baked lighting where possible
- Environment maps
- Limited dynamic lights
- Limited shadow casters

Avoid many real-time lights.

The game should look premium but still run smoothly.

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

# 76. Scene Optimization Budget

For MVP, keep scene complexity conservative.

Avoid:

- Massive city geometry
- Thousands of dynamic objects
- Excessive post-processing
- Many shadow-casting lights
- Very high-resolution textures everywhere

The product should run on office laptops, not only gaming PCs.

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
