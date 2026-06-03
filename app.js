const unitProfiles = {
  pickup: { name: "Pickup 1.5 t", multiplier: 1, capacity: "1.5 t", tollClass: "C2", emptyKmL: 9.5, loadedKmL: 7.2 },
  rabon: { name: "Rabon 8 t", multiplier: 1.28, capacity: "8 t", tollClass: "C2-C3", emptyKmL: 6.2, loadedKmL: 4.8 },
  torton: { name: "Torton 15 t", multiplier: 1.52, capacity: "15 t", tollClass: "C3", emptyKmL: 4.5, loadedKmL: 3.3 },
  trailer: { name: "Trailer 53 ft", multiplier: 1.9, capacity: "26 t / 53 ft", tollClass: "T3-S2", emptyKmL: 3.2, loadedKmL: 2.4 },
  full: { name: "Full / doble remolque", multiplier: 2.35, capacity: "Hasta 50 t", tollClass: "T3-S2-R4", emptyKmL: 2.5, loadedKmL: 1.8 }
};

const fields = [
  "client",
  "origin",
  "destination",
  "departure",
  "unitType",
  "kilometers",
  "ratePerKm",
  "marginPercent",
  "tolls",
  "extras",
  "fuelMode",
  "dieselPrice",
  "emptyKmL",
  "loadedKmL",
  "taxPercent",
  "avgSpeed",
  "loadHours",
  "bufferHours",
  "notes",
  "tollApiUrl"
];

const historyKey = "transport-quotes-history";
let lastRouteData = null;
let selectedPoints = { origin: null, destination: null };
let pickMode = "origin";
let routeMap = null;
let originMarker = null;
let destinationMarker = null;
let routeLine = null;
const formatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN"
});

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short"
});

const byId = (id) => document.getElementById(id);
const numberValue = (id) => Number(byId(id).value) || 0;
const money = (value) => formatter.format(Number.isFinite(value) ? value : 0);

function nowLocalInputValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function createFolio(index = 1) {
  return `COT-${String(index).padStart(4, "0")}`;
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(historyKey)) || [];
  } catch {
    return [];
  }
}

function saveHistory(items) {
  localStorage.setItem(historyKey, JSON.stringify(items.slice(0, 8)));
}

function getFormData() {
  return fields.reduce((data, field) => {
    data[field] = byId(field).value;
    return data;
  }, { routeData: lastRouteData, selectedPoints });
}

function setFormData(data) {
  fields.forEach((field) => {
    if (data[field] !== undefined) byId(field).value = data[field];
  });
  lastRouteData = data.routeData || null;
  selectedPoints = data.selectedPoints || pointsFromRouteData(lastRouteData);
  renderRouteData();
  renderMapPoints();
  calculateQuote();
}

