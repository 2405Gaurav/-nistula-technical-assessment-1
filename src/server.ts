import dotenv from "dotenv";
dotenv.config();

import express from "express";

const app = express();

app.get("/", (_, res) => {
    res.json({
        success: true,
        message: "Nistula API running"
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});