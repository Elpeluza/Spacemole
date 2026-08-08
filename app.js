/* global Cesium */

// -----------------------------------------------------------------------
// TOKEN DE CESIUM ION
// Reemplazá el string de abajo por tu propio token, generado en
// https://ion.cesium.com/tokens
// Esto evita los límites de uso del token de demostración que trae
// Cesium.js por defecto, y es necesario para producción.
// -----------------------------------------------------------------------
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2MDk4YTI2Ny1iMWY2LTQ1MTctOTU0My0yMDNhZTY1NDA0YWUiLCJpZCI6NDYzNjI2LCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoidW5kZWZpbmVkX2RlZmF1bHQiLCJpYXQiOjE3ODU4MDI5MzB9.nOiePrXCuGiAoEDbz_p6ESU7o53VNKRrqFiew3L7CDc";

// --- Captura de errores visible en pantalla (diagnóstico) -----------------
// Si algo falla en cualquier parte del script, en vez de fallar en
// silencio (o solo en la consola) lo mostramos directo en el infoPanel.
window.addEventListener("error", (event) => {
  const panel = document.getElementById("infoPanel");
  if (panel) {
    panel.textContent = `ERROR: ${event.message}`;
    panel.style.color = "#ff6b6b";
  }
});
window.addEventListener("unhandledrejection", (event) => {
  const panel = document.getElementById("infoPanel");
  if (panel) {
    panel.textContent = `ERROR (promise): ${event.reason}`;
    panel.style.color = "#ff6b6b";
  }
});

const initialView = {
  destination: Cesium.Cartesian3.fromDegrees(0, 15, 10_000_000),
  orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-45), roll: 0 },
};

// -----------------------------------------------------------------------
// FIX PRINCIPAL: en Cesium 1.104+ (y ya de forma definitiva en 1.123) los
// constructores directos de imagery/terrain providers como
// `new Cesium.ArcGisMapServerImageryProvider(...)` fueron removidos a favor
// de métodos estáticos asíncronos. Llamar al constructor viejo tira una
// excepción al crear el Viewer, y por eso el globo nunca se veía, sin
// importar qué tan bien estuviera el resto del código.
//
// La forma correcta es usar `ArcGisMapServerImageryProvider.fromUrl(url)`
// (devuelve una Promise) envuelto en `ImageryLayer.fromProviderAsync`, que
// te da una capa utilizable de inmediato como `baseLayer` del Viewer aunque
// el provider todavía se esté resolviendo en segundo plano.
// -----------------------------------------------------------------------
const viewer = new Cesium.Viewer("cesiumContainer", {
  // Esri World Imagery: mosaico satelital/aéreo de alta resolución
  // (hasta ~30cm en zonas urbanas, 1m o mejor en gran parte del mundo).
  // El propio MapServer selecciona automáticamente el nivel de detalle
  // correcto según el zoom de la cámara.
  baseLayer: Cesium.ImageryLayer.fromProviderAsync(
    Cesium.ArcGisMapServerImageryProvider.fromUrl(
      "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer"
    ),
    {}
  ),
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  navigationHelpButton: false,
  sceneModePicker: false,
  timeline: false,
  animation: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
  // -------------------------------------------------------------------
  // RELIEVE REAL: se reemplaza el EllipsoidTerrainProvider (matemáticamente
  // liso, sin montañas ni valles) por Cesium World Terrain, un dataset de
  // elevación global real derivado de fuentes como SRTM, ArcticDEM, y otros.
  // Ahora usa tu token propio (definido arriba) en vez del token de
  // demostración, así que no tenés los límites de uso compartidos.
  // -------------------------------------------------------------------
  terrain: Cesium.Terrain.fromWorldTerrain({
    requestWaterMask: true, // reflejos realistas en océanos/lagos
    requestVertexNormals: true, // iluminación correcta sobre el relieve
  }),
  scene3DOnly: true,
});

viewer.scene.globe.enableLighting = true;
viewer.scene.globe.showGroundAtmosphere = true;
viewer.scene.skyAtmosphere = new Cesium.SkyAtmosphere();
viewer.scene.fog.enabled = true;
viewer.scene.sun.show = true;
viewer.scene.shadows = true;

// Exageración vertical opcional: descomentar si querés que las montañas
// se noten más al acercar la cámara (útil en vistas de escala regional,
// ya que a escala planetaria el relieve real es casi imperceptible).
// viewer.scene.verticalExaggeration = 2.5;

// -----------------------------------------------------------------------
// Capa de referencia (calles, ciudades, límites políticos) con fondo
// transparente sobre la imagen satelital.
//
// NOTA IMPORTANTE: Esri deprecó los servicios legacy
// "Reference/World_Boundaries_and_Places" y "Reference/World_Transportation"
// hace unos años — desde entonces exigen API key con cuenta de ArcGIS
// Developer para servir tiles (el endpoint responde bien a "?f=json" con
// metadata, pero ya no entrega imágenes sin autenticación, por eso no se
// veía nada y tampoco había error de JS: el fallo ocurre silenciosamente
// dentro del pipeline de tiles de Cesium).
//
// En su lugar usamos las tiles "only_labels" de CARTO: gratuitas, sin
// necesidad de registro ni API key, con fondo transparente y que incluyen
// tanto etiquetas de país/ciudad (zoom lejano) como nombres de calles y
// rutas (zoom cercano) en una sola capa. Atribución obligatoria: © CARTO,
// © OpenStreetMap contributors (ya agregada en el footer del HTML).
// -----------------------------------------------------------------------
const referenceLayer = new Cesium.ImageryLayer(
  new Cesium.UrlTemplateImageryProvider({
    url: "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png",
    subdomains: ["a", "b", "c", "d"],
    credit: "Labels © CARTO, © OpenStreetMap contributors",
    tilingScheme: new Cesium.WebMercatorTilingScheme(),
    maximumLevel: 19,
  }),
  { alpha: 0.85 }
);
viewer.imageryLayers.add(referenceLayer);

viewer.clock.currentTime = Cesium.JulianDate.now();
viewer.clock.clockRange = Cesium.ClockRange.UNBOUNDED;
viewer.clock.clockStep = Cesium.ClockStep.SYSTEM_CLOCK;
viewer.clock.multiplier = 1;
viewer.clock.shouldAnimate = true;

// -----------------------------------------------------------------------
// NOTA: no se agrega ninguna entidad esférica manual para representar la
// Tierra. El Viewer YA renderiza el globo real (elipsoide WGS84) con la
// imagen satelital de ArcGIS de arriba. Agregar una esfera extra ahí
// generaba conflictos de profundidad con `depthTestAgainstTerrain=true`.
// -----------------------------------------------------------------------

const moonOrbitRadius = 384_400_000; // meters
const moonInclination = Cesium.Math.toRadians(5.145);
const lunarPeriodSeconds = 27.321661 * 86400;
const orbitCache = [];
for (let i = 0; i <= 180; i += 4) {
  const angle = Cesium.Math.TWO_PI * (i / 180);
  orbitCache.push(Cesium.Cartesian3.fromElements(
    moonOrbitRadius * Math.cos(angle),
    moonOrbitRadius * Math.sin(angle) * Math.cos(moonInclination),
    moonOrbitRadius * Math.sin(angle) * Math.sin(moonInclination)
  ));
}

// Epoch fijo para que la órbita avance de verdad con el reloj de la escena
// (antes se comparaba contra "ahora" en cada tick y el desfasaje era ~0).
const orbitEpoch = Cesium.JulianDate.now();

const moonPosition = new Cesium.CallbackProperty(() => {
  const now = viewer.clock.currentTime;
  const elapsed = Cesium.JulianDate.secondsDifference(now, orbitEpoch);
  const angle = Cesium.Math.TWO_PI * ((elapsed % lunarPeriodSeconds) / lunarPeriodSeconds);
  const x = moonOrbitRadius * Math.cos(angle);
  const y = moonOrbitRadius * Math.sin(angle) * Math.cos(moonInclination);
  const z = moonOrbitRadius * Math.sin(angle) * Math.sin(moonInclination);
  return new Cesium.Cartesian3(x, y, z);
}, false);