function calculateQuote() {
  const unit = unitProfiles[byId("unitType").value];
  const kilometers = numberValue("kilometers");
  const ratePerKm = numberValue("ratePerKm");
  const marginPercent = numberValue("marginPercent");
  const tolls = numberValue("tolls");
  const extras = numberValue("extras");
  const taxPercent = numberValue("taxPercent");
  const avgSpeed = Math.max(numberValue("avgSpeed"), 1);
  const loadHours = numberValue("loadHours");
  const bufferHours = numberValue("bufferHours");

  const baseFreight = kilometers * ratePerKm;
  const unitAdjustment = baseFreight * (unit.multiplier - 1);
  const freightWithUnit = baseFreight + unitAdjustment;
  const marginAmount = freightWithUnit * (marginPercent / 100);
  const subtotal = freightWithUnit + marginAmount + tolls + extras;
  const taxAmount = subtotal * (taxPercent / 100);
  const total = subtotal + taxAmount;
  const routeHours = kilometers / avgSpeed;
  const totalHours = routeHours + loadHours + bufferHours;
  const departureValue = byId("departure").value;
  const arrival = departureValue ? new Date(new Date(departureValue).getTime() + totalHours * 3600000) : null;
  const origin = byId("origin").value.trim() || "Origen";
  const destination = byId("destination").value.trim() || "Destino";

  byId("summaryRoute").textContent = `${origin} -> ${destination}`;
  byId("unitBadge").textContent = unit.name;
  byId("unitCapacity").textContent = unit.capacity;
  byId("totalAmount").textContent = money(total);
  byId("travelTime").textContent = formatDuration(totalHours);
  byId("arrivalTime").textContent = arrival ? dateFormatter.format(arrival) : "Sin salida";
  byId("etaText").textContent = arrival ? `Llegada estimada: ${dateFormatter.format(arrival)}` : "Define una salida para calcular ETA";
  byId("effectiveRate").textContent = kilometers > 0 ? `${money(total / kilometers)} / km` : "$0.00 / km";
  byId("baseFreight").textContent = money(baseFreight);
  byId("unitAdjustment").textContent = money(unitAdjustment);
  byId("marginAmount").textContent = money(marginAmount);
  byId("tollsAmount").textContent = money(tolls);
  byId("extrasAmount").textContent = money(extras);
  byId("subtotalAmount").textContent = money(subtotal);
  byId("taxAmount").textContent = money(taxAmount);

  return {
    folio: byId("quoteFolio").textContent,
    client: byId("client").value.trim(),
    origin,
    destination,
    unit: unit.name,
    kilometers,
    total,
    subtotal,
    taxAmount,
    totalHours,
    arrival,
    routeData: lastRouteData,
    data: getFormData()
  };
}

function formatDuration(hours) {
  if (!Number.isFinite(hours) || hours <= 0) return "0 h";
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  if (minutes === 60) return `${wholeHours + 1} h`;
  return `${wholeHours} h ${String(minutes).padStart(2, "0")} min`;
}

function quoteText(quote) {
  const eta = quote.arrival ? dateFormatter.format(quote.arrival) : "Pendiente";
  const notes = byId("notes").value.trim();
  return [
    `Cotizacion ${quote.folio}`,
    `Cliente: ${quote.client || "Sin cliente"}`,
    `Ruta: ${quote.origin} -> ${quote.destination}`,
    `Unidad: ${quote.unit}`,
    `Kilometros: ${quote.kilometers}`,
    quote.routeData ? `Inicio exacto: ${quote.routeData.origin.displayName} (${quote.routeData.origin.lat}, ${quote.routeData.origin.lng})` : "",
    quote.routeData ? `Destino exacto: ${quote.routeData.destination.displayName} (${quote.routeData.destination.lat}, ${quote.routeData.destination.lng})` : "",
    `Tiempo estimado: ${formatDuration(quote.totalHours)}`,
    `ETA: ${eta}`,
    `Subtotal: ${money(quote.subtotal)}`,
    `IVA: ${money(quote.taxAmount)}`,
    `Total: ${money(quote.total)}`,
    notes ? `Observaciones: ${notes}` : ""
  ].filter(Boolean).join("\n");
}

async function calculateRouteAndTolls() {
  const originText = byId("origin").value.trim();
  const destinationText = byId("destination").value.trim();
  if (!selectedPoints.origin && !originText) {
    setRouteStatus("Marca el inicio en el mapa o escribe el origen.");
    return;
  }
  if (!selectedPoints.destination && !destinationText) {
    setRouteStatus("Marca el destino en el mapa o escribe el destino.");
    return;
  }

  setRouteStatus("Preparando puntos exactos...");
  byId("calculateRoute").disabled = true;

  try {
    const [originPoint, destinationPoint] = await Promise.all([
      selectedPoints.origin || geocodePlace(originText),
      selectedPoints.destination || geocodePlace(destinationText)
    ]);
    setRouteStatus("Calculando kilometros por carretera...");
    const route = await getRoadRoute(originPoint, destinationPoint);
    lastRouteData = {
      origin: originPoint,
      destination: destinationPoint,
      distanceKm: route.distanceKm,
      durationHours: route.durationHours,
      geometry: route.geometry,
      provider: "Nominatim + OSRM"
    };
    selectedPoints = { origin: originPoint, destination: destinationPoint };

    byId("kilometers").value = route.distanceKm.toFixed(1);
    if (route.durationHours > 0) {
      byId("avgSpeed").value = Math.max(Math.round(route.distanceKm / route.durationHours), 1);
    }

    await updateTollsFromApi(originPoint, destinationPoint, route);
    renderRouteData();
    renderMapPoints();
    drawRouteLine(route.geometry);
    calculateQuote();
    setRouteStatus("Ruta calculada con coordenadas y kilometros reales.");
  } catch (error) {
    setRouteStatus(error.message || "No se pudo calcular la ruta.");
  } finally {
    byId("calculateRoute").disabled = false;
  }
}

async function geocodePlace(query) {
  const results = await geocodePlaces(query, 1);
  return results[0];
}

async function geocodePlaces(query, limit = 5) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("countrycodes", "mx");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("q", query);

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error("No pude consultar coordenadas del punto.");
  const results = await response.json();
  if (!results.length) throw new Error(`No encontre coordenadas para: ${query}`);
  return results.map((point) => ({
    query,
    displayName: point.display_name,
    lat: Number(point.lat),
    lng: Number(point.lon),
    type: point.type || point.category || "direccion",
    importance: Number(point.importance) || 0
  }));
}

async function searchAddress(type) {
  const inputId = type === "origin" ? "origin" : "destination";
  const buttonId = type === "origin" ? "searchOrigin" : "searchDestination";
  const query = byId(inputId).value.trim();
  if (!query) {
    setRouteStatus(type === "origin" ? "Escribe la direccion de inicio." : "Escribe la direccion de destino.");
    return;
  }

  setRouteStatus(`Buscando ${type === "origin" ? "inicio" : "destino"} exacto...`);
  byId(buttonId).disabled = true;
  try {
    const points = await geocodePlaces(query, 6);
    renderAddressSuggestions(type, points);
    if (points.length === 1) {
      selectAddressPoint(type, points[0]);
    } else {
      setRouteStatus("Elige la coincidencia correcta para fijar el punto exacto.");
    }
  } catch (error) {
    renderAddressSuggestions(type, []);
    setRouteStatus(error.message || "No se pudo buscar la direccion.");
  } finally {
    byId(buttonId).disabled = false;
  }
}

