const express = require("express");
const axios = require("axios");

const router = express.Router();


// ===============================
// GET COORDINATES (Nominatim)
// ===============================
async function getCoords(place) {
  const response = await axios.get(
    "https://nominatim.openstreetmap.org/search",
    {
      params: {
        format: "json",
        q: place,
        limit: 1
      },
      headers: {
        "User-Agent": "map-ai-agent"
      }
    }
  );

  if (!response.data || response.data.length === 0) {
    throw new Error(`Location not found: ${place}`);
  }

  return response.data[0];
}


// ===============================
// MAIN ROUTE API
// ===============================
router.post("/agent", async (req, res) => {
  try {

    const { text } = req.body;

    if (!text || typeof text !== "string") {
      return res.status(400).json({
        success: false,
        error: "Text is required"
      });
    }

    const match = text.trim().match(/^(.+)\s+to\s+(.+)$/i);

    if (!match) {
      return res.status(400).json({
        success: false,
        error: "Use format: Delhi to Jaipur"
      });
    }

    const from = match[1].trim();
    const to = match[2].trim();

    const fromData = await getCoords(from);
    const toData = await getCoords(to);

    const osrmUrl =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${fromData.lon},${fromData.lat};${toData.lon},${toData.lat}` +
      `?overview=full&geometries=geojson`;

    const routeResponse = await axios.get(osrmUrl);

    if (!routeResponse.data.routes || routeResponse.data.routes.length === 0) {
      return res.status(500).json({
        success: false,
        error: "No route found"
      });
    }

    const route = routeResponse.data.routes[0];

    // ===============================
    // TIME FORMAT FIX (HOUR:MINUTE)
    // ===============================
    const totalMinutes = Math.round(route.duration / 60);

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    const formattedTime =
      hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    // ===============================
    // RESPONSE
    // ===============================
    return res.json({
      success: true,

      from,
      to,

      fromCoords: {
        lat: parseFloat(fromData.lat),
        lon: parseFloat(fromData.lon)
      },

      toCoords: {
        lat: parseFloat(toData.lat),
        lon: parseFloat(toData.lon)
      },

      distance: (route.distance / 1000).toFixed(2) + " km",

      // ✅ FIXED TIME FORMAT
      duration: formattedTime,

      routeGeometry: route.geometry
    });

  } catch (err) {
    console.error("ROUTE API ERROR:", err.message);

    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});


// ===============================
// EXPORT
// ===============================
module.exports = router;