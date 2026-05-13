import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { webhookRouter } from "./routes/webhook.routes";
import { messagesRouter } from "./routes/messages.routes";

// import db to trigger connection test on startup
import "./lib/db";

const app = express();

//middleware
app.use(cors());
app.use(express.json());

//routes
app.get("/", (_, res) => {
  res.json({
    success: true,
    message: "Nistula API running",
  });
});

app.use("/webhook/message", webhookRouter);
app.use("/api/messages", messagesRouter);

//start
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`POST http://localhost:${PORT}/webhook/message`);
  console.log(`GET  http://localhost:${PORT}/api/messages`);
});