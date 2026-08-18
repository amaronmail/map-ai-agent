const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();

app.use(cors());
app.use(express.json());

app.post("/api/agent", async (req, res) => {
  try {
    const { text } = req.body;

    const [from, to] = text.split(" to ");

    const fromGeo = await axios.get(
      `https://nominatim.openstreetmap.org/search?q=${from}&format=json&limit=1`
    );

    const toGeo = await axios.get(
      `https://nominatim.openstreetmap.org/search?q=${to}&format=json&limit=1`
    );

    const fromCoords = {
      lat: parseFloat(fromGeo.data[0].lat),
      lon: parseFloat(fromGeo.data[0].lon),
    };

    const toCoords = {
      lat: parseFloat(toGeo.data[0].lat),
      lon: parseFloat(toGeo.data[0].lon),
    };

    const routeRes = await axios.get(
      `https://router.project-osrm.org/route/v1/driving/${fromCoords.lon},${fromCoords.lat};${toCoords.lon},${toCoords.lat}?overview=full&geometries=geojson`
    );

    const route = routeRes.data.routes[0];

    res.json({
      from,
      to,
      distance: `${(route.distance / 1000).toFixed(1)} km`,
      duration: `${Math.floor(route.duration / 3600)}h ${Math.floor((route.duration % 3600) / 60)}m`,
      fromCoords,
      toCoords,
      routeGeometry: route.geometry,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Route fetch failed" });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});