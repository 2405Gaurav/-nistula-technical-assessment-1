# Nistula Technical Assessment — Guest Message Handler

A backend system that receives guest messages from multiple channels, normalises them, classifies the query type, generates AI-drafted replies using Claude, and returns a confidence-scored response.

**Stack:** Node.js · TypeScript · Express · PostgreSQL (raw pg) · Claude API · Zod

---

## Setup Instructions

### Prerequisites
- Node.js 18+
- PostgreSQL running locally on port 5432
- A database named `nistula_db`

### 1. Clone and install
```bash
git clone https://github.com/YOUR_USERNAME/nistula-technical-assessment.git
cd nistula-technical-assessment
npm install
```

### 2. Set up the database
Open pgAdmin or psql and run the schema file against your `nistula_db` database:
```bash
psql -U postgres -d nistula_db -f schema.sql
```
This creates all tables (Guest, Property, Reservation, Conversation, Message) and seeds Villa B1.

**Note:** `Guest.fullName` is `UNIQUE` so one profile is reused per name. If you applied an older schema without this constraint and already have duplicate guest names, drop the database (or dedupe rows) before re-running `schema.sql`.

Optional — seed the sample reservation from the brief (`NIS-2024-0891`) so reservation context appears in prompts and scores higher when both property + booking data exist:
```bash
npx tsx seed-reservation.ts
```

### 3. Configure environment variables
```bash
cp .env.example .env
```
Edit `.env` with your actual values:
```
PORT=3000
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/nistula_db"
ANTHROPIC_API_KEY="your-api-key"
```

### 4. Start the server
```bash
npm run dev
```

### 5. Test the endpoint

The handler returns **flat JSON** exactly as in the brief (no `success` / `data` wrapper):

`{ "message_id", "query_type", "drafted_reply", "confidence_score", "action" }`

Run at least three different scenarios (after `schema.sql` and, for booking-aware tests, `npx tsx seed-reservation.ts`):

**1 — Pre-sales + booking ref (property + reservation context in prompt)**  
```bash
curl -s -X POST http://localhost:3000/webhook/message \
  -H "Content-Type: application/json" \
  -d "{\"source\":\"whatsapp\",\"guest_name\":\"Rahul Sharma\",\"message\":\"Is the villa available from April 20 to 24? What is the rate for 2 adults?\",\"timestamp\":\"2026-05-05T10:30:00Z\",\"booking_ref\":\"NIS-2024-0891\",\"property_id\":\"villa-b1\"}"
```

**2 — Post-sales factual (WiFi / check-in)**  
```bash
curl -s -X POST http://localhost:3000/webhook/message \
  -H "Content-Type: application/json" \
  -d "{\"source\":\"airbnb\",\"guest_name\":\"Rahul Sharma\",\"message\":\"What is the WiFi password and what time is check-in?\",\"timestamp\":\"2026-05-06T08:00:00Z\",\"booking_ref\":\"NIS-2024-0891\",\"property_id\":\"villa-b1\"}"
```

**3 — Complaint (must escalate regardless of score)**  
```bash
curl -s -X POST http://localhost:3000/webhook/message \
  -H "Content-Type: application/json" \
  -d "{\"source\":\"whatsapp\",\"guest_name\":\"Alex\",\"message\":\"The AC is not working. This is unacceptable.\",\"timestamp\":\"2026-05-07T03:00:00Z\",\"booking_ref\":\"NIS-2024-0891\",\"property_id\":\"villa-b1\"}"
```

---

## How It Works — Pipeline Architecture

```
POST /webhook/message
  │
  ├── 1. Zod Validation Middleware
  │       Validates payload shape, trims strings, checks source enum
  │
  ├── 2. Normalisation Service
  │       Maps external fields → canonical internal schema
  │       Generates UUID, classifies query type
  │
  ├── 3. Classification Service (Hybrid)
  │       Rule-based keyword matching runs first (free, instant)
  │       Claude fallback only if rules return "general_enquiry"
  │
  ├── 4. Context Service
  │       Builds the AI prompt context: Villa B1 facts (static string) +
  │       optional reservation block from PostgreSQL when booking_ref matches
  │
  ├── 5. Response Service
  │       Sends structured prompt to Claude claude-sonnet-4-20250514
  │       System prompt sets tone per query type
  │
  ├── 6. Confidence Scoring
  │       Deterministic score from query type + property + reservation signals
  │
  ├── 7. Persistence Service
  │       Upsert guest (unique name), link conversation to reservation when known,
  │       store query_type + confidence + action on inbound and outbound rows
  │
  └── Response (assessment shape — flat JSON, no wrapper)
        { message_id, query_type, drafted_reply, confidence_score, action }
```

---

## Confidence Scoring Logic

The score is **deterministic** (0.00–1.00): it estimates how well **grounded** the draft was likely to be, based on **what we put in the prompt** — especially **property context** (Villa B1 facts) and **reservation context** (dates, guests, status from PostgreSQL when `booking_ref` matches). It does **not** re-read the model’s answer to judge prose quality.

### Why score inputs, not the reply text?
Judging the reply would mean a second model call or brittle heuristics. Input-based scoring is cheap, reproducible, and matches the operational question: “Did we have enough authoritative data for automation?”

