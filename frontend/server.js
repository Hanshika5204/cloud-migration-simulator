const express = require("express");
const path = require("path");

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.FRONTEND_PORT || 5000;
app.listen(PORT, () => {
  console.log(`[frontend] dashboard running on http://localhost:${PORT}`);
});
