const express = require("express");
const cors = require("cors");
const axios = require("axios");
const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "client")));

const nseHeaders = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.nseindia.com/"
};

async function fetchNsePreOpen(key) {
  try {
    const nseResp = await axios.get(
      `https://www.nseindia.com/api/market-data-pre-open?key=${encodeURIComponent(key)}`,
      {
        headers: nseHeaders,
        timeout: 15000
      }
    );

    return {
      success: true,
      statusCode: nseResp.status,
      data: nseResp.data,
      dataLength: Array.isArray(nseResp.data?.data) ? nseResp.data.data.length : null
    };
  } catch (err) {
    console.error(`NSE pre-open fetch failed for ${key}:`, err.message || err, {
      status: err.response?.status,
      statusText: err.response?.statusText,
      dataPreview: err.response?.data ? String(err.response.data).slice(0,200) : null
    });

    return {
      success: false,
      statusCode: err.response?.status || null,
      error: err.message || "Unknown NSE fetch error"
    };
  }
}

function getAdvanceDecline(preOpenData) {
  if (!preOpenData || !Array.isArray(preOpenData.data)) return null;

  const declines = Number(preOpenData.declines ?? 0);
  const unchanged = Number(preOpenData.unchanged ?? 0);
  const total = preOpenData.data.length;
  const advances = Math.max(0, total - declines - unchanged);

  return {
    advances,
    declines,
    unchanged
  };
}

// Serve static files from client directory
app.use(express.static(path.join(__dirname, "client")));

// TEST ROUTE
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "client", "index.html"));
});

// MAIN API
app.post("/api/agent", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== "string") {
      return res.status(400).json({
        error: "Text missing or invalid"
      });
    }

    // SAFE PARSING
    const parts = text.split(/to/i).map(s => s.trim()).filter(Boolean);

    const from = parts[0];
    const to = parts[1];

    if (!from || !to) {
      return res.status(400).json({
        error: "Invalid format. Use: City A to City B"
      });
    }

    const headers = {
      "User-Agent": "AI-Map-App/1.0"
    };

    // ================= GEO CODING =================

    const fromGeo = await axios.get(
      "https://nominatim.openstreetmap.org/search",
      {
        params: {
          q: from,
          format: "json",
          limit: 1
        },
        headers
      }
    );

    const toGeo = await axios.get(
      "https://nominatim.openstreetmap.org/search",
      {
        params: {
          q: to,
          format: "json",
          limit: 1
        },
        headers
      }
    );

    const fromPlace = fromGeo.data?.[0];
    const toPlace = toGeo.data?.[0];

    if (!fromPlace || !toPlace) {
      return res.status(400).json({
        error: "Location not found. Try more specific names."
      });
    }

    const fromCoords = {
      lat: Number(fromPlace.lat),
      lon: Number(fromPlace.lon)
    };

    const toCoords = {
      lat: Number(toPlace.lat),
      lon: Number(toPlace.lon)
    };

    // ================= ROUTE =================

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
      return res.status(500).json({
        error: "No route found"
      });
    }

    // ================= RESPONSE =================

    res.json({
      from: fromPlace.display_name,
      to: toPlace.display_name,

      distance: `${(route.distance / 1000).toFixed(1)} km`,
      duration: `${Math.floor(route.duration / 3600)}h ${Math.floor((route.duration % 3600) / 60)}m`,

      fromCoords,
      toCoords,
      routeGeometry: route.geometry
    });

  } catch (err) {
    console.log("ERROR:", err.message);

    res.status(500).json({
      error: "Internal server error",
      details: err.message
    });
  }
});

// ================= MARKET DATA API =================

app.get("/api/market-data", async (req, res) => {
  try {
    console.log("🔵 Fetching market data from Yahoo Finance...");

    const symbols = [
      { key: "nifty50", symbol: "^NSEI" },
      { key: "sensex", symbol: "^BSESN" },
      { key: "bankNifty", symbol: "^NSEBANK" }
    ];

    const marketPromises = symbols.map((item) => yahooFinance.quote(item.symbol));
    const marketResults = await Promise.all(marketPromises);

    const niftyFetch = await fetchNsePreOpen("NIFTY");
    const bankFetch = await fetchNsePreOpen("BANKNIFTY");

    const niftyPreOpen = niftyFetch?.success ? niftyFetch.data : null;
    const bankPreOpen = bankFetch?.success ? bankFetch.data : null;

    console.log('NIFTY pre-open fetch result:', niftyFetch?.success, niftyFetch?.statusCode, niftyFetch?.error);
    console.log('BANKNIFTY pre-open fetch result:', bankFetch?.success, bankFetch?.statusCode, bankFetch?.error);

    const niftyBreadth = getAdvanceDecline(niftyPreOpen);
    const bankBreadth = getAdvanceDecline(bankPreOpen);

    console.log('Computed breadth:', { niftyBreadth, bankBreadth });

    const marketData = {};
    symbols.forEach((item, index) => {
      const quote = marketResults[index] || {};

      let advances = "N/A";
      let declines = "N/A";
      let unchanged = "N/A";

      if (item.key === "nifty50" && niftyBreadth) {
        advances = niftyBreadth.advances;
        declines = niftyBreadth.declines;
        unchanged = niftyBreadth.unchanged;
      }

      if (item.key === "bankNifty" && bankBreadth) {
        advances = bankBreadth.advances;
        declines = bankBreadth.declines;
        unchanged = bankBreadth.unchanged;
      }

      marketData[item.key] = {
        price: quote.regularMarketPrice ?? "N/A",
        pointChange: quote.regularMarketChange ?? null,
        percentChange: quote.regularMarketChangePercent ?? null,
        // `change` remains for backwards compatibility and used for styling/sign
        change: (quote.regularMarketChange ?? quote.regularMarketChangePercent) ?? null,
        previousClose: quote.regularMarketPreviousClose ?? "N/A",
        advances,
        declines,
        unchanged
      };
    });

    res.json({
      marketData,
      debugBreadth: {
        niftyBreadth,
        bankBreadth,
        niftyFetch: {
          success: niftyFetch?.success,
          statusCode: niftyFetch?.statusCode,
          error: niftyFetch?.error,
          dataLength: niftyFetch?.dataLength
        },
        bankFetch: {
          success: bankFetch?.success,
          statusCode: bankFetch?.statusCode,
          error: bankFetch?.error,
          dataLength: bankFetch?.dataLength
        }
      }
    });
  } catch (err) {
    console.error("❌ Market data error:", err.message);
    res.json({
      error: err.message
    });
  }
});

// ================= START SERVER =================

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  const hostLabel = HOST === "0.0.0.0" ? "all network interfaces" : HOST;
  console.log(`Server running on http://${hostLabel}:${PORT}`);
  console.log("Use this app from any device on the same network via the server's IP address.");
});