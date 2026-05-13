import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { webhookRouter } from "./routes/webhook.routes";

const app = express();

//middlware

app.use(cors());
app.use(express.json());

//routes
app.get("/", (_, res) => {
  res.json({
    success: true,
    message: "Nistula API running",
  });
});

app.use("/api/webhook", webhookRouter);


//starttt
const PORT = process.env.PORT;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`http://localhost:${PORT}/api/webhook`);
});