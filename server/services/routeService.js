exports.getRoute = async (from, to) => {
  return {
    from,
    to,
    fromCoords: { lat: 28.61, lon: 77.20 },
    toCoords: { lat: 28.70, lon: 77.10 },
    distance: "12 km",
    duration: "25 mins",
    routeGeometry: [
      [28.61, 77.20],
      [28.70, 77.10]
    ]
  };
};