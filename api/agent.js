const axios = require("axios");

const headers = {
  "User-Agent": "AI-Map-App/1.0"
};

async function geocode(location) {
  const response = await axios.get("https://nominatim.openstreetmap.org/search", {
    params: {
      q: location,
      format: "json",
      limit: 1
    },
    headers
  });

  return response.data?.[0] || null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const text = req.body?.text;

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Text missing or invalid" });
    }

    const parts = text.split(/to/i).map((part) => part.trim()).filter(Boolean);
    const from = parts[0];
    const to = parts[1];

    if (!from || !to) {
      return res.status(400).json({ error: "Invalid format. Use: City A to City B" });
    }

    const fromPlace = await geocode(from);
    const toPlace = await geocode(to);

    if (!fromPlace || !toPlace) {
      return res.status(400).json({ error: "Location not found. Try more specific names." });
    }

    const fromCoords = {
      lat: Number(fromPlace.lat),
      lon: Number(fromPlace.lon)
    };

    const toCoords = {
      lat: Number(toPlace.lat),
      lon: Number(toPlace.lon)
    };

    const routeRes = await axios.get(
      `https://router.project-osrm.org/route/v1/driving/${fromCoords.lon},${fromCoords.lat};${toCoords.lon},${toCoords.lat}`,
      {
        params: {
          overview: "full",
          geometries: "geojson"
        }
      }
    );

    const route = routeRes.data?.routes?.[0];

    if (!route) {
      return res.status(500).json({ error: "No route found" });
    }

    return res.status(200).json({
      from: fromPlace.display_name,
      to: toPlace.display_name,
      distance: `${(route.distance / 1000).toFixed(1)} km`,
      duration: `${Math.floor(route.duration / 3600)}h ${Math.floor((route.duration % 3600) / 60)}m`,
      fromCoords,
      toCoords,
      routeGeometry: route.geometry
    });
  } catch (err) {
    console.error("API agent error:", err.message);
    return res.status(500).json({
      error: "Internal server error",
      details: err.message
    });
  }
};
