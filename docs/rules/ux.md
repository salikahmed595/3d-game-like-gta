# Rules — Ux
> HUD/UI, responsive, admin, branding, a11y, copy, psychology, currency, deployment, pricing priorities

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

# 29. Responsive Rules

Desktop is primary for MVP.

Still ensure:

- No broken layout at smaller widths
- Admin dashboard works on tablet
- Main game can display a simplified layout on mobile

Do not spend large development time on advanced mobile 3D before desktop MVP works.

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

# 40. Accessibility Rules

Where applicable:

- Buttons must be keyboard accessible
- Use semantic HTML
- Maintain readable contrast
- Provide mute controls
- Avoid essential information communicated only by color
- Provide text equivalent for important game state

Do not require precise 3D interaction to perform critical admin actions.

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

# 63. Empty States

Admin empty states should explain the next action.

Example:

```text
No sales events yet.

Add a sale manually or connect your CRM to start building the empire.
```

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
