# Rules — Data
> Game state, sales event pipeline, duplicates, XP/levels, tenancy, security, DB, API format, realtime, errors, offline, audit, config

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

# 57. Date and Time Rules

Store timestamps in UTC.

Format for the user based on configured locale/timezone.

Do not use local browser time as the sole authority for streak logic.

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

# 59. Save and Recovery Rules

Game progress should survive:

- Refresh
- Logout
- Browser restart
- Temporary connection loss

Do not rely only on localStorage for important business progression.

Local cache is acceptable for temporary UI state.

Server is authoritative.

# 60. Offline / Connection Failure

If the connection drops:

- Keep the scene usable
- Show a subtle connection state
- Do not fake confirmed sales
- Retry safe reads
- Queue only operations that can be safely reconciled
- Never double-process events after reconnect

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
