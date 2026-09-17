import { assets, edgeBetween, edges, fromLonLat, LAYER_KEYS, neighbours, nodes, toLonLat } from './config';
import { fetchFacilitiesAround, fetchLiveFacilities, fetchLiveTraffic, fetchLiveWeather, fetchTrafficAwareRoute } from './live';
import { analyseDependencyFailure } from './dependencies';

const edgeByKey = (key: string) => edges.find((e) => e.key === key);
import type {
  FeedLine,
  Incident,
  IncidentKind,
  LayerKey,
  Metrics,
  MapProbeState,
  Notice,
  Pedestrian,
  SignalState,
  Snapshot,
  TimePreset,
  TrafficMode,
  Vehicle,
  WeatherMode,
  DisasterKind,
  DisasterState,
  Intervention,
  RecoveryStep,
  AlgorithmTrace,
  DataMode,
  ImpactAssessment,
  LiveFacility,
  LiveTrafficState,
  LiveWeatherState,
  RoadState,
  ResponsePlan,
  NearbyFacilityMatch,
  RouteAlternative,
  RoadHoverState,
  DependencyAnalysis,
} from './types';

/* --------------------------------------------------------------------------
   TUNING
   -------------------------------------------------------------------------- */

export const WEATHER_MODES: WeatherMode[] = ['CLEAR', 'CLOUDY', 'RAIN', 'HEAVY RAIN', 'FOG', 'STORM'];
export const TRAFFIC_MODES: TrafficMode[] = ['LIGHT', 'NORMAL', 'HEAVY', 'GRIDLOCK'];

const WEATHER_SPEED: Record<WeatherMode, number> = {
  CLEAR: 1.0,
  CLOUDY: 0.95,
  RAIN: 0.85,
  'HEAVY RAIN': 0.65,
  FOG: 0.75,
  STORM: 0.55,
};

const WEATHER_VISIBILITY: Record<WeatherMode, number> = {
  CLEAR: 9.6,
  CLOUDY: 8.1,
  RAIN: 5.4,
  'HEAVY RAIN': 3.1,
  FOG: 1.2,
  STORM: 2.4,
};

const WEATHER_LABEL: Record<WeatherMode, string> = {
  CLEAR: 'CLEAR',
  CLOUDY: 'CLOUD COVER',
  RAIN: 'RAIN',
  'HEAVY RAIN': 'HEAVY RAIN',
  FOG: 'DENSE FOG',
  STORM: 'SEVERE RAIN',
};

const TRAFFIC_DENSITY: Record<TrafficMode, number> = {
  LIGHT: 0.7,
  NORMAL: 1.0,
  HEAVY: 1.5,
  GRIDLOCK: 2.1,
};

const TRAFFIC_SPEED: Record<TrafficMode, number> = {
  LIGHT: 1.15,
  NORMAL: 1.0,
  HEAVY: 0.72,
  GRIDLOCK: 0.42,
};

const BASE_VEHICLES = 27;
const MAX_VEHICLES = 64;
const TIME_SCALE = 20; // AUTO TIME: 1 real second = 20 simulated seconds
const SIGNAL_NODES = [18, 21, 26, 29, 34, 37, 42, 45];

const MINOR_EVENTS: IncidentKind[] = [
  'ROAD WORK',
  'TRAFFIC JAM',
  'BREAKDOWN',
  'WATER LEAK',
  'POWER FLUCTUATION',
  'PUBLIC EVENT',
  'ROAD CLOSURE',
  'CONSTRUCTION',
  'MINOR FLOODING',
  'SIGNAL FAILURE',
];