function renderAddressSuggestions(type, points) {
  const container = byId(`${type}Suggestions`);
  container.innerHTML = "";
  if (!points.length) {
    const empty = document.createElement("p");
    empty.textContent = "Sin resultados para esa direccion.";
    container.appendChild(empty);
    return;
  }

  points.forEach((point) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "suggestion-item";
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    title.textContent = compactAddress(point.displayName);
    meta.textContent = `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
    item.append(title, meta);
    item.addEventListener("click", () => selectAddressPoint(type, point));
    container.appendChild(item);
  });
}

function selectAddressPoint(type, point) {
  selectedPoints[type] = point;
  lastRouteData = null;
  byId(type === "origin" ? "origin" : "destination").value = point.displayName;
  byId(`${type}Suggestions`).innerHTML = "";
  renderRouteData();
  renderMapPoints();
  calculateQuote();
  setPickMode(type === "origin" ? "destination" : "origin");
  setRouteStatus(`${type === "origin" ? "Inicio" : "Destino"} exacto seleccionado. Puedes calcular la ruta.`);
}

function compactAddress(address) {
  return address.split(",").map((part) => part.trim()).filter(Boolean).slice(0, 5).join(", ");
}

function clearSelectedPoint(type) {
  if (!selectedPoints[type]) return;
  selectedPoints[type] = null;
  lastRouteData = null;
  byId(`${type}Suggestions`).innerHTML = "";
  renderPoint(type, null);
  removeMapPoint(type);
  clearRouteLine();
  setRouteStatus(`${type === "origin" ? "Inicio" : "Destino"} actualizado. Busca la direccion o marca el punto en el mapa.`);
}

async function getRoadRoute(originPoint, destinationPoint) {
  const coords = `${originPoint.lng},${originPoint.lat};${destinationPoint.lng},${destinationPoint.lat}`;
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&alternatives=false&steps=false`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("No pude consultar kilometros por carretera.");
  const data = await response.json();
  if (!data.routes || !data.routes.length) throw new Error("No se encontro ruta carretera entre esos puntos.");
  const route = data.routes[0];
  return {
    distanceKm: route.distance / 1000,
    durationHours: route.duration / 3600,
    geometry: route.geometry
  };
}

function initMap() {
  if (!window.L) {
    byId("mapFallback").style.display = "grid";
    setRouteStatus("El mapa no cargo. Puedes calcular por texto o revisar tu conexion.");
    return;
  }

  byId("mapFallback").style.display = "none";
  routeMap = L.map("routeMap", { zoomControl: true }).setView([23.6345, -102.5528], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(routeMap);

  routeMap.on("click", (event) => {
    const point = createManualPoint(event.latlng.lat, event.latlng.lng, pickMode);
    selectedPoints[pickMode] = point;
    lastRouteData = null;
    renderRouteData();
    renderMapPoints();
    calculateQuote();
    setRouteStatus(`${pickMode === "origin" ? "Inicio" : "Destino"} marcado. Puedes marcar el otro punto o calcular la ruta.`);
    reverseLabelPoint(point, pickMode);
  });
}

function createManualPoint(lat, lng, type) {
  const fixedLat = Number(lat.toFixed(6));
  const fixedLng = Number(lng.toFixed(6));
  return {
    query: type === "origin" ? "Inicio manual" : "Destino manual",
    displayName: `${type === "origin" ? "Inicio" : "Destino"} exacto (${fixedLat}, ${fixedLng})`,
    lat: fixedLat,
    lng: fixedLng,
    manual: true
  };
}

async function reverseLabelPoint(point, type) {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", point.lat);
    url.searchParams.set("lon", point.lng);
    url.searchParams.set("zoom", "18");
    const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!response.ok) return;
    const data = await response.json();
    if (!data.display_name) return;
    selectedPoints[type] = { ...point, displayName: data.display_name };
    renderRouteData();
    renderMapPoints();
  } catch {
    // Las coordenadas exactas siguen siendo validas si la busqueda inversa no responde.
  }
}

function setPickMode(mode) {
  pickMode = mode;
  byId("pickOrigin").classList.toggle("active", mode === "origin");
  byId("pickDestination").classList.toggle("active", mode === "destination");
  setRouteStatus(mode === "origin" ? "Haz clic en el mapa para fijar el inicio exacto." : "Haz clic en el mapa para fijar el destino exacto.");
}

function renderMapPoints() {
  if (!routeMap || !window.L) return;

  if (selectedPoints.origin) {
    originMarker = upsertMarker(originMarker, selectedPoints.origin, "Inicio", "#0f766e", "origin");
  } else if (originMarker) {
    originMarker.remove();
    originMarker = null;
  }

  if (selectedPoints.destination) {
    destinationMarker = upsertMarker(destinationMarker, selectedPoints.destination, "Destino", "#b7791f", "destination");
  } else if (destinationMarker) {
    destinationMarker.remove();
    destinationMarker = null;
  }

  if (lastRouteData && lastRouteData.geometry) {
    drawRouteLine(lastRouteData.geometry);
  } else if (routeLine) {
    routeLine.remove();
    routeLine = null;
  }

  fitMapToCurrentRoute();
}

