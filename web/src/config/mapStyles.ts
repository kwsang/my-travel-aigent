// Custom Google Maps theme matching the "Marine & Sunset" dark UI
export const marineSunsetMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#0a1118" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0a1118" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#ffd07b" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#fdb833" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#ffd07b" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#0d1b2a" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#296eb4" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#111f33" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1a2c45" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#b1740f" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#1789fc" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#296eb4" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#fdb833" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#b1740f" }],
  },
  {
    featureType: "transit.station",
    elementType: "labels.text.fill",
    stylers: [{ color: "#fdb833" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#060d14" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#296eb4" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#0a1118" }],
  },
];