// ✅ 完整後端 index.js（新增補充說明儲存與分析整合）
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
const SUPPLEMENT_FILE = path.join(__dirname, "supplements.json");

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([]));
if (!fs.existsSync(PROFILE_FILE))
  fs.writeFileSync(PROFILE_FILE, JSON.stringify({}));
if (!fs.existsSync(SUPPLEMENT_FILE))
  fs.writeFileSync(SUPPLEMENT_FILE, JSON.stringify({}));

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(UPLOAD_DIR));

const upload = multer({ dest: UPLOAD_DIR });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get("/", (req, res) => {
  res.send("✅ 圖片上傳伺服器運作中！");
});

// 🔹 個人資料 API
app.get("/profile", (req, res) => {
  try {
    const profile = JSON.parse(fs.readFileSync(PROFILE_FILE));
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: "讀取個人資料失敗" });
  }
});

app.post("/profile", (req, res) => {
  try {
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "儲存個人資料失敗" });
  }
});

// 🔹 補充說明 API
app.post("/supplements", (req, res) => {
  const { id, note } = req.body;
  try {
    const data = JSON.parse(fs.readFileSync(SUPPLEMENT_FILE));
    data[id] = note;
    fs.writeFileSync(SUPPLEMENT_FILE, JSON.stringify(data, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "儲存補充說明失敗" });
  }
});

app.get("/supplements", (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(SUPPLEMENT_FILE));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "讀取補充說明失敗" });
  }
});

// 🔹 上傳圖片
app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "請選擇圖片上傳" });

    const taipeiTime = new Date().toLocaleString("sv-SE", {
      timeZone: "Asia/Taipei",
      hour12: false,
    });
    const timestamp = taipeiTime.replace(" ", "T") + "+08:00";

    const id = uuidv4();
    const url = `https://image-analyzer-backend-8s8u.onrender.com/uploads/${file.filename}`;

    const newEntry = {
      id,
      filename: file.filename,
      url,
      timestamp,
      analysis: "",
    };
    const existingData = JSON.parse(fs.readFileSync(DATA_FILE));
    existingData.push(newEntry);
    fs.writeFileSync(DATA_FILE, JSON.stringify(existingData, null, 2));

    res.json(newEntry);
  } catch (error) {
    console.error("❌ Upload Error:", error);
    res.status(500).json({ error: "圖片上傳失敗", message: error.message });
  }
});

// 🔹 分析圖片與補充說明
app.post("/analyze", async (req, res) => {
  const { id } = req.body;
  try {
    const images = JSON.parse(fs.readFileSync(DATA_FILE));
    const target = images.find((img) => img.id === id);
    if (!target) return res.status(404).json({ error: "找不到圖片紀錄" });

    const supplements = JSON.parse(fs.readFileSync(SUPPLEMENT_FILE));
    const extraNote = supplements[id] || "";

    const messages = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `你是一位專業營養師，請根據這張圖片以及補充說明內容來進行分析，請回覆下列項目：\n\n1. 食物項目\n2. 根據圖片與補充說明來估計熱量（卡路里）、碳水化合物(公克)、蛋白質(公克)、脂肪(公克)\n3. 餐點健康程度分析\n4. 飲食建議（如增加蔬菜、降低油脂）\n\n補充說明如下：\n${extraNote}\n\n請使用繁體中文回答，語氣自然簡潔，若無法辨識請明確說明，並移除多餘符號。`,
          },
          {
            type: "image_url",
            image_url: { url: target.url },
          },
        ],
      },
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
    });

    const result = response.choices[0].message.content || "無法取得分析結果";
    target.analysis = result;

    const updatedData = images.map((img) => (img.id === id ? target : img));
    fs.writeFileSync(DATA_FILE, JSON.stringify(updatedData, null, 2));

    res.json({ analysis: result });
  } catch (err) {
    console.error("分析失敗：", err);
    res.status(500).json({ error: "分析失敗" });
  }
});

// 🔹 紀錄讀取與刪除
app.get("/records", (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "讀取紀錄失敗" });
  }
});

app.delete("/records/:id", (req, res) => {
  const { id } = req.params;
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE));
    const updated = data.filter((r) => r.id !== id);
    fs.writeFileSync(DATA_FILE, JSON.stringify(updated, null, 2));

    const record = data.find((r) => r.id === id);
    if (record) {
      const filePath = path.join(UPLOAD_DIR, record.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    res.json({ success: true });
  } catch (e) {
    console.error("刪除紀錄失敗：", e);
    res.status(500).json({ error: "刪除紀錄失敗" });
  }
});

// 🔹 建議攝取量分析
app.get("/recommendation", async (req, res) => {
  try {
    const profile = JSON.parse(fs.readFileSync(PROFILE_FILE));
    if (!profile || Object.keys(profile).length === 0) {
      return res.status(400).json({ error: "尚未填寫個人資料" });
    }

    const prompt = `以下是使用者的基本資料：\n性別：${profile.gender}\n年齡：${profile.age} 歲\n身高：${profile.height} cm\n體重：${profile.weight} kg\n目標：${profile.goal}。請根據這些資訊，估算每日建議攝取熱量、蛋白質、脂肪、碳水化合物，並簡單說明依據來源，使用繁體中文以台灣人的語氣回覆。`;

    const gptRes = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
    });

    const result = gptRes.choices[0].message.content || "無法產生建議";
    res.json({ content: result });
  } catch (err) {
    console.error("/recommendation error", err);
    res.status(500).json({ error: "產生建議失敗" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
