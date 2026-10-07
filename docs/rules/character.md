# Rules — Character
> Animations, emotions, priorities, camera, event queue, game modes, reduced motion, durations, asset naming

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

# 51. Animation Duration Rules

Animations must not block work.

Suggested:

- Small sale reaction: 1–2 seconds
- Normal celebration: 2–4 seconds
- Major milestone: 5–8 seconds
- Legendary cinematic: maximum around 10–12 seconds

Allow skip for longer cinematics later if needed.

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

# 78. Accessibility Motion Rule

Add a reduced-motion option eventually.

If reduced motion is enabled:

- Minimize camera movement
- Disable unnecessary shake
- Shorten particles
- Preserve important textual feedback