function removeMapPoint(type) {
  if (type === "origin" && originMarker) {
    originMarker.remove();
    originMarker = null;
  }
  if (type === "destination" && destinationMarker) {
    destinationMarker.remove();
    destinationMarker = null;
  }
}

function clearRouteLine() {
  if (!routeLine) return;
  routeLine.remove();
  routeLine = null;
}

function upsertMarker(marker, point, label, color, type) {
  const markerOptions = {
    draggable: true,
    title: label,
    icon: L.divIcon({
      className: "pin-icon",
      html: `<span style="background:${color}"><b>${label.slice(0, 1)}</b></span>`,
      iconSize: [28, 28],
      iconAnchor: [14, 28]
    })
  };
  const latLng = [point.lat, point.lng];
  const nextMarker = marker || L.marker(latLng, markerOptions).addTo(routeMap);
  nextMarker.setLatLng(latLng);
  nextMarker.bindPopup(`${label}: ${point.displayName}`);
  nextMarker.off("dragend");
  nextMarker.on("dragend", (event) => {
    const moved = event.target.getLatLng();
    selectedPoints[type] = createManualPoint(moved.lat, moved.lng, type);
    lastRouteData = null;
    renderRouteData();
    renderMapPoints();
    calculateQuote();
    reverseLabelPoint(selectedPoints[type], type);
  });
  return nextMarker;
}

function drawRouteLine(geometry) {
  if (!routeMap || !window.L || !geometry || !geometry.coordinates) return;
  const latLngs = geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  if (!routeLine) {
    routeLine = L.polyline(latLngs, { color: "#1d4ed8", weight: 5, opacity: 0.78 }).addTo(routeMap);
  } else {
    routeLine.setLatLngs(latLngs);
  }
  fitMapToCurrentRoute();
}

function fitMapToCurrentRoute() {
  if (!routeMap || !window.L) return;
  const bounds = [];
  if (routeLine) {
    routeMap.fitBounds(routeLine.getBounds(), { padding: [28, 28] });
    return;
  }
  if (selectedPoints.origin) bounds.push([selectedPoints.origin.lat, selectedPoints.origin.lng]);
  if (selectedPoints.destination) bounds.push([selectedPoints.destination.lat, selectedPoints.destination.lng]);
  if (bounds.length === 1) routeMap.setView(bounds[0], 13);
  if (bounds.length === 2) routeMap.fitBounds(bounds, { padding: [28, 28] });
}

function pointsFromRouteData(routeData) {
  if (!routeData) return { origin: null, destination: null };
  return {
    origin: routeData.origin || null,
    destination: routeData.destination || null
  };
}

