import {
  assets,
  cameraPresets,
  CENTER_LAT,
  CENTER_LON,
  edges,
  nodes,
  toLonLat,
  fromLonLat,
} from './config';
import type { CitySim } from './sim';
import type { Vehicle } from './types';

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

  /* ---- LIVE real-asset dependency intelligence links ----
     Geometry is built only for the currently selected mapped OSM asset. The
     physical asset location is real; the dependency relation is explicitly
     model-inferred in the inspector. */
  const dependencyEnts = new Map<string, any>();
  const alternativeEnts = new Map<string, any>();

  function facilityById(id: string) {
    return sim.liveFacilities.find((f) => f.id === id);
  }

  function syncDependencyGraph() {
    const analysis = sim.dependencyAnalysis();
    const activeRelationIds = new Set<string>();
    const activeAlternativeIds = new Set<string>();

    if (analysis && sim.layers.DEPENDENCIES) {
      for (const rel of analysis.relations) {
        const from = facilityById(rel.from);
        const to = facilityById(rel.to);
        if (!from || !to) continue;
        activeRelationIds.add(rel.id);
        const direct = rel.from === analysis.sourceAssetId;
        let ent = dependencyEnts.get(rel.id);
        const positions = [
          Cesium.Cartesian3.fromDegrees(from.lon, from.lat, 26),
          Cesium.Cartesian3.fromDegrees(to.lon, to.lat, 26),
        ];
        const material = rel.hidden
          ? new Cesium.PolylineDashMaterialProperty({ color: css('#c989ff', .98), dashLength: 8 })
          : new Cesium.PolylineGlowMaterialProperty({ color: css(direct ? '#58e6ff' : '#7e9dff', .96), glowPower: direct ? .18 : .08 });
        if (!ent) {
          ent = ents.add({
            id: `real-dep-${rel.id}`,
            polyline: { positions, width: direct ? 4 : rel.hidden ? 3.2 : 2.4, material, clampToGround: false },
            properties: { kind: 'REAL_DEPENDENCY', relationId: rel.id },
            show: true,
          });
          dependencyEnts.set(rel.id, ent);
        } else {
          ent.polyline.positions = positions;
          ent.polyline.width = direct ? 4 : rel.hidden ? 3.2 : 2.4;
          ent.polyline.material = material;
          ent.show = true;
        }
      }

      for (const alt of analysis.alternatives) {
        if (!alt.replacementAssetId) continue;
        const from = facilityById(alt.replacementAssetId);
        const to = facilityById(alt.targetAssetId);
        if (!from || !to) continue;
        activeAlternativeIds.add(alt.id);
        let ent = alternativeEnts.get(alt.id);
        const positions = [
          Cesium.Cartesian3.fromDegrees(from.lon, from.lat, 34),
          Cesium.Cartesian3.fromDegrees(to.lon, to.lat, 34),
        ];
        if (!ent) {
          ent = ents.add({
            id: `real-dep-alt-${alt.id}`,
            polyline: {
              positions,
              width: 3,
              material: new Cesium.PolylineDashMaterialProperty({ color: css('#55d69a', .96), dashLength: 20 }),
            },
            position: Cesium.Cartesian3.fromDegrees((from.lon + to.lon) / 2, (from.lat + to.lat) / 2, 38),
            label: {
              text: 'ALTERNATIVE',
              font: '9px "JetBrains Mono", monospace',
              fillColor: css('#75efb2', .95),
              showBackground: true,
              backgroundColor: css('#04110b', .76),
              backgroundPadding: new Cesium.Cartesian2(5, 3),
              pixelOffset: new Cesium.Cartesian2(0, -10),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            show: true,
          });
          alternativeEnts.set(alt.id, ent);
        } else {
          ent.polyline.positions = positions;
          ent.position = Cesium.Cartesian3.fromDegrees((from.lon + to.lon) / 2, (from.lat + to.lat) / 2, 38);
          ent.show = true;
        }
      }
    }

    dependencyEnts.forEach((ent, id) => { if (!activeRelationIds.has(id)) ent.show = false; });
    alternativeEnts.forEach((ent, id) => { if (!activeAlternativeIds.has(id)) ent.show = false; });
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

  /* ---- public mapped REAL infrastructure (OpenStreetMap live query) ---- */
  const facilityEnts = new Map<string, any>();
  const facilityColour = (kind: string) => kind === 'HOSPITAL' ? '#4ec9b0'
    : kind === 'FIRE' ? '#d9614a'
    : kind === 'POLICE' ? '#5aa9e6'
    : kind === 'POWER' ? '#e0b84c'
    : kind === 'WATER' ? '#4aa3d9'
    : kind === 'METRO' ? '#b48cff'
    : '#62d9a7';

  function syncLiveFacilities() {
    const liveIds = new Set(sim.liveFacilities.map((f) => f.id));
    facilityEnts.forEach((entity, id) => {
      if (!liveIds.has(id)) { ents.remove(entity); facilityEnts.delete(id); }
    });

    sim.liveFacilities.forEach((f) => {
      if (facilityEnts.has(f.id)) return;
      const entity = ents.add({
        id: `live-${f.id}`,
        position: Cesium.Cartesian3.fromDegrees(f.lon, f.lat, 0),
        point: {
          pixelSize: new Cesium.CallbackProperty(() => {
            const dep = sim.dependencyAnalysis();
            const selected = sim.selectedId === `REAL_ASSET:${f.id}` || dep?.sourceAssetId === f.id;
            if (selected) return 15 + Math.sin(Date.now() / 120) * 2.5;
            if (dep?.affected.some((n) => n.assetId === f.id)) return 11;
            return f.kind === 'SAFE' ? 7 : 8;
          }, false),
          color: new Cesium.CallbackProperty(() => {
            const dep = sim.dependencyAnalysis();
            if (dep?.sourceAssetId === f.id) return css('#ffffff', 1);
            const hit = dep?.affected.find((n) => n.assetId === f.id);
            if (hit?.hiddenPath) return css('#c989ff', .98);
            if (hit) return css('#58e6ff', .98);
            return css(facilityColour(f.kind), .94);
          }, false),
          outlineColor: new Cesium.CallbackProperty(() => {
            const dep = sim.dependencyAnalysis();
            return css(dep?.sourceAssetId === f.id ? '#58e6ff' : '#ffffff', .9);
          }, false),
          outlineWidth: new Cesium.CallbackProperty(() => (sim.selectedId === `REAL_ASSET:${f.id}` || sim.dependencyAnalysis()?.sourceAssetId === f.id) ? 4 : 1, false),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: new Cesium.CallbackProperty(() => {
            const dep = sim.dependencyAnalysis();
            if (sim.selectedId === `REAL_ASSET:${f.id}` || dep?.sourceAssetId === f.id) return `◉ SELECTED // ${f.name}`;
            const hit = dep?.affected.find((n) => n.assetId === f.id);
            if (hit) return `${f.name} // D${hit.depth}${hit.hiddenPath ? ' // HIDDEN' : ''}`;
            return `${f.kind} // ${f.name}`;
          }, false),
          font: '9px "JetBrains Mono", monospace',
          fillColor: css('#e9f4ff', 0.9),
          showBackground: true,
          backgroundColor: css('#05070a', 0.72),
          backgroundPadding: new Cesium.Cartesian2(4, 3),
          pixelOffset: new Cesium.Cartesian2(0, -16),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2600),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: { kind: 'LIVE_FACILITY', facilityId: f.id, facilityKind: f.kind },
      });
      facilityEnts.set(f.id, entity);
    });
  }

  // One animated halo follows the currently selected mapped asset. This makes
  // every building/asset click visually undeniable without adding hundreds of
  // expensive animated ellipses to the scene.
  const selectionHalo = ents.add({
    id: 'citadel-selection-halo',
    show: false,
    position: Cesium.Cartesian3.fromDegrees(CENTER_LON, CENTER_LAT, 0),
    point: {
      pixelSize: 5,
      color: css('#ffffff', .98),
      outlineColor: css('#58e6ff', 1),
      outlineWidth: 3,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    ellipse: {
      semiMajorAxis: new Cesium.CallbackProperty(() => 34 + (Math.sin(Date.now() / 150) + 1) * 8, false),
      semiMinorAxis: new Cesium.CallbackProperty(() => 34 + (Math.sin(Date.now() / 150) + 1) * 8, false),
      material: css('#58e6ff', .08),
      outline: true,
      outlineColor: css('#58e6ff', .9),
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    },
    label: {
      text: 'SELECTED ASSET',
      font: '9px "JetBrains Mono", monospace',
      fillColor: css('#ffffff', .96),
      showBackground: true,
      backgroundColor: css('#05070a', .82),
      backgroundPadding: new Cesium.Cartesian2(5, 3),
      pixelOffset: new Cesium.Cartesian2(0, -34),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  function syncSelectionHalo() {
    const selected = sim.selectedId;
    if (!selected?.startsWith('REAL_ASSET:')) { selectionHalo.show = false; return; }
    const id = selected.slice('REAL_ASSET:'.length);
    const f = sim.liveFacilities.find((x) => x.id === id);
    if (!f) { selectionHalo.show = false; return; }
    selectionHalo.position = Cesium.Cartesian3.fromDegrees(f.lon, f.lat, 0);
    selectionHalo.label.text = `SELECTED // ${f.kind} // ${f.name}`;
    selectionHalo.show = true;
  }

  /* ---- incident + corridor layers (rebuilt on change) ---- */
  const incidentEnts = new Map<string, any[]>();

  /* ---- major disaster visualisation ---- */
  const disasterEnts: any[] = [];
  let disasterVisualId = '';
  let disasterVisualSignature = '';

  function clearDisasterVisuals() {
    while (disasterEnts.length) {
      const e = disasterEnts.pop();
      try { ents.remove(e); } catch {}
    }
    disasterVisualId = '';
    disasterVisualSignature = '';
  }

  function syncDisasterVisuals() {
    const d = sim.disaster;
    if (!d) {
      if (disasterVisualId) clearDisasterVisuals();
      return;
    }

    const newDisaster = disasterVisualId !== d.id;
    const signature = [
      d.id,
      d.phase,
      Math.floor(d.modelMinute),
      d.affectedEdges.length,
      d.affectedAssets.length,
      d.failedAssets.length,
      d.cascadeEvents.filter((x) => x.revealed).length,
      Object.keys(d.floodDepthByEdge).length,
    ].join(':');
    if (!newDisaster && signature === disasterVisualSignature) return;

    clearDisasterVisuals();
    disasterVisualId = d.id;
    disasterVisualSignature = signature;

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

    // FLOOD: no single blue hazard disk. Water is rendered only where the
    // graph-propagation model says it has reached a road corridor.
    if (d.kind === 'FLOOD' || d.kind === 'COMPOUND') {
      d.affectedEdges.forEach((key) => {
        const e = edges.find((x) => x.key === key);
        if (!e) return;
        const a = nodes[e.a], b = nodes[e.b];
        const depth = d.floodDepthByEdge[key] ?? 0.16;
        const waterColour = depth > 0.72 ? '#3e8fe8' : depth > 0.42 ? '#4aa9e8' : '#65bfe9';
        disasterEnts.push(ents.add({
          polyline: {
            positions: [pos(a.x, a.y, 5), pos(b.x, b.y, 5)],
            width: 5 + depth * 10,
            material: new Cesium.PolylineGlowMaterialProperty({
              color: css(waterColour, Math.min(0.95, 0.48 + depth * 0.38)),
              glowPower: 0.16 + depth * 0.18,
            }),
            clampToGround: true,
          },
        }));
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        disasterEnts.push(ents.add({
          position: pos(mx, my, 3),
          ellipse: {
            semiMajorAxis: 34 + depth * 64,
            semiMinorAxis: 18 + depth * 34,
            material: css('#43a7e8', 0.08 + depth * 0.10),
            outline: false,
            height: 3,
          },
        }));
      });
      disasterEnts.push(ents.add({
        position: center,
        point: { pixelSize: 11, color: css('#72c8ff', 0.96), outlineColor: css('#ffffff', 0.8), outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text: `FLOOD ORIGIN // T+${String(Math.floor(d.modelMinute)).padStart(2, '0')}`, font: '10px "JetBrains Mono", monospace', fillColor: css('#cdeeff', 0.98), showBackground: true, backgroundColor: css('#04121d', 0.84), backgroundPadding: new Cesium.Cartesian2(7, 4), pixelOffset: new Cesium.Cartesian2(0, -24), disableDepthTestDistance: Number.POSITIVE_INFINITY },
      }));
    }

    // EARTHQUAKE: faint distance-decay bands remain as a shaking reference,
    // while actual severity is communicated asset-by-asset below.
    if (d.kind === 'EARTHQUAKE' || d.kind === 'COMPOUND') {
      addRing(d.radius * 0.82, '#e0b84c', 0.018);
      addRing(d.radius * 0.48, '#e77c55', 0.025);
      addRing(d.radius * 0.20, '#df554a', 0.040, 2);
      disasterEnts.push(ents.add({
        position: center,
        point: { pixelSize: 18, color: css('#ff493d', 0.98), outlineColor: css('#ffffff', 0.85), outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text: d.magnitude ? `EPICENTRE // M${d.magnitude.toFixed(1)}` : 'COMPOUND EPICENTRE', font: '11px "JetBrains Mono", monospace', fillColor: css('#ffd6d1', 0.98), showBackground: true, backgroundColor: css('#1b0605', 0.82), backgroundPadding: new Cesium.Cartesian2(7, 4), pixelOffset: new Cesium.Cartesian2(0, -28), disableDepthTestDistance: Number.POSITIVE_INFINITY },
      }));

      Object.entries(d.damageByAsset).forEach(([id, severity]) => {
        if (severity === 'NONE') return;
        const asset = assets.find((a) => a.id === id);
        if (!asset) return;
        const colour = severity === 'FAILED' ? '#ff4038' : severity === 'SEVERE' ? '#f16a45' : severity === 'MODERATE' ? '#e8ae4b' : '#e9d988';
        const px = severity === 'FAILED' ? 24 : severity === 'SEVERE' ? 20 : severity === 'MODERATE' ? 16 : 12;
        disasterEnts.push(ents.add({
          position: pos(asset.x, asset.y, 15),
          point: { pixelSize: px, color: css(colour, 0.32), outlineColor: css(colour, 0.98), outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY },
          label: { text: `${severity} DAMAGE // ${asset.name}`, font: '9px "JetBrains Mono", monospace', fillColor: css('#fff0e8', 0.96), showBackground: true, backgroundColor: css('#190c08', 0.80), backgroundPadding: new Cesium.Cartesian2(5, 3), pixelOffset: new Cesium.Cartesian2(0, -22), disableDepthTestDistance: Number.POSITIVE_INFINITY },
        }));
      });
    }

    if (d.kind === 'GRID CASCADE') {
      addRing(210, '#e0b84c', 0.045, 2);
    }

    // Non-flood damaged roads. Flood has its own depth-driven corridor layer.
    if (d.kind !== 'FLOOD') {
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
              : css('#ef7b52', 0.82),
            clampToGround: true,
          },
        }));
      });
    }

    // Sequential causal propagation. Only revealed stages exist on the map, so
    // the chain literally grows T+00 -> T+05 -> T+15 -> T+30.
    const revealed = d.cascadeEvents.filter((x) => x.revealed);
    revealed.forEach((event, index) => {
      if (Math.hypot(event.toX - event.fromX, event.toY - event.fromY) < 1) return;
      const latest = index === revealed.length - 1;
      const colour = event.tone === 'ALERT' ? '#ff5a49' : event.tone === 'WARN' ? '#e4b74f' : '#62d9d3';
      disasterEnts.push(ents.add({
        polyline: {
          positions: [pos(event.fromX, event.fromY, 34), pos(event.toX, event.toY, 34)],
          width: latest ? 5 : 2.5,
          material: latest
            ? new Cesium.PolylineGlowMaterialProperty({ color: css(colour, 0.98), glowPower: 0.28 })
            : new Cesium.PolylineDashMaterialProperty({ color: css(colour, 0.72), dashLength: 12 }),
        },
      }));
      disasterEnts.push(ents.add({
        position: pos(event.toX, event.toY, 24),
        point: { pixelSize: latest ? 12 : 8, color: css(colour, 0.96), outlineColor: css('#ffffff', latest ? 0.75 : 0.35), outlineWidth: 1, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text: `T+${String(event.minute).padStart(2, '0')} // ${event.label}`, font: '9px "JetBrains Mono", monospace', fillColor: css('#ffffff', 0.94), showBackground: true, backgroundColor: css('#071019', 0.78), backgroundPadding: new Cesium.Cartesian2(5, 3), pixelOffset: new Cesium.Cartesian2(0, -18), disableDepthTestDistance: Number.POSITIVE_INFINITY },
      }));
    });

    // Four synthetic evacuation shelters. The people agents use the same road
    // graph for route selection; lines are intentionally subtle.
    [0, 7, 56, 63].forEach((nodeId, i) => {
      const n = nodes[nodeId];
      disasterEnts.push(ents.add({
        position: pos(n.x, n.y, 0),
        point: { pixelSize: 9, color: css('#62d9a7', 0.88), outlineColor: css('#ffffff', 0.55), outlineWidth: 1, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text: `SAFE ${i + 1}`, font: '8px "JetBrains Mono", monospace', fillColor: css('#bdf7de', 0.9), pixelOffset: new Cesium.Cartesian2(0, -16), disableDepthTestDistance: Number.POSITIVE_INFINITY },
      }));
    });

    if (newDisaster) {
      viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(center, 120), {
        offset: new Cesium.HeadingPitchRange(Cesium.Math.toRadians(28), Cesium.Math.toRadians(-36), Math.max(1850, d.radius * 1.75)),
        duration: 1.8,
      });
    }
  }

  ents.resumeEvents();

  /* ---- user-placed hazard targeting ---- */
  let placementPreview: any = null;

  function mapPointFromScreen(screen: any) {
    let cartesian: any = null;
    try {
      if (viewer.scene.pickPositionSupported) cartesian = viewer.scene.pickPosition(screen);
    } catch {}
    if (!cartesian) cartesian = viewer.camera.pickEllipsoid(screen, viewer.scene.globe.ellipsoid);
    if (!cartesian) return null;
    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
    const lat = Cesium.Math.toDegrees(cartographic.latitude);
    const lon = Cesium.Math.toDegrees(cartographic.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const [x, y] = fromLonLat(lon, lat);
    return { lat, lon, x, y };
  }

  function syncPlacementPreview(screen?: any) {
    const kind = sim.hazardPlacement;
    if (!kind || !screen) {
      if (placementPreview) { ents.remove(placementPreview); placementPreview = null; }
      return;
    }
    const point = mapPointFromScreen(screen);
    if (!point) return;
    const colour = kind === 'FLOOD' ? '#42a5df' : kind === 'EARTHQUAKE' ? '#efb85a' : '#ff574d';
    const radius = kind === 'FLOOD' ? 1120 : kind === 'EARTHQUAKE' ? 1450 : 220;
    if (!placementPreview) {
      placementPreview = ents.add({
        id: 'hazard-placement-preview',
        position: Cesium.Cartesian3.fromDegrees(point.lon, point.lat, 3),
        point: {
          pixelSize: 13,
          color: css(colour, .98),
          outlineColor: css('#ffffff', .95),
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        ellipse: {
          semiMajorAxis: radius,
          semiMinorAxis: radius,
          material: css(colour, .08),
          outline: true,
          outlineColor: css(colour, .9),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: `PLACE ${kind} // CLICK`,
          font: '10px "JetBrains Mono", monospace',
          fillColor: css('#ffffff', .98),
          showBackground: true,
          backgroundColor: css('#05070a', .86),
          backgroundPadding: new Cesium.Cartesian2(7, 5),
          pixelOffset: new Cesium.Cartesian2(0, -22),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    } else {
      placementPreview.position = Cesium.Cartesian3.fromDegrees(point.lon, point.lat, 3);
      placementPreview.point.color = css(colour, .98);
      placementPreview.ellipse.semiMajorAxis = radius;
      placementPreview.ellipse.semiMinorAxis = radius;
      placementPreview.ellipse.material = css(colour, .08);
      placementPreview.ellipse.outlineColor = css(colour, .9);
      placementPreview.label.text = `PLACE ${kind} // CLICK`;
    }
  }

  /* ---- selection handler ---- */
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  handler.setInputAction((click: any) => {
    const placement = sim.hazardPlacement;
    if (placement) {
      const point = mapPointFromScreen(click.position);
      if (!point) return;
      if (placement === 'FIRE') sim.triggerFireAt(point.x, point.y);
      else sim.triggerDisaster(placement, { x: point.x, y: point.y });
      syncPlacementPreview();
      viewer.canvas.style.cursor = '';
      return;
    }

    // Drill through photorealistic tiles. A single scene.pick() often returns the
    // 3D building mesh instead of the CITADEL marker/road sitting on top of it.
    try {
      const picks = viewer.scene.drillPick(click.position, 24) ?? [];
      for (const picked of picks) {
        const id = picked?.id?.properties;
        if (!id) continue;
        const kind = id.kind?.getValue();
        if (kind === 'ASSET') { sim.select(id.assetId.getValue()); return; }
        if (kind === 'VEHICLE') { sim.select(id.vehicleId.getValue()); return; }
        if (kind === 'ROAD') { sim.select(`ROAD:${id.edgeKey.getValue()}`); return; }
        if (kind === 'LIVE_TRAFFIC_ROAD') { sim.select(`LIVE_TRAFFIC:${id.sampleId.getValue()}`); return; }
        if (kind === 'LIVE_FACILITY') { sim.selectLiveAsset(id.facilityId.getValue()); return; }
        if (kind === 'MAP_PROBE') return;
      }
    } catch {}

    // If the road was detected by the screen-space hover fallback, clicking it
    // must still open the full road inspector even when Cesium cannot pick it.
    if (sim.roadHover) {
      if (sim.roadHover.kind === 'LIVE') { sim.select(`LIVE_TRAFFIC:${sim.roadHover.id}`); return; }
      if (sim.roadHover.kind === 'MODEL') { sim.select(`ROAD:${sim.roadHover.id}`); return; }
    }

    // Empty-map click = real 15 km civic-response lookup around that exact point.
    const mapPoint = mapPointFromScreen(click.position);
    if (!mapPoint) { sim.select(null); return; }
    const { lat, lon } = mapPoint;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      // Clicking the real 3D building itself should work even when Cesium's
      // photorealistic tile has no CITADEL entity metadata. Snap the click to
      // the nearest mapped OSM infrastructure point within ~180 metres.
      const nearest = sim.liveFacilities
        .map((f) => {
          const dy = (f.lat - lat) * 110.54;
          const dx = (f.lon - lon) * 111.32 * Math.cos(lat * Math.PI / 180);
          return { f, km: Math.hypot(dx, dy) };
        })
        .filter((x) => x.km <= 0.24)
        .sort((a, b) => a.km - b.km)[0];
      if (nearest) { sim.selectLiveAsset(nearest.f.id); return; }
      void sim.probeMapPoint(lat, lon, 15);
    }
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
        if (d <= 24 && (!best || d < best.d)) best = { kind: 'LIVE', id: sample.id, d };
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
      if (d <= 18 && (!best || d < best.d)) best = { kind: 'MODEL', id: edge.key, d };
    }
    return best;
  };

  const updatePointerInteraction = (screen: any) => {
    if (!screen) return;

    if (sim.hazardPlacement) {
      sim.setRoadHover(null);
      viewer.canvas.style.cursor = 'crosshair';
      syncPlacementPreview(screen);
      return;
    }
    if (placementPreview) syncPlacementPreview();
    if (!sim.layers.TRAFFIC) { sim.setRoadHover(null); viewer.canvas.style.cursor = ''; return; }

    // PASS 1: drill through tiles/entities at the exact pointer position.
    try {
      const picks = viewer.scene.drillPick(screen, 16) ?? [];
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
        if (kind === 'LIVE_FACILITY' || kind === 'ASSET' || kind === 'VEHICLE') {
          sim.setRoadHover(null);
          viewer.canvas.style.cursor = 'pointer';
          return;
        }
      }
    } catch {}

    // PASS 2: nearest visible road in screen space. This remains reliable even
    // when GroundPolyline / photorealistic tiles make Cesium picking flaky.
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
  };

  handler.setInputAction((movement: any) => updatePointerInteraction(movement.endPosition), Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  // DOM pointermove is an independent fallback for browsers where Cesium's
  // ScreenSpaceEventHandler misses motion over streamed 3D tiles.
  let hoverRaf = 0;
  let pendingPointer: any = null;
  const onCanvasPointerMove = (event: PointerEvent) => {
    if (sim.hazardPlacement) return;
    const rect = viewer.canvas.getBoundingClientRect();
    pendingPointer = new Cesium.Cartesian2(event.clientX - rect.left, event.clientY - rect.top);
    if (hoverRaf) return;
    hoverRaf = window.requestAnimationFrame(() => {
      hoverRaf = 0;
      if (pendingPointer) updatePointerInteraction(pendingPointer);
    });
  };
  const onCanvasPointerLeave = () => {
    if (hoverRaf) { window.cancelAnimationFrame(hoverRaf); hoverRaf = 0; }
    pendingPointer = null;
    sim.setRoadHover(null);
    if (!sim.hazardPlacement) viewer.canvas.style.cursor = '';
  };
  viewer.canvas.addEventListener('pointermove', onCanvasPointerMove, { passive: true });
  viewer.canvas.addEventListener('pointerleave', onCanvasPointerLeave, { passive: true });


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
        if (inc.severity !== 'MINOR' || isFire) {
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

    // Fire is a living incident, not a static 170 m circle. Its footprint grows
    // while the appliance is en-route and contracts once suppression begins.
    sim.incidents.filter((i) => i.active && i.kind === 'FIRE').forEach((inc) => {
      const marker = ents.getById(`inc-${inc.id}`);
      const ring = ents.getById(`inc-ring-${inc.id}`);
      const radius = Math.max(28, inc.fireRadius ?? 35);
      const maxRadius = Math.max(radius, inc.fireMaxRadius ?? 430);
      const ratio = Math.min(1, radius / maxRadius);
      if (ring?.ellipse) {
        ring.ellipse.semiMinorAxis = radius;
        ring.ellipse.semiMajorAxis = radius;
        ring.ellipse.material = css('#d9614a', 0.08 + ratio * 0.16);
        ring.ellipse.outlineColor = css(ratio > 0.7 ? '#ff493d' : '#e17858', 0.72);
      }
      if (marker?.point) marker.point.pixelSize = 12 + ratio * 10;
      if (marker?.label) {
        const eta = Math.max(0, Math.round((inc.responseEtaSeconds ?? 0) / 60));
        const containment = Math.round((inc.containment ?? 0) * 100);
        marker.label.text = `FIRE // ${inc.edgeId}\nSPREAD ${Math.round(radius)}M // FIRE ETA ${eta}M // CONTAIN ${containment}%`;
      }
    });
  }

  function syncLayers() {
    const L = sim.layers;
    roadEnts.forEach((e) => (e.show = L.TRAFFIC));
    roadLabelEnts.forEach((e, i) => (e.show = L.TRAFFIC && sim.selectedId === `ROAD:${edges[i].key}`));
    liveTrafficEnts.forEach((e) => (e.show = L.TRAFFIC && sim.dataMode === 'LIVE' && sim.liveTraffic.connected));
    signalEnts.forEach((e) => (e.show = L.TRAFFIC));

    const depAnalysis = sim.dependencyAnalysis();
    syncDependencyGraph();
    const tracedRealAssets = new Set<string>([
      ...(depAnalysis ? [depAnalysis.sourceAssetId] : []),
      ...(depAnalysis?.affected.map((n) => n.assetId) ?? []),
      ...(depAnalysis?.alternatives.flatMap((a) => [a.targetAssetId, a.replacementAssetId].filter(Boolean) as string[]) ?? []),
    ]);

    const activePeds = sim.pedestrianActive();
    pedEnts.forEach((e, i) => (e.show = L.POPULATION && i < activePeds));

    // Synthetic P1/H1/W1-style assets are Scenario Lab objects only. LIVE mode
    // shows mapped OSM infrastructure instead, avoiding the old fake-asset UX.
    assetEnts.forEach((e, i) => {
      e.show = sim.dataMode === 'SIMULATION' && L[assets[i].layer] !== false;
    });

    sim.liveFacilities.forEach((f) => {
      const e = facilityEnts.get(f.id);
      if (!e) return;
      const normalVisible = f.kind === 'HOSPITAL' ? L.HEALTHCARE
        : f.kind === 'POWER' ? L.POWER
        : f.kind === 'WATER' ? L.WATER
        : f.kind === 'METRO' ? L.TRAFFIC
        : f.kind === 'SAFE' ? (L.POPULATION || L.EMERGENCY)
        : L.EMERGENCY;
      e.show = sim.dataMode === 'LIVE' && (normalVisible || (L.DEPENDENCIES && tracedRealAssets.has(f.id)));
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
    syncSelectionHalo();
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

  let searchTargetEnt: any = null;
  let searchTargetTimer = 0;

  function showSearchTarget(lon: number, lat: number) {
    if (searchTargetEnt) { try { ents.remove(searchTargetEnt); } catch {} searchTargetEnt = null; }
    if (searchTargetTimer) window.clearTimeout(searchTargetTimer);
    searchTargetEnt = ents.add({
      id: `search-target-${Date.now()}`,
      position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
      point: { pixelSize: 10, color: css('#ffffff', 1), outlineColor: css('#58e6ff', 1), outlineWidth: 3, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      ellipse: { semiMajorAxis: 65, semiMinorAxis: 65, material: css('#58e6ff', .07), outline: true, outlineColor: css('#58e6ff', .95), heightReference: Cesium.HeightReference.CLAMP_TO_GROUND },
      label: { text: 'SEARCH TARGET', font: '9px "JetBrains Mono", monospace', fillColor: css('#ffffff', .95), showBackground: true, backgroundColor: css('#05070a', .82), pixelOffset: new Cesium.Cartesian2(0,-28), disableDepthTestDistance: Number.POSITIVE_INFINITY },
    });
    searchTargetTimer = window.setTimeout(() => {
      if (searchTargetEnt) { try { ents.remove(searchTargetEnt); } catch {} searchTargetEnt = null; }
      searchTargetTimer = 0;
    }, 5200);
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
    showSearchTarget(targetLon, targetLat);

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
        destination: Cesium.Cartesian3.fromDegrees(targetLon, targetLat, Math.max(900, range)),
        orientation: {
          heading: Cesium.Math.toRadians(8),
          pitch: Cesium.Math.toRadians(-48),
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
    if (placementPreview) { try { ents.remove(placementPreview); } catch {} placementPreview = null; }
    viewer.canvas.removeEventListener('pointermove', onCanvasPointerMove);
    viewer.canvas.removeEventListener('pointerleave', onCanvasPointerLeave);
    if (hoverRaf) window.cancelAnimationFrame(hoverRaf);
    if (searchTargetTimer) window.clearTimeout(searchTargetTimer);
    if (searchTargetEnt) { try { ents.remove(searchTargetEnt); } catch {} searchTargetEnt = null; }
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
