// backend/index.js
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const OpenAI = require("openai");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

const UPLOAD_DIR = path.join(__dirname, "uploads");
const DATA_FILE = path.join(__dirname, "data.json");
const PROFILE_FILE = path.join(__dirname, "profile.json");

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([]));
if (!fs.existsSync(PROFILE_FILE))
  fs.writeFileSync(PROFILE_FILE, JSON.stringify({}));

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(UPLOAD_DIR));

app.get("/", (req, res) => {
  res.send("✅ 圖片上傳伺服器運作中！");
});

const upload = multer({ dest: UPLOAD_DIR });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 簡單模擬單人 profile：GET + POST
app.get("/profile", (req, res) => {
  try {
    const profile = JSON.parse(fs.readFileSync(PROFILE_FILE));
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: "讀取個人資料失敗" });
  }
});

app.post("/profile", (req, res) => {
  const profile = req.body;
  try {
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(profile, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "儲存個人資料失敗" });
  }
});

// ...其他路由（upload、records、delete 等保持不變）
// ...（保留原本 POST /upload、GET /records、DELETE /records/:id 等）

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
