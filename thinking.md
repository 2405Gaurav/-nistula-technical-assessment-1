# Part 3 — Thinking question (≤400 words)

**SCENARIO:** It is 3am. A guest at Villa B1 sends a WhatsApp message: *"There is no hot water and we have guests arriving for breakfast in 4 hours. This is unacceptable. I want a refund for tonight."*

Question A — The Immediate Response
"Hello [Guest’s Name], We are extremely sorry; this is the last thing you should have to worry about at 3 o'clock in the morning. We have informed our caretaker, who will contact you immediately. We will compensate for your trouble caused today, and you will be notified of the same tomorrow morning. We will sort it out for you."
Acknowledges the time, provides a quick timeline, promises compensation without stating an amount (this needs a personal touch), and concludes with reassurance.

Question B — The System Design
In addition to sending the message itself, the system should do the following:

Type of issue: complaint; confidence score forces escalate; autoSend: false
Alert the caretaker and on-call employees using SMS/WhatsApp messages including the guest's message and details of the room urgency wise, so that 3am becomes irrelevant as an excuse
Report a high priority event, tied to the message itself, to the property and reservation, with timestamps and responder assigned
Kick off a 30 minute response timer

No response from any human within 30 minutes escalates it to the senior manager, who then sends to the guest: "We're still on this — you have not been forgotten." Lack of a response is what turns complaints into online reviews. Escalation levels will have less time allocated to them than previous ones.
All interaction points - alert sent, acknowledged, issue solved, compensation delivered - are timed and logged. Timings from each stage are used to further tune confidence scores and escalation windows.

Question C — The Learning
It’s not mere coincidence that there have been three hot water complaints in two months. With all complaints from Question B having timestamps, property details, resolution time, escalation route stored in the system, it’s capable of recognizing such a trend easily.
There will be a nightly task to run on the Message table to check for keyword clusters associated with complaints categorized by propertyId. Should a property get more than two occurrences of “hot water”, “geyser”, and “no hot water” complaints in the last 60 days, an automatic maintenance ticket will be generated for the property manager to see along with the history of past complaints.
What will come out of it is a maintenance ticket and not just a notification — meaning that the issue will have to be marked as resolved before the flag is removed. While it is raised, the system will know about the outstanding issue, which it will consider when handling guest responses.
The objective is to identify the infrastructure problem before a fourth guest checks in.