### How property + reservation work together
- **Property context** always includes the brief’s Villa B1 block when `property_id` is `villa-b1` (unknown IDs fall back to “Property details not available”, which **does not** count as “known property” for scoring).
- **Reservation context** is loaded only when `booking_ref` is present **and** a row exists in `Reservation` (e.g. after running `seed-reservation.ts`).
- When **both** are strong — known property string **and** a non-empty reservation block built from the DB — we add a **+0.05 full-context** bonus on top of the separate reservation signals. That reflects the best case for the pipeline: Claude saw static property facts **plus** verified stay details in the same prompt.

### Base score: 0.60

### Additions
| Signal | Bonus | Reasoning |
|--------|-------|-----------|
| Query type `post_sales_checkin` | +0.20 | Mostly factual (WiFi, times) — aligns with property + stay data |
| Query type `pre_sales_availability` | +0.15 | Availability is explicit in the property block |
| Query type `pre_sales_pricing` | +0.10 | Rates and extra-guest rules are in the property block |
| Query type `special_request` | +0.05 | Caretaker / chef rules are in context |
| Known property context (not the “details not available” fallback) | +0.10 | Model had real Villa B1 facts |
| `booking_ref` present | +0.10 | We can tie the thread to a booking |
| Reservation row found in DB (`hasReservation`) | +0.05 | Verified booking exists |
| Reservation block included in prompt (non-empty string) | +0.10 | Check-in/out, guests, payment/status were shown to the model |
| **Full context** — known property **and** reservation block in prompt | +0.05 | Optimisation: both layers of grounding together |

### Deductions
| Signal | Penalty | Reasoning |
|--------|---------|-----------|
| Query type `complaint` | −0.40 | Empathy and policy need a human even if facts exist |
| Query type `general_enquiry` | −0.20 | Often means keyword rules missed; classifier fallback |
| No `booking_ref` | −0.10 | Harder to verify identity / stay |
| Message shorter than 10 characters | −0.10 | Too little text to trust classification |

The final value is clamped to \[0, 1\] and rounded to two decimals.

### Action mapping (assessment brief)
| Condition | `action` |
|-----------|----------|
| `query_type` is `complaint` | `escalate` (always, even if score is high) |
| Score **strictly above** 0.85 | `auto_send` |
| Score between **0.60 and 0.85** (inclusive) | `agent_review` |
| Score **below** 0.60 | `escalate` |

So **0.85** is **not** auto-sent (only scores **> 0.85** are), matching “above 0.85” in the brief.

---

## Project Structure

```
src/
├── constants/
│   └── message.ts           # Valid sources, query types, keyword map
├── controllers/
│   └── webhook.controller.ts # Pipeline orchestration (req/res handling)
├── lib/
│   ├── db.ts                # PostgreSQL connection pool (raw pg)
│   └── rawQuery.ts          # Raw SQL JOIN queries
├── middleware/
│   ├── validation.middleware.ts   # Generic Zod validation middleware
│   └── rateLimiter.middleware.ts  # Global + webhook IP rate limits
├── routes/
│   ├── webhook.routes.ts    # POST /webhook/message
│   └── messages.routes.ts   # GET /api/messages
├── schemas/
│   └── webhook.schema.ts    # Zod schema for incoming payload
├── services/
│   ├── normalization.service.ts   # Payload → canonical shape
│   ├── classification.service.ts  # Hybrid rule-based + Claude
│   ├── context.service.ts         # DB lookups for property + reservation
│   ├── response.service.ts        # Claude AI reply generation
│   ├── confidence.service.ts      # Deterministic scoring
│   └── persistence.service.ts     # Save to PostgreSQL
├── types/
│   └── message.types.ts     # TypeScript interfaces
├── utils/
│   └── propertyContext.ts   # Static property info
└── server.ts                # Express app entry point
```

---

## Design Decisions

- **No ORM**: Using raw `pg` (node-postgres) with parameterised queries for full SQL control and to demonstrate relational database skills.
- **Hybrid Classification**: Rule-based keyword matching handles 70-80% of messages for free. Claude is only called for ambiguous messages that fall through to `general_enquiry`.
- **Service Layer Separation**: Services are pure functions that never touch Express req/res. The controller orchestrates them. This makes every service independently testable.
- **Webhook response shape**: `POST /webhook/message` returns the brief’s **flat** JSON object so it matches the assessment example exactly.
- **Guest profiles**: `Guest.fullName` is unique in SQL; persistence uses `INSERT … ON CONFLICT` so repeat messages from the same name reuse one guest row (demo scope — production would merge on phone/email).
- **Conversations and reservations**: When `booking_ref` resolves to a `Reservation`, new conversations store `reservationId`; existing threads get `reservationId` backfilled if it was null.
- **Non-blocking persistence**: `persistConversation` is invoked **without** `await` before `res.json`, so the client gets the draft quickly while PostgreSQL writes complete in the background. Errors are logged and do not change the HTTP body.
- **Graceful Degradation**: If Claude fails → fallback reply. If DB fails → property context still returned. The pipeline never breaks completely.

---

## Bonus: Rate Limiting

Two-layer rate limiting protects the API from abuse:

- **Global:** 100 requests / 15 minutes per IP across all routes (everything after `express.json()` in `server.ts`).
- **Webhook:** 10 requests / 60 seconds per IP on `POST /webhook/message` only, so the Claude-backed path cannot be flooded cheaply.

When a limit is hit, the server responds with HTTP 429 and JSON in the existing `ApiResponse` shape: `{ "success": false, "error": "<message>" }`, plus standard `RateLimit-*` headers (`standardHeaders: true`, `legacyHeaders: false`).

In production this would use a **Redis** store (for example `ioredis` + `rate-limit-redis`) so limits are shared across multiple server instances behind a load balancer.
