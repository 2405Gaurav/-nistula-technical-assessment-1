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
```bash
curl -X POST http://localhost:3000/webhook/message \
  -H "Content-Type: application/json" \
  -d '{
    "source": "whatsapp",
    "guest_name": "Rahul Sharma",
    "message": "Is the villa available from April 20 to 24? What is the rate for 2 adults?",
    "timestamp": "2026-05-05T10:30:00Z",
    "booking_ref": "NIS-2024-0891",
    "property_id": "villa-b1"
  }'
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
  │       Fetches property info + reservation lookup from PostgreSQL
  │
  ├── 5. Response Service
  │       Sends structured prompt to Claude claude-sonnet-4-20250514
  │       System prompt sets tone per query type
  │
  ├── 6. Confidence Scoring
  │       Deterministic scoring based on input signals
  │
  ├── 7. Persistence Service
  │       Saves guest, conversation, inbound + outbound messages to DB
  │
  └── Response
        { message_id, query_type, drafted_reply, confidence_score, action }
```

---

## Confidence Scoring Logic

The confidence score is **deterministic** — it measures how much context was available to the AI when generating the reply, not the quality of the reply itself.

### Why score the inputs, not the output?
Scoring the AI response would require a second Claude call (expensive) or fragile regex checks. Scoring the inputs is free, instant, and reproducible — same inputs always give the same score.

### Base Score: 0.60

### Additions
| Signal | Bonus | Reasoning |
|--------|-------|-----------|
| Query type is `post_sales_checkin` | +0.20 | Simple factual answers (WiFi, check-in time) — AI has exact data |
| Query type is `pre_sales_availability` | +0.15 | Clear yes/no answer available in property context |
| Query type is `pre_sales_pricing` | +0.10 | Exact pricing data available in context |
| Property context found | +0.10 | AI had real property data to work with |
| Booking reference present | +0.10 | Guest can be identified and verified |
| Reservation verified in DB | +0.05 | Extra trust — guest exists in our system |
| Query type is `special_request` | +0.05 | Manageable — caretaker/chef info available |

### Deductions
| Signal | Penalty | Reasoning |
|--------|---------|-----------|
| Query type is `complaint` | -0.40 | Complaints need human empathy and judgment |
| Query type is `general_enquiry` | -0.20 | Ambiguous — Claude was used as classification fallback |
| No booking reference | -0.10 | Unverified guest — less trust in context |
| Message under 10 characters | -0.10 | Too short to classify reliably |

### Action Decision
```
if complaint           → "escalate"      (always, regardless of score)
else if score > 0.85   → "auto_send"     (high confidence, safe to send)
else if score >= 0.60  → "agent_review"  (moderate, needs human check)
else                   → "escalate"      (low confidence, escalate)
```

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
│   └── validation.middleware.ts # Generic Zod validation middleware
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
- **Fire-and-Forget Persistence**: Database writes happen after the response is sent so the API stays fast. Persistence errors are caught and logged but never crash the response.
- **Graceful Degradation**: If Claude fails → fallback reply. If DB fails → property context still returned. The pipeline never breaks completely.
