// backend/index.js
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const OpenAI = require("openai");
require("dotenv").config();
const { router: authRouter, authMiddleware } = require("./auth");

const app = express();
const PORT = process.env.PORT || 3001;

const UPLOAD_DIR = path.join(__dirname, "uploads");
const DATA_FILE = path.join(__dirname, "data.json");
const PROFILE_FILE = path.join(__dirname, "profile.json");
const SUPPLEMENT_FILE = path.join(__dirname, "supplements.json");
const NUTRITION_FILE = path.join(__dirname, "nutrition.json");

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([]));
if (!fs.existsSync(PROFILE_FILE))
  fs.writeFileSync(PROFILE_FILE, JSON.stringify({}));
if (!fs.existsSync(SUPPLEMENT_FILE))
  fs.writeFileSync(SUPPLEMENT_FILE, JSON.stringify({}));
if (!fs.existsSync(NUTRITION_FILE))
  fs.writeFileSync(NUTRITION_FILE, JSON.stringify({}));

app.use(
  cors({
    origin: ["http://localhost:5173", "https://your-frontend-url.com"],
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["Content-Type", , "Authorization"],
    credentials: true,
  })
);

app.use(express.json());
app.use("/uploads", express.static(UPLOAD_DIR));

// 認證路由
app.use("/auth", authRouter);

// 保護需要認證的路由
app.use("/api", authMiddleware);

const upload = multer({ dest: UPLOAD_DIR });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get("/", (req, res) => {
  res.send("✅ 健康日記分析師 API 已啟動");
});

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

  // ✅ 儲存前清除 recommendationText，避免使用舊建議
  if (profile.recommendationText) {
    delete profile.recommendationText;
  }

  try {
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(profile, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "儲存個人資料失敗" });
  }
});

// 從分析結果中提取營養數據
function extractNutritionData(analysisText) {
  if (!analysisText) return null;

  const caloriesMatch = analysisText.match(/熱量.*?(\d+).*?大卡/);
  const carbsMatch = analysisText.match(/碳水化合物.*?(\d+).*?公克/);
  const proteinMatch = analysisText.match(/蛋白質.*?(\d+).*?公克/);
  const fatMatch = analysisText.match(/脂肪.*?(\d+).*?公克/);

  return {
    calories: caloriesMatch ? parseInt(caloriesMatch[1]) : 0,
    carbs: carbsMatch ? parseInt(carbsMatch[1]) : 0,
    protein: proteinMatch ? parseInt(proteinMatch[1]) : 0,
    fat: fatMatch ? parseInt(fatMatch[1]) : 0,
  };
}

// 儲存營養數據到專用文件
function saveNutritionData(recordId, timestamp, nutritionData) {
  try {
    const nutritionDB = JSON.parse(fs.readFileSync(NUTRITION_FILE));
    nutritionDB[recordId] = {
      timestamp,
      ...nutritionData,
    };
    fs.writeFileSync(NUTRITION_FILE, JSON.stringify(nutritionDB, null, 2));
    return true;
  } catch (err) {
    console.error("儲存營養數據失敗:", err);
    return false;
  }
}

app.post("/upload", upload.single("image"), (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "請選擇圖片上傳" });

    const timestamp = new Date().toISOString();
    const id = uuidv4();
    const url = `/uploads/${file.filename}`;

    const newEntry = {
      id,
      filename: file.filename,
      url,
      timestamp,
      analysis: "",
    };

    const data = JSON.parse(fs.readFileSync(DATA_FILE));
    data.push(newEntry);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

    res.json(newEntry);
  } catch (err) {
    res.status(500).json({ error: "圖片上傳失敗" });
  }
});

app.get("/records", (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "讀取紀錄失敗" });
  }
});

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

    const supplementData = JSON.parse(fs.readFileSync(SUPPLEMENT_FILE));
    delete supplementData[id];
    fs.writeFileSync(SUPPLEMENT_FILE, JSON.stringify(supplementData, null, 2));

    // 同時刪除對應的營養數據
    const nutritionData = JSON.parse(fs.readFileSync(NUTRITION_FILE));
    delete nutritionData[id];
    fs.writeFileSync(NUTRITION_FILE, JSON.stringify(nutritionData, null, 2));

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "刪除失敗" });
  }
});

app.get("/supplements", (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(SUPPLEMENT_FILE));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "讀取補充資料失敗" });
  }
});

app.post("/analyze", async (req, res) => {
  try {
    const { id, supplement } = req.body;
    const data = JSON.parse(fs.readFileSync(DATA_FILE));
    const entry = data.find((d) => d.id === id);
    if (!entry) return res.status(404).json({ error: "找不到圖片紀錄" });

    const url = `https://image-analyzer-backend-8s8u.onrender.com/uploads/${entry.filename}`;
    const promptText = supplement?.trim()
      ? `使用者補充說明：「${supplement}」\n請將此補充資訊視為可靠來源，與圖片內容一併分析，若有衝突，以補充文字為主。`
      : "無補充說明，請僅依圖片進行分析。";

    const prompt = `${promptText}

你是一位具備專業營養師背景的助理，請根據上述資訊提供以下項目：

1. 🍱 食物項目：
- 請列出圖中或補充說明中包含的所有食物。

2. 🔢 營養估算（每一餐整體）：
- 熱量（大卡）：
- 碳水化合物（公克）：
- 蛋白質（公克）：
- 脂肪（公克）：
(請記得要加上單位)
3. 💡 健康分析（200字內）：
- 評估此餐是否均衡、是否高糖/高脂/高鈉，並提供合理推測。

4. ✅ 飲食建議（100字內）：
- 請以實際可行、簡短清楚為原則，例如「可增加蔬菜攝取」、「建議選擇低脂部位」。

請使用自然流暢的繁體中文呈現，風格親切且具專業度，避免過度冗長。`;

    const gptResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url } },
          ],
        },
      ],
    });

    const result = gptResponse.choices[0].message.content || "無法取得分析結果";
    entry.analysis = result;
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

    const supplementData = JSON.parse(fs.readFileSync(SUPPLEMENT_FILE));
    supplementData[id] = supplement || "";
    fs.writeFileSync(SUPPLEMENT_FILE, JSON.stringify(supplementData, null, 2));

    // 提取並存儲營養數據
    const nutritionData = extractNutritionData(result);
    if (nutritionData) {
      saveNutritionData(id, entry.timestamp, nutritionData);
    }

    res.json({ success: true, analysis: result });
  } catch (err) {
    console.error("分析錯誤：", err);
    res.status(500).json({ error: "分析失敗" });
  }
});

// 獲取營養分析數據
app.get("/analytics", (req, res) => {
  try {
    const { from, to } = req.query;
    const fromDate = from ? new Date(from) : new Date(0);
    const toDate = to ? new Date(to) : new Date();

    const nutritionData = JSON.parse(fs.readFileSync(NUTRITION_FILE));

    // 過濾並按日期排序數據
    const filteredData = Object.values(nutritionData)
      .filter((item) => {
        const itemDate = new Date(item.timestamp);
        return itemDate >= fromDate && itemDate <= toDate;
      })
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // 按日期組織數據
    const dates = [];
    const calories = [];
    const carbs = [];
    const protein = [];
    const fat = [];

    // 創建日期到數據的映射
    const dateMap = {};
    filteredData.forEach((item) => {
      // 提取日期部分 (YYYY-MM-DD)
      const dateStr = item.timestamp.split("T")[0];

      if (!dateMap[dateStr]) {
        dateMap[dateStr] = {
          count: 0,
          calories: 0,
          carbs: 0,
          protein: 0,
          fat: 0,
        };
      }

      dateMap[dateStr].count += 1;
      dateMap[dateStr].calories += item.calories || 0;
      dateMap[dateStr].carbs += item.carbs || 0;
      dateMap[dateStr].protein += item.protein || 0;
      dateMap[dateStr].fat += item.fat || 0;
    });

    // 將映射轉換為數組
    Object.keys(dateMap)
      .sort()
      .forEach((dateStr) => {
        const date = new Date(dateStr);
        const formattedDate = `${(date.getMonth() + 1)
          .toString()
          .padStart(2, "0")}/${date.getDate().toString().padStart(2, "0")}`;

        dates.push(formattedDate);
        calories.push(dateMap[dateStr].calories);
        carbs.push(dateMap[dateStr].carbs);
        protein.push(dateMap[dateStr].protein);
        fat.push(dateMap[dateStr].fat);
      });

    res.json({
      dates,
      calories,
      carbs,
      protein,
      fat,
    });
  } catch (err) {
    console.error("獲取分析數據失敗:", err);
    res.status(500).json({ error: "獲取分析數據失敗" });
  }
});

// ✅ backend/index.js（節錄：/recommendation 改寫）
app.get("/recommendation", async (req, res) => {
  try {
    const profile = JSON.parse(fs.readFileSync(PROFILE_FILE));
    if (!profile || Object.keys(profile).length === 0) {
      return res.status(400).json({ error: "尚未填寫個人資料" });
    }

    // ✅ 如果已有 recommendationText，就直接回傳，避免重複呼叫 GPT
    if (profile.recommendationText) {
      return res.json({ content: profile.recommendationText });
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

    // ✅ 寫入 recommendationText 到 profile
    profile.recommendationText = result;
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(profile, null, 2));

    res.json({ content: result });
  } catch (err) {
    console.error("/recommendation error", err);
    res.status(500).json({ error: "產生建議失敗" });
  }
});

// 聊天機器人 API
app.post("/chat", async (req, res) => {
  try {
    const { message, profile } = req.body;

    // 構建 prompt，將用戶的個人資料和目前的營養數據納入考量
    let prompt = `你是一位專業的營養顧問。請針對以下問題提供專業、友善且有幫助的回答。問題: ${message}`;

    // 如果有用戶資料，添加到 prompt
    if (profile && Object.keys(profile).length > 0) {
      prompt += `\n\n用戶資料：
- 性別: ${profile.gender === "male" ? "男性" : "女性"}
- 年齡: ${profile.age} 歲
- 身高: ${profile.height} cm
- 體重: ${profile.weight} kg`;

      if (profile.goal) {
        prompt += `\n- 健康目標: ${profile.goal}`;
      }
    }

    // 添加用戶的最近營養攝取情況
    const nutritionData = JSON.parse(fs.readFileSync(NUTRITION_FILE));
    if (Object.keys(nutritionData).length > 0) {
      const recentEntries = Object.values(nutritionData)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 3);

      if (recentEntries.length > 0) {
        prompt += `\n\n用戶最近的飲食記錄 (${recentEntries.length} 筆):`;
        recentEntries.forEach((entry, index) => {
          const date = new Date(entry.timestamp).toLocaleDateString("zh-TW");
          prompt += `\n${index + 1}. ${date}: 熱量 ${
            entry.calories
          } 大卡, 碳水 ${entry.carbs}g, 蛋白質 ${entry.protein}g, 脂肪 ${
            entry.fat
          }g`;
        });
      }
    }

    prompt += "\n\n請提供專業但易懂的回答，使用繁體中文，並避免過長的回應。";

    const gptRes = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
    });

    const response =
      gptRes.choices[0].message.content || "抱歉，我無法回答這個問題。";

    res.json({ response });
  } catch (err) {
    console.error("聊天回應失敗:", err);
    res.status(500).json({ error: "無法取得回應，請稍後再試" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