/* --------------------------------------------------------------------------
   HELPERS
   -------------------------------------------------------------------------- */

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function clockString(sec: number, withSeconds = false): string {
  const s = ((sec % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return withSeconds ? `${pad(h)}:${pad(m)}:${pad(ss)}` : `${pad(h)}:${pad(m)}`;
}

export function etaString(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Dynamic Dijkstra routing. Edge cost increases with congestion/capacity and
 * becomes effectively infinite when a road is closed. This keeps the demo
 * algorithmic: vehicles genuinely choose the currently cheapest route. */
function findPath(from: number, to: number, simSeconds: number, emergency = false, banned = new Set<string>()): number[] {
  if (from === to) return [from];
  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  const open = new Set<number>(nodes.map((n) => n.id));
  nodes.forEach((n) => dist.set(n.id, Number.POSITIVE_INFINITY));
  dist.set(from, 0);

  while (open.size) {
    let cur = -1;
    let best = Number.POSITIVE_INFINITY;
    open.forEach((id) => {
      const d = dist.get(id)!;
      if (d < best) { best = d; cur = id; }
    });
    if (cur < 0 || !Number.isFinite(best)) break;
    open.delete(cur);
    if (cur === to) break;

    for (const nb of neighbours[cur]) {
      if (!open.has(nb)) continue;
      const edge = edgeBetween(cur, nb);
      if (!edge) continue;
      if (banned.has(edge.key)) continue;
      if (edge.closedUntil > simSeconds && !emergency) continue;
      // Travel-time proxy. Congestion and capacity loss increase cost.
      const capacity = Math.max(0.08, edge.capacity);
      const loadRatio = Math.max(0, edge.load) / capacity;
      const congestionPenalty = 1 + Math.max(0, loadRatio - 0.55) * (emergency ? 1.1 : 3.2);
      const closurePenalty = edge.closedUntil > simSeconds ? (emergency ? 7 : 9999) : 1;
      const arterialBonus = edge.arterial ? 0.88 : 1;
      const liveRatio = edge.liveFreeFlowSpeedKmh > 0 ? clamp(edge.liveSpeedRatio, 0.08, 1.2) : 1;
      const livePenalty = 1 / liveRatio;
      const cost = edge.length * congestionPenalty * closurePenalty * arterialBonus * livePenalty / capacity;
      const alt = best + cost;
      if (alt < dist.get(nb)!) {
        dist.set(nb, alt);
        prev.set(nb, cur);
      }
    }
  }

  if (!prev.has(to)) return [from, to];
  const path = [to];
  let walk = to;
  while (walk !== from) {
    walk = prev.get(walk)!;
    path.unshift(walk);
  }
  return path;
}

function randomPath(from: number, simSeconds: number): number[] {
  const to = Math.floor(Math.random() * nodes.length);
  return findPath(from, to === from ? (to + 9) % nodes.length : to, simSeconds);
}

/* --------------------------------------------------------------------------
   SIMULATION
   -------------------------------------------------------------------------- */

const EMPTY_LIVE_WEATHER: LiveWeatherState = {
  connected: false, provider: 'OPEN-METEO', observedAt: '', temperatureC: 0, feelsLikeC: 0,
  humidityPct: 0, precipitationMm: 0, rainMm: 0, weatherCode: 0, condition: 'WAITING',
  cloudPct: 0, windKmh: 0, gustKmh: 0, visibilityKm: 0, isDay: true, error: '',
};

const EMPTY_LIVE_TRAFFIC: LiveTrafficState = {
  connected: false, provider: 'TOMTOM', observedAt: '', avgCurrentSpeedKmh: 0, avgFreeFlowSpeedKmh: 0,
  speedRatio: 1, congestionPct: 0, confidence: 0, samples: [], error: '',
};

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const r = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
};

export class CitySim {
  simSeconds = 17 * 3600 + 40 * 60;
  autoTime = true;
  weather: WeatherMode = 'CLEAR';
  traffic: TrafficMode = 'NORMAL';
  manualTraffic = false;
  dataMode: DataMode = 'LIVE';
  liveSyncing = false;
  liveLastSyncAt = '';
  liveWeather: LiveWeatherState = { ...EMPTY_LIVE_WEATHER };
  liveTraffic: LiveTrafficState = { ...EMPTY_LIVE_TRAFFIC };
  liveFacilities: LiveFacility[] = [];
  liveFacilitiesError = '';
  mapProbe: MapProbeState | null = null;
  roadHover: RoadHoverState | null = null;

  vehicles: Vehicle[] = [];
  pedestrians: Pedestrian[] = [];
  incidents: Incident[] = [];
  signals: { node: number; state: SignalState; offset: number }[] = [];
  feed: FeedLine[] = [];
  notices: Notice[] = [];
  layers: Record<LayerKey, boolean> = {
    TRAFFIC: true,
    HEALTHCARE: true,
    POWER: true,
    WATER: false,
    EMERGENCY: true,
    POPULATION: false,
    WEATHER: true,
    DEPENDENCIES: false,
  };

  selectedId: string | null = null;
  followId: string | null = null;
  lightningAt = -999;
  disaster: DisasterState | null = null;
  interventions: Intervention[] = [];
  recoveryPlan: RecoveryStep[] = [];
  algorithmTrace: AlgorithmTrace[] = [];
  simulationSpeed = 1;
  private disasterId = 1;
  private disasterTickAccum = 0;
  private scenarioBaseline: null | { resilience: number; mobility: number; hospitalCapacity: number; powerLoad: number; waterReserve: number } = null;

  metrics: Metrics = {
    populationActive: 38420,
    vehiclesActive: BASE_VEHICLES,
    emsAvailable: 4,
    emsTotal: 4,
    powerLoad: 71,
    waterDemand: 63,
    waterOutput: 76,
    waterReserve: 82,
    hospitalCapacity: 74,
    mobility: 96,
    resilience: 92,
    aqi: 74,
    tempC: 27,
    visibilityKm: 9.6,
  };

  private feedId = 1;
  private noticeId = 1;
  private vehicleId = 1;
  private incidentId = 1;
  private metricAccum = 0;
  private eventAccum = 0;
  private nextEventIn = rand(25, 55);
  private listeners = new Set<() => void>();
  private civilianIndex = new Map<string, number>();

  constructor() {
    this.spawnTraffic();
    this.spawnEmergencyUnits();
    this.spawnPedestrians();
    this.signals = SIGNAL_NODES.map((node, i) => ({ node, state: 'RED' as SignalState, offset: i * 7 }));
    this.log('CITY MODEL ONLINE // NORMAL OPERATIONS', 'OK');
    this.log(`SECTOR GRID SYNCED // ${edges.length} SEGMENTS`, 'INFO');
  }

  /* ---------------- subscription ---------------- */

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  snapshot(): Snapshot {
    return {
      simSeconds: this.simSeconds,
      clock: clockString(this.simSeconds),
      autoTime: this.autoTime,
      weather: this.weather,
      traffic: this.traffic,
      metrics: { ...this.metrics },
      vehicles: this.vehicles.filter((v) => v.emergency).map((v) => ({ ...v })),
      assets: assets.map((a) => ({ ...a })),
      roads: this.roadStates(),
      incidents: this.incidents.filter((i) => i.active).map((i) => ({ ...i })),
      feed: this.feed.slice(0, 40),
      notices: [...this.notices],
      layers: { ...this.layers },
      selectedId: this.selectedId,
      followId: this.followId,
      lightningAt: this.lightningAt,
      status: this.statusLabel(),
      disaster: this.disaster ? { ...this.disaster, affectedEdges: [...this.disaster.affectedEdges], affectedAssets: [...this.disaster.affectedAssets], failedAssets: [...this.disaster.failedAssets] } : null,
      interventions: this.interventions.map((x) => ({ ...x })),
      recoveryPlan: this.recoveryPlan.map((x) => ({ ...x, unlocks: [...x.unlocks] })),
      algorithmTrace: this.algorithmTrace.map((x) => ({ ...x })),
      simulationSpeed: this.simulationSpeed,
      liveOps: {
        mode: this.dataMode,
        syncing: this.liveSyncing,
        lastSyncAt: this.liveLastSyncAt,
        weather: { ...this.liveWeather },
        traffic: { ...this.liveTraffic, samples: this.liveTraffic.samples.map((x) => ({ ...x })) },
        facilities: this.liveFacilities.map((x) => ({ ...x })),
        facilitiesError: this.liveFacilitiesError,
        signalControl: this.dataMode === 'LIVE' && this.liveTraffic.connected ? 'ADAPTIVE MODEL' : 'SIMULATED CYCLE',
        impact: this.impactAssessment(),
      },
      responsePlan: this.responsePlan(),
      mapProbe: this.mapProbe ? { ...this.mapProbe, facilities: this.mapProbe.facilities.map((f) => ({ ...f })) } : null,
      roadHover: this.roadHover ? { ...this.roadHover } : null,
      dependencyAnalysis: this.dependencyAnalysis(),
    };
  }

  statusLabel(): string {
    if (this.disaster) {
      if (this.disaster.phase === 'RECOVERY') return 'RECOVERING';
      if (this.disaster.phase === 'RESPONSE') return 'EMERGENCY RESPONSE';
      return 'MAJOR INCIDENT';
    }
    const severe = this.incidents.some((i) => i.active && i.severity === 'SEVERE');
    if (severe) return 'DEGRADED';
    if (this.incidents.some((i) => i.active)) return 'RESPONDING';
    if (this.weather === 'STORM' || this.weather === 'HEAVY RAIN') return 'WEATHER WATCH';
    return 'STABLE';
  }

  weatherLabel() {
    return WEATHER_LABEL[this.weather];
  }

  /* ---------------- feed / notices ---------------- */

  log(text: string, tone: FeedLine['tone'] = 'INFO') {
    this.feed.unshift({
      id: this.feedId++,
      stamp: clockString(this.simSeconds, true),
      text,
      tone,
    });
    if (this.feed.length > 120) this.feed.length = 120;
  }

  notice(title: string, lines: string[], tone: Notice['tone'] = 'ALERT') {
    this.notices.push({ id: this.noticeId++, title, lines, tone, bornAt: performance.now() });
    if (this.notices.length > 3) this.notices.shift();
  }

  setDataMode(mode: DataMode) {
    this.dataMode = mode;
    this.manualTraffic = mode === 'SIMULATION';
    this.autoTime = mode === 'LIVE';
    this.log(`DATA MODE // ${mode}`, 'INFO');
    if (mode === 'LIVE') void this.refreshLiveData();
    this.emit();
  }

  async refreshLiveData() {
    if (this.liveSyncing) return;
    this.liveSyncing = true;
    this.emit();
    const [weather, traffic, facilities] = await Promise.allSettled([
      fetchLiveWeather(),
      fetchLiveTraffic(),
      fetchLiveFacilities(),
    ]);

    if (weather.status === 'fulfilled') {
      this.liveWeather = weather.value;
      if (this.dataMode === 'LIVE') this.applyLiveWeather(weather.value);
    } else {
      this.liveWeather = { ...EMPTY_LIVE_WEATHER, error: String(weather.reason ?? 'weather sync failed') };
    }

    if (traffic.status === 'fulfilled') {
      this.liveTraffic = traffic.value;
      if (this.dataMode === 'LIVE' && traffic.value.connected) this.applyLiveTraffic(traffic.value);
    } else {
      this.liveTraffic = { ...EMPTY_LIVE_TRAFFIC, error: String(traffic.reason ?? 'traffic sync failed') };
    }

    if (facilities.status === 'fulfilled') {
      this.liveFacilities = facilities.value;
      this.liveFacilitiesError = '';
    } else {
      this.liveFacilities = [];
      this.liveFacilitiesError = String(facilities.reason ?? 'facility sync failed');
    }

    this.liveLastSyncAt = new Date().toISOString();
    this.liveSyncing = false;
    const connected = [this.liveWeather.connected, this.liveTraffic.connected, this.liveFacilities.length > 0].filter(Boolean).length;
    this.log(`LIVE DATA SYNC // ${connected}/3 CONNECTORS ACTIVE`, connected >= 2 ? 'OK' : 'INFO');
    this.emit();
  }

  private applyLiveWeather(w: LiveWeatherState) {
    // Open-Meteo `current` precipitation is a 15-minute model-derived amount.
    // Do NOT turn the Cesium rain effect on for trace precipitation alone.
    // Visible rain requires both a precipitation WMO code and a meaningful
    // current 15-minute amount, preventing a stale/light model signal from
    // making the city look rainy when the ground is actually dry.
    let mode: WeatherMode = 'CLEAR';
    const code = w.weatherCode;
    const precipCode = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
    const activeRain = precipCode && Math.max(w.precipitationMm, w.rainMm) >= 0.35;
    const heavyRain = precipCode && Math.max(w.precipitationMm, w.rainMm) >= 2.0;
    if (code >= 95 && activeRain) mode = 'STORM';
    else if (heavyRain) mode = 'HEAVY RAIN';
    else if (activeRain) mode = 'RAIN';
    else if ([45, 48].includes(code) || w.visibilityKm < 2.5) mode = 'FOG';
    else if (w.cloudPct > 65 || (precipCode && !activeRain)) mode = 'CLOUDY';
    this.weather = mode;
    this.metrics.tempC = w.temperatureC;
    this.metrics.visibilityKm = w.visibilityKm || WEATHER_VISIBILITY[mode];
    this.retunePedestrians();
    if (mode === 'STORM' || mode === 'HEAVY RAIN') {
      this.notice('LIVE WEATHER RISK', [`${w.condition} // ${w.precipitationMm.toFixed(1)} MM`, 'FLOOD / ACCESS IMPACT ESTIMATE UPDATED'], 'ALERT');
    }
  }

  private applyLiveTraffic(t: LiveTrafficState) {
    const ratio = t.speedRatio;
    const mode: TrafficMode = ratio < 0.28 ? 'GRIDLOCK' : ratio < 0.58 ? 'HEAVY' : ratio > 0.92 ? 'LIGHT' : 'NORMAL';
    this.traffic = mode;
    this.manualTraffic = false;

    // Bind every simulated road segment to its nearest TomTom flow sample.
    // This makes each vehicle's speed vary by the live traffic around the road
    // it is currently traversing instead of applying one city-wide multiplier.
    edges.forEach((e) => {
      const a = nodes[e.a]; const b = nodes[e.b];
      const [lon, lat] = toLonLat((a.x + b.x) / 2, (a.y + b.y) / 2);
      let nearest = t.samples[0];
      let best = Number.POSITIVE_INFINITY;
      for (const sample of t.samples) {
        const d = (sample.lat - lat) ** 2 + (sample.lon - lon) ** 2;
        if (d < best) { best = d; nearest = sample; }
      }
      if (nearest && nearest.freeFlowSpeedKmh > 0) {
        e.liveCurrentSpeedKmh = nearest.currentSpeedKmh;
        e.liveFreeFlowSpeedKmh = nearest.freeFlowSpeedKmh;
        e.liveSpeedRatio = clamp(nearest.currentSpeedKmh / nearest.freeFlowSpeedKmh, 0.05, 1.25);
        e.liveConfidence = nearest.confidence;
        const liveCongestion = 1 - Math.min(1, e.liveSpeedRatio);
        e.load = clamp(0.18 + liveCongestion * 1.45, 0.08, 1.95);
      }
    });

    this.metrics.vehiclesActive = this.activeVehicleCount();
    if (t.congestionPct > 45) {
      this.notice('LIVE TRAFFIC PRESSURE', [`${t.congestionPct.toFixed(0)}% CONGESTION`, 'ROAD-SPECIFIC AGENT SPEEDS + ADAPTIVE SIGNALS ACTIVE'], 'UNIT');
    }
  }

  private roadStates(): RoadState[] {
    return edges.map((e) => {
      const closed = e.closedUntil > this.simSeconds || e.capacity < 0.18;
      const ratio = e.liveFreeFlowSpeedKmh > 0 ? clamp(e.liveSpeedRatio, 0.05, 1.2) : clamp(1 - Math.max(0, e.load - 0.25) * 0.55, 0.08, 1);
      const free = e.liveFreeFlowSpeedKmh > 0 ? e.liveFreeFlowSpeedKmh : (e.arterial ? 45 : 32);
      const current = e.liveCurrentSpeedKmh > 0 ? e.liveCurrentSpeedKmh : free * ratio * e.capacity;
      const congestionPct = clamp((1 - Math.min(1, ratio)) * 100, 0, 100);
      const pressure = e.load / Math.max(0.08, e.capacity);
      const status: RoadState['status'] = closed ? 'CLOSED' : pressure > 1.2 || congestionPct > 72 ? 'GRIDLOCK' : pressure > 0.88 || congestionPct > 52 ? 'HEAVY' : pressure > 0.58 || congestionPct > 28 ? 'MODERATE' : 'FREE';
      return {
        key: e.key,
        corridor: e.corridor,
        arterial: e.arterial,
        capacityPct: Math.round(e.capacity * 100),
        loadRatio: pressure,
        congestionPct,
        modelVehicleCount: e.modelVehicleCount,
        currentSpeedKmh: current,
        freeFlowSpeedKmh: free,
        confidence: e.liveConfidence,
        status,
        source: this.dataMode === 'LIVE' && this.liveTraffic.connected && e.liveFreeFlowSpeedKmh > 0 ? 'LIVE+MODEL' : 'MODEL',
      };
    });
  }

  private pathMetrics(path: number[]): { corridors: string[]; etaMinutes: number; distanceKm: number } {
    let metres = 0; let seconds = 0;
    const corridors: string[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const e = edgeBetween(path[i], path[i + 1]);
      if (!e) continue;
      metres += e.length;
      if (!corridors.includes(e.corridor)) corridors.push(e.corridor);
      const free = e.liveFreeFlowSpeedKmh > 0 ? e.liveFreeFlowSpeedKmh : (e.arterial ? 45 : 32);
      const ratio = this.dataMode === 'LIVE' && e.liveFreeFlowSpeedKmh > 0 ? clamp(e.liveSpeedRatio, 0.08, 1.1) : clamp(1 - e.load * 0.35, 0.2, 1);
      const kmh = Math.max(6, free * ratio * clamp(e.capacity, 0.2, 1));
      seconds += (e.length / 1000) / kmh * 3600;
    }
    return { corridors, etaMinutes: Math.max(1, Math.round(seconds / 60)), distanceKm: metres / 1000 };
  }

  private responsePlan(): ResponsePlan | null {
    const inc = this.incidents.find((i) => i.active);
    const d = this.disaster;
    if (!inc && !d) return null;
    const x = inc?.x ?? d!.epicenterX;
    const y = inc?.y ?? d!.epicenterY;
    const [lon, lat] = toLonLat(x, y);
    const nearby = (kind: NearbyFacilityMatch['kind']) => this.liveFacilities
      .filter((f) => f.kind === kind)
      .map((f) => ({ id: f.id, name: f.name, kind: f.kind, distanceKm: haversineKm(lat, lon, f.lat, f.lon), source: f.source }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 4);

    const alternateRoutes: RouteAlternative[] = [];
    if (inc) {
      const edge = edgeByKey(inc.edgeKey);
      if (edge) {
        const baselinePath = findPath(edge.a, edge.b, this.simSeconds, false);
        const baseline = this.pathMetrics(baselinePath);
        const banned = new Set<string>([edge.key]);
        const alt1 = findPath(edge.a, edge.b, this.simSeconds, false, banned);
        if (alt1.length > 1) {
          const m1 = this.pathMetrics(alt1);
          alternateRoutes.push({ id: 'ALT-1', corridors: m1.corridors, etaMinutes: m1.etaMinutes, deltaMinutes: Math.max(1, m1.etaMinutes - baseline.etaMinutes), distanceKm: m1.distanceKm });
          const midIndex = Math.max(0, Math.floor((alt1.length - 1) / 2));
          if (alt1[midIndex + 1] !== undefined) {
            const extra = edgeBetween(alt1[midIndex], alt1[midIndex + 1]);
            const banned2 = new Set<string>([edge.key]);
            if (extra) banned2.add(extra.key);
            const alt2 = findPath(edge.a, edge.b, this.simSeconds, false, banned2);
            if (alt2.length > 1) {
              const m2 = this.pathMetrics(alt2);
              if (m2.corridors.join('>') !== m1.corridors.join('>')) alternateRoutes.push({ id: 'ALT-2', corridors: m2.corridors, etaMinutes: m2.etaMinutes, deltaMinutes: Math.max(1, m2.etaMinutes - baseline.etaMinutes), distanceKm: m2.distanceKm });
            }
          }
        }
      }
    }

    return {
      eventId: inc?.id ?? d!.id,
      eventLabel: inc ? `${inc.kind} // ${inc.severity}` : `${d!.kind} // ${Math.round(d!.severity * 100)}% SEVERITY`,
      roadLabel: inc ? `${inc.edgeId} // SEGMENT ${inc.edgeKey}` : `${d!.affectedEdges.length} AFFECTED ROAD SEGMENTS`,
      hospitals: nearby('HOSPITAL'),
      fireStations: nearby('FIRE'),
      policeStations: nearby('POLICE'),
      safeSites: nearby('SAFE'),
      alternateRoutes,
    };
  }

  private impactAssessment(): ImpactAssessment {
    const facilities = this.liveFacilities;
    const hospitals = facilities.filter((f) => f.kind === 'HOSPITAL').length || assets.filter((a) => a.kind === 'HOSPITAL').length;
    const fires = facilities.filter((f) => f.kind === 'FIRE').length || assets.filter((a) => a.kind === 'FIRE').length;
    const police = facilities.filter((f) => f.kind === 'POLICE').length || 1;
    const safe = facilities.filter((f) => f.kind === 'SAFE');

    const weatherRisk = this.weather === 'STORM' ? 0.72 : this.weather === 'HEAVY RAIN' ? 0.52 : this.weather === 'RAIN' || this.weather === 'FOG' ? 0.28 : this.weather === 'CLOUDY' ? 0.08 : 0.02;
    const trafficRisk = this.traffic === 'GRIDLOCK' ? 0.68 : this.traffic === 'HEAVY' ? 0.42 : this.traffic === 'NORMAL' ? 0.15 : 0.05;
    const incidentRisk = this.incidents.filter((x) => x.active).reduce((sum, x) => sum + (x.severity === 'SEVERE' ? 0.26 : x.severity === 'MODERATE' ? 0.12 : 0.05), 0);
    const baseExposure = this.disaster?.exposedPopulation ?? Math.round(this.metrics.populationActive * clamp(weatherRisk + trafficRisk * 0.5 + incidentRisk, 0.01, 0.6));
    const failed = this.disaster?.failedAssets.length ?? 0;
    const affected = Math.max(0, Math.round(baseExposure * clamp(0.48 + weatherRisk * 0.42 + trafficRisk * 0.28 + failed * 0.035, 0.18, 1.05)));
    const highRisk = Math.round(affected * clamp(0.12 + weatherRisk * 0.38 + failed * 0.05, 0.08, 0.72));
    const delayed = Math.round(this.activeVehicleCount() * (this.traffic === 'GRIDLOCK' ? 155 : this.traffic === 'HEAVY' ? 95 : 38) + this.incidents.filter((x) => x.active).length * 280);
    const evacuation = this.disaster ? Math.max(this.disaster.evacuated, Math.round(highRisk * 0.72)) : Math.round(highRisk * 0.18);
    const affectedRoads = this.disaster?.affectedEdges.length ?? this.incidents.filter((x) => x.active).length;
    const severity = this.disaster?.severity ?? clamp(weatherRisk + incidentRisk, 0.12, 0.9);
    const clearance = Math.round(12 + affectedRoads * 2.2 + severity * 34 + (this.traffic === 'GRIDLOCK' ? 18 : this.traffic === 'HEAVY' ? 8 : 0));
    const stabilise = Math.round(clearance * 1.7 + failed * 16);
    const alternate = Math.max(2, Math.round(3 + affectedRoads * 0.7 + trafficRisk * 12));

    let safeName = 'SIMULATED SAFE ZONE 01';
    let safeDistance = 0.8;
    if (safe.length) {
      let originLat: number; let originLon: number;
      if (this.disaster) [originLon, originLat] = toLonLat(this.disaster.epicenterX, this.disaster.epicenterY);
      else { [originLon, originLat] = toLonLat(0, 0); }
      const nearest = [...safe].sort((a, b) => haversineKm(originLat, originLon, a.lat, a.lon) - haversineKm(originLat, originLon, b.lat, b.lon))[0];
      safeName = nearest.name;
      safeDistance = haversineKm(originLat, originLon, nearest.lat, nearest.lon);
    }

    return {
      estimatedPeopleAffected: affected,
      highRiskPopulation: highRisk,
      roadUsersDelayed: delayed,
      evacuationRecommended: evacuation,
      hospitalsAvailable: hospitals,
      fireStationsAvailable: fires,
      policeStationsAvailable: police,
      safeSitesAvailable: safe.length || 4,
      emsBatchesRequired: Math.max(1, Math.ceil(highRisk / 90)),
      fireBatchesRequired: Math.max(0, Math.ceil((this.incidents.filter((x) => x.kind === 'FIRE' && x.active).length + (this.disaster ? severity * 2 : 0)))),
      policeBatchesRequired: Math.max(1, Math.ceil((affectedRoads + this.incidents.filter((x) => x.active).length) / 3)),
      estimatedRoadClearanceMinutes: clearance,
      estimatedStabilizationMinutes: stabilise,
      alternateRouteMinutes: alternate,
      nearestSafeSiteName: safeName,
      nearestSafeSiteDistanceKm: safeDistance,
      basis: `${this.dataMode === 'LIVE' ? 'live weather/traffic where connected + ' : ''}synthetic network exposure × access penalty × hazard severity`,
    };
  }

  /* ---------------- environment controls ---------------- */

  setTime(seconds: number) {
    this.simSeconds = ((seconds % 86400) + 86400) % 86400;
    if (!this.manualTraffic) this.applyTimeTraffic();
    this.emit();
  }

  nudgeTime(deltaMinutes: number) {
    this.setTime(this.simSeconds + deltaMinutes * 60);
  }

  setPreset(preset: TimePreset) {
    if (preset === 'DAY') this.setTime(12 * 3600);
    else if (preset === 'SUNSET') this.setTime(18 * 3600 + 20 * 60);
    else this.setTime(0);
  }

  toggleAutoTime() {
    this.autoTime = !this.autoTime;
    this.manualTraffic = !this.autoTime;
    this.log(`AUTO TIME // ${this.autoTime ? 'ENGAGED' : 'HELD'}`, 'INFO');
    this.emit();
  }

  setWeather(mode: WeatherMode) {
    this.weather = mode;
    this.metrics.visibilityKm = WEATHER_VISIBILITY[mode];
    this.metrics.tempC = mode === 'CLEAR' ? 27 : mode === 'CLOUDY' ? 25 : mode === 'FOG' ? 22 : 23;
    this.log(`WEATHER // ${WEATHER_LABEL[mode]}`, mode === 'STORM' ? 'ALERT' : 'INFO');
    if (mode === 'STORM') {
      this.notice('WEATHER ADVISORY', ['SEVERE RAIN // CITY WIDE', 'TRAFFIC DISRUPTION PROBABLE'], 'ALERT');
    }
    this.retunePedestrians();
    this.emit();
  }

  cycleWeather(dir = 1) {
    const i = WEATHER_MODES.indexOf(this.weather);
    this.setWeather(WEATHER_MODES[(i + dir + WEATHER_MODES.length) % WEATHER_MODES.length]);
  }

  setTraffic(mode: TrafficMode, manual = true) {
    if (this.traffic === mode) return;
    this.traffic = mode;
    if (manual) this.manualTraffic = true;
    this.log(`TRAFFIC STATE // ${mode}`, mode === 'GRIDLOCK' ? 'ALERT' : 'INFO');
    this.metrics.vehiclesActive = this.activeVehicleCount();
    this.emit();
  }

  cycleTraffic(dir = 1) {
    const i = TRAFFIC_MODES.indexOf(this.traffic);
    this.setTraffic(TRAFFIC_MODES[(i + dir + TRAFFIC_MODES.length) % TRAFFIC_MODES.length]);
  }

  toggleLayer(key: LayerKey) {
    this.layers[key] = !this.layers[key];
    this.emit();
  }

  liveTrafficSample(id: string) {
    return this.liveTraffic.samples.find((s) => s.id === id);
  }

  async probeMapPoint(lat: number, lon: number, radiusKm = 15) {
    const id = `MAP:${lat.toFixed(5)},${lon.toFixed(5)}`;
    this.mapProbe = { id, lat, lon, radiusKm, loading: true, error: '', facilities: [] };
    this.selectedId = id;
    this.emit();
    try {
      const facilities = await fetchFacilitiesAround(lat, lon, radiusKm * 1000);
      // Ignore a stale request if the user clicked elsewhere while it loaded.
      if (!this.mapProbe || this.mapProbe.id !== id) return;
      this.mapProbe = { ...this.mapProbe, loading: false, facilities, error: '' };
      this.log(`POINT QUERY // ${facilities.length} RESPONSE FACILITIES WITHIN ${radiusKm} KM`, 'INFO');
    } catch (err: any) {
      if (!this.mapProbe || this.mapProbe.id !== id) return;
      this.mapProbe = { ...this.mapProbe, loading: false, error: err?.message ?? String(err), facilities: [] };
    }
    this.emit();
  }

  clearMapProbe() {
    this.mapProbe = null;
    if (this.selectedId?.startsWith('MAP:')) this.selectedId = null;
    this.emit();
  }

  setRoadHover(hover: RoadHoverState | null) {
    const prev = this.roadHover;
    // Avoid a React update on every single mouse pixel while still keeping the
    // card attached to the pointer.
    if (prev && hover && prev.id === hover.id && Math.abs(prev.screenX - hover.screenX) < 5 && Math.abs(prev.screenY - hover.screenY) < 5) return;
    this.roadHover = hover;
    this.emit();
  }

  dependencyAnalysis(assetId?: string | null): DependencyAnalysis | null {
    const id = assetId ?? this.selectedId;
    if (!id || !assets.some((a) => a.id === id)) return null;
    return analyseDependencyFailure(id, this.metrics.populationActive);
  }

  traceAssetDependencies(id: string) {
    const analysis = this.dependencyAnalysis(id);
    if (!analysis) return;
    this.selectedId = id;
    this.layers.DEPENDENCIES = true;
    this.log(`DEPENDENCY TRACE // ${id} → ${analysis.affected.length} DOWNSTREAM ASSETS`, 'INFO');
    if (analysis.hiddenRelations.length) {
      this.notice('HIDDEN DEPENDENCIES DISCOVERED', [
        `${analysis.hiddenRelations.length} NON-OBVIOUS CROSS-LAYER LINKS`,
        `CASCADE RISK ${analysis.cascadeRisk}/100 // MODELLED EXPOSURE ${analysis.estimatedPeopleAffected.toLocaleString()}`,
      ], 'INFO');
    }
    this.algorithmTrace = [
      {
        id: `dep-${id}-${Date.now()}`,
        label: 'DEPENDENCY DISCOVERY',
        algorithm: analysis.algorithm,
        output: `${analysis.direct.length} direct / ${analysis.indirect.length} indirect / ${analysis.hiddenRelations.length} hidden`,
        tone: analysis.cascadeRisk >= 75 ? 'ALERT' : analysis.cascadeRisk >= 50 ? 'WARN' : 'INFO',
      },
      ...this.algorithmTrace.filter((x) => x.label !== 'DEPENDENCY DISCOVERY').slice(0, 20),
    ];
    this.emit();
  }

  select(id: string | null) {
    this.selectedId = id;
    if (id && assets.some((a) => a.id === id)) this.layers.DEPENDENCIES = true;
    this.emit();
  }

  follow(id: string | null) {
    this.followId = id;
    if (id) this.log(`CAMERA LOCK // ${id}`, 'UNIT');
    else this.log('CAMERA RELEASED', 'INFO');
    this.emit();
  }

  private applyTimeTraffic() {
    const h = this.simSeconds / 3600;
    let mode: TrafficMode = 'NORMAL';
    if (h >= 7.5 && h < 10.5) mode = 'HEAVY';
    else if (h >= 17 && h < 20) mode = 'HEAVY';
    else if (h >= 23 || h < 6) mode = 'LIGHT';
    else if (h >= 6 && h < 7.5) mode = 'LIGHT';
    if (this.weather === 'STORM' && mode === 'HEAVY') mode = 'GRIDLOCK';
    if (mode !== this.traffic) this.setTraffic(mode, false);
  }

  /* ---------------- population ---------------- */

  speedFactor() {
    // In LIVE mode road-level TomTom ratios are applied in edgeFactor(), so do
    // not double-penalise agents with a second city-wide traffic multiplier.
    const trafficFactor = this.dataMode === 'LIVE' && this.liveTraffic.connected ? 1 : TRAFFIC_SPEED[this.traffic];
    return WEATHER_SPEED[this.weather] * trafficFactor;
  }

  private targetVehicleCount() {
    return Math.min(MAX_VEHICLES, Math.round(BASE_VEHICLES * TRAFFIC_DENSITY[this.traffic]));
  }

  /** Civilian vehicles are pooled once; traffic mode changes how many are live. */
  activeVehicleCount() {
    return this.targetVehicleCount();
  }

  isVehicleLive(v: Vehicle) {
    if (v.emergency) return true;
    const i = this.civilianIndex.get(v.id);
    return i !== undefined && i < this.activeVehicleCount();
  }

  private spawnTraffic() {
    const target = MAX_VEHICLES;
    const civilians = this.vehicles.filter((v) => !v.emergency);
    while (civilians.length < target) {
      const start = Math.floor(Math.random() * nodes.length);
      const path = randomPath(start, this.simSeconds);
      const kind = Math.random() > 0.86 ? 'BUS' : Math.random() > 0.8 ? 'TRUCK' : 'CAR';
      const v: Vehicle = {
        id: `VH-${String(this.vehicleId++).padStart(3, '0')}`,
        kind,
        path,
        leg: 0,
        t: Math.random(),
        speed: kind === 'CAR' ? rand(9.5, 13.5) : rand(7, 9.5),
        x: nodes[start].x,
        y: nodes[start].y,
        heading: 0,
        emergency: false,
        status: 'PATROL',
        etaSeconds: 0,
        label: '',
      };
      this.civilianIndex.set(v.id, civilians.length);
      civilians.push(v);
      this.vehicles.push(v);
    }
    this.metrics.vehiclesActive = this.activeVehicleCount();
  }

  private spawnEmergencyUnits() {
    const units: [string, Vehicle['kind'], string][] = [
      ['EMS-01', 'EMS', 'E1'],
      ['EMS-02', 'EMS', 'E1'],
      ['EMS-03', 'EMS', 'E2'],
      ['EMS-04', 'EMS', 'E2'],
      ['FIRE-01', 'FIRE', 'F1'],
      ['FIRE-02', 'FIRE', 'F2'],
      ['PATROL-01', 'POLICE', 'F1'],
    ];
    units.forEach(([id, kind, stationId]) => {
      const station = assets.find((a) => a.id === stationId)!;
      this.vehicles.push({
        id,
        kind,
        path: [station.node],
        leg: 0,
        t: 0,
        speed: kind === 'FIRE' ? 18 : 22,
        x: station.x,
        y: station.y,
        heading: 0,
        emergency: true,
        station: station.node,
        status: 'STANDBY',
        etaSeconds: 0,
        label: id,
      });
    });
  }

  private spawnPedestrians() {
    for (let i = 0; i < 90; i++) {
      const start = Math.floor(Math.random() * nodes.length);
      this.pedestrians.push({
        id: `P${i}`,
        x: nodes[start].x,
        y: nodes[start].y,
        path: randomPath(start, this.simSeconds),
        leg: 0,
        t: Math.random(),
        speed: rand(1.1, 1.8),
        fleeing: false,
      });
    }
  }

  /** How many pedestrians are currently out, given weather / hour / incidents. */
  pedestrianActive(): number {
    const h = this.simSeconds / 3600;
    let factor = 1;
    if (h < 6 || h >= 22) factor *= 0.25;
    else if (h < 8 || h >= 20) factor *= 0.6;
    if (this.weather === 'RAIN') factor *= 0.6;
    if (this.weather === 'HEAVY RAIN' || this.weather === 'STORM') factor *= 0.3;
    if (this.weather === 'FOG') factor *= 0.7;
    return Math.round(this.pedestrians.length * factor);
  }

  private retunePedestrians() {
    this.metrics.populationActive = Math.round(
      38420 * (this.pedestrianActive() / this.pedestrians.length || 0.4)
    );
  }

  /* ---------------- incidents ---------------- */

  triggerAccident(): Incident {
    const arterials = edges.filter((e) => e.arterial && e.closedUntil <= this.simSeconds);
    const edge = pick(arterials.length ? arterials : edges);
    const a = nodes[edge.a];
    const b = nodes[edge.b];
    const before = Math.round(edge.capacity * 100);
    const after = Math.round(rand(32, 46));
    edge.capacity = after / 100;
    edge.closedUntil = this.simSeconds + 900;

    const inc: Incident = {
      id: `INC-${String(this.incidentId++).padStart(3, '0')}`,
      kind: 'ACCIDENT',
      severity: 'MODERATE',
      edgeId: edge.id,
      edgeKey: edge.key,
      zone: `Z${1 + (edge.a % 9)}`,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      openedAt: this.simSeconds,
      clearanceSeconds: Math.round(rand(14, 22)) * 60,
      capacityBefore: before,
      capacityAfter: after,
      corridor: [],
      active: true,
    };
    this.incidents.push(inc);

    this.log(`COLLISION REPORTED // ${edge.id}`, 'ALERT');
    this.notice('PRIORITY EVENT', [`COLLISION // ROAD ${edge.id}`, 'EMS RESPONSE INITIATED'], 'ALERT');
    this.dispatch('EMS', inc, edge.b);
    this.dispatch('POLICE', inc, edge.b);
    this.log(`${edge.id} CAPACITY ${before}% -> ${after}%`, 'ALERT');
    this.rerouteAround(edge.key);
    this.log(`TRAFFIC DIVERTED VIA ${pick(edges.filter((e) => e.id !== edge.id)).id}`, 'INFO');
    this.metrics.mobility = clamp(this.metrics.mobility - rand(5, 9), 40, 100);
    this.metrics.resilience = clamp(this.metrics.resilience - rand(2, 4), 30, 100);
    this.metrics.hospitalCapacity = clamp(this.metrics.hospitalCapacity + rand(1, 3), 20, 100);
    this.emit();
    return inc;
  }

  triggerFire(): Incident {
    const edge = pick(edges);
    const a = nodes[edge.a];
    const inc: Incident = {
      id: `INC-${String(this.incidentId++).padStart(3, '0')}`,
      kind: 'FIRE',
      severity: 'MODERATE',
      edgeId: edge.id,
      edgeKey: edge.key,
      zone: `Z${1 + (edge.a % 9)}`,
      x: a.x + rand(-120, 120),
      y: a.y + rand(-120, 120),
      openedAt: this.simSeconds,
      clearanceSeconds: Math.round(rand(18, 28)) * 60,
      capacityBefore: 100,
      capacityAfter: 70,
      corridor: [],
      active: true,
    };
    this.incidents.push(inc);
    edge.capacity = 0.7;

    this.log(`STRUCTURE FIRE // ZONE ${inc.zone}`, 'ALERT');
    this.notice('PRIORITY EVENT', [`FIRE // ZONE ${inc.zone}`, 'FIRE RESPONSE INITIATED'], 'ALERT');
    this.dispatch('FIRE', inc, edge.a);
    this.metrics.resilience = clamp(this.metrics.resilience - rand(3, 6), 30, 100);
    this.metrics.waterDemand = clamp(this.metrics.waterDemand + rand(3, 6), 30, 100);
    this.emit();
    return inc;
  }

  triggerMinorEvent(kind?: IncidentKind) {
    const k = kind ?? pick(MINOR_EVENTS);
    const edge = pick(edges);
    const a = nodes[edge.a];
    const b = nodes[edge.b];
    const before = Math.round(edge.capacity * 100);
    const after = Math.round(clamp(before - rand(12, 34), 35, 95));
    edge.capacity = after / 100;

    const inc: Incident = {
      id: `INC-${String(this.incidentId++).padStart(3, '0')}`,
      kind: k,
      severity: 'MINOR',
      edgeId: edge.id,
      edgeKey: edge.key,
      zone: `Z${1 + (edge.a % 9)}`,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      openedAt: this.simSeconds,
      clearanceSeconds: Math.round(rand(8, 18)) * 60,
      capacityBefore: before,
      capacityAfter: after,
      corridor: [],
      active: true,
    };
    this.incidents.push(inc);
    this.log(`${k} // ${edge.id}`, 'INFO');
    if (k === 'POWER FLUCTUATION') {
      const sub = pick(assets.filter((x) => x.kind === 'POWER'));
      sub.primary = clamp(sub.primary + rand(6, 14), 30, 100);
      this.log(`${sub.id} LOAD ${Math.round(sub.primary)}%`, sub.primary > 88 ? 'ALERT' : 'INFO');
    }
    if (k === 'SIGNAL FAILURE') {
      const sig = pick(this.signals);
      sig.state = 'RED';
      this.log(`SIGNAL FAULT // NODE ${sig.node}`, 'ALERT');
    }
    this.metrics.mobility = clamp(this.metrics.mobility - rand(1, 4), 40, 100);
    this.emit();
  }

  triggerJam() {
    this.setTraffic('GRIDLOCK');
    this.triggerMinorEvent('TRAFFIC JAM');
  }

  /* ---------------- major disaster / resilience laboratory ---------------- */

  setSimulationSpeed(speed: number) {
    this.simulationSpeed = clamp(speed, 0.5, 8);
    this.log(`SIMULATION RATE // ${this.simulationSpeed.toFixed(1)}X`, 'INFO');
    this.emit();
  }

  /** Deterministic pseudo-random value from a string. Useful for reproducible
   * scenario damage instead of hard-coding which asset fails. */
  private seeded01(key: string) {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10000) / 10000;
  }

  private nearestEdge(x: number, y: number) {
    return [...edges].sort((ea, eb) => {
      const amid = { x: (nodes[ea.a].x + nodes[ea.b].x) / 2, y: (nodes[ea.a].y + nodes[ea.b].y) / 2 };
      const bmid = { x: (nodes[eb.a].x + nodes[eb.b].x) / 2, y: (nodes[eb.a].y + nodes[eb.b].y) / 2 };
      return Math.hypot(amid.x - x, amid.y - y) - Math.hypot(bmid.x - x, bmid.y - y);
    })[0];
  }

  private resetNetworkForScenario() {
    // Preserve normal city-life incidents only visually; major scenarios start
    // from a clean capacity baseline so results are repeatable in demos.
    edges.forEach((e) => {
      e.capacity = 1;
      e.load = 0.25;
      e.closedUntil = 0;
    });
    assets.forEach((a) => {
      a.status = 'NOMINAL';
      if (a.kind === 'POWER') a.primary = a.id === 'P2' ? 81 : a.id === 'P1' ? 67 : 58;
      if (a.kind === 'HOSPITAL') a.primary = a.id === 'H1' ? 63 : 76;
    });
    this.incidents.forEach((i) => (i.active = false));
    this.vehicles.filter((v) => v.emergency).forEach((v) => {
      v.targetIncident = undefined;
      v.status = 'STANDBY';
      const station = v.station ?? v.path[0] ?? 0;
      v.path = [station]; v.leg = 0; v.t = 0;
      v.x = nodes[station].x; v.y = nodes[station].y;
    });
    this.metrics.emsAvailable = this.availableEms();
  }

  triggerDisaster(kind: DisasterKind) {
    this.resetNetworkForScenario();
    this.scenarioBaseline = {
      resilience: this.metrics.resilience,
      mobility: this.metrics.mobility,
      hospitalCapacity: this.metrics.hospitalCapacity,
      powerLoad: this.metrics.powerLoad,
      waterReserve: this.metrics.waterReserve,
    };
    this.interventions = [];
    this.recoveryPlan = [];
    this.algorithmTrace = [];

    let x = 0, y = 0, radius = 920, severity = 0.78;
    let magnitude: number | undefined;
    let rainfallMm: number | undefined;
    if (kind === 'FLOOD') {
      x = 420; y = -520; radius = 1120; severity = 0.82; rainfallMm = 238;
      this.setWeather('HEAVY RAIN');
    } else if (kind === 'EARTHQUAKE') {
      x = -120; y = 80; radius = 1450; severity = 0.84; magnitude = 6.4;
      this.setWeather('CLEAR');
    } else if (kind === 'GRID CASCADE') {
      const p2 = assets.find((a) => a.id === 'P2')!;
      x = p2.x; y = p2.y; radius = 1500; severity = 0.76;
    } else {
      x = 260; y = -260; radius = 1500; severity = 0.9; magnitude = 5.8; rainfallMm = 210;
      this.setWeather('STORM');
    }

    const id = `DS-${String(this.disasterId++).padStart(3, '0')}`;
    this.disaster = {
      id,
      kind,
      phase: 'ONSET',
      startedAt: this.simSeconds,
      elapsedSeconds: 0,
      severity,
      magnitude,
      rainfallMm,
      epicenterX: x,
      epicenterY: y,
      radius,
      affectedEdges: [],
      affectedAssets: [],
      failedAssets: [],
      evacuated: 0,
      exposedPopulation: Math.round(62000 + severity * 82000),
      confidence: kind === 'EARTHQUAKE' ? 0.76 : kind === 'FLOOD' ? 0.84 : 0.81,
      scenarioLabel: kind === 'FLOOD' ? 'EXTREME RAINFALL / URBAN FLOOD' : kind === 'EARTHQUAKE' ? 'M6.4 SEISMIC EVENT' : kind === 'GRID CASCADE' ? 'PRIMARY SUBSTATION LOSS' : 'COMPOUND WEATHER + SEISMIC EVENT',
    };

    this.layers.TRAFFIC = true;
    this.layers.EMERGENCY = true;
    this.layers.POPULATION = true;
    this.layers.DEPENDENCIES = true;
    this.setTraffic(kind === 'FLOOD' || kind === 'COMPOUND' ? 'HEAVY' : 'NORMAL');

    this.log(`MAJOR SCENARIO // ${this.disaster.scenarioLabel}`, 'ALERT');
    this.notice('CITADEL MAJOR INCIDENT', [this.disaster.scenarioLabel, 'SIMULATION ENGINE RUNNING'], 'ALERT');
    this.algorithmTrace.push({ id: 'hazard', label: 'HAZARD MODEL', algorithm: kind === 'EARTHQUAKE' ? 'distance-decay fragility model' : kind === 'FLOOD' ? 'rainfall × drainage × exposure model' : kind === 'GRID CASCADE' ? 'load redistribution + threshold cascade' : 'multi-hazard composition', output: 'initial exposure field generated', tone: 'INFO' });
    this.applyInitialDisasterDamage(kind);
    this.buildInterventions();
    this.optimizeRecovery(false);
    this.dispatchDisasterResponse();
    this.emit();
  }

  private applyInitialDisasterDamage(kind: DisasterKind) {
    if (!this.disaster) return;
    const d = this.disaster;
    const affectedEdges: string[] = [];
    const affectedAssets: string[] = [];
    const failedAssets: string[] = [];

    const applyFlood = (strength = 1) => {
      edges.forEach((e) => {
        const a = nodes[e.a], b = nodes[e.b];
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const dist = Math.hypot(mx - d.epicenterX, my - d.epicenterY);
        if (dist > d.radius) return;
        const exposure = 1 - dist / d.radius;
        // Synthetic drainage field: deterministic and explicitly labelled as modelled.
        const drainagePenalty = 0.72 + this.seeded01(`drain-${e.key}`) * 0.58;
        const arterialProtection = e.arterial ? 0.86 : 1.05;
        const risk = exposure * d.severity * drainagePenalty * arterialProtection * strength;
        if (risk > 0.22) {
          affectedEdges.push(e.key);
          e.capacity = clamp(1 - risk * 0.95, 0.08, 0.86);
          if (risk > 0.68) e.closedUntil = this.simSeconds + 7200;
        }
      });
      assets.forEach((a) => {
        const dist = Math.hypot(a.x - d.epicenterX, a.y - d.epicenterY);
        const exposure = clamp(1 - dist / d.radius, 0, 1);
        const vuln = a.kind === 'WATER' ? 1.15 : a.kind === 'POWER' ? 1.0 : a.kind === 'HOSPITAL' ? 0.65 : 0.75;
        const risk = exposure * d.severity * vuln * strength;
        if (risk > 0.18) {
          affectedAssets.push(a.id);
          a.status = risk > 0.7 ? 'CRITICAL' : risk > 0.42 ? 'WARNING' : 'ELEVATED';
          a.primary = clamp(a.primary + risk * 14, 0, 100);
          if (risk > 0.82 && a.kind !== 'HOSPITAL') { a.status = 'FAILED'; failedAssets.push(a.id); }
        }
      });
    };

    const applyEarthquake = (strength = 1) => {
      const quakeRisks: { id: string; risk: number }[] = [];
      const failedBefore = failedAssets.length;
      edges.forEach((e) => {
        const a = nodes[e.a], b = nodes[e.b];
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const dist = Math.max(80, Math.hypot(mx - d.epicenterX, my - d.epicenterY));
        const shaking = clamp((d.magnitude ?? 6.0) / 6.8 * (1 - dist / (d.radius * 1.25)), 0, 1);
        const fragility = 0.55 + this.seeded01(`road-frag-${e.key}`) * 0.65;
        const risk = shaking * fragility * d.severity * strength;
        if (risk > 0.26) {
          affectedEdges.push(e.key);
          e.capacity = clamp(1 - risk * 0.82, 0.12, 0.9);
          if (risk > 0.74) e.closedUntil = this.simSeconds + 5400;
        }
      });
      assets.forEach((a) => {
        const dist = Math.max(60, Math.hypot(a.x - d.epicenterX, a.y - d.epicenterY));
        const shaking = clamp((d.magnitude ?? 6.0) / 6.8 * (1 - dist / (d.radius * 1.3)), 0, 1);
        const baseVuln = a.kind === 'HOSPITAL' ? 0.55 : a.kind === 'POWER' ? 0.88 : a.kind === 'WATER' ? 0.82 : 0.7;
        const fragility = baseVuln * (0.7 + this.seeded01(`asset-frag-${a.id}`) * 0.6);
        const failureP = clamp(shaking * fragility * d.severity * strength, 0, 0.98);
        quakeRisks.push({ id: a.id, risk: failureP });
        if (failureP > 0.18) {
          affectedAssets.push(a.id);
          a.status = failureP > 0.60 ? 'FAILED' : failureP > 0.44 ? 'CRITICAL' : 'WARNING';
          if (a.status === 'FAILED') failedAssets.push(a.id);
        }
      });
      if (failedAssets.length === failedBefore) {
        const top = [...quakeRisks].sort((a, b) => b.risk - a.risk)[0];
        if (top && top.risk > 0.30) {
          const a = assets.find((x) => x.id === top.id)!;
          a.status = 'FAILED';
          failedAssets.push(a.id);
          if (!affectedAssets.includes(a.id)) affectedAssets.push(a.id);
        }
      }
      this.algorithmTrace.push({ id: 'fragility', label: 'FRAGILITY PASS', algorithm: 'distance attenuation × asset vulnerability', output: `${affectedAssets.length} assets exposed / ${failedAssets.length - failedBefore} structural failure(s)`, tone: 'WARN' });
    };

    if (kind === 'FLOOD') applyFlood();
    if (kind === 'EARTHQUAKE') applyEarthquake();
    if (kind === 'GRID CASCADE') {
      const p2 = assets.find((a) => a.id === 'P2')!;
      p2.status = 'FAILED'; p2.primary = 0; affectedAssets.push('P2'); failedAssets.push('P2');
      this.runGridCascade(0.95, affectedAssets, failedAssets);
    }
    if (kind === 'COMPOUND') {
      applyFlood(0.85);
      applyEarthquake(0.72);
      this.runGridCascade(0.72, affectedAssets, failedAssets);
    }

    d.affectedEdges = Array.from(new Set(affectedEdges));
    d.affectedAssets = Array.from(new Set(affectedAssets));
    d.failedAssets = Array.from(new Set(failedAssets));
    this.algorithmTrace.push({ id: 'routing', label: 'ROUTING PASS', algorithm: 'dynamic Dijkstra shortest path', output: `${d.affectedEdges.length} road segments re-weighted`, tone: 'WARN' });
    this.rerouteDisasterTraffic();
    this.startEvacuation();
    this.recalculateDisasterMetrics();
  }

  private runGridCascade(strength: number, affectedAssets: string[], failedAssets: string[]) {
    const p = assets.filter((a) => a.kind === 'POWER');
    const failed = p.filter((a) => a.status === 'FAILED');
    const lost = failed.length ? 38 * failed.length * strength : 28 * strength;
    const survivors = p.filter((a) => a.status !== 'FAILED');
    survivors.forEach((a) => {
      a.primary = clamp(a.primary + lost / Math.max(1, survivors.length), 0, 125);
      affectedAssets.push(a.id);
      if (a.primary > 104) { a.status = 'FAILED'; failedAssets.push(a.id); }
      else if (a.primary > 92) a.status = 'CRITICAL';
      else if (a.primary > 84) a.status = 'WARNING';
    });
    // Dependency propagation: central grid influences hospital/water/transit.
    const powerFailed = p.filter((a) => a.status === 'FAILED').length;
    if (powerFailed) {
      ['H1', 'H2', 'W1', 'T1'].forEach((id, i) => {
        const a = assets.find((x) => x.id === id)!;
        affectedAssets.push(id);
        if (a.kind === 'HOSPITAL') {
          a.status = powerFailed >= 2 ? 'CRITICAL' : 'WARNING';
          a.primary = clamp(a.primary + 8 + powerFailed * 4, 0, 100);
        } else if (a.kind === 'WATER') {
          a.status = powerFailed >= 2 ? 'CRITICAL' : 'WARNING';
          a.primary = clamp(a.primary - 14 * powerFailed, 10, 100);
        } else a.status = 'WARNING';
      });
    }
    this.algorithmTrace.push({ id: `grid-${Date.now()}`, label: 'GRID CASCADE', algorithm: 'load redistribution + threshold failure', output: `${powerFailed} substations unavailable`, tone: powerFailed > 1 ? 'ALERT' : 'WARN' });
  }

  private rerouteDisasterTraffic() {
    if (!this.disaster) return;
    let rerouted = 0;
    this.vehicles.forEach((v) => {
      if (v.emergency) return;
      const dest = v.path[v.path.length - 1] ?? Math.floor(Math.random() * nodes.length);
      const start = v.path[Math.min(v.leg, v.path.length - 1)] ?? 0;
      const old = v.path.join('-');
      const next = findPath(start, dest, this.simSeconds + 30);
      if (next.join('-') !== old) rerouted++;
      v.path = next; v.leg = 0; v.t = 0;
    });
    this.log(`DYNAMIC ROUTING // ${rerouted} VEHICLES REASSIGNED`, 'INFO');
  }

  private startEvacuation() {
    if (!this.disaster) return;
    const d = this.disaster;
    // Use corner nodes as synthetic shelters; Dijkstra chooses the reachable one.
    const shelters = [0, 7, 56, 63];
    let reps = 0;
    this.pedestrians.forEach((p) => {
      const dist = Math.hypot(p.x - d.epicenterX, p.y - d.epicenterY);
      if (dist > d.radius * 0.82) return;
      const current = [...nodes].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0].id;
      const shelter = [...shelters].sort((a, b) => {
        const da = Math.hypot(nodes[a].x - d.epicenterX, nodes[a].y - d.epicenterY);
        const db = Math.hypot(nodes[b].x - d.epicenterX, nodes[b].y - d.epicenterY);
        return db - da;
      })[0];
      p.path = findPath(current, shelter, this.simSeconds);
      p.leg = 0; p.t = 0; p.fleeing = true; p.speed = Math.max(1.8, p.speed * 1.5);
      reps++;
    });
    d.evacuated = reps * 420;
    this.log(`EVACUATION MODEL // ${d.evacuated.toLocaleString()} PEOPLE REPRESENTED`, 'UNIT');
    this.algorithmTrace.push({ id: 'evac', label: 'EVACUATION ROUTING', algorithm: 'safe-zone Dijkstra routing', output: `${reps} visible agents rerouted to shelters`, tone: 'OK' });
  }

  private dispatchDisasterResponse() {
    if (!this.disaster) return;
    const d = this.disaster;
    const edge = this.nearestEdge(d.epicenterX, d.epicenterY);
    const inc: Incident = {
      id: `INC-${String(this.incidentId++).padStart(3, '0')}`,
      kind: 'ACCIDENT', severity: 'SEVERE', edgeId: edge.id, edgeKey: edge.key,
      zone: 'DISASTER ZONE', x: d.epicenterX, y: d.epicenterY,
      openedAt: this.simSeconds, clearanceSeconds: 5400,
      capacityBefore: Math.round(edge.capacity * 100), capacityAfter: Math.round(edge.capacity * 100),
      corridor: [], active: true,
    };
    this.incidents.push(inc);
    this.dispatch('EMS', inc, edge.a);
    this.dispatch('FIRE', inc, edge.b);
    // Second ambulance independently routes to the opposite side when possible.
    this.dispatch('EMS', inc, edge.b);
    this.algorithmTrace.push({ id: 'dispatch', label: 'RESOURCE DISPATCH', algorithm: 'nearest available unit + priority routing', output: 'EMS / fire response corridors computed', tone: 'OK' });
  }

  private buildInterventions() {
    if (!this.disaster) return;
    const k = this.disaster.kind;
    const common: Intervention[] = [
      { id: 'GREEN-CORRIDOR', title: 'ACTIVATE EMERGENCY GREEN CORRIDOR', description: 'Reserve the lowest-cost connected route for EMS and evacuation traffic.', costLakhs: 1.2, resilienceGain: 7, cascadeReduction: 22, etaMinutes: 4, algorithm: 'multi-objective shortest path', applied: false },
      { id: 'MOBILE-EMS', title: 'FORWARD-DEPLOY MOBILE MEDICAL UNIT', description: 'Move emergency capacity closer to the highest exposure zone.', costLakhs: 3.4, resilienceGain: 8, cascadeReduction: 18, etaMinutes: 12, algorithm: 'facility-location heuristic', applied: false },
    ];
    if (k === 'FLOOD' || k === 'COMPOUND') common.push({ id: 'PUMP-CORRIDOR', title: 'PROTECT DRAINAGE + EVACUATION CORRIDOR', description: 'Reopen the best arterial pair and reduce flood impedance on connected roads.', costLakhs: 4.8, resilienceGain: 13, cascadeReduction: 36, etaMinutes: 18, algorithm: 'benefit-cost edge restoration', applied: false });
    if (k === 'EARTHQUAKE' || k === 'COMPOUND') common.push({ id: 'RAPID-INSPECTION', title: 'RAPID BRIDGE / ROUTE INSPECTION', description: 'Prioritise high-betweenness damaged links to recover network connectivity.', costLakhs: 2.6, resilienceGain: 10, cascadeReduction: 29, etaMinutes: 15, algorithm: 'betweenness + accessibility score', applied: false });
    if (k === 'GRID CASCADE' || k === 'COMPOUND') common.push({ id: 'BACKUP-GENERATOR', title: 'DEPLOY HOSPITAL + WATER BACKUP POWER', description: 'Protect dependent critical services while grid load is rebalanced.', costLakhs: 4.1, resilienceGain: 14, cascadeReduction: 41, etaMinutes: 9, algorithm: 'dependency-cut optimisation', applied: false });
    const best = [...common].sort((a, b) => (b.resilienceGain * b.cascadeReduction) / b.costLakhs - (a.resilienceGain * a.cascadeReduction) / a.costLakhs)[0];
    best.recommended = true;
    this.interventions = common;
  }

  applyIntervention(id: string) {
    if (!this.disaster) return;
    const item = this.interventions.find((x) => x.id === id);
    if (!item || item.applied) return;
    item.applied = true;
    this.disaster.phase = 'RESPONSE';
    this.metrics.resilience = clamp(this.metrics.resilience + item.resilienceGain, 0, 100);
    this.metrics.mobility = clamp(this.metrics.mobility + Math.round(item.cascadeReduction * 0.18), 0, 100);

    if (id === 'GREEN-CORRIDOR') {
      const candidates = edges.filter((e) => e.capacity < 0.75).sort((a, b) => b.arterial === a.arterial ? a.capacity - b.capacity : Number(b.arterial) - Number(a.arterial)).slice(0, 4);
      candidates.forEach((e) => { e.capacity = Math.max(e.capacity, 0.82); e.closedUntil = 0; });
      this.rerouteDisasterTraffic();
    }
    if (id === 'BACKUP-GENERATOR') {
      assets.filter((a) => a.kind === 'HOSPITAL' || a.kind === 'WATER').forEach((a) => {
        if (a.status === 'FAILED' || a.status === 'CRITICAL') a.status = 'WARNING';
      });
      this.metrics.hospitalCapacity = clamp(this.metrics.hospitalCapacity - 8, 20, 100);
      this.metrics.waterOutput = clamp(this.metrics.waterOutput + 14, 0, 100);
    }
    if (id === 'PUMP-CORRIDOR') {
      edges.filter((e) => e.capacity < 0.5).slice(0, 8).forEach((e) => { e.capacity = Math.min(1, e.capacity + 0.35); if (e.capacity > 0.55) e.closedUntil = 0; });
      this.metrics.waterReserve = clamp(this.metrics.waterReserve + 7, 0, 100);
      this.rerouteDisasterTraffic();
    }
    if (id === 'RAPID-INSPECTION') {
      edges.filter((e) => e.closedUntil > this.simSeconds).slice(0, 5).forEach((e) => { e.closedUntil = 0; e.capacity = Math.max(e.capacity, 0.7); });
      this.rerouteDisasterTraffic();
    }
    if (id === 'MOBILE-EMS') {
      this.metrics.hospitalCapacity = clamp(this.metrics.hospitalCapacity - 6, 20, 100);
      this.metrics.emsAvailable = clamp(this.metrics.emsAvailable + 1, 0, this.metrics.emsTotal);
    }
    this.log(`INTERVENTION APPLIED // ${item.title}`, 'OK');
    this.notice('RESPONSE ACTION', [item.title, `MODELLED CASCADE REDUCTION ${item.cascadeReduction}%`], 'UNIT');
    this.algorithmTrace.push({ id: `int-${id}`, label: 'INTERVENTION', algorithm: item.algorithm, output: `+${item.resilienceGain} resilience / ${item.cascadeReduction}% cascade reduction`, tone: 'OK' });
    this.recalculateDisasterMetrics();
    this.optimizeRecovery(false);
    this.emit();
  }

  applyBestIntervention() {
    const best = this.interventions.find((x) => x.recommended && !x.applied) ?? this.interventions.find((x) => !x.applied);
    if (best) this.applyIntervention(best.id);
  }

  optimizeRecovery(announce = true) {
    if (!this.disaster) return;
    const candidates = assets.filter((a) => a.status === 'FAILED' || a.status === 'CRITICAL' || a.status === 'WARNING');
    const typeWeight: Record<string, number> = { POWER: 1.35, HOSPITAL: 1.3, WATER: 1.2, EMS: 1.15, FIRE: 1.1, TRANSIT: 0.9 };
    const unlockMap: Record<string, string[]> = {
      P1: ['H2', 'W1'], P2: ['H1', 'W1', 'T1'], P3: ['H2'], W1: ['H1'], H1: ['EMS ACCESS'], H2: ['EMS ACCESS'], T1: ['MOBILITY'],
    };
    const scored = candidates.map((a) => {
      const restore = a.kind === 'POWER' ? 38 : a.kind === 'HOSPITAL' ? 26 : a.kind === 'WATER' ? 32 : 18;
      const unlocks = unlockMap[a.id] ?? [];
      const severity = a.status === 'FAILED' ? 1.5 : a.status === 'CRITICAL' ? 1.25 : 0.8;
      const score = (typeWeight[a.kind] ?? 1) * severity * (1 + unlocks.length * 0.35) / restore;
      return { a, restore, unlocks, score };
    }).sort((a, b) => b.score - a.score);
    this.recoveryPlan = scored.slice(0, 6).map((x, i) => ({ order: i + 1, assetId: x.a.id, label: x.a.name, restoreMinutes: x.restore, unlocks: x.unlocks, score: x.score, completed: false }));
    if (announce) {
      this.disaster.phase = 'RECOVERY';
      this.log(`RECOVERY OPTIMIZER // ${this.recoveryPlan.length} PRIORITY ACTIONS`, 'INFO');
      this.algorithmTrace.push({ id: 'recovery', label: 'RECOVERY OPTIMIZER', algorithm: 'criticality × dependency unlock / repair time', output: this.recoveryPlan[0] ? `restore ${this.recoveryPlan[0].assetId} first` : 'no critical repair required', tone: 'OK' });
      this.emit();
    }
  }

  runRecoveryStep() {
    if (!this.disaster) return;
    if (!this.recoveryPlan.length) this.optimizeRecovery(false);
    const step = this.recoveryPlan.find((s) => !s.completed);
    if (!step) {
      this.disaster.phase = 'RECOVERY';
      this.metrics.resilience = clamp(this.metrics.resilience + 5, 0, 100);
      this.log('RECOVERY PLAN COMPLETE // NETWORK STABILISED', 'OK');
      this.emit();
      return;
    }
    step.completed = true;
    const a = assets.find((x) => x.id === step.assetId);
    if (a) { a.status = 'RECOVERING'; a.primary = a.kind === 'POWER' ? 72 : a.kind === 'HOSPITAL' ? 70 : a.primary; }
    this.metrics.resilience = clamp(this.metrics.resilience + 4.5, 0, 100);
    this.metrics.mobility = clamp(this.metrics.mobility + 3, 0, 100);
    this.disaster.phase = 'RECOVERY';
    this.log(`RECOVERY STEP ${step.order} // ${step.assetId} RESTORATION STARTED`, 'OK');
    window.setTimeout(() => {
      if (a) a.status = 'NOMINAL';
      this.emit();
    }, 1200);
    this.emit();
  }

  resetDisaster() {
    this.disaster = null;
    this.interventions = [];
    this.recoveryPlan = [];
    this.algorithmTrace = [];
    this.simulationSpeed = 1;
    this.resetNetworkForScenario();
    this.setWeather('CLEAR');
    this.setTraffic('NORMAL');
    const b = this.scenarioBaseline;
    if (b) {
      this.metrics.resilience = b.resilience;
      this.metrics.mobility = b.mobility;
      this.metrics.hospitalCapacity = b.hospitalCapacity;
      this.metrics.powerLoad = b.powerLoad;
      this.metrics.waterReserve = b.waterReserve;
    } else {
      this.metrics.resilience = 92; this.metrics.mobility = 96;
    }
    this.layers.POPULATION = false;
    this.layers.DEPENDENCIES = false;
    this.log('MAJOR SCENARIO RESET // NORMAL OPERATIONS', 'OK');
    this.emit();
  }

  runRedTeam() {
    // Fast structural vulnerability search over asset pairs. The score combines
    // dependency degree, distance to critical services and road centrality proxy.
    const candidates = assets.filter((a) => ['POWER', 'HOSPITAL', 'WATER', 'TRANSIT'].includes(a.kind));
    const pairs: { a: string; b: string; score: number }[] = [];
    for (let i = 0; i < candidates.length; i++) for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i], b = candidates[j];
      const diversity = a.kind === b.kind ? 0.82 : 1.18;
      const centralA = 1 / (1 + Math.hypot(a.x, a.y) / 1500);
      const centralB = 1 / (1 + Math.hypot(b.x, b.y) / 1500);
      const critical = (a.kind === 'POWER' ? 1.25 : a.kind === 'HOSPITAL' ? 1.2 : 1) * (b.kind === 'POWER' ? 1.25 : b.kind === 'HOSPITAL' ? 1.2 : 1);
      pairs.push({ a: a.id, b: b.id, score: diversity * critical * (centralA + centralB) });
    }
    pairs.sort((a, b) => b.score - a.score);
    const best = pairs[0];
    this.algorithmTrace.unshift({ id: `red-${Date.now()}`, label: 'RESILIENCE RED TEAM', algorithm: 'pairwise structural stress search', output: `${best.a} + ${best.b} = highest hidden-pair score`, tone: 'ALERT' });
    this.notice('HIDDEN VULNERABILITY FOUND', [`${best.a} + ${best.b}`, 'PAIRWISE CASCADE RISK // HIGH'], 'ALERT');
    this.log(`RED TEAM // ${pairs.length} ASSET PAIRS SCORED`, 'INFO');
    this.log(`HIGHEST-RISK PAIR // ${best.a} + ${best.b}`, 'ALERT');
    this.emit();
  }

  private recalculateDisasterMetrics() {
    if (!this.disaster) return;
    const d = this.disaster;
    const closed = edges.filter((e) => e.closedUntil > this.simSeconds || e.capacity < 0.25).length;
    const avgCapacityLoss = edges.reduce((s, e) => s + (1 - e.capacity), 0) / edges.length;
    const failed = assets.filter((a) => a.status === 'FAILED').length;
    const critical = assets.filter((a) => a.status === 'CRITICAL').length;
    const interventionGain = this.interventions.filter((x) => x.applied).reduce((s, x) => s + x.resilienceGain, 0);
    const damage = d.severity * 23 + avgCapacityLoss * 42 + failed * 6 + critical * 2.5 + closed * 0.9;
    this.metrics.resilience = clamp((this.scenarioBaseline?.resilience ?? 92) - damage + interventionGain, 18, 100);
    this.metrics.mobility = clamp(96 - avgCapacityLoss * 68 - closed * 1.8 + interventionGain * 0.5, 18, 100);
    this.metrics.hospitalCapacity = clamp((this.scenarioBaseline?.hospitalCapacity ?? 74) + d.severity * 12 + failed * 1.6, 20, 100);
    this.metrics.powerLoad = clamp(71 + assets.filter((a) => a.kind === 'POWER' && a.status !== 'NOMINAL').length * 7, 25, 120);
    this.metrics.waterReserve = clamp((this.scenarioBaseline?.waterReserve ?? 82) - (d.kind === 'FLOOD' || d.kind === 'COMPOUND' ? 9 : 3) - failed * 1.5, 12, 100);
  }

  private tickDisaster(dt: number) {
    if (!this.disaster) return;
    const d = this.disaster;
    d.elapsedSeconds += dt;
    if (d.elapsedSeconds > 6 && d.phase === 'ONSET') {
      d.phase = 'CASCADE';
      this.log('CASCADE PHASE // SECONDARY EFFECTS PROPAGATING', 'ALERT');
    }
    this.disasterTickAccum += dt;
    if (this.disasterTickAccum < 4) return;
    this.disasterTickAccum = 0;

    // Recompute traffic pressure and progressively propagate failures.
    this.recomputeRoadLoads();
    if ((d.kind === 'GRID CASCADE' || d.kind === 'COMPOUND') && d.phase === 'CASCADE') {
      this.runGridCascade(0.24, d.affectedAssets, d.failedAssets);
      d.affectedAssets = Array.from(new Set(d.affectedAssets));
      d.failedAssets = Array.from(new Set(d.failedAssets));
    }
    if ((d.kind === 'FLOOD' || d.kind === 'COMPOUND') && d.phase === 'CASCADE') {
      // flood front expands slightly; only already-exposed low-capacity roads continue degrading
      edges.filter((e) => d.affectedEdges.includes(e.key) && e.capacity < 0.7).forEach((e) => {
        e.capacity = clamp(e.capacity - 0.025 * d.severity, 0.08, 1);
        if (e.capacity < 0.18) e.closedUntil = Math.max(e.closedUntil, this.simSeconds + 3600);
      });
    }
    this.rerouteDisasterTraffic();
    this.recalculateDisasterMetrics();
  }

  private recomputeRoadLoads() {
    const counts = new Map<string, number>();
    this.vehicles.forEach((v) => {
      if (!this.isVehicleLive(v) || v.leg >= v.path.length - 1) return;
      const a = v.path[v.leg], b = v.path[v.leg + 1];
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    edges.forEach((e) => {
      const count = counts.get(e.key) ?? 0;
      e.modelVehicleCount = count;
      const nominalVehicles = e.arterial ? 4.5 : 3.1;
      const agentPressure = count / nominalVehicles + ({ LIGHT: 0.06, NORMAL: 0.14, HEAVY: 0.24, GRIDLOCK: 0.38 }[this.traffic]);
      if (this.dataMode === 'LIVE' && this.liveTraffic.connected && e.liveFreeFlowSpeedKmh > 0) {
        const liveCongestion = 1 - Math.min(1, e.liveSpeedRatio);
        e.load = clamp(agentPressure * 0.48 + (0.16 + liveCongestion * 1.55) * 0.52, 0.05, 2.2);
      } else {
        e.load = clamp(agentPressure, 0.05, 2.2);
      }
    });
  }

  private rerouteAround(edgeKey: string) {
    let count = 0;
    this.vehicles.forEach((v) => {
      if (v.emergency) return;
      for (let i = v.leg; i < v.path.length - 1; i++) {
        const key = `${Math.min(v.path[i], v.path[i + 1])}-${Math.max(v.path[i], v.path[i + 1])}`;
        if (key === edgeKey) {
          const head = v.path[Math.min(v.leg + 1, v.path.length - 1)];
          v.path = findPath(head, v.path[v.path.length - 1], this.simSeconds + 90);
          v.leg = 0;
          v.t = 0;
          count++;
          break;
        }
      }
    });
    if (count) this.log(`${count} VEHICLES REROUTED`, 'INFO');
  }

  /* ---------------- dispatch ---------------- */

  dispatch(kind: Vehicle['kind'], incident: Incident, targetNode: number) {
    const unit = this.vehicles
      .filter((v) => v.kind === kind && v.status === 'STANDBY')
      .sort(
        (a, b) =>
          Math.hypot(a.x - incident.x, a.y - incident.y) - Math.hypot(b.x - incident.x, b.y - incident.y)
      )[0];
    if (!unit) {
      this.log(`NO ${kind} UNIT AVAILABLE`, 'ALERT');
      return;
    }

    const from = unit.path[unit.leg] ?? unit.station ?? 0;
    const fallbackPath = findPath(from, targetNode, this.simSeconds, true);
    unit.path = fallbackPath;
    unit.leg = 0;
    unit.t = 0;
    unit.status = 'RESPONDING';
    unit.targetIncident = incident.id;
    unit.routeSource = 'MODEL DIJKSTRA';
    unit.geoRoute = undefined;
    unit.geoRouteIndex = 0;
    unit.geoRouteT = 0;
    incident.assignedUnit = unit.id;
    incident.corridor = fallbackPath;
    const dist = this.pathLength(fallbackPath);
    unit.etaSeconds = dist / Math.max(1, unit.speed * this.speedFactor());
    this.log(`${unit.id} DISPATCHED // COMPUTING LIVE ROAD ROUTE`, 'UNIT');
    if (kind === 'EMS') this.metrics.emsAvailable = this.availableEms();

    if (this.dataMode === 'LIVE' && this.liveTraffic.connected && import.meta.env.VITE_TOMTOM_API_KEY?.trim()) {
      void this.attachTrafficAwareRoute(unit, targetNode, 'RESPONDING').catch((err: any) => {
        this.log(`LIVE ROUTE FALLBACK // ${err?.message ?? 'ROUTING UNAVAILABLE'}`, 'INFO');
      });
    } else {
      this.log(`MODEL ROUTE ACTIVE // ETA ${etaString(unit.etaSeconds)}`, 'UNIT');
    }
  }

  private async attachTrafficAwareRoute(unit: Vehicle, targetNode: number, phase: 'RESPONDING' | 'RETURNING') {
    const [fallbackLon, fallbackLat] = toLonLat(unit.x, unit.y);
    const fromLat = Number.isFinite(unit.geoLat) ? unit.geoLat! : fallbackLat;
    const fromLon = Number.isFinite(unit.geoLon) ? unit.geoLon! : fallbackLon;
    const target = nodes[targetNode];
    const [toLon, toLat] = toLonLat(target.x, target.y);
    const route = await fetchTrafficAwareRoute(fromLat, fromLon, toLat, toLon);
    unit.geoRoute = route.coordinates;
    unit.geoRouteIndex = 0;
    unit.geoRouteT = 0;
    unit.geoLat = route.coordinates[0].lat;
    unit.geoLon = route.coordinates[0].lon;
    unit.routeDistanceMeters = route.lengthMeters;
    unit.trafficDelaySeconds = route.trafficDelaySeconds;
    unit.etaSeconds = Math.max(1, route.travelTimeSeconds);
    unit.geoSpeedMps = route.lengthMeters > 0 && route.travelTimeSeconds > 0
      ? clamp(route.lengthMeters / route.travelTimeSeconds, 2.5, unit.kind === 'FIRE' ? 18 : 22)
      : unit.speed;
    unit.routeSource = 'TOMTOM LIVE ROUTING';
    unit.status = phase;
    this.log(`${unit.id} LIVE ROAD ROUTE // ${(route.lengthMeters / 1000).toFixed(1)} KM // TRAFFIC DELAY ${Math.round(route.trafficDelaySeconds / 60)} MIN`, 'UNIT');
    this.log('SIGNAL PRIORITY GRANTED // EMERGENCY CORRIDOR', 'UNIT');
    this.emit();
  }

  private availableEms() {
    return this.vehicles.filter((v) => v.kind === 'EMS' && v.status === 'STANDBY').length;
  }

  private pathLength(path: number[]) {
    let d = 0;
    for (let i = 0; i < path.length - 1; i++) {
      d += Math.hypot(nodes[path[i + 1]].x - nodes[path[i]].x, nodes[path[i + 1]].y - nodes[path[i]].y);
    }
    return d;
  }

  /* ---------------- per-frame update ---------------- */

  update(dt: number) {
    const d = Math.min(dt, 0.1) * this.simulationSpeed;
    if (this.dataMode === 'LIVE') {
      const now = new Date();
      this.simSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    } else {
      this.simSeconds = (this.simSeconds + d * (this.autoTime ? TIME_SCALE : 1)) % 86400;
      if (this.autoTime) this.applyTimeTraffic();
    }
    this.tickDisaster(d);

    const factor = this.speedFactor();
    const activePeds = this.pedestrianActive();

    // vehicles
    for (const v of this.vehicles) {
      if (!this.isVehicleLive(v)) continue;
      if (v.emergency && (v.status === 'STANDBY' || v.status === 'ON SCENE')) {
        if (v.status === 'ON SCENE') v.etaSeconds = Math.max(0, v.etaSeconds - d);
        if (v.status === 'ON SCENE' && v.etaSeconds <= 0) this.releaseUnit(v);
        continue;
      }
      const edgeFactor = this.edgeFactor(v);
      const speed = v.speed * (v.emergency ? 1 : factor * edgeFactor);
      const onLiveRoadRoute = v.emergency && v.geoRoute && v.geoRoute.length >= 2 && (v.status === 'RESPONDING' || v.status === 'RETURNING');
      if (onLiveRoadRoute) this.advanceGeoVehicle(v, (v.geoSpeedMps ?? v.speed) * d);
      else this.advance(v, speed * d);
      if (v.emergency && v.status === 'RESPONDING') {
        v.etaSeconds = Math.max(0, v.etaSeconds - d);
        const arrived = onLiveRoadRoute ? (v.geoRouteIndex ?? 0) >= (v.geoRoute!.length - 1) : v.leg >= v.path.length - 1;
        if (arrived) this.arrive(v);
      } else if (v.emergency && v.status === 'RETURNING') {
        const returned = onLiveRoadRoute ? (v.geoRouteIndex ?? 0) >= (v.geoRoute!.length - 1) : v.leg >= v.path.length - 1;
        if (returned) {
          v.status = 'STANDBY';
          v.geoRoute = undefined;
          v.geoLat = undefined;
          v.geoLon = undefined;
          v.routeSource = undefined;
          this.metrics.emsAvailable = this.availableEms();
          this.log(`${v.id} BACK IN SERVICE`, 'OK');
        }
      } else if (v.leg >= v.path.length - 1) {
        v.path = randomPath(v.path[v.path.length - 1], this.simSeconds);
        v.leg = 0;
        v.t = 0;
      }
    }

    // pedestrians
    for (let i = 0; i < this.pedestrians.length; i++) {
      const p = this.pedestrians[i];
      if (i >= activePeds) continue;
      const near = this.incidents.find(
        (inc) => inc.active && Math.hypot(inc.x - p.x, inc.y - p.y) < 220
      );
      p.fleeing = !!near;
      this.advancePed(p, p.speed * (p.fleeing ? 2.1 : 1) * d);
    }

    // signals
    const priorityNodes = new Set<number>();
    this.vehicles.forEach((v) => {
      if (v.emergency && v.status === 'RESPONDING') {
        for (let i = v.leg; i < v.path.length; i++) priorityNodes.add(v.path[i]);
      }
    });
    for (const s of this.signals) {
      if (priorityNodes.has(s.node)) {
        s.state = 'PRIORITY';
        continue;
      }
      const phase = (this.simSeconds + s.offset) % 60;
      const adjacent = neighbours[s.node].map((nb) => edgeBetween(s.node, nb)).filter(Boolean);
      const localCongestion = adjacent.length
        ? adjacent.reduce((sum, edge) => {
            if (!edge) return sum;
            const live = edge.liveFreeFlowSpeedKmh > 0 ? 1 - Math.min(1, edge.liveSpeedRatio) : Math.min(1, edge.load / Math.max(0.2, edge.capacity));
            return sum + live;
          }, 0) / adjacent.length
        : 0;
      const adaptiveGreen = this.dataMode === 'LIVE' && this.liveTraffic.connected
        ? clamp(25 + localCongestion * 18, 24, 43)
        : this.traffic === 'GRIDLOCK' ? 40 : this.traffic === 'HEAVY' ? 34 : 28;
      s.state = phase < adaptiveGreen ? 'GREEN' : phase < adaptiveGreen + 6 ? 'AMBER' : 'RED';
    }

    // slow tick: metrics, incident decay, random events
    this.metricAccum += d;
    if (this.metricAccum >= 1) {
      this.tickSlow(this.metricAccum);
      this.metricAccum = 0;
      this.emit();
    }

    this.eventAccum += d;
    if (!this.disaster && this.eventAccum >= this.nextEventIn) {
      this.eventAccum = 0;
      this.nextEventIn = rand(28, 62);
      const stormy = this.weather === 'STORM' || this.weather === 'HEAVY RAIN';
      const roll = Math.random();
      if (roll < (stormy ? 0.32 : 0.14)) this.triggerAccident();
      else this.triggerMinorEvent();
    }

    if (this.weather === 'STORM' && Math.random() < d * 0.35) {
      this.lightningAt = performance.now();
    }

    this.notices = this.notices.filter((n) => performance.now() - n.bornAt < 7000);
  }

  private edgeFactor(v: Vehicle) {
    const a = v.path[v.leg];
    const b = v.path[v.leg + 1];
    if (a === undefined || b === undefined) return 1;
    const edge = edgeBetween(a, b);
    if (!edge) return 1;
    const capacityFactor = clamp(edge.capacity, 0.22, 1);
    const liveFactor = this.dataMode === 'LIVE' && this.liveTraffic.connected && edge.liveFreeFlowSpeedKmh > 0
      ? clamp(edge.liveSpeedRatio, v.emergency ? 0.45 : 0.12, 1.15)
      : 1;
    const loadPenalty = clamp(1.12 - Math.max(0, edge.load - 0.55) * 0.38, 0.35, 1.08);
    return clamp(capacityFactor * liveFactor * loadPenalty, 0.1, 1.15);
  }

  private advance(v: Vehicle, metres: number) {
    let remaining = metres;
    while (remaining > 0 && v.leg < v.path.length - 1) {
      const a = nodes[v.path[v.leg]];
      const b = nodes[v.path[v.leg + 1]];
      const legLen = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const step = remaining / legLen;
      if (v.t + step >= 1) {
        remaining -= (1 - v.t) * legLen;
        v.leg++;
        v.t = 0;
      } else {
        v.t += step;
        remaining = 0;
      }
      const na = nodes[v.path[Math.min(v.leg, v.path.length - 1)]];
      const nb = nodes[v.path[Math.min(v.leg + 1, v.path.length - 1)]];
      v.x = na.x + (nb.x - na.x) * v.t;
      v.y = na.y + (nb.y - na.y) * v.t;
      v.heading = Math.atan2(nb.x - na.x, nb.y - na.y);
    }
  }

  private advanceGeoVehicle(v: Vehicle, metres: number) {
    const route = v.geoRoute;
    if (!route || route.length < 2) return;
    let index = Math.min(v.geoRouteIndex ?? 0, route.length - 1);
    let t = clamp(v.geoRouteT ?? 0, 0, 1);
    let remaining = Math.max(0, metres);

    while (remaining > 0 && index < route.length - 1) {
      const a = route[index];
      const b = route[index + 1];
      const legMeters = Math.max(1, haversineKm(a.lat, a.lon, b.lat, b.lon) * 1000);
      const left = (1 - t) * legMeters;
      if (remaining >= left) {
        remaining -= left;
        index += 1;
        t = 0;
      } else {
        t += remaining / legMeters;
        remaining = 0;
      }
    }

    const a = route[Math.min(index, route.length - 1)];
    const b = route[Math.min(index + 1, route.length - 1)] ?? a;
    const lat = a.lat + (b.lat - a.lat) * t;
    const lon = a.lon + (b.lon - a.lon) * t;
    v.geoRouteIndex = index;
    v.geoRouteT = t;
    v.geoLat = lat;
    v.geoLon = lon;
    const [x, y] = fromLonLat(lon, lat);
    v.x = x;
    v.y = y;
    v.heading = Math.atan2((b.lon - a.lon) * Math.cos(lat * Math.PI / 180), b.lat - a.lat);
  }

  private advancePed(p: Pedestrian, metres: number) {
    let remaining = metres;
    while (remaining > 0 && p.leg < p.path.length - 1) {
      const a = nodes[p.path[p.leg]];
      const b = nodes[p.path[p.leg + 1]];
      const legLen = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const step = remaining / legLen;
      if (p.t + step >= 1) {
        remaining -= (1 - p.t) * legLen;
        p.leg++;
        p.t = 0;
      } else {
        p.t += step;
        remaining = 0;
      }
      const na = nodes[p.path[Math.min(p.leg, p.path.length - 1)]];
      const nb = nodes[p.path[Math.min(p.leg + 1, p.path.length - 1)]];
      p.x = na.x + (nb.x - na.x) * p.t + 18;
      p.y = na.y + (nb.y - na.y) * p.t + 18;
    }
    if (p.leg >= p.path.length - 1) {
      p.path = randomPath(p.path[p.path.length - 1], this.simSeconds);
      p.leg = 0;
      p.t = 0;
    }
  }

  private arrive(v: Vehicle) {
    v.status = 'ON SCENE';
    v.etaSeconds = v.kind === 'FIRE' ? 90 : 55;
    const inc = this.incidents.find((i) => i.id === v.targetIncident);
    this.log(`${v.id} ON SCENE // ${inc ? inc.edgeId : 'FIELD'}`, 'UNIT');
    if (v.kind === 'EMS') {
      this.metrics.hospitalCapacity = clamp(this.metrics.hospitalCapacity + rand(0.5, 2), 20, 100);
    }
  }

  private releaseUnit(v: Vehicle) {
    const inc = this.incidents.find((i) => i.id === v.targetIncident);
    if (inc && inc.active) {
      inc.active = false;
      const edge = edgeByKey(inc.edgeKey);
      if (edge) {
        edge.capacity = 1;
        edge.closedUntil = 0;
      }
      this.log(`${inc.edgeId} CLEARED // CAPACITY RESTORED`, 'OK');
      this.metrics.mobility = clamp(this.metrics.mobility + rand(4, 8), 40, 100);
      this.metrics.resilience = clamp(this.metrics.resilience + rand(1, 3), 30, 100);
    }
    v.targetIncident = undefined;
    v.status = 'RETURNING';
    const stationNode = v.station ?? 0;
    v.path = findPath(v.path[v.path.length - 1], stationNode, this.simSeconds);
    v.leg = 0;
    v.t = 0;
    this.log(`${v.id} RETURNING TO STATION`, 'INFO');
    if (this.dataMode === 'LIVE' && import.meta.env.VITE_TOMTOM_API_KEY?.trim()) {
      void this.attachTrafficAwareRoute(v, stationNode, 'RETURNING').catch(() => {
        v.geoRoute = undefined;
        v.geoLat = undefined;
        v.geoLon = undefined;
        v.routeSource = 'MODEL DIJKSTRA';
      });
    } else {
      v.geoRoute = undefined;
      v.geoLat = undefined;
      v.geoLon = undefined;
    }
  }

  private tickSlow(dt: number) {
    this.recomputeRoadLoads();
    const m = this.metrics;
    const h = this.simSeconds / 3600;
    const dayLoad = Math.sin(((h - 5) / 24) * Math.PI * 2) * 12;

    m.powerLoad = clamp(m.powerLoad + rand(-0.8, 0.8) + dayLoad * 0.02, 35, 99);
    m.waterDemand = clamp(m.waterDemand + rand(-0.6, 0.6) + (m.tempC > 26 ? 0.12 : -0.05), 30, 99);
    m.waterOutput = clamp(m.waterOutput + rand(-0.5, 0.5), 40, 99);
    m.waterReserve = clamp(m.waterReserve + (m.waterOutput - m.waterDemand) * 0.01, 25, 99);
    m.hospitalCapacity = clamp(m.hospitalCapacity + rand(-0.4, 0.35), 20, 99);
    m.aqi = clamp(m.aqi + rand(-0.9, 0.9) + (this.traffic === 'GRIDLOCK' ? 0.4 : 0), 20, 180);
    m.mobility = clamp(m.mobility + (this.incidents.some((i) => i.active) ? -0.1 : 0.25), 35, 100);
    m.resilience = clamp(m.resilience + (this.statusLabel() === 'STABLE' ? 0.08 : -0.05), 30, 100);
    m.visibilityKm = WEATHER_VISIBILITY[this.weather] + rand(-0.15, 0.15);
    m.vehiclesActive = this.activeVehicleCount();
    m.emsAvailable = this.availableEms();
    m.populationActive = Math.round(
      38420 * (this.pedestrianActive() / this.pedestrians.length) * rand(0.98, 1.02)
    );

    assets.forEach((a) => {
      if (this.disaster && (a.status === 'FAILED' || a.status === 'RECOVERING')) return;
      if (a.kind === 'POWER') {
        a.primary = clamp(a.primary + rand(-0.9, 0.95) + (this.traffic === 'GRIDLOCK' ? 0.15 : 0), 35, 100);
        a.status = a.primary > 92 ? 'CRITICAL' : a.primary > 85 ? 'WARNING' : a.primary > 78 ? 'ELEVATED' : 'NOMINAL';
        if (a.status === 'CRITICAL' && Math.random() < dt * 0.05) {
          this.log(`${a.id} OVERLOAD WARNING // ${Math.round(a.primary)}%`, 'ALERT');
        }
      }
      if (a.kind === 'HOSPITAL') {
        a.primary = clamp(a.primary + rand(-0.5, 0.55) + (this.incidents.some((i) => i.active) ? 0.2 : -0.05), 20, 100);
        a.status = a.primary > 92 ? 'CRITICAL' : a.primary > 84 ? 'WARNING' : a.primary > 72 ? 'ELEVATED' : 'NOMINAL';
      }
      if (a.kind === 'WATER') {
        a.primary = m.waterOutput;
        a.secondary = m.waterDemand;
        a.status = m.waterReserve < 45 ? 'WARNING' : 'NOMINAL';
      }
      if (a.kind === 'TRANSIT') {
        a.primary = clamp(a.primary + rand(-1, 1), 30, 100);
      }
      if (a.kind === 'EMS' || a.kind === 'FIRE') {
        a.primary = 100;
        a.status = 'NOMINAL';
      }
    });

    // slow capacity recovery on unmanaged minor incidents
    this.incidents.forEach((inc) => {
      if (!inc.active || inc.assignedUnit) return;
      if (this.simSeconds - inc.openedAt > inc.clearanceSeconds) {
        inc.active = false;
        const edge = edgeByKey(inc.edgeKey);
        if (edge) edge.capacity = 1;
        this.log(`${inc.kind} CLEARED // ${inc.edgeId}`, 'OK');
      }
    });
  }
}

export const LAYERS = LAYER_KEYS;
