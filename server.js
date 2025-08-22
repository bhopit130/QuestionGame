const express = require("express");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 10000;

// ชี้ไปยังโฟลเดอร์ public โดยตรง
app.use(express.static(path.join(__dirname, "public")));

// เส้นทางสำหรับ index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
