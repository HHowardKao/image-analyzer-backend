const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const OpenAI = require("openai");
require("dotenv").config();

const app = express();
const PORT = 3001;

const UPLOAD_DIR = path.join(__dirname, "uploads");
const DATA_FILE = path.join(__dirname, "data.json");

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([]));

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(UPLOAD_DIR));

app.get("/", (req, res) => {
  res.send("✅ 圖片上傳伺服器運作中！");
});

const upload = multer({ dest: UPLOAD_DIR });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    const file = req.file;
    const timestamp = new Date().toLocaleString();
    const id = uuidv4();
    const url = `http://localhost:${PORT}/uploads/${file.filename}`;

    // 呼叫 OpenAI 分析
    const gptResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `你是一位專業營養師，請根據這張圖片回覆下列項目：\n\n1. 食物項目\n2. 每項估計熱量（卡路里）\n3. 總熱量\n4. 餐點健康程度分析\n5. 飲食建議（如增加蔬菜、降低油脂）\n請用繁體中文回答。`,
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

    const newEntry = {
      id,
      filename: file.filename,
      url,
      timestamp,
      analysis,
    };

    const existingData = JSON.parse(fs.readFileSync(DATA_FILE));
    existingData.push(newEntry);
    fs.writeFileSync(DATA_FILE, JSON.stringify(existingData, null, 2));

    res.json(newEntry);
  } catch (error) {
    console.error("Upload Error:", error);
    res.status(500).json({ error: "圖片上傳或分析失敗" });
  }
});

app.get("/records", (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "讀取紀錄失敗" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
