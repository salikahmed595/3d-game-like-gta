# PRD — Tech
> Architecture, 3D assets, game state JSON, DB entities, performance, browser, security, privacy

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

## 58. Browser Support

Primary:

- Chrome
- Edge
- Safari
- Firefox

Desktop-first MVP.

Mobile can use a simplified experience later.

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
