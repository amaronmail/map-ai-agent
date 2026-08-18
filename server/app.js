const express = require("express");
const cors = require("cors");

const routeApi = require("./routes/routeApi");

const app = express();

app.use(cors());
app.use(express.json());

// routes
app.use("/api", routeApi);

// home route
app.get("/", (req, res) => {
  res.send("AI Map Agent Running 🚀");
});

// start server
app.listen(3000, () => {
  console.log("Server running on port 3000");
});