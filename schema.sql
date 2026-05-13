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
    direction VARCHAR(255) NOT NULL,
    messageText TEXT NOT NULL,
    queryType VARCHAR(255),
    confidenceScore FLOAT,
    action VARCHAR(255),
    aiDrafted BOOLEAN NOT NULL DEFAULT FALSE,
    agentEdited BOOLEAN NOT NULL DEFAULT FALSE,
    autoSent BOOLEAN NOT NULL DEFAULT FALSE,
    createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (conversationId) REFERENCES Conversation(id) ON DELETE CASCADE
);
