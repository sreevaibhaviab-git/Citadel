import {
  assets,
  cameraPresets,
  CENTER_LAT,
  CENTER_LON,
  edges,
  nodes,
  toLonLat,
} from './config';
import type { CitySim } from './sim';
import type { Vehicle } from './types';
import { dependencyRelations } from './dependencies';

const C = () => window.Cesium;

const COLORS = {
  roadBase: '#4b5a68',
  roadArterial: '#7d8fa0',
  moderate: '#d6b447',
  heavy: '#d98232',
  gridlock: '#c8453a',
  hospital: '#4ec9b0',
  power: '#e0b84c',
  water: '#4aa3d9',
  fire: '#d9614a',
  ems: '#e8e8e8',
  transit: '#8f9fb0',
};

function css(hex: string, alpha = 1) {
  return C().Color.fromCssColorString(hex).withAlpha(alpha);
}

function pos(x: number, y: number, h = 0) {
  const [lon, lat] = toLonLat(x, y);
  return C().Cartesian3.fromDegrees(lon, lat, h);
}

/* --------------------------------------------------------------------------
   VIEWER
   -------------------------------------------------------------------------- */

export function createViewer(container: HTMLElement) {
  const Cesium = C();
  const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN?.trim();
  if (ionToken) Cesium.Ion.defaultAccessToken = ionToken;

  // With a token, let Cesium use its normal high-quality imagery stack.
  // Without one, fall back to plain OpenStreetMap so the app still runs and
  // never shows an "API KEY REQUIRED" watermark.
  const options: any = {
    baseLayerPicker: false,
    // Google Photorealistic 3D Tiles require the Google geocoder configuration.
    // The widget itself is hidden in CSS; this is only the provider setting.
    geocoder: ionToken && Cesium.IonGeocodeProviderType ? Cesium.IonGeocodeProviderType.GOOGLE : false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    shouldAnimate: false,
  };

  if (!ionToken) {
    options.baseLayer = new Cesium.ImageryLayer(
      new Cesium.OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/',
        credit: '© OpenStreetMap contributors',
      })
    );
    options.terrainProvider = new Cesium.EllipsoidTerrainProvider();
  }

  const viewer = new Cesium.Viewer(container, options);

  if (ionToken && Cesium.createWorldTerrainAsync) {
    Cesium.createWorldTerrainAsync()
      .then((terrain: any) => {
        viewer.terrainProvider = terrain;
      })
      .catch(() => {
        // Keep the ellipsoid fallback if terrain is unavailable.
      });
  }

  viewer.scene.globe.enableLighting = true;
  viewer.scene.globe.baseColor = css('#0b0f14');
  viewer.scene.highDynamicRange = true;
  viewer.scene.fog.enabled = true;
  viewer.scene.skyAtmosphere.show = true;
  const cameraController = viewer.scene.screenSpaceCameraController;
  cameraController.minimumZoomDistance = 120;
  cameraController.maximumZoomDistance = 7000;
  cameraController.inertiaZoom = 0.72;
  cameraController.inertiaTranslate = 0.78;
  cameraController.inertiaSpin = 0.72;
  cameraController.maximumMovementRatio = 0.085;
  cameraController.bounceAnimationTime = 0.35;
  viewer.scene.postProcessStages.fxaa.enabled = true;

  return viewer;
}

/* --------------------------------------------------------------------------
   WORLD
   -------------------------------------------------------------------------- */

export interface World {
  update: (dt?: number) => void;
  applyEnvironment: () => void;
  flyPreset: (id: string) => void;
  flyToLonLat: (lon: number, lat: number, range?: number) => void;
  setViewMode: (mode: '2D' | '3D') => void;
  zoomBy: (direction: 'IN' | 'OUT') => void;
  destroy: () => void;
}

export function buildWorld(viewer: any, sim: CitySim): World {
  const Cesium = C();
  const ents = viewer.entities;
  ents.suspendEvents();

  /* ---- real 3D city fabric ---- */
  const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN?.trim();
  let cityTileset: any = null;
  let cityIsPhotorealistic = false;
  let viewMode: '2D' | '3D' = '3D';

  // REAL CITY FABRIC ONLY. No generated box-buildings are ever rendered.
  // Prefer Google Photorealistic 3D Tiles; fall back to Cesium OSM Buildings.
  if (ionToken) {
    const addTileset = (tileset: any, photorealistic = false) => {
      cityTileset = tileset;
      cityIsPhotorealistic = photorealistic;
      tileset.show = viewMode === '3D';
      if ('maximumScreenSpaceError' in tileset) tileset.maximumScreenSpaceError = photorealistic ? 8 : 3;
      if ('dynamicScreenSpaceError' in tileset) tileset.dynamicScreenSpaceError = true;
      viewer.scene.primitives.add(tileset);
      if (photorealistic && viewMode === '3D' && viewer.scene.globe) {
        // Google tiles include the ground surface; hiding the globe prevents a flat map
        // from visually fighting the photogrammetry.
        viewer.scene.globe.show = false;
      }
      (window as any).__CITADEL_3D_MODE__ = photorealistic ? 'PHOTOREALISTIC' : 'OSM_3D';
    };

    const loadOsmBuildings = () => {
      if (viewer.scene.globe) viewer.scene.globe.show = true;
      if (!Cesium.createOsmBuildingsAsync) return;
      Cesium.createOsmBuildingsAsync({ showOutline: false })
        .then((tileset: any) => addTileset(tileset, false))
        .catch((err: any) => console.warn('CITADEL // OSM BUILDINGS UNAVAILABLE', err));
    };

    if (Cesium.createGooglePhotorealistic3DTileset) {
      Cesium.createGooglePhotorealistic3DTileset({ onlyUsingWithGoogleGeocoder: true })
        .then((tileset: any) => addTileset(tileset, true))
        .catch((err: any) => {
          console.warn('CITADEL // PHOTOREALISTIC 3D UNAVAILABLE, USING OSM 3D', err);
          loadOsmBuildings();
        });
    } else {
      loadOsmBuildings();
    }
  } else {
    (window as any).__CITADEL_3D_MODE__ = 'MAP_ONLY';
  }

  /* ---- roads ---- */
  const roadEnts = edges.map((e) => {
    const a = nodes[e.a];
    const b = nodes[e.b];
    return ents.add({
      id: `road-${e.key}`,
      polyline: {
        positions: [pos(a.x, a.y, 1.5), pos(b.x, b.y, 1.5)],
        width: e.arterial ? 5 : 3,
        material: css(e.arterial ? COLORS.roadArterial : COLORS.roadBase, 0.72),
        clampToGround: true,
      },
      properties: { kind: 'ROAD', edgeKey: e.key, corridor: e.corridor },
    });
  });

  const roadLabelEnts = edges.map((e) => {
    const a = nodes[e.a]; const b = nodes[e.b];
    return ents.add({
      id: `road-label-${e.key}`,
      position: pos((a.x + b.x) / 2, (a.y + b.y) / 2, 4),
      label: {
        text: new Cesium.CallbackProperty(() => {
          const free = e.liveFreeFlowSpeedKmh > 0 ? e.liveFreeFlowSpeedKmh : (e.arterial ? 45 : 32);
          const current = e.liveCurrentSpeedKmh > 0 ? e.liveCurrentSpeedKmh : free * Math.max(0.08, Math.min(1, 1 - e.load * 0.35));
          return `${e.corridor} // ${Math.round(current)} KM/H // ${e.modelVehicleCount} MODEL VEH`;
        }, false),
        font: '10px "JetBrains Mono", monospace',
        fillColor: css('#eef8ff', 0.96),
        showBackground: true,
        backgroundColor: css('#061019', 0.9),
        backgroundPadding: new Cesium.Cartesian2(6, 4),
        pixelOffset: new Cesium.Cartesian2(0, -12),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1800),
      },
      show: false,
      properties: { kind: 'ROAD', edgeKey: e.key, corridor: e.corridor },
    });
  });

  /* ---- REAL TomTom traffic-flow road geometry ----
     These are the road segments actually returned by the Traffic Flow API.
     They sit over the map independently of the synthetic resilience graph. */
  const liveTrafficEnts = new Map<string, any>();
  function syncLiveTrafficRoads() {
    const samples = sim.liveTraffic.samples.filter((sample) => sample.coordinates.length >= 2);
    const liveIds = new Set(samples.map((s) => s.id));
    liveTrafficEnts.forEach((entity, id) => {
      if (!liveIds.has(id)) { ents.remove(entity); liveTrafficEnts.delete(id); }
    });
    samples.forEach((sample) => {
      const ratio = sample.freeFlowSpeedKmh > 0 ? sample.currentSpeedKmh / sample.freeFlowSpeedKmh : 1;
      const congestion = Math.max(0, Math.min(100, (1 - ratio) * 100));
      const colour = sample.roadClosure ? '#ff4036' : congestion > 70 ? COLORS.gridlock : congestion > 50 ? COLORS.heavy : congestion > 25 ? COLORS.moderate : '#54c68a';
      const positions = sample.coordinates.map((c) => Cesium.Cartesian3.fromDegrees(c.lon, c.lat, 2));
      const selected = sim.selectedId === `LIVE_TRAFFIC:${sample.id}`;
      const existing = liveTrafficEnts.get(sample.id);
      if (existing) {
        existing.polyline.positions = positions;
        existing.polyline.width = selected ? 11 : 7;
        existing.polyline.material = new Cesium.PolylineGlowMaterialProperty({ color: css(colour, 0.98), glowPower: selected ? 0.24 : 0.12 });
        return;
      }
      const entity = ents.add({
        id: `live-traffic-${sample.id}`,
        polyline: {
          positions,
          width: selected ? 11 : 7,
          clampToGround: true,
          material: new Cesium.PolylineGlowMaterialProperty({ color: css(colour, 0.98), glowPower: selected ? 0.24 : 0.12 }),
        },
        properties: { kind: 'LIVE_TRAFFIC_ROAD', sampleId: sample.id },
      });
      liveTrafficEnts.set(sample.id, entity);
    });
  }

  /* Selected arbitrary-map point for the 15 km emergency-resource query. */
  let probeEnt: any = null;
  let probeId = '';
  function syncMapProbe() {
    const probe = sim.mapProbe;
    if (!probe) {
      if (probeEnt) { ents.remove(probeEnt); probeEnt = null; probeId = ''; }
      return;
    }
    if (probeId === probe.id && probeEnt) return;
    if (probeEnt) ents.remove(probeEnt);
    probeId = probe.id;
    probeEnt = ents.add({
      id: `probe-${probe.id}`,
      position: Cesium.Cartesian3.fromDegrees(probe.lon, probe.lat, 0),
      point: {
        pixelSize: 12,
        color: css('#67d9ff', 0.95),
        outlineColor: css('#ffffff', 0.9),
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      ellipse: {
        semiMajorAxis: 15000,
        semiMinorAxis: 15000,
        material: css('#67d9ff', 0.035),
        outline: true,
        outlineColor: css('#67d9ff', 0.34),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
      properties: { kind: 'MAP_PROBE' },
    });
  }

  /* ---- infrastructure assets ---- */
  const assetEnts: any[] = [];
  assets.forEach((a) => {
    const colour =
      a.kind === 'HOSPITAL'
        ? COLORS.hospital
        : a.kind === 'POWER'
        ? COLORS.power
        : a.kind === 'WATER'
        ? COLORS.water
        : a.kind === 'FIRE'
        ? COLORS.fire
        : a.kind === 'EMS'
        ? COLORS.ems
        : COLORS.transit;

    assetEnts.push(ents.add({
      id: `asset-${a.id}`,
      position: pos(a.x, a.y, 0),
      point: {
        pixelSize: new Cesium.CallbackProperty(() => {
          const dep = sim.dependencyAnalysis();
          if (dep?.sourceAssetId === a.id) return 17;
          const hit = dep?.affected.find((n) => n.assetId === a.id);
          if (hit) return hit.depth === 1 ? 15 : 12;
          return a.status === 'FAILED' ? 14 : a.status === 'CRITICAL' ? 12 : 9;
        }, false),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        color: new Cesium.CallbackProperty(() => {
          if (a.status === 'FAILED') return css('#ff3d32', 1);
          if (a.status === 'RECOVERING') return css('#55a8ff', 1);
          if (a.status === 'CRITICAL') return css('#ef6a3a', 1);
          if (a.status === 'WARNING') return css('#dfbf55', 1);
          return css(colour, 0.95);
        }, false),
        outlineColor: new Cesium.CallbackProperty(() => {
          const dep = sim.dependencyAnalysis();
          if (dep?.sourceAssetId === a.id) return css('#ffffff', 1);
          const hit = dep?.affected.find((n) => n.assetId === a.id);
          if (hit) return css(hit.hiddenPath ? '#c989ff' : hit.depth === 1 ? '#58e6ff' : '#7e9dff', 1);
          return a.status === 'FAILED' ? css('#ffffff', 0.9) : css('#000000', 0.6);
        }, false),
        outlineWidth: new Cesium.CallbackProperty(() => {
          const dep = sim.dependencyAnalysis();
          if (dep?.sourceAssetId === a.id || dep?.affected.some((n) => n.assetId === a.id)) return 4;
          return a.status === 'FAILED' ? 3 : 2;
        }, false),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: new Cesium.CallbackProperty(
          () => {
            const dep = sim.dependencyAnalysis();
            if (dep?.sourceAssetId === a.id) return `${a.id} // TRACE SOURCE`;
            const hit = dep?.affected.find((n) => n.assetId === a.id);
            if (hit) return `${a.id} // D${hit.depth}${hit.hiddenPath ? ' // HIDDEN' : ''}`;
            return `${a.id} // ${a.status === 'FAILED' ? 'FAILED' : a.status === 'RECOVERING' ? 'RECOVERING' : `${Math.round(a.primary)}%`}`;
          },
          false
        ),
        font: '11px "JetBrains Mono", monospace',
        fillColor: new Cesium.CallbackProperty(
          () => css(a.status === 'FAILED' ? '#ff6b61' : a.status === 'RECOVERING' ? '#70b7ff' : a.status === 'CRITICAL' ? COLORS.gridlock : a.status === 'WARNING' ? COLORS.moderate : '#c9d6e2', 0.95),
          false
        ),
        showBackground: true,
        backgroundColor: css('#05070a', 0.72),
        backgroundPadding: new Cesium.Cartesian2(6, 4),
        pixelOffset: new Cesium.Cartesian2(0, -24),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1650),
      
      },
      properties: { kind: 'ASSET', assetId: a.id, layer: a.layer },
    }));
  });

  /* ---- dependency intelligence links ---- */
  const dependencyEnts = dependencyRelations.map((rel) => {
    const a = assets.find((x) => x.id === rel.from)!;
    const b = assets.find((x) => x.id === rel.to)!;
    return ents.add({
      id: `dep-${rel.id}`,
      polyline: {
        positions: [pos(a.x, a.y, 90), pos(b.x, b.y, 90)],
        width: 2,
        material: new Cesium.PolylineDashMaterialProperty({
          color: css(rel.hidden ? '#c989ff' : rel.backup ? '#55d69a' : '#58e6ff', rel.hidden ? 0.88 : 0.78),
          dashLength: rel.hidden ? 8 : rel.backup ? 18 : 12,
        }),
      },
      properties: { kind: 'DEPENDENCY', relationId: rel.id },
      show: false,
    });
  });

  const alternativeEnts = new Map<string, any>();
  function syncDependencyAlternatives() {
    const analysis = sim.dependencyAnalysis();
    const desired = new Set<string>();
    if (analysis && sim.layers.DEPENDENCIES) {
      analysis.alternatives.forEach((alt) => {
        if (!alt.replacementAssetId) return;
        const from = assets.find((a) => a.id === alt.replacementAssetId);
        const to = assets.find((a) => a.id === alt.targetAssetId);
        if (!from || !to) return;
        desired.add(alt.id);
        let ent = alternativeEnts.get(alt.id);
        if (!ent) {
          ent = ents.add({
            id: `dep-alt-${alt.id}`,
            polyline: {
              positions: [pos(from.x, from.y, 110), pos(to.x, to.y, 110)],
              width: 3,
              material: new Cesium.PolylineDashMaterialProperty({ color: css('#55d69a', 0.95), dashLength: 22 }),
            },
            label: {
              text: 'BACKUP',
              font: '10px "JetBrains Mono", monospace',
              fillColor: css('#75efb2', .95),
              showBackground: true,
              backgroundColor: css('#04110b', .78),
              pixelOffset: new Cesium.Cartesian2(0, -10),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            position: pos((from.x + to.x) / 2, (from.y + to.y) / 2, 120),
            show: true,
          });
          alternativeEnts.set(alt.id, ent);
        }
        ent.show = true;
      });
    }
    alternativeEnts.forEach((ent, id) => { if (!desired.has(id)) ent.show = false; });
  }

  /* ---- vehicles ---- */
  const GROUND_VEHICLE =
    'https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/models/GroundVehicle/GroundVehicle.glb';
  const MILK_TRUCK =
    'https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/models/CesiumMilkTruck/CesiumMilkTruck.glb';

  const vehicleEnts = sim.vehicles.map((v) => {
    const modelUri = v.kind === 'BUS' || v.kind === 'TRUCK' || v.emergency ? MILK_TRUCK : GROUND_VEHICLE;
    return ents.add({
      id: `veh-${v.id}`,
      position: new Cesium.CallbackProperty(() => (
        Number.isFinite(v.geoLat) && Number.isFinite(v.geoLon)
          ? Cesium.Cartesian3.fromDegrees(v.geoLon, v.geoLat, 0)
          : pos(v.x, v.y, 0)
      ), false),
      orientation: new Cesium.CallbackProperty(() => {
        const p = Number.isFinite(v.geoLat) && Number.isFinite(v.geoLon)
          ? Cesium.Cartesian3.fromDegrees(v.geoLon, v.geoLat, 0)
          : pos(v.x, v.y, 0);
        return Cesium.Transforms.headingPitchRollQuaternion(
          p,
          new Cesium.HeadingPitchRoll(v.heading, 0, 0)
        );
      }, false),
      model: {
        uri: modelUri,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        minimumPixelSize: v.emergency ? 18 : v.kind === 'BUS' ? 17 : 14,
        maximumScale: v.kind === 'BUS' ? 1.6 : 1.35,
        color: new Cesium.CallbackProperty(() => vehicleColour(v), false),
        colorBlendMode: Cesium.ColorBlendMode.MIX,
        colorBlendAmount: 0.35,
        silhouetteColor: new Cesium.CallbackProperty(
          () => (v.emergency && v.status !== 'STANDBY' ? css('#ffffff', 0.85) : css('#000000', 0)),
          false
        ),
        silhouetteSize: new Cesium.CallbackProperty(
          () => (v.emergency && v.status !== 'STANDBY' ? 1.4 : 0),
          false
        ),
        runAnimations: true,
      },
      label: v.emergency
        ? {
            text: new Cesium.CallbackProperty(() => (v.status === 'STANDBY' ? '' : v.id), false),
            font: '10px "JetBrains Mono", monospace',
            fillColor: css('#ffffff', 0.95),
            showBackground: true,
            backgroundColor: css('#05070a', 0.72),
            backgroundPadding: new Cesium.Cartesian2(5, 3),
            pixelOffset: new Cesium.Cartesian2(0, -24),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          }
        : undefined,
      properties: { kind: 'VEHICLE', vehicleId: v.id, emergency: v.emergency },
    });
  });

  function vehicleColour(v: Vehicle) {
    if (v.kind === 'EMS') return css(v.status === 'STANDBY' ? '#8fa4b8' : '#ffffff', 1);
    if (v.kind === 'FIRE') return css(v.status === 'STANDBY' ? '#8a5a52' : COLORS.fire, 1);
    if (v.kind === 'POLICE') return css(v.status === 'STANDBY' ? '#5c7a94' : '#5aa9e6', 1);
    const night = isNight();
    if (v.kind === 'BUS') return css('#d6b447', night ? 1 : 0.85);
    if (v.kind === 'TRUCK') return css('#9aa8b5', night ? 1 : 0.8);
    return css(night ? '#eaf2ff' : '#7fd4e8', night ? 1 : 0.85);
  }

  /* ---- pedestrians ---- */
  const pedEnts = sim.pedestrians.map((p, i) =>
    ents.add({
      id: `ped-${p.id}`,
      position: new Cesium.CallbackProperty(() => pos(p.x, p.y, 0), false),
      point: {
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        pixelSize: 3,
        color: new Cesium.CallbackProperty(
          () => css(p.fleeing ? COLORS.heavy : '#93a7b8', 0.85),
          false
        ),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      show: false,
      properties: { kind: 'PEDESTRIAN', index: i },
    })
  );

  /* ---- traffic signals ---- */
  const signalEnts = sim.signals.map((s) =>
    ents.add({
      id: `sig-${s.node}`,
      position: pos(nodes[s.node].x, nodes[s.node].y, 0),
      point: {
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        pixelSize: 6,
        color: new Cesium.CallbackProperty(
          () =>
            css(
              s.state === 'PRIORITY'
                ? '#ffffff'
                : s.state === 'GREEN'
                ? '#4ec9b0'
                : s.state === 'AMBER'
                ? COLORS.moderate
                : COLORS.gridlock,
              0.95
            ),
          false
        ),
        outlineColor: css('#04070b', 0.8),
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      properties: { kind: 'SIGNAL' },
    })
  );

  /* ---- public mapped response / safe facilities (OpenStreetMap live query) ---- */
  const facilityEnts = new Map<string, any>();
  function syncLiveFacilities() {
    const liveIds = new Set(sim.liveFacilities.map((f) => f.id));
    facilityEnts.forEach((entity, id) => {
      if (!liveIds.has(id)) { ents.remove(entity); facilityEnts.delete(id); }
    });
    sim.liveFacilities.forEach((f) => {
      if (facilityEnts.has(f.id)) return;
      const colour = f.kind === 'HOSPITAL' ? '#4ec9b0' : f.kind === 'FIRE' ? '#d9614a' : f.kind === 'POLICE' ? '#5aa9e6' : '#62d9a7';
      const entity = ents.add({
        id: `live-${f.id}`,
        position: Cesium.Cartesian3.fromDegrees(f.lon, f.lat, 0),
        point: {
          pixelSize: f.kind === 'SAFE' ? 7 : 8,
          color: css(colour, 0.92),
          outlineColor: css('#ffffff', 0.7),
          outlineWidth: 1,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `${f.kind} // ${f.name}`,
          font: '9px "JetBrains Mono", monospace',
          fillColor: css('#e9f4ff', 0.88),
          showBackground: true,
          backgroundColor: css('#05070a', 0.7),
          backgroundPadding: new Cesium.Cartesian2(4, 3),
          pixelOffset: new Cesium.Cartesian2(0, -16),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2400),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: { kind: 'LIVE_FACILITY', facilityId: f.id },
      });
      facilityEnts.set(f.id, entity);
    });
  }

  /* ---- incident + corridor layers (rebuilt on change) ---- */
  const incidentEnts = new Map<string, any[]>();

  /* ---- major disaster visualisation ---- */
  const disasterEnts: any[] = [];
  let disasterVisualId = '';

  function clearDisasterVisuals() {
    while (disasterEnts.length) {
      const e = disasterEnts.pop();
      try { ents.remove(e); } catch {}
    }
    disasterVisualId = '';
  }

  function syncDisasterVisuals() {
    const d = sim.disaster;
    if (!d) {
      if (disasterVisualId) clearDisasterVisuals();
      return;
    }
    if (disasterVisualId === d.id) return;
    clearDisasterVisuals();
    disasterVisualId = d.id;

    const center = pos(d.epicenterX, d.epicenterY, 5);
    const addRing = (radius: number, color: string, alpha: number, width = 2) => {
      disasterEnts.push(ents.add({
        position: center,
        ellipse: {
          semiMajorAxis: radius,
          semiMinorAxis: radius,
          material: css(color, alpha),
          outline: true,
          outlineColor: css(color, Math.min(0.92, alpha + 0.45)),
          outlineWidth: width,
          height: 4,
        },
      }));
    };

    if (d.kind === 'FLOOD' || d.kind === 'COMPOUND') {
      addRing(d.radius, '#2f82c9', 0.10);
      addRing(d.radius * 0.68, '#3f9ee8', 0.10);
      addRing(d.radius * 0.38, '#72bdf2', 0.12);
    }
    if (d.kind === 'EARTHQUAKE' || d.kind === 'COMPOUND') {
      addRing(d.radius * 0.9, '#e0b84c', 0.035);
      addRing(d.radius * 0.58, '#e77c55', 0.045);
      addRing(d.radius * 0.28, '#df554a', 0.075, 3);
      disasterEnts.push(ents.add({
        position: center,
        point: { pixelSize: 18, color: css('#ff493d', 0.98), outlineColor: css('#ffffff', 0.85), outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text: d.magnitude ? `EPICENTRE // M${d.magnitude.toFixed(1)}` : 'COMPOUND EPICENTRE', font: '11px "JetBrains Mono", monospace', fillColor: css('#ffd6d1', 0.98), showBackground: true, backgroundColor: css('#1b0605', 0.82), backgroundPadding: new Cesium.Cartesian2(7, 4), pixelOffset: new Cesium.Cartesian2(0, -28), disableDepthTestDistance: Number.POSITIVE_INFINITY },
      }));
    }
    if (d.kind === 'GRID CASCADE') {
      addRing(320, '#e0b84c', 0.08, 3);
    }

    // Hazard-affected roads. This overlay is the visible consequence of the model,
    // not a decorative pre-baked animation.
    d.affectedEdges.forEach((key) => {
      const e = edges.find((x) => x.key === key);
      if (!e) return;
      const a = nodes[e.a], b = nodes[e.b];
      disasterEnts.push(ents.add({
        polyline: {
          positions: [pos(a.x, a.y, 7), pos(b.x, b.y, 7)],
          width: e.capacity < 0.25 ? 7 : 4,
          material: e.capacity < 0.25
            ? new Cesium.PolylineGlowMaterialProperty({ color: css('#ff463a', 0.92), glowPower: 0.22 })
            : css(d.kind === 'FLOOD' ? '#42a5df' : '#ef7b52', 0.82),
          clampToGround: true,
        },
      }));
    });

    // Four synthetic evacuation shelters. The visible people agents route toward
    // these using the same Dijkstra engine used by traffic.
    [0, 7, 56, 63].forEach((nodeId, i) => {
      const n = nodes[nodeId];
      disasterEnts.push(ents.add({
        position: pos(n.x, n.y, 0),
        point: { pixelSize: 10, color: css('#62d9a7', 0.95), outlineColor: css('#ffffff', 0.75), outlineWidth: 1, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text: `SAFE ${i + 1}`, font: '9px "JetBrains Mono", monospace', fillColor: css('#bdf7de', 0.95), pixelOffset: new Cesium.Cartesian2(0, -18), disableDepthTestDistance: Number.POSITIVE_INFINITY },
      }));
      disasterEnts.push(ents.add({
        polyline: {
          positions: [center, pos(n.x, n.y, 8)],
          width: 1.5,
          material: new Cesium.PolylineDashMaterialProperty({ color: css('#62d9a7', 0.38), dashLength: 12 }),
        },
      }));
    });

    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(center, 120), {
      offset: new Cesium.HeadingPitchRange(Cesium.Math.toRadians(28), Cesium.Math.toRadians(-36), Math.max(1850, d.radius * 2.0)),
      duration: 1.8,
    });
  }

  ents.resumeEvents();

  /* ---- selection handler ---- */
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  handler.setInputAction((click: any) => {
    const picked = viewer.scene.pick(click.position);
    const id = picked?.id?.properties;
    if (id) {
      const kind = id.kind?.getValue();
      if (kind === 'ASSET') { sim.select(id.assetId.getValue()); return; }
      if (kind === 'VEHICLE') { sim.select(id.vehicleId.getValue()); return; }
      if (kind === 'ROAD') { sim.select(`ROAD:${id.edgeKey.getValue()}`); return; }
      if (kind === 'LIVE_TRAFFIC_ROAD') { sim.select(`LIVE_TRAFFIC:${id.sampleId.getValue()}`); return; }
      if (kind === 'MAP_PROBE') return;
    }

    // Empty-map click = real 15 km civic-response lookup around that exact point.
    let cartesian: any = null;
    try {
      if (viewer.scene.pickPositionSupported) cartesian = viewer.scene.pickPosition(click.position);
    } catch {}
    if (!cartesian) cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
    if (!cartesian) { sim.select(null); return; }
    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
    const lat = Cesium.Math.toDegrees(cartographic.latitude);
    const lon = Cesium.Math.toDegrees(cartographic.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) void sim.probeMapPoint(lat, lon, 15);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // Cesium's normal scene.pick can miss clamped-to-ground polylines when a
  // photorealistic 3D tile sits underneath them.  Road hover therefore uses
  // two passes: drill-pick first, then a screen-space proximity fallback.
  const pointToSegmentPx = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
    const abx = bx - ax; const aby = by - ay;
    const len2 = abx * abx + aby * aby;
    if (len2 <= 0.0001) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / len2));
    const x = ax + t * abx; const y = ay + t * aby;
    return Math.hypot(px - x, py - y);
  };

  const toScreen = (lon: number, lat: number) => {
    try {
      const world = Cesium.Cartesian3.fromDegrees(lon, lat, 3);
      return viewer.scene.cartesianToCanvasCoordinates(world, new Cesium.Cartesian2());
    } catch {
      return undefined;
    }
  };

  const showLiveHover = (sampleId: string, screen: any) => {
    const sample = sim.liveTrafficSample(sampleId);
    if (!sample) return false;
    const coords = sample.coordinates;
    const mid = coords[Math.floor(coords.length / 2)] ?? { lat: sample.lat, lon: sample.lon };
    const free = Math.max(1, sample.freeFlowSpeedKmh);
    sim.setRoadHover({
      kind: 'LIVE', id: sample.id, label: `LIVE ROAD // ${sample.id}`,
      screenX: screen.x, screenY: screen.y,
      lat: mid.lat, lon: mid.lon,
      currentSpeedKmh: sample.currentSpeedKmh,
      freeFlowSpeedKmh: sample.freeFlowSpeedKmh,
      congestionPct: Math.max(0, Math.min(100, (1 - sample.currentSpeedKmh / free) * 100)),
      vehicleCount: sample.estimatedVehicleCount,
      vehicleCountLabel: 'ESTIMATED', source: 'TOMTOM LIVE',
    });
    return true;
  };

  const showModelHover = (edgeKey: string, screen: any) => {
    const edge = edges.find((e) => e.key === edgeKey);
    const road = sim.snapshot().roads.find((r) => r.key === edgeKey);
    if (!edge || !road) return false;
    const a = nodes[edge.a], b = nodes[edge.b];
    const [lon, lat] = toLonLat((a.x + b.x) / 2, (a.y + b.y) / 2);
    sim.setRoadHover({
      kind: 'MODEL', id: road.key, label: `${road.corridor} // ${road.key}`,
      screenX: screen.x, screenY: screen.y,
      lat, lon,
      currentSpeedKmh: road.currentSpeedKmh,
      freeFlowSpeedKmh: road.freeFlowSpeedKmh,
      congestionPct: road.congestionPct,
      vehicleCount: road.modelVehicleCount,
      vehicleCountLabel: 'MODELLED', source: road.source === 'LIVE+MODEL' ? 'TOMTOM CALIBRATED' : 'CITADEL MODEL',
    });
    return true;
  };

  const nearestRoadAtScreen = (screen: any) => {
    const px = screen.x; const py = screen.y;
    let best: { kind: 'LIVE' | 'MODEL'; id: string; d: number } | null = null;

    // Prefer live TomTom geometry whenever it is visible / available.
    for (const sample of sim.liveTraffic.samples) {
      if (!sample.coordinates || sample.coordinates.length < 2) continue;
      for (let i = 0; i < sample.coordinates.length - 1; i++) {
        const a = toScreen(sample.coordinates[i].lon, sample.coordinates[i].lat);
        const b = toScreen(sample.coordinates[i + 1].lon, sample.coordinates[i + 1].lat);
        if (!a || !b) continue;
        const d = pointToSegmentPx(px, py, a.x, a.y, b.x, b.y);
        if (d <= 16 && (!best || d < best.d)) best = { kind: 'LIVE', id: sample.id, d };
      }
    }

    // Synthetic/model roads remain hoverable too, especially when live traffic
    // is temporarily unavailable.
    for (const edge of edges) {
      const aNode = nodes[edge.a]; const bNode = nodes[edge.b];
      const [aLon, aLat] = toLonLat(aNode.x, aNode.y);
      const [bLon, bLat] = toLonLat(bNode.x, bNode.y);
      const a = toScreen(aLon, aLat); const b = toScreen(bLon, bLat);
      if (!a || !b) continue;
      const d = pointToSegmentPx(px, py, a.x, a.y, b.x, b.y);
      if (d <= 12 && (!best || d < best.d)) best = { kind: 'MODEL', id: edge.key, d };
    }
    return best;
  };

  handler.setInputAction((movement: any) => {
    const screen = movement.endPosition;

    // PASS 1: drill through the 3D tiles so a road primitive under a building
    // facade can still be discovered.
    try {
      const picks = viewer.scene.drillPick(screen, 12) ?? [];
      for (const picked of picks) {
        const props = picked?.id?.properties;
        if (!props) continue;
        const kind = props.kind?.getValue();
        if (kind === 'LIVE_TRAFFIC_ROAD' && showLiveHover(props.sampleId.getValue(), screen)) {
          viewer.canvas.style.cursor = 'crosshair';
          return;
        }
        if (kind === 'ROAD' && showModelHover(props.edgeKey.getValue(), screen)) {
          viewer.canvas.style.cursor = 'crosshair';
          return;
        }
      }
    } catch {}

    // PASS 2: screen-space nearest-segment test. This makes hover reliable even
    // when Cesium refuses to pick a clamped GroundPolylinePrimitive.
    const nearest = nearestRoadAtScreen(screen);
    if (nearest?.kind === 'LIVE' && showLiveHover(nearest.id, screen)) {
      viewer.canvas.style.cursor = 'crosshair';
      return;
    }
    if (nearest?.kind === 'MODEL' && showModelHover(nearest.id, screen)) {
      viewer.canvas.style.cursor = 'crosshair';
      return;
    }

    viewer.canvas.style.cursor = '';
    sim.setRoadHover(null);
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  /* ---- environment ---- */
  function isNight() {
    const h = sim.simSeconds / 3600;
    return h < 6.2 || h >= 18.6;
  }

  const CLOCK_BASE = Cesium.JulianDate.fromIso8601('2026-03-21T00:00:00Z');

  /** Keep the Cesium sun locked to the city clock (IST = UTC+5:30). */
  function syncSun() {
    viewer.clock.currentTime = Cesium.JulianDate.addSeconds(
      CLOCK_BASE,
      (sim.simSeconds / 3600 - 5.5) * 3600,
      new Cesium.JulianDate()
    );
  }

  function applyEnvironment() {
    syncSun();
    const h = sim.simSeconds / 3600;
    const night = isNight();
    const sunset = (h >= 17.4 && h < 18.9) || (h >= 5.6 && h < 6.6);

    // atmosphere mood
    const sky = viewer.scene.skyAtmosphere;
    sky.brightnessShift = night ? -0.55 : sunset ? 0.18 : 0;
    sky.hueShift = sunset ? 0.06 : 0;
    sky.saturationShift = night ? -0.35 : sunset ? 0.28 : 0;

    // weather grading
    const w = sim.weather;
    const fogDensity =
      w === 'FOG' ? 0.0009 : w === 'HEAVY RAIN' || w === 'STORM' ? 0.00035 : w === 'RAIN' ? 0.0002 : 0.00008;
    viewer.scene.fog.density = fogDensity;
    viewer.scene.fog.screenSpaceErrorFactor = w === 'FOG' ? 8 : 2;

    const dim = w === 'STORM' || w === 'HEAVY RAIN' ? 0.55 : w === 'RAIN' || w === 'FOG' ? 0.72 : w === 'CLOUDY' ? 0.85 : 1;
    viewer.scene.globe.translucency.enabled = false;
    viewer.imageryLayers.get(0).brightness = (night ? 0.55 : 1.05) * dim;
    viewer.imageryLayers.get(0).contrast = night ? 1.25 : 1.05;
    viewer.imageryLayers.get(0).saturation = night ? 0.6 : 0.85 * dim;

    // Road colours are owned by syncRoadPressure() so the live traffic layer
    // remains readable in every weather condition.
  }

  /* ---- per-frame sync ---- */
  let slowAccum = 0;
  let lastNight = isNight();

  function syncRoadPressure() {
    roadEnts.forEach((ent, i) => {
      const e = edges[i];
      const pressure = e.load / Math.max(0.08, e.capacity);
      const liveRatio = e.liveFreeFlowSpeedKmh > 0 ? Math.max(0.05, Math.min(1.2, e.liveSpeedRatio)) : Math.max(0.08, Math.min(1, 1 - e.load * 0.35));
      const congestion = (1 - Math.min(1, liveRatio)) * 100;
      const closed = e.closedUntil > sim.simSeconds || e.capacity < 0.18;
      const selected = sim.selectedId === `ROAD:${e.key}`;
      const colour = closed
        ? '#ff4036'
        : congestion > 72 || pressure > 1.2
        ? COLORS.gridlock
        : congestion > 52 || pressure > 0.88
        ? COLORS.heavy
        : congestion > 28 || pressure > 0.58
        ? COLORS.moderate
        : '#54c68a';
      ent.polyline.material = closed || selected
        ? new Cesium.PolylineGlowMaterialProperty({ color: css(colour, 0.98), glowPower: selected ? 0.24 : 0.15 })
        : css(colour, e.arterial ? 0.92 : 0.78);
      ent.polyline.width = selected ? 9 : closed ? 7 : e.arterial ? 5.5 : 3.2;
      roadLabelEnts[i].show = selected;
    });
  }

  function syncIncidents() {
    const active = new Set(sim.incidents.filter((i) => i.active).map((i) => i.id));
    incidentEnts.forEach((list, id) => {
      if (!active.has(id)) {
        list.forEach((e) => ents.remove(e));
        incidentEnts.delete(id);
      }
    });
    sim.incidents
      .filter((i) => i.active && !incidentEnts.has(i.id))
      .forEach((inc) => {
        const created: any[] = [];
        const isFire = inc.kind === 'FIRE';
        created.push(
          ents.add({
            id: `inc-${inc.id}`,
            position: pos(inc.x, inc.y, 20),
            point: {
              pixelSize: inc.severity === 'MINOR' ? 10 : 16,
              color: css(isFire ? COLORS.fire : COLORS.gridlock, 0.9),
              outlineColor: css('#ffffff', 0.7),
              outlineWidth: 2,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            label: {
              text: `${inc.kind} // ${inc.edgeId}`,
              font: '10px "JetBrains Mono", monospace',
              fillColor: css('#ffd9d2', 0.95),
              showBackground: true,
              backgroundColor: css('#1a0806', 0.8),
              backgroundPadding: new Cesium.Cartesian2(6, 4),
              pixelOffset: new Cesium.Cartesian2(0, 22),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          })
        );
        if (inc.severity !== 'MINOR') {
          created.push(
            ents.add({
              id: `inc-ring-${inc.id}`,
              position: pos(inc.x, inc.y, 4),
              ellipse: {
                semiMinorAxis: 170,
                semiMajorAxis: 170,
                material: css(isFire ? COLORS.fire : COLORS.gridlock, 0.12),
                outline: true,
                outlineColor: css(isFire ? COLORS.fire : COLORS.gridlock, 0.5),
                height: 4,
              },
            })
          );
        }
        if (inc.corridor.length > 1) {
          created.push(
            ents.add({
              id: `inc-corr-${inc.id}`,
              polyline: {
                positions: inc.corridor.map((n) => pos(nodes[n].x, nodes[n].y, 8)),
                width: 4,
                material: new Cesium.PolylineGlowMaterialProperty({
                  color: css('#ffffff', 0.75),
                  glowPower: 0.18,
                }),
              },
            })
          );
        }
        incidentEnts.set(inc.id, created);
      });
  }

  function syncLayers() {
    const L = sim.layers;
    roadEnts.forEach((e) => (e.show = L.TRAFFIC));
    roadLabelEnts.forEach((e, i) => (e.show = L.TRAFFIC && sim.selectedId === `ROAD:${edges[i].key}`));
    liveTrafficEnts.forEach((e) => (e.show = L.TRAFFIC && sim.dataMode === 'LIVE' && sim.liveTraffic.connected));
    signalEnts.forEach((e) => (e.show = L.TRAFFIC));
    const depAnalysis = sim.dependencyAnalysis();
    const activeRelIds = new Set(depAnalysis?.relations.map((r) => r.id) ?? []);
    dependencyEnts.forEach((e, i) => {
      const rel = dependencyRelations[i];
      const active = !!depAnalysis && activeRelIds.has(rel.id);
      e.show = L.DEPENDENCIES && active;
      if (active) {
        const direct = rel.from === depAnalysis!.sourceAssetId;
        e.polyline.width = direct ? 4 : rel.hidden ? 3.2 : 2.4;
        e.polyline.material = rel.hidden
          ? new Cesium.PolylineDashMaterialProperty({ color: css('#c989ff', .98), dashLength: 8 })
          : rel.backup
          ? new Cesium.PolylineDashMaterialProperty({ color: css('#55d69a', .98), dashLength: 20 })
          : new Cesium.PolylineGlowMaterialProperty({ color: css(direct ? '#58e6ff' : '#7e9dff', .96), glowPower: direct ? .18 : .08 });
      }
    });
    syncDependencyAlternatives();
    const activePeds = sim.pedestrianActive();
    pedEnts.forEach((e, i) => (e.show = L.POPULATION && i < activePeds));
    const tracedAssets = new Set<string>([...(depAnalysis ? [depAnalysis.sourceAssetId] : []), ...(depAnalysis?.affected.map((n) => n.assetId) ?? [])]);
    assetEnts.forEach((e, i) => {
      e.show = L[assets[i].layer] !== false || (L.DEPENDENCIES && tracedAssets.has(assets[i].id));
    });
    sim.liveFacilities.forEach((f) => {
      const e = facilityEnts.get(f.id);
      if (!e) return;
      e.show = f.kind === 'HOSPITAL' ? L.HEALTHCARE : f.kind === 'SAFE' ? (L.POPULATION || L.EMERGENCY) : L.EMERGENCY;
    });
    vehicleEnts.forEach((e, i) => {
      const v = sim.vehicles[i];
      if (!v) return;
      e.show = (v.emergency ? L.EMERGENCY : L.TRAFFIC) && sim.isVehicleLive(v);
    });
  }

  function syncFollow() {
    if (!sim.followId) return;
    const v = sim.vehicles.find((x) => x.id === sim.followId);
    if (!v) return;
    viewer.camera.lookAt(
      pos(v.x, v.y, 0),
      new Cesium.HeadingPitchRange(v.heading + Math.PI, Cesium.Math.toRadians(-38), 340)
    );
  }

  let following = false;

  function update(dt = 1 / 60) {
    syncSun();
    slowAccum += dt;
    if (slowAccum > 0.4) {
      slowAccum = 0;
      syncRoadPressure();
      syncLiveFacilities();
      syncLiveTrafficRoads();
      syncMapProbe();
      syncIncidents();
      syncDisasterVisuals();
      syncLayers();
      if (isNight() !== lastNight) {
        lastNight = isNight();
        applyEnvironment();
      }
    }
    if (sim.followId) {
      syncFollow();
      following = true;
    } else if (following) {
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      following = false;
    }
  }

  function flyPreset(id: string) {
    const p = cameraPresets.find((c) => c.id === id) ?? cameraPresets[0];
    sim.follow(null);
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(pos(p.x, p.y, 0), 60), {
      offset: new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(p.heading),
        Cesium.Math.toRadians(p.pitch),
        p.range
      ),
      duration: 1.8,
    });
  }

  function flyToLonLat(lon: number, lat: number, range = 2200) {
    const targetLon = Number(lon);
    const targetLat = Number(lat);
    if (!Number.isFinite(targetLon) || !Number.isFinite(targetLat) || viewer.isDestroyed()) return;

    // Release any vehicle-follow / previous camera animation before location search.
    sim.follow(null);
    viewer.trackedEntity = undefined;
    viewer.camera.cancelFlight();
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

    const doFly = () => {
      if (viewer.isDestroyed()) return;

      // In 2D, fly to a rectangle around the searched place. Using a Cartesian
      // altitude in 2D can look like the camera did not move at all.
      if (viewMode === '2D' || viewer.scene.mode === Cesium.SceneMode.SCENE2D) {
        const dLon = 0.012;
        const dLat = 0.009;
        viewer.camera.flyTo({
          destination: Cesium.Rectangle.fromDegrees(
            targetLon - dLon,
            targetLat - dLat,
            targetLon + dLon,
            targetLat + dLat
          ),
          duration: 1.45,
          easingFunction: Cesium.EasingFunction.CUBIC_OUT,
        });
        return;
      }

      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(targetLon, targetLat, Math.max(1800, range)),
        orientation: {
          heading: Cesium.Math.toRadians(8),
          pitch: Cesium.Math.toRadians(-58),
          roll: 0,
        },
        duration: 1.6,
        easingFunction: Cesium.EasingFunction.CUBIC_OUT,
      });
    };

    // If the user searched while Cesium was still morphing between map modes,
    // wait for the scene to become stable and then execute the flight.
    if (viewMode === '3D' && viewer.scene.mode !== Cesium.SceneMode.SCENE3D) {
      viewer.scene.morphTo3D(0.35);
      window.setTimeout(doFly, 420);
      return;
    }

    window.requestAnimationFrame(doFly);
  }

  function setViewMode(mode: '2D' | '3D') {
    viewMode = mode;
    sim.follow(null);
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

    if (mode === '2D') {
      if (cityTileset) cityTileset.show = false;
      if (viewer.scene.globe) viewer.scene.globe.show = true;
      viewer.scene.morphTo2D(0.75);
      window.setTimeout(() => {
        if (viewer.isDestroyed()) return;
        viewer.camera.flyTo({
          destination: Cesium.Rectangle.fromDegrees(
            CENTER_LON - 0.028,
            CENTER_LAT - 0.022,
            CENTER_LON + 0.028,
            CENTER_LAT + 0.022
          ),
          duration: 0.85,
          easingFunction: Cesium.EasingFunction.CUBIC_OUT,
        });
      }, 720);
      (window as any).__CITADEL_VIEW_MODE__ = '2D';
      return;
    }

    viewer.scene.morphTo3D(0.75);
    window.setTimeout(() => {
      if (viewer.isDestroyed()) return;
      if (cityTileset) cityTileset.show = true;
      if (viewer.scene.globe) viewer.scene.globe.show = !cityIsPhotorealistic;
      flyPreset('OVERVIEW');
    }, 720);
    (window as any).__CITADEL_VIEW_MODE__ = '3D';
  }

  function zoomBy(direction: 'IN' | 'OUT') {
    const carto = viewer.camera.positionCartographic;
    if (!carto) return;
    const current = Math.max(140, carto.height || 1200);
    const target = Math.min(7000, Math.max(140, current * (direction === 'IN' ? 0.72 : 1.38)));
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, target),
      orientation: {
        heading: viewer.camera.heading,
        pitch: viewer.camera.pitch,
        roll: viewer.camera.roll,
      },
      duration: 0.48,
      easingFunction: Cesium.EasingFunction.CUBIC_OUT,
    });
  }

  function destroy() {
    clearDisasterVisuals();
    handler.destroy();
    if (cityTileset && !cityTileset.isDestroyed?.()) {
      try { viewer.scene.primitives.remove(cityTileset); } catch {}
    }
  }

  applyEnvironment();
  syncRoadPressure();
  syncDisasterVisuals();
  syncLayers();
  viewer.camera.setView({
    destination: C().Cartesian3.fromDegrees(CENTER_LON - 0.010, CENTER_LAT - 0.014, 2400),
    orientation: {
      heading: Cesium.Math.toRadians(18),
      pitch: Cesium.Math.toRadians(-44),
      roll: 0,
    },
  });

  // Enter Bengaluru at district scale rather than looking at a schematic grid
  // from above. The fly-in makes the OSM building massing immediately visible.
  window.setTimeout(() => {
    if (viewer.isDestroyed()) return;
    viewer.camera.flyTo({
      destination: C().Cartesian3.fromDegrees(CENTER_LON + 0.001, CENTER_LAT - 0.003, 1120),
      orientation: {
        heading: Cesium.Math.toRadians(24),
        pitch: Cesium.Math.toRadians(-36),
        roll: 0,
      },
      duration: 2.2,
    });
  }, 250);

  return { update, applyEnvironment, flyPreset, flyToLonLat, setViewMode, zoomBy, destroy };
}