viewer.entities.add({
  name: "Luna",
  position: moonPosition,
  ellipsoid: {
    radii: new Cesium.Cartesian3(1_737_400, 1_737_400, 1_737_400),
    material: new Cesium.ImageMaterialProperty({
      // Textura incluida en el propio paquete de Cesium (no depende de una
      // URL externa que puede desaparecer o dar 404).
      image: Cesium.buildModuleUrl("Assets/Textures/moonSmall.jpg"),
      repeat: new Cesium.Cartesian2(1, 1),
    }),
  },
  label: {
    text: "Luna",
    font: "14px Inter, sans-serif",
    fillColor: Cesium.Color.WHITE,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    outlineColor: Cesium.Color.BLACK,
    outlineWidth: 2,
    pixelOffset: new Cesium.Cartesian2(0, -42),
    translucencyByDistance: new Cesium.NearFarScalar(1_000_000.0, 1.0, 120_000_000.0, 0.1),
  },
});

viewer.entities.add({
  name: "Órbita Lunar",
  polyline: {
    positions: orbitCache,
    width: 1.6,
    material: new Cesium.PolylineGlowMaterialProperty({
      glowPower: 0.12,
      color: Cesium.Color.SILVER.withAlpha(0.55),
    }),
    clampToGround: false,
  },
});

viewer.scene.globe.depthTestAgainstTerrain = true;
viewer.camera.setView(initialView);

const infoPanel = document.getElementById("infoPanel");
const formatDate = (date) => date.toLocaleString("es-AR", {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

viewer.clock.onTick.addEventListener(() => {
  const now = Cesium.JulianDate.toDate(viewer.clock.currentTime);
  const speedLabel = viewer.clock.shouldAnimate
    ? `${viewer.clock.multiplier}x`
    : "pausado";
  infoPanel.textContent = `Hora UTC: ${formatDate(now)} · Velocidad: ${speedLabel}`;
});

// --- Navegación básica -------------------------------------------------
document.querySelector("#homeButton").addEventListener("click", () => viewer.camera.flyTo(initialView));
document.querySelector("#locateButton").addEventListener("click", () => {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(-58.3816, -34.6037, 28_000),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-50), roll: 0 },
    duration: 1.6,
  });
});

// Centrar la Tierra en pantalla y viajar hacia ella: vista cenital desde
// una distancia donde el globo completo entra en cámara.
document.querySelector("#earthButton").addEventListener("click", () => {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(0, 0, 22_000_000),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
    duration: 2.4,
  });
});

// --- Control de tiempo ---------------------------------------------------
const speedSteps = [0.25, 0.5, 1, 2, 5, 10, 50, 100, 500, 1000, 5000];
let speedIndex = speedSteps.indexOf(1);

const playPauseButton = document.querySelector("#playPauseButton");
const speedUpButton = document.querySelector("#speedUpButton");
const speedDownButton = document.querySelector("#speedDownButton");
const resetTimeButton = document.querySelector("#resetTimeButton");

function applySpeed() {
  viewer.clock.multiplier = speedSteps[speedIndex];
}

playPauseButton.addEventListener("click", () => {
  viewer.clock.shouldAnimate = !viewer.clock.shouldAnimate;
  playPauseButton.textContent = viewer.clock.shouldAnimate ? "⏸" : "▶";
});

speedUpButton.addEventListener("click", () => {
  speedIndex = Math.min(speedIndex + 1, speedSteps.length - 1);
  applySpeed();
});

speedDownButton.addEventListener("click", () => {
  speedIndex = Math.max(speedIndex - 1, 0);
  applySpeed();
});

resetTimeButton.addEventListener("click", () => {
  viewer.clock.currentTime = Cesium.JulianDate.now();
  speedIndex = speedSteps.indexOf(1);
  applySpeed();
  viewer.clock.shouldAnimate = true;
  playPauseButton.textContent = "⏸";
});

// --- Zoom con numpad 1 / 2 ------------------------------------------------
// Se usa event.code (tecla física) en vez de event.key para que funcione
// sin importar el estado de NumLock. preventDefault evita que el navegador
// intercepte la tecla.
document.addEventListener("keydown", (event) => {
  if (event.code === "Numpad1") {
    viewer.camera.zoomIn(250_000);
    event.preventDefault();
  }

  if (event.code === "Numpad2") {
    viewer.camera.zoomOut(250_000);
    event.preventDefault();
  }
});