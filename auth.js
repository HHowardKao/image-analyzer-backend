const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");

const USERS_FILE = path.join(__dirname, "users.json");
const JWT_SECRET = "your-secret-key"; // 在實際環境中應該使用環境變數
const cors = require("cors");

// 確保 users.json 存在
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([]), "utf8");
}

// 讀取用戶數據
function getUsers() {
  const data = fs.readFileSync(USERS_FILE, "utf8");
  return JSON.parse(data);
}

// 保存用戶數據
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

// 註冊
router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    const users = getUsers();

    // 檢查用戶是否已存在
    if (users.find((u) => u.email === email)) {
      return res.status(400).json({ message: "此 Email 已被註冊" });
    }

    // 加密密碼
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 創建新用戶
    const newUser = {
      id: Date.now().toString(),
      email,
      password: hashedPassword,
    };

    users.push(newUser);
    saveUsers(users);

    res.status(201).json({ message: "註冊成功" });
  } catch (error) {
    console.error("註冊錯誤:", error);
    res.status(500).json({ message: "伺服器錯誤" });
  }
});

// 登入
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const users = getUsers();
    const user = users.find((u) => u.email === email);

    if (!user) {
      return res.status(400).json({ message: "帳號或密碼錯誤" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "帳號或密碼錯誤" });
    }

    // 生成 JWT token
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "24h",
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("登入錯誤:", error);
    res.status(500).json({ message: "伺服器錯誤" });
  }
});

// 驗證 token 的中間件
const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "未提供認證token" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: "無效的token" });
  }
};

// 取得當前用戶資料
router.get("/me", authMiddleware, (req, res) => {
  const users = getUsers();
  const user = users.find((u) => u.id === req.user.userId);

  if (!user) {
    return res.status(404).json({ message: "找不到用戶" });
  }

  res.json({
    id: user.id,
    email: user.email,
  });
});

module.exports = { router, authMiddleware };
