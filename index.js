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

// ... 其他路由略 ...

// 建議攝取量（GPT）
app.get("/recommendation", async (req, res) => {
  try {
    const profile = JSON.parse(fs.readFileSync(PROFILE_FILE));
    if (!profile || Object.keys(profile).length === 0) {
      return res.status(400).json({ error: "尚未填寫個人資料" });
    }

    const prompt = `以下是使用者的基本資料：
- 性別：${profile.gender}
- 年齡：${profile.age} 歲
- 身高：${profile.height} cm
- 體重：${profile.weight} kg
- 健康目標：${profile.goal}

請你根據上述資訊回覆「每日建議攝取量」，並明確提供以下四個項目，每一項以獨立段落說明，格式如下：

1. 🔥 熱量建議（大卡）：
- 數值：xxxx 大卡
- 推算邏輯：請簡單描述使用的公式或原則（避免寫出乘除公式以避免亂碼，可說「依照 TDEE 計算」）

2. 🍚 碳水建議（公克）：
- 數值：xxx 公克
- 推算邏輯：...

3. 🍗 蛋白質建議（公克）：
- 數值：xxx 公克
- 推算邏輯：...

4. 🥑 脂肪建議（公克）：
- 數值：xxx 公克
- 推算邏輯：...

請使用自然流暢的繁體中文，風格親切且專業，避免 markdown 符號，避免寫出數學公式與程式碼格式，務必維持乾淨且可讀性高的文字排版。`;

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
