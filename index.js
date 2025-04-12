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

const upload = multer({ dest: UPLOAD_DIR });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get("/", (req, res) => {
  res.send("✅ 圖片上傳伺服器運作中！");
});

// 🧍‍♂️ 個人資訊 API
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

// 📤 圖片上傳與分析
app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "請選擇圖片上傳" });

    const timestamp = new Date().toISOString(); // 改為標準 ISO 格式時間，避免解析問題
    const id = uuidv4();
    const url = `https://image-analyzer-backend-8s8u.onrender.com/uploads/${file.filename}`;

    const gptResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `你是一位專業營養師，請根據這張圖片回覆下列項目：\n\n1. 食物項目（列出圖片中可辨識的食物）\n2. 根據圖片來估計熱量（卡路里）、碳水化合物(公克)、蛋白質(公克)、脂肪(公克)\n3. 數值加總值\n4. 餐點健康程度分析\n5. 飲食建議（如增加蔬菜、降低油脂）\n\n請使用繁體中文進行回答，並且以台灣人的語氣為主，若無法辨識請回覆「無法清楚辨識食物」。`,
            },
            {
              type: "image_url",
              image_url: { url },
            },
          ],
        },
      ],
    });

    const analysis =
      gptResponse.choices[0].message.content || "無法取得分析結果";

    const newEntry = { id, filename: file.filename, url, timestamp, analysis };
    const existingData = JSON.parse(fs.readFileSync(DATA_FILE));
    existingData.push(newEntry);
    fs.writeFileSync(DATA_FILE, JSON.stringify(existingData, null, 2));

    res.json(newEntry);
  } catch (error) {
    console.error("❌ Upload Error:", error);
    res.status(500).json({ error: "圖片分析失敗", message: error.message });
  }
});

// 📄 紀錄讀取
app.get("/records", (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "讀取紀錄失敗" });
  }
});

// ❌ 刪除紀錄
app.delete("/records/:id", (req, res) => {
  const { id } = req.params;
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE));
    const record = data.find((r) => r.id === id);
    if (!record) return res.status(404).json({ error: "找不到紀錄" });

    const updated = data.filter((r) => r.id !== id);
    fs.writeFileSync(DATA_FILE, JSON.stringify(updated, null, 2));

    const filePath = path.join(UPLOAD_DIR, record.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    res.json({ success: true });
  } catch (e) {
    console.error("刪除紀錄失敗：", e);
    res.status(500).json({ error: "刪除紀錄失敗" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
