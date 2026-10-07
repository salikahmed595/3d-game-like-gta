# PRD — Events
> Sales event types, game event pipeline, CRM/API integration, fraud/duplicate protection

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

## 37. Duplicate and Fraud Protection

Required:

- Unique external event IDs
- Duplicate detection
- Server-side validation
- Admin approval for manual entries
- Audit logs
- Role-based permissions
