-- Handwritten PostgreSQL DDL for the Nistula messaging platform.
-- The Node app uses the `pg` driver (no ORM) against these tables.

-- need this extension for gen_random_uuid() to work, spent like 10 mins figuring out why uuid wasnt generating
-- postgres doesnt have it by default, pgcrypto gives us the function
-- problem: was getting ERROR: function gen_random_uuid() does not exist
-- fix: added this extension line at the top, now it works fine
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- Guest Table
-- well this is the basic guest profile storing, email, phone number is not added here, in case if you need you can add,
-- no problmme faced while designing this table
-- one thing i decided here is to keep it minimal, fullName is enough for now
-- since we are getting guest_name from the webhook payload directly
CREATE TABLE Guest (
    id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    fullName  VARCHAR(255) NOT NULL UNIQUE,   -- one row per guest name for this assessment (production would use phone/email)
    createdAt TIMESTAMP    NOT NULL DEFAULT NOW()
);


-- Stores master property information and operational context
-- used during AI response generation.
-- i put property before conversation because conversation has a foreign key to property
-- problem: originally had conversation before property and was getting ERROR: relation "property" does not exist
-- fix: reordered the tables, guest -> property -> reservation -> conversation -> message
-- postgres needs the referenced table to already exist before you can point a foreign key at it
CREATE TABLE Property (
    id                    UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    propertyCode          VARCHAR(100)   UNIQUE NOT NULL,      -- this is what we match against from the webhook payload eg villa-b1
    name                  VARCHAR(255)   NOT NULL,
    location              VARCHAR(255)   NOT NULL,
    bedrooms              INTEGER        NOT NULL,
    maxGuests             INTEGER        NOT NULL,
    privatePool           BOOLEAN        NOT NULL DEFAULT FALSE,
    checkInTime           VARCHAR(50)    NOT NULL,
    checkOutTime          VARCHAR(50)    NOT NULL,
    baseRatePerNight      DECIMAL(10,2)  NOT NULL,
    baseGuestCount        INTEGER        NOT NULL,              -- base pricing is for this many guests, extras are charged separately
    extraGuestCharge      DECIMAL(10,2)  NOT NULL,
    wifiPassword          VARCHAR(255),
    caretakerAvailability VARCHAR(255),
    chefOnCall            BOOLEAN        NOT NULL DEFAULT FALSE,
    chefBookingRequired   BOOLEAN        NOT NULL DEFAULT FALSE,
    cancellationPolicy    TEXT,
    createdAt             TIMESTAMP      NOT NULL DEFAULT NOW()
);

-- the dummy property, only villa-b1 for now as given in the assessment
INSERT INTO Property (
    propertyCode, name, location,
    bedrooms, maxGuests, privatePool,
    checkInTime, checkOutTime,
    baseRatePerNight, baseGuestCount, extraGuestCharge,
    wifiPassword, caretakerAvailability,
    chefOnCall, chefBookingRequired, cancellationPolicy
) VALUES (
    'villa-b1',
    'Villa B1',
    'Assagao, North Goa',
    3, 6, TRUE,
    '2pm', '11am',
    18000, 4, 2000,
    'Nistula@2024', '8am to 10pm',
    TRUE, TRUE,
    'Free up to 7 days before check-in'
);


-- Reservation Table
-- Stores all booking-related information including guest details,
-- property ID, dates, pricing, and reservation status.
-- while designing this table i was thinking from a user perspective, like when a user books a property
-- what details he should have in the booking reference
-- so i included the booking reference number, check-in date, check-out date, number of guests, total amount, payment status, status,
-- created at and updated at
-- reservation comes before conversation because conversation optionally references it
-- a pre-sales conversation wont have a reservationId but a post-sales one will
CREATE TABLE Reservation (
    id             UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    bookingRef     VARCHAR(100)   UNIQUE NOT NULL,             -- this is what comes in from the webhook payload eg NIS-2024-0891
    guestId        UUID           NOT NULL,
    propertyId     UUID           NOT NULL,
    checkInDate    DATE           NOT NULL,
    checkOutDate   DATE           NOT NULL,
    numberOfGuests INTEGER        NOT NULL,
    totalAmount    DECIMAL(10,2)  NOT NULL,
    paymentStatus  VARCHAR(50)    NOT NULL DEFAULT 'pending'
                       CHECK (paymentStatus IN ('pending', 'paid', 'refunded', 'failed')),
    status         VARCHAR(50)    NOT NULL DEFAULT 'confirmed'
                       CHECK (status IN ('confirmed', 'cancelled', 'completed', 'pending')),
    createdAt      TIMESTAMP      NOT NULL DEFAULT NOW(),
    updatedAt      TIMESTAMP      NOT NULL DEFAULT NOW(),
    FOREIGN KEY (guestId)    REFERENCES Guest(id),
    FOREIGN KEY (propertyId) REFERENCES Property(id)
);


-- then we are gonna conversation, well it is the part that i have relly spet time with pen and paper
-- to understand the flow, like it should store the details such as messages, the source of the conversation
-- what is the current status of the conversation,
-- to uniquely identify a conversation we have the combination of multiple attributes such as source, guestid, reason, status, etc and i created it first thinking this
-- like gaurav is in discussion of bad odour in the bathroom in one conversation and about the AC not working in the other one right
-- this is the simplest logic but it took me time to understand it
--
-- reservationId is nullable here, that was an important decision i made
-- if the guest is enquiring before booking (pre_sales) there is no reservation yet
-- so we cant make it NOT NULL, it gets filled in later when/if they book
--
-- problem: had a trailing comma after the last FOREIGN KEY line and was getting a syntax error
-- fix: removed the comma, only columns and constraints in the middle get commas, not the last one
--
-- problem: forgot to add FOREIGN KEY for propertyId, had the column but no constraint
-- fix: added the foreign key line, now referential integrity is enforced at db level not just app level
CREATE TABLE Conversation (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    guestId       UUID        NOT NULL,
    propertyId    UUID        NOT NULL,
    reservationId UUID,                                        -- nullable, pre-sales conversations wont have this
    source        VARCHAR(50) NOT NULL
                      CHECK (source IN ('whatsapp', 'booking_com', 'airbnb', 'instagram', 'direct')),
    status        VARCHAR(50) NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'resolved', 'escalated', 'closed')),
    createdAt     TIMESTAMP   NOT NULL DEFAULT NOW(),
    updatedAt     TIMESTAMP   NOT NULL DEFAULT NOW(),
    FOREIGN KEY (guestId)       REFERENCES Guest(id),          -- connecting the conversation to guest, 1 to many (a guest can have many conversations)
    FOREIGN KEY (propertyId)    REFERENCES Property(id),       -- every conversation belongs to a property
    FOREIGN KEY (reservationId) REFERENCES Reservation(id)     -- optional link, only present for post-sales conversations
);


-- then we have messages table, where it stores the messages of the conversation
-- and to identify the exact message, we use conversation id, direction (incoming or outgoing),
-- inbound rows store query_type plus the same confidence_score and action computed for that turn (assessment: per inbound message)
-- outbound rows store aiDrafted / agentEdited / autoSent
-- this is what is a big part of the problem statement
--
-- biggest design decision here was putting both inbound guest messages AND outbound AI replies in the same table
-- i could have made two tables but this keeps the conversation timeline clean and queries simple
-- you just ORDER BY createdAt and you have the full thread in sequence
-- later if required i will add source/property-id in the message table but i dont think i need it right now
-- since you can always join through conversation to get those
CREATE TABLE Message (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    conversationId  UUID        NOT NULL,
    direction       VARCHAR(10) NOT NULL
                        CHECK (direction IN ('inbound', 'outbound')),
    messageText     TEXT        NOT NULL,
    queryType       VARCHAR(100)
                        CHECK (queryType IN (
                            'pre_sales_availability',
                            'pre_sales_pricing',
                            'post_sales_checkin',
                            'special_request',
                            'complaint',
                            'general_enquiry'
                        )),
    confidenceScore FLOAT
                        CHECK (confidenceScore >= 0 AND confidenceScore <= 1),   -- always between 0 and 1, enforced at db level too not just app level
    action          VARCHAR(20)
                        CHECK (action IN ('auto_send', 'agent_review', 'escalate')),
    aiDrafted       BOOLEAN     NOT NULL DEFAULT FALSE,        -- was this reply written by claude
    agentEdited     BOOLEAN     NOT NULL DEFAULT FALSE,        -- did a human agent modify the draft before sending
    autoSent        BOOLEAN     NOT NULL DEFAULT FALSE,        -- was it sent without human approval (confidence > 0.85)
    createdAt       TIMESTAMP   NOT NULL DEFAULT NOW(),
    FOREIGN KEY (conversationId) REFERENCES Conversation(id) ON DELETE CASCADE  -- protecting referential integrity, when a conversation is deleted all its messages are deleted too
);


-- adding indexes on the columns we query most frequently
-- without these, every lookup would be a full table scan which is bad when messages start piling up
-- problem: was not thinking about indexes at first, then realised that bookingRef lookup on every webhook call
-- would get slow as the table grows, so added these after thinking about the actual query patterns
CREATE INDEX idx_message_conversation  ON Message(conversationId);      -- most common query, get all messages for a conversation
CREATE INDEX idx_conversation_guest    ON Conversation(guestId);         -- look up all conversations by a guest
CREATE INDEX idx_conversation_property ON Conversation(propertyId);      -- look up all conversations for a property
CREATE INDEX idx_reservation_booking   ON Reservation(bookingRef);       -- webhook lookup, matching bookingRef from payload
CREATE INDEX idx_property_code         ON Property(propertyCode);        -- webhook lookup, matching propertyCode from payload