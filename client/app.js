async function getNearby(lat, lon, type) {
  const query = `
    [out:json];
    node[amenity=${type}](around:5000,${lat},${lon});
    out;
  `;

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain"
      },
      body: query
    });

    return await res.json();
  } catch (err) {
    console.error("Overpass error:", err);
    return { elements: [] };
  }
}

async function getWeather(lat, lon) {
  try {
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=celsius&windspeed_unit=kmh`
    );
    const weatherJson = await weatherRes.json();
    return weatherJson.current_weather || {};
  } catch (err) {
    console.error("Weather error:", err);
    return {};
  }
}

function formatNumber(value, decimals = 2) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(decimals) : "N/A";
}

function formatPercent(value, decimals = 2) {
  const num = Number(value);
  return Number.isFinite(num) ? `${num.toFixed(decimals)}%` : "N/A";
}

function changeClass(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return num > 0 ? "positive-change" : num < 0 ? "negative-change" : "";
}

function changeStyle(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return num > 0
    ? "color: #1f8c4b; font-weight: 600;"
    : num < 0
    ? "color: #c0392b; font-weight: 600;"
    : "";
}

function formatMarketChange(pointChange, percentChange) {
  const p = Number(pointChange);
  const point = Number.isFinite(p) ? (p > 0 ? `+${p.toFixed(2)}` : p.toFixed(2)) : "N/A";
  const percent = formatPercent(percentChange, 2);
  // Use a clear separator between points and percent
  return `${point} | ${percent}`;
}

const API_BASE_URL = window.API_BASE_URL || "";

function apiFetch(path, options) {
  return fetch(`${API_BASE_URL}${path}`, options);
}

function renderCount(value) {
  return value === null || value === undefined || value === "" ? "N/A" : value;
}

// ================= MAIN APP =================
document.addEventListener("DOMContentLoaded", () => {

  // Capitalize input
  function forceCityCase(id) {
    const input = document.getElementById(id);

    input.addEventListener("input", () => {
      let words = input.value.split(" ");
      input.value = words
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    });
  }

  forceCityCase("fromInput");
  forceCityCase("toInput");

  // MAP
  let map = L.map("map").setView([28.6, 77.2], 6);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
  }).addTo(map);

  let routeLine;
  let startMarker;
  let endMarker;
  let carMarker;

  // Create custom emoji markers
  function createEmojiMarker(emoji, size = 40) {
    return L.divIcon({
      html: `<div style="font-size: ${size}px; line-height: 1; filter: drop-shadow(0 0 2px rgba(0,0,0,0.3));">${emoji}</div>`,
      iconSize: [size, size],
      className: 'emoji-marker'
    });
  }

  // Click card expand
  document.addEventListener("click", (e) => {
    const card = e.target.closest(".info-card");
    if (!card) return;

    const isActive = card.classList.contains("active");
    document.querySelectorAll(".info-card.active").forEach((otherCard) => {
      otherCard.classList.remove("active");
    });

    if (!isActive) {
      card.classList.add("active");
    }
  });

  // Car animation
  function animateCar(coords) {
    if (!coords || coords.length === 0) return;

    let i = 0;

    if (carMarker) map.removeLayer(carMarker);

    carMarker = L.marker(coords[0], { icon: createEmojiMarker('🚗', 40) }).addTo(map);

    function move() {
      if (i < coords.length) {
        carMarker.setLatLng([coords[i][1], coords[i][0]]);
        i++;
        setTimeout(move, 80);
      }
    }

    move();
  }

  // MAIN FUNCTION
  window.runAI = async function () {

    try {

      const from = document.getElementById("fromInput").value;
      const to = document.getElementById("toInput").value;

      if (!from || !to) {
        alert("Please enter locations");
        return;
      }

      const text = `${from} to ${to}`;

      const res = await apiFetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });

      const data = await res.json();

      if (data.error) {
        alert(data.error);
        return;
      }

      const distanceNum = parseFloat(data.distance);

      // ================= CALCULATIONS =================
      const avgSpeed = 65;
      const mileage = 15;
      
      // Store in global scope for dynamic updates
      window.currentFuelPrice = 100;
      window.currentMileage = mileage;  // km/L (fuel efficiency)
      window.currentDistance = distanceNum;  // Total distance
      window.currentFuelUsed = (distanceNum / mileage).toFixed(1);
      
      const fuelUsed = window.currentFuelUsed;
      const fuelCost = (fuelUsed * window.currentFuelPrice).toFixed(0);
      
      // Store for later reference
      window.currentFuelCost = fuelCost;

      let traffic = "Low 🟢";
      if (distanceNum > 100) traffic = "Medium 🟠";
      if (distanceNum > 300) traffic = "Heavy 🔴";

      const baseTime = distanceNum / avgSpeed;

      let multiplier = 1;
      if (distanceNum > 100) multiplier = 1.2;
      if (distanceNum > 250) multiplier = 1.5;

      const aiTime = baseTime * multiplier;

      const aiH = Math.floor(aiTime);
      const aiM = Math.round((aiTime - aiH) * 60);
      const aiETA = aiH > 0 ? `${aiH}h ${aiM}m` : `${aiM}m`;

      const weather = await getWeather(data.toCoords.lat, data.toCoords.lon);
      const temp = weather.temperature ?? "N/A";
      const wind = weather.windspeed ?? "N/A";
      const now = new Date();
      const hour = now.getHours();
      const isNight = hour < 6 || hour >= 18;
      const isHillRoute = /manali|shimla|kullu/.test(data.to.toLowerCase());
      const isCold = typeof temp === "number" && temp < 15;
      const fogHigh = isNight || isCold;
      const weatherAdvice = isNight
        ? "Night driving, headlights ON ⚠️"
        : isCold
        ? "Slow driving + headlights ON ⚠️"
        : "Normal driving conditions ✅";
      const routeTitle = `${from.toUpperCase()} TO ${to.toUpperCase()}`;

      // ================= UI =================
      document.getElementById("result").innerHTML = `
      <div class="dashboard">

        <div class="info-card">
          <h2>🚗 ${routeTitle}</h2>
        </div>

        <div class="info-card">
          <h2>🛣 Route Summary</h2>
          <div class="card-content">
            <div class="info-row"><span>From</span><span>${data.from}</span></div>
            <div class="info-row"><span>To</span><span>${data.to}</span></div>
            <div class="info-row"><span>Distance</span><span>${data.distance}</span></div>
            <div class="info-row"><span>Time</span><span>${data.duration}</span></div>
          </div>
        </div>

<div class="info-card">
  <h2>🤖 AI Advanced Travel Info</h2>
  <div class="card-content">

    <div class="info-row">
      <span>Base ETA</span>
      <span>${data.duration}</span>
    </div>

    <div class="info-row">
      <span>AI Optimized ETA</span>
      <span>${aiETA}</span>
    </div>

    <div class="info-row">
      <span>Recommended Start Time</span>
      <span>${
        distanceNum > 300
          ? "Early Morning (5AM–7AM)"
          : distanceNum > 100
          ? "Morning / Evening"
          : "Anytime"
      }</span>
    </div>

    <div class="info-row">
      <span>Fatigue Risk Level</span>
      <span>${
        distanceNum > 300
          ? "High ⚠️ (Long drive)"
          : distanceNum > 150
          ? "Medium 🟠"
          : "Low 🟢"
      }</span>
    </div>

    <div class="info-row">
      <span>Break Recommendation</span>
      <span>${
        distanceNum > 300
          ? "Every 2–3 hours mandatory"
          : distanceNum > 150
          ? "Every 3–4 hours"
          : "Optional short breaks"
      }</span>
    </div>

    <div class="info-row">
      <span>Fuel Strategy</span>
      <span>${
        distanceNum > 400
          ? "Refuel full tank + backup plan"
          : distanceNum > 150
          ? "Check fuel at midpoint"
          : "Normal refuel OK"
      }</span>
    </div>

    <div class="info-row">
      <span>Road Stress Level</span>
      <span>${
        distanceNum > 300
          ? "High (fatigue + highway monotony)"
          : distanceNum > 150
          ? "Moderate"
          : "Low"
      }</span>
    </div>

    <div class="info-row">
      <span>Night Driving Advice</span>
      <span>${
        distanceNum > 250
          ? "Avoid night driving"
          : "Safe if rested"
      }</span>
    </div>

  </div>
</div>

<div class="info-card">
  <h2>🌿 Nature Update</h2>
  <div class="card-content">

    <div class="info-row">
      <span>Hill Mode</span>
      <span>${
        data.to.toLowerCase().includes("manali") ||
        data.to.toLowerCase().includes("shimla") ||
        data.to.toLowerCase().includes("kullu")
          ? "Active 🏔"
          : "Normal Route 🛣"
      }</span>
    </div>

    <div class="info-row">
      <span>Temperature</span>
      <span>${temp} °C</span>
    </div>

    <div class="info-row">
      <span>Wind Speed</span>
      <span>${wind} km/h</span>
    </div>

    <div class="info-row">
      <span>Fog Risk</span>
      <span>${fogHigh ? "High 🌫⚠️" : "Low 🟢"}</span>
    </div>

    <div class="info-row">
      <span>Weather Advice</span>
      <span>${weatherAdvice}</span>
    </div>

  </div>
</div>

<div class="info-card">
  <h2>🚘 Vehicle Performance Dashboard</h2>
  <div class="card-content">

    <div class="info-row">
      <span>Normal Speed</span>
      <span>${avgSpeed} km/h</span>
    </div>

    <div class="info-row">
      <span>Highway Optimized Speed</span>
      <span>80 km/h</span>
    </div>

    <div class="info-row">
      <span>Estimated Travel Mode</span>
      <span>${
        distanceNum > 200
          ? "Highway Dominant Drive"
          : "Mixed City + Highway"
      }</span>
    </div>

    <div class="info-row">
      <span>Fuel Consumption</span>
      <div style="display: flex; gap: 8px; align-items: center;" onclick="event.stopPropagation()">
        <input type="number" id="fuelMileageInput" placeholder="km/L" value="${window.currentMileage}" style="width: 80px; padding: 6px 8px; font-size: 13px; border: 1px solid #ccc; border-radius: 5px; outline: none;" />
        <button id="updateFuelMileageBtn" onclick="updateFuelConsumption(event); event.stopPropagation();" style="padding: 6px 10px; font-size: 12px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap;">Update</button>
        <span id="fuelConsumptionDisplay" style="font-weight: 600;">${fuelUsed} L</span>
      </div>
    </div>

    <div class="info-row">
      <span>Fuel Cost Estimate</span>
      <div style="display: flex; gap: 8px; align-items: center;" onclick="event.stopPropagation()">
        <input type="number" id="fuelPriceInput" placeholder="₹/L" value="${window.currentFuelPrice}" style="width: 80px; padding: 6px 8px; font-size: 13px; border: 1px solid #ccc; border-radius: 5px; outline: none;" />
        <button id="updateFuelPriceBtn" onclick="updateFuelPrice(event); event.stopPropagation();" style="padding: 6px 10px; font-size: 12px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap;">Update</button>
        <span id="fuelCostDisplay" style="font-weight: 600;">₹${fuelCost}</span>
      </div>
    </div>

    <div class="info-row">
      <span>Driving Efficiency</span>
      <span>${
        distanceNum > 300
          ? "Highway efficient driving recommended"
          : "Normal efficiency"
      }</span>
    </div>

    <div class="info-row">
      <span>Trip Fuel Strategy</span>
      <span>${
        distanceNum > 400
          ? "Full tank + refill at midpoint"
          : distanceNum > 150
          ? "Check fuel at halfway point"
          : "Single tank sufficient"
      }</span>
    </div>

    <div class="info-row">
      <span>Modern Travel Insight</span>
      <span>${
        distanceNum > 250
          ? "Avoid peak hours for better mileage"
          : "Standard driving conditions"
      }</span>
    </div>

  </div>
</div>

        <!-- 🚦 UPGRADED TRAFFIC CARD -->
        <div class="info-card">
          <h2>🚦 Live Travel Intelligence</h2>
          <div class="card-content">

            <div class="info-row">
              <span>Traffic Status</span>
              <span>${traffic}</span>
            </div>

            <div class="info-row">
              <span>Congestion Level</span>
              <span>${
                distanceNum > 300
                  ? "High 🔴"
                  : distanceNum > 100
                  ? "Medium 🟠"
                  : "Low 🟢"
              }</span>
            </div>

            <div class="info-row">
              <span>Road Type</span>
              <span>${
                distanceNum > 200
                  ? "Highway + Rural mix"
                  : "City + Highway route"
              }</span>
            </div>

            <div class="info-row">
              <span>Break Suggestion</span>
              <span>${
                distanceNum > 300
                  ? "Every 2–3 hours"
                  : "Optional breaks"
              }</span>
            </div>

            <div class="info-row">
              <span>Safety Level</span>
              <span>${
                distanceNum > 250
                  ? "Medium fatigue risk ⚠️"
                  : "Safe route ✅"
              }</span>
            </div>

          </div>
        </div>

        <div class="info-card">
          <h2>⛽ Services</h2>
          <div class="card-content" id="servicesBox">
            <div class="info-row"><span>Petrol Pumps</span><span>Loading...</span></div>
            <div class="info-row"><span>Restaurants</span><span>Loading...</span></div>
            <div class="info-row"><span>Hotels</span><span>Loading...</span></div>
          </div>
        </div>

        <div class="info-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h2 style="margin: 0;">📈 Market Dashboard</h2>
            <button id="refreshMarketBtn" onclick="refreshMarketData()" style="padding: 6px 10px; font-size: 16px; background: transparent; border: none; cursor: pointer; transition: all 0.3s;" title="Refresh Live Data">🔄</button>
          </div>
          <div class="card-content" id="marketBox">
            <div class="info-row"><span>NIFTY 50</span><span>Loading...</span></div>
            <div class="info-row"><span>Change</span><span>Loading...</span></div>
            <div class="info-row"><span>Advances</span><span>Loading...</span></div>
            <div class="info-row"><span>Declines</span><span>Loading...</span></div>
            <div class="info-row"><span>Unchanged</span><span>Loading...</span></div>
            <div class="info-row"><span>SENSEX</span><span>Loading...</span></div>
            <div class="info-row"><span>Change</span><span>Loading...</span></div>
            <div class="info-row"><span>BANKNIFTY</span><span>Loading...</span></div>
            <div class="info-row"><span>Change</span><span>Loading...</span></div>
          </div>
        </div>
      </div>
      `;
      

      // ================= ROUTE =================
      if (routeLine) map.removeLayer(routeLine);
      if (startMarker) map.removeLayer(startMarker);
      if (endMarker) map.removeLayer(endMarker);

      const start = [data.fromCoords.lat, data.fromCoords.lon];
      const end = [data.toCoords.lat, data.toCoords.lon];

      startMarker = L.marker(start, { icon: createEmojiMarker('📍', 40) }).addTo(map);
      endMarker = L.marker(end, { icon: createEmojiMarker('🚩', 40) }).addTo(map);

      routeLine = L.geoJSON(data.routeGeometry, {
        style: { color: "blue", weight: 5 }
      }).addTo(map);

      map.fitBounds(routeLine.getBounds());

      animateCar(data.routeGeometry.coordinates);

      // ================= SERVICES =================
      const fuel = await getNearby(data.toCoords.lat, data.toCoords.lon, "fuel");
      const food = await getNearby(data.toCoords.lat, data.toCoords.lon, "restaurant");
      const hotel = await getNearby(data.toCoords.lat, data.toCoords.lon, "hotel");

      document.getElementById("servicesBox").innerHTML = `
        <div class="info-row"><span>Petrol Pumps</span><span>${fuel.elements?.length || 0}</span></div>
        <div class="info-row"><span>Restaurants</span><span>${food.elements?.length || 0}</span></div>
        <div class="info-row"><span>Hotels</span><span>${hotel.elements?.length || 0}</span></div>
      `;

      // ================= MARKET DATA =================
      try {
        console.log("📊 Fetching market data from /api/market-data...");
        const marketRes = await apiFetch("/api/market-data");
        const marketPayload = await marketRes.json();
        const marketData = marketPayload?.marketData ?? marketPayload;
        
        console.log("🎯 Market payload received:", JSON.stringify(marketPayload, null, 2));
        console.log("NIFTY50:", marketData?.nifty50);
        console.log("SENSEX:", marketData?.sensex);
        console.log("BANKNIFTY:", marketData?.bankNifty);
        
        if (marketData && marketData.nifty50) {
          document.getElementById("marketBox").innerHTML = `
            <div class="info-row"><span>NIFTY 50</span><span class="${changeClass(marketData.nifty50.change)}" style="${changeStyle(marketData.nifty50.change)}">${formatNumber(marketData.nifty50.price)}</span></div>
            <div class="info-row"><span>Change</span><span class="${changeClass(marketData.nifty50.change)}" style="${changeStyle(marketData.nifty50.change)}">${formatMarketChange(marketData.nifty50.pointChange, marketData.nifty50.percentChange)}</span></div>
            <div class="info-row"><span>Advances</span><span>${renderCount(marketData.nifty50.advances)} 📈</span></div>
            <div class="info-row"><span>Declines</span><span>${renderCount(marketData.nifty50.declines)} 📉</span></div>
            <div class="info-row"><span>Unchanged</span><span>${renderCount(marketData.nifty50.unchanged)}</span></div>
            <div class="info-row"><span>Prev Close</span><span>${formatNumber(marketData.nifty50.previousClose)}</span></div>
            <div style="border-bottom: 3px solid #333; margin: 12px 0;"></div>
            <div class="info-row"><span>SENSEX</span><span class="${changeClass(marketData.sensex?.change)}" style="${changeStyle(marketData.sensex?.change)}">${formatNumber(marketData.sensex?.price)}</span></div>
            <div class="info-row"><span>Change</span><span class="${changeClass(marketData.sensex?.change)}" style="${changeStyle(marketData.sensex?.change)}">${formatMarketChange(marketData.sensex?.pointChange, marketData.sensex?.percentChange)}</span></div>
            <div class="info-row"><span>Prev Close</span><span>${formatNumber(marketData.sensex?.previousClose)}</span></div>
            <div style="border-bottom: 3px solid #333; margin: 12px 0;"></div>
            <div class="info-row"><span>BANKNIFTY</span><span class="${changeClass(marketData.bankNifty?.change)}" style="${changeStyle(marketData.bankNifty?.change)}">${formatNumber(marketData.bankNifty?.price)}</span></div>
            <div class="info-row"><span>Change</span><span class="${changeClass(marketData.bankNifty?.change)}" style="${changeStyle(marketData.bankNifty?.change)}">${formatMarketChange(marketData.bankNifty?.pointChange, marketData.bankNifty?.percentChange)}</span></div>
            <div class="info-row"><span>Prev Close</span><span>${formatNumber(marketData.bankNifty?.previousClose)}</span></div>
          `;
          console.log("✅ Market data displayed successfully");
        } else {
          console.warn("⚠️ Market data structure invalid:", marketData);
          document.getElementById("marketBox").innerHTML = `
            <div class="info-row"><span>NIFTY 50</span><span>N/A</span></div>
            <div class="info-row"><span>Change</span><span>N/A</span></div>
            <div class="info-row"><span>Advances</span><span>N/A</span></div>
            <div class="info-row"><span>Declines</span><span>N/A</span></div>
            <div class="info-row"><span>Unchanged</span><span>N/A</span></div>
            <div class="info-row"><span>SENSEX</span><span>N/A</span></div>
            <div class="info-row"><span>Change</span><span>N/A</span></div>
            <div class="info-row"><span>BANKNIFTY</span><span>N/A</span></div>
            <div class="info-row"><span>Change</span><span>N/A</span></div>
          `;
        }
      } catch (err) {
        console.error("❌ Market data fetch error:", err);
        document.getElementById("marketBox").innerHTML = `
          <div class="info-row"><span>NIFTY 50</span><span>N/A</span></div>
          <div class="info-row"><span>Change</span><span>N/A</span></div>
          <div class="info-row"><span>Advances</span><span>N/A</span></div>
          <div class="info-row"><span>Declines</span><span>N/A</span></div>
          <div class="info-row"><span>Unchanged</span><span>N/A</span></div>
          <div class="info-row"><span>SENSEX</span><span>N/A</span></div>
          <div class="info-row"><span>Change</span><span>N/A</span></div>
          <div class="info-row"><span>BANKNIFTY</span><span>N/A</span></div>
          <div class="info-row"><span>Change</span><span>N/A</span></div>
        `;
      }

    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    }
  };

  // ================= REFRESH MARKET DATA =================
  window.refreshMarketData = async function () {
    const btn = document.getElementById("refreshMarketBtn");
    btn.disabled = true;
    btn.style.opacity = "0.6";
    
    try {
      console.log("🔄 Refreshing market data...");
      const marketRes = await apiFetch("/api/market-data");
      const marketPayload = await marketRes.json();
      const marketData = marketPayload?.marketData ?? marketPayload;
      
      console.log("🎯 Market payload refreshed:", JSON.stringify(marketPayload, null, 2));
      
      if (marketData && marketData.nifty50) {
        document.getElementById("marketBox").innerHTML = `
          <div class="info-row"><span>NIFTY 50</span><span class="${changeClass(marketData.nifty50.change)}" style="${changeStyle(marketData.nifty50.change)}">${formatNumber(marketData.nifty50.price)}</span></div>
          <div class="info-row"><span>Change</span><span class="${changeClass(marketData.nifty50.change)}" style="${changeStyle(marketData.nifty50.change)}">${formatMarketChange(marketData.nifty50.change, marketData.nifty50.change)}</span></div>
          <div class="info-row"><span>Advances</span><span>${renderCount(marketData.nifty50.advances)} 📈</span></div>
          <div class="info-row"><span>Declines</span><span>${renderCount(marketData.nifty50.declines)} 📉</span></div>
          <div class="info-row"><span>Unchanged</span><span>${renderCount(marketData.nifty50.unchanged)}</span></div>
          <div class="info-row"><span>Prev Close</span><span>${formatNumber(marketData.nifty50.previousClose)}</span></div>
          <div style="border-bottom: 3px solid #333; margin: 12px 0;"></div>
          <div class="info-row"><span>SENSEX</span><span class="${changeClass(marketData.sensex?.change)}" style="${changeStyle(marketData.sensex?.change)}">${formatNumber(marketData.sensex?.price)}</span></div>
          <div class="info-row"><span>Change</span><span class="${changeClass(marketData.sensex?.change)}" style="${changeStyle(marketData.sensex?.change)}">${formatMarketChange(marketData.sensex?.change, marketData.sensex?.change)}</span></div>
          <div class="info-row"><span>Prev Close</span><span>${formatNumber(marketData.sensex?.previousClose)}</span></div>
          <div style="border-bottom: 3px solid #333; margin: 12px 0;"></div>
          <div class="info-row"><span>BANKNIFTY</span><span class="${changeClass(marketData.bankNifty?.change)}" style="${changeStyle(marketData.bankNifty?.change)}">${formatNumber(marketData.bankNifty?.price)}</span></div>
          <div class="info-row"><span>Change</span><span class="${changeClass(marketData.bankNifty?.change)}" style="${changeStyle(marketData.bankNifty?.change)}">${formatMarketChange(marketData.bankNifty?.change, marketData.bankNifty?.change)}</span></div>
          <div class="info-row"><span>Prev Close</span><span>${formatNumber(marketData.bankNifty?.previousClose)}</span></div>
        `;
        console.log("✅ Market data refreshed successfully");
      } else {
        console.warn("⚠️ Market data invalid:", marketData);
      }
    } catch (err) {
      console.error("❌ Refresh error:", err);
    } finally {
      btn.disabled = false;
      btn.style.opacity = "1";
    }
  };

});

// ENTER key support
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const fuelPriceInput = document.getElementById("fuelPriceInput");
    const fuelMileageInput = document.getElementById("fuelMileageInput");
    
    // If fuel price input is focused, update fuel price
    if (fuelPriceInput && document.activeElement === fuelPriceInput) {
      updateFuelPrice(e);
    }
    // If fuel mileage input is focused, update fuel consumption
    else if (fuelMileageInput && document.activeElement === fuelMileageInput) {
      updateFuelConsumption(e);
    } 
    // Otherwise run AI search
    else {
      runAI();
    }
  }
});

// swap locations
window.swapLocations = function () {
  const from = document.getElementById("fromInput");
  const to = document.getElementById("toInput");

  const temp = from.value;
  from.value = to.value;
  to.value = temp;
};

// Update fuel consumption (mileage) and recalculate
window.updateFuelConsumption = function (event) {
  if (event) event.stopPropagation();
  
  const mileageInput = document.getElementById("fuelMileageInput");
  const newMileage = parseFloat(mileageInput.value);

  if (isNaN(newMileage) || newMileage <= 0) {
    alert("Please enter a valid mileage (km/L)");
    return;
  }

  window.currentMileage = newMileage;
  // Recalculate fuel consumption based on new mileage
  const newFuelUsed = (window.currentDistance / newMileage).toFixed(1);
  window.currentFuelUsed = newFuelUsed;
  
  // Recalculate fuel cost
  const newFuelCost = (newFuelUsed * window.currentFuelPrice).toFixed(0);
  window.currentFuelCost = newFuelCost;

  // Update displays
  const consumptionDisplay = document.getElementById("fuelConsumptionDisplay");
  if (consumptionDisplay) {
    consumptionDisplay.textContent = `${newFuelUsed} L`;
  }
  
  const fuelCostDisplay = document.getElementById("fuelCostDisplay");
  if (fuelCostDisplay) {
    fuelCostDisplay.textContent = `₹${newFuelCost}`;
  }
};

// Update fuel price and recalculate fuel cost
window.updateFuelPrice = function (event) {
  if (event) event.stopPropagation();
  
  const fuelPriceInput = document.getElementById("fuelPriceInput");
  const newPrice = parseFloat(fuelPriceInput.value);

  if (isNaN(newPrice) || newPrice <= 0) {
    alert("Please enter a valid fuel price");
    return;
  }

  window.currentFuelPrice = newPrice;
  const newFuelCost = (window.currentFuelUsed * window.currentFuelPrice).toFixed(0);
  window.currentFuelCost = newFuelCost;

  // Update the display
  const fuelCostDisplay = document.getElementById("fuelCostDisplay");
  if (fuelCostDisplay) {
    fuelCostDisplay.textContent = `₹${newFuelCost}`;
  }
};

// reset form
window.resetForm = function () {
  // Clear input fields
  document.getElementById("fromInput").value = "";
  document.getElementById("toInput").value = "";

  // Clear result area
  document.getElementById("result").innerHTML = "";

  // Clear services box
  document.getElementById("servicesBox").innerHTML = `
    <div class="info-row"><span>Petrol Pumps</span><span>-</span></div>
    <div class="info-row"><span>Restaurants</span><span>-</span></div>
    <div class="info-row"><span>Hotels</span><span>-</span></div>
  `;

  // Clear markers and routes from map
  if (typeof map !== 'undefined') {
    map.eachLayer(function(layer) {
      if (layer instanceof L.Marker || layer instanceof L.Polyline || layer instanceof L.GeoJSON) {
        map.removeLayer(layer);
      }
    });
    
    // Reset map to default view
    map.setView([28.6, 77.2], 6);
  }

  // Focus on input field for convenience
  document.getElementById("fromInput").focus();
};