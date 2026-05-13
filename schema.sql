-- The application uses Prisma ORM for runtime database interaction,
-- while schema.sql contains handwritten PostgreSQL DDL statements
-- to explicitly demonstrate relational schema design decisions.

-- Guest Table
-- well this is the basic guest profile storing, email, phone number is not added here, in case if you need you can add,
--no problmme faced while designing this table

CREATE TABLE Guest (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fullName VARCHAR(255) NOT NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT NOW()
);

--then we are gonna conversation ,well it is the part that i have relly spet time with pen and paper 
--to understanf the flow ,like it should store the detaiuls such as mesages, the source of the conversation
--what is the current status of the conversation , 
--to uniquely identify a conversation we hvae the combination of multiple attribute such as source,guestid,reason,status,etc and i created it first thinking this
--like gaurav is in discussion of bad odour in the bathroom in one conversation and about the AC not working in the other one right 
--this is the simplest logic but it took me time to understand it

CREATE TABLE Conversation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guestId UUID NOT NULL,
    propertyId UUID NOT NULL,
    source VARCHAR(255) NOT NULL,
    status VARCHAR(255) NOT NULL DEFAULT 'open',
    createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
    updatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (guestId) REFERENCES Guest(id),--connecting the conversation to guest 1 to many(a guesst can have many conversations)
    
);


-- then we have messages table,where it stores the messages of the conversation
--and to identify the exact message ,we use conversation id,direction(incoming or outgoing),
--we also store if the ai has drafted a message or not,if the agent has edited a message or not,if the message was sent automatically or not,this is 
--what is a big part of the problem statement

CREATE TABLE Message (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversationId UUID NOT NULL,
    direction VARCHAR(255) NOT NULL CHECK (direction IN ('inbound', 'outbound')) ,
    messageText TEXT NOT NULL,
    queryType VARCHAR(255),
    confidenceScore FLOAT,
    action VARCHAR(255),
    aiDrafted BOOLEAN NOT NULL DEFAULT FALSE,
    agentEdited BOOLEAN NOT NULL DEFAULT FALSE,
    autoSent BOOLEAN NOT NULL DEFAULT FALSE,
    createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (conversationId) REFERENCES Conversation(id) ON DELETE CASCADE --protecting the referential intergerity when a conversation is deleted all its messages are deleted 
);
-- later if required id will add the source/property-id in the message table i dont think i need it till now 


now lets create the property table and fill it with the given data for now 
-- Stores master property information and operational context
-- used during AI response generation.

CREATE TABLE Property (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    propertyCode VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    bedrooms INTEGER NOT NULL,
    maxGuests INTEGER NOT NULL,
    privatePool BOOLEAN NOT NULL DEFAULT FALSE,
    checkInTime VARCHAR(50) NOT NULL,
    checkOutTime VARCHAR(50) NOT NULL,
    baseRatePerNight DECIMAL(10,2) NOT NULL,
    baseGuestCount INTEGER NOT NULL,
    extraGuestCharge DECIMAL(10,2) NOT NULL,
    wifiPassword VARCHAR(255),
    caretakerAvailability VARCHAR(255),
    chefOnCall BOOLEAN NOT NULL DEFAULT FALSE,
    chefBookingRequired BOOLEAN NOT NULL DEFAULT FALSE,
    cancellationPolicy TEXT,
    createdAt TIMESTAMP NOT NULL DEFAULT NOW()
);
--the dummy property 
INSERT INTO Property (
    propertyCode,
    name,
    location,
    bedrooms,
    maxGuests,
    privatePool,
    checkInTime,
    checkOutTime,
    baseRatePerNight,
    baseGuestCount,
    extraGuestCharge,
    wifiPassword,
    caretakerAvailability,
    chefOnCall,
    chefBookingRequired,
    cancellationPolicy
) VALUES (
    'villa-b1',
    'Villa B1',
    'Assagao, North Goa',
    3,
    6,
    TRUE,
    '2pm',
    '11am',
    18000,
    4,
    2000,
    'Nistula@2024',
    '8am to 10pm',
    TRUE,
    TRUE,
    'Free up to 7 days before check-in'
);


now for the reservation, connecting the property-conversation-booking-etc,
-- Reservation Table
-- Stores all booking-related information including guest details,
-- property ID, dates, pricing, and reservation status.
--while designing this table i was thinking from a user perspective,like when a user book a property 
--what details he should have in the booking reference
--so i included the booking reference number,check-in date,check-out date,number of guests,total amount,payment status,status,
--created at and updated at i will remove if

CREATE TABLE Reservation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guestId UUID NOT NULL,
    propertyId UUID NOT NULL,
    bookingRef VARCHAR(100) UNIQUE NOT NULL,
    checkInDate DATE NOT NULL,
    checkOutDate DATE NOT NULL,
    numberOfGuests INTEGER NOT NULL,
    totalAmount DECIMAL(10,2) NOT NULL,
    paymentStatus VARCHAR(255) NOT NULL DEFAULT 'pending',
    status VARCHAR(255) NOT NULL DEFAULT 'confirmed',
    createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
    updatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (guestId) REFERENCES Guest(id),
    FOREIGN KEY (propertyId) REFERENCES Property(id)
);

