async function updateTollsFromApi(originPoint, destinationPoint, route) {
  const endpoint = byId("tollApiUrl").value.trim();
  if (!endpoint) {
    byId("tollSource").value = "Manual";
    return;
  }

  setRouteStatus("Consultando casetas en API configurada...");
  const unit = unitProfiles[byId("unitType").value];
  const payload = {
    origin: originPoint,
    destination: destinationPoint,
    distanceKm: route.distanceKm,
    vehicleType: byId("unitType").value,
    tollClass: unit.tollClass,
    unitName: unit.name
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("La API de casetas no respondio correctamente.");
  const data = await response.json();
  const tollTotal = readTollTotal(data);
  if (tollTotal === null) throw new Error("La API respondio, pero no encontre el total de casetas.");
  byId("tolls").value = tollTotal.toFixed(2);
  byId("tollSource").value = data.source || data.provider || "API casetas";
  lastRouteData.tolls = {
    total: tollTotal,
    booths: data.booths || data.casetas || data.tolls || []
  };
}

function readTollTotal(data) {
  const candidates = [
    data.total,
    data.tollsTotal,
    data.tollTotal,
    data.peajeTotal,
    data.totalPeaje,
    data.casetasTotal,
    data.cost
  ];
  const value = candidates.find((candidate) => Number.isFinite(Number(candidate)));
  return value === undefined ? null : Number(value);
}

function renderRouteData() {
  if (!lastRouteData) {
    renderPoint("origin", selectedPoints.origin);
    renderPoint("destination", selectedPoints.destination);
    return;
  }

  renderPoint("origin", lastRouteData.origin);
  renderPoint("destination", lastRouteData.destination);
}

function renderPoint(type, point) {
  byId(`${type}Resolved`).textContent = point ? point.displayName : "Pendiente";
  byId(`${type}Coords`).textContent = point ? `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}` : "Sin coordenadas";
}

function setRouteStatus(message) {
  byId("routeStatus").textContent = message;
}

async function copyCurrentQuote() {
  const quote = calculateQuote();
  const text = quoteText(quote);
  try {
    await navigator.clipboard.writeText(text);
    flashButton("copyQuote", "Copiado");
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    flashButton("copyQuote", "Copiado");
  }
}

function flashButton(id, label) {
  const button = byId(id);
  const original = button.textContent;
  button.textContent = label;
  setTimeout(() => {
    button.textContent = original;
  }, 1400);
}

function saveCurrentQuote() {
  const history = getHistory();
  const quote = calculateQuote();
  const next = {
    ...quote,
    createdAt: new Date().toISOString(),
    data: getFormData()
  };
  saveHistory([next, ...history]);
  byId("quoteFolio").textContent = createFolio(getHistory().length + 1);
  renderHistory();
  flashButton("saveQuote", "Guardado");
}

function renderHistory() {
  const list = byId("historyList");
  const history = getHistory();
  list.innerHTML = "";

  if (!history.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Aun no hay cotizaciones guardadas.";
    list.appendChild(empty);
    return;
  }

  history.forEach((quote) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "history-item";
    const title = document.createElement("strong");
    const route = document.createElement("span");
    const meta = document.createElement("span");
    title.textContent = `${quote.folio} - ${money(quote.total)}`;
    route.textContent = `${quote.origin} -> ${quote.destination}`;
    meta.textContent = `${quote.unit} - ${dateFormatter.format(new Date(quote.createdAt))}`;
    item.append(title, route, meta);
    item.addEventListener("click", () => {
      byId("quoteFolio").textContent = quote.folio;
      setFormData(quote.data);
    });
    list.appendChild(item);
  });
}

function clearHistory() {
  localStorage.removeItem(historyKey);
  byId("quoteFolio").textContent = createFolio(1);
  renderHistory();
}

function init() {
  byId("departure").value = nowLocalInputValue();
  byId("quoteFolio").textContent = createFolio(getHistory().length + 1);
  byId("quoteForm").addEventListener("submit", (event) => event.preventDefault());
  fields.forEach((field) => byId(field).addEventListener("input", calculateQuote));
  byId("origin").addEventListener("input", () => clearSelectedPoint("origin"));
  byId("destination").addEventListener("input", () => clearSelectedPoint("destination"));
  byId("origin").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchAddress("origin");
    }
  });
  byId("destination").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchAddress("destination");
    }
  });
  byId("unitType").addEventListener("change", calculateQuote);
  byId("saveQuote").addEventListener("click", saveCurrentQuote);
  byId("copyQuote").addEventListener("click", copyCurrentQuote);
  byId("printQuote").addEventListener("click", () => window.print());
  byId("clearHistory").addEventListener("click", clearHistory);
  byId("calculateRoute").addEventListener("click", calculateRouteAndTolls);
  byId("searchOrigin").addEventListener("click", () => searchAddress("origin"));
  byId("searchDestination").addEventListener("click", () => searchAddress("destination"));
  byId("pickOrigin").addEventListener("click", () => setPickMode("origin"));
  byId("pickDestination").addEventListener("click", () => setPickMode("destination"));
  initMap();
  calculateQuote();
  renderHistory();
}

init();
