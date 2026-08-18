const axios = require("axios");
const YahooFinance = require("yahoo-finance2").default;

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const nseHeaders = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.nseindia.com/"
};

async function fetchNsePreOpen(key) {
  try {
    const response = await axios.get(
      `https://www.nseindia.com/api/market-data-pre-open?key=${encodeURIComponent(key)}`,
      {
        headers: nseHeaders,
        timeout: 15000
      }
    );

    return {
      success: true,
      statusCode: response.status,
      data: response.data,
      dataLength: Array.isArray(response.data?.data) ? response.data.data.length : null
    };
  } catch (err) {
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

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const symbols = [
      { key: "nifty50", symbol: "^NSEI" },
      { key: "sensex", symbol: "^BSESN" },
      { key: "bankNifty", symbol: "^NSEBANK" }
    ];

    const marketResults = await Promise.all(symbols.map((item) => yahooFinance.quote(item.symbol)));
    const niftyFetch = await fetchNsePreOpen("NIFTY");
    const bankFetch = await fetchNsePreOpen("BANKNIFTY");

    const niftyBreadth = niftyFetch?.success ? getAdvanceDecline(niftyFetch.data) : null;
    const bankBreadth = bankFetch?.success ? getAdvanceDecline(bankFetch.data) : null;

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
        change: (quote.regularMarketChange ?? quote.regularMarketChangePercent) ?? null,
        previousClose: quote.regularMarketPreviousClose ?? "N/A",
        advances,
        declines,
        unchanged
      };
    });

    return res.status(200).json({
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
    console.error("Market data handler error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
