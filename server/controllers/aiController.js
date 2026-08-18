const aiService = require("../services/aiService");
const routeService = require("../services/routeService");

exports.processRequest = async (req, res) => {
  try {
    const { text } = req.body;

    const parsed = aiService.parseText(text);

    const result = await routeService.getRoute(
      parsed.from,
      parsed.to
    );

    res.json({
      query: text,
      ...result
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};