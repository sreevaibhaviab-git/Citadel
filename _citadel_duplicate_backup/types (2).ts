
export type DataMode = 'LIVE' | 'SIMULATION';

export interface LiveWeatherState {
  connected: boolean;
  provider: string;
  observedAt: string;
  temperatureC: number;
  feelsLikeC: number;
  humidityPct: number;
  precipitationMm: number;
  rainMm: number;
  weatherCode: number;
  condition: string;
  cloudPct: number;
  windKmh: number;
  gustKmh: number;
  visibilityKm: number;
  isDay: boolean;
  error: string;
}

export interface LiveTrafficCoordinate {
  lat: number;
  lon: number;
}

export interface LiveTrafficSample {
  id: string;
  lat: number;
  lon: number;
  currentSpeedKmh: number;
  freeFlowSpeedKmh: number;
  confidence: number;
  currentTravelTimeSec: number;
  freeFlowTravelTimeSec: number;
  roadClosure: boolean;
  frc: string;
  coordinates: LiveTrafficCoordinate[];
  estimatedVehicleCount: number;
  segmentLengthKm: number;
}


export interface LiveTrafficState {
  connected: boolean;
  provider: string;
  observedAt: string;
  avgCurrentSpeedKmh: number;
  avgFreeFlowSpeedKmh: number;
  speedRatio: number;
  congestionPct: number;
  confidence: number;
  samples: LiveTrafficSample[];
  error: string;
}

export interface LiveFacility {
  id: string;
  kind: 'HOSPITAL' | 'FIRE' | 'POLICE' | 'SAFE' | 'POWER' | 'WATER' | 'METRO';
  name: string;
  lat: number;
  lon: number;
  source: string;
  operator?: string;
  ref?: string;
  network?: string;
  osmType?: string;
  osmId?: string;
}


export interface MapProbeState {
  id: string;
  lat: number;
  lon: number;
  radiusKm: number;
  loading: boolean;
  error: string;
  facilities: LiveFacility[];
}

export interface RoadHoverState {
  kind: 'MODEL' | 'LIVE';
  id: string;
  label: string;
  screenX: number;
  screenY: number;
  lat: number;
  lon: number;
  currentSpeedKmh: number;
  freeFlowSpeedKmh: number;
  congestionPct: number;
  vehicleCount: number;
  vehicleCountLabel: 'MODELLED' | 'ESTIMATED';
  source: string;
}

export interface ImpactAssessment {
  estimatedPeopleAffected: number;
  highRiskPopulation: number;
  roadUsersDelayed: number;
  evacuationRecommended: number;
  hospitalsAvailable: number;
  fireStationsAvailable: number;
  policeStationsAvailable: number;
  safeSitesAvailable: number;
  emsBatchesRequired: number;
  fireBatchesRequired: number;
  policeBatchesRequired: number;
  estimatedRoadClearanceMinutes: number;
  estimatedStabilizationMinutes: number;
  alternateRouteMinutes: number;
  nearestSafeSiteName: string;
  nearestSafeSiteDistanceKm: number;
  basis: string;
}

export interface LiveOpsState {
  mode: DataMode;
  syncing: boolean;
  lastSyncAt: string;
  weather: LiveWeatherState;
  traffic: LiveTrafficState;
  facilities: LiveFacility[];
  facilitiesError: string;
  signalControl: 'ADAPTIVE MODEL' | 'SIMULATED CYCLE';
  impact: ImpactAssessment;
}

export type WeatherMode = 'CLEAR' | 'CLOUDY' | 'RAIN' | 'HEAVY RAIN' | 'FOG' | 'STORM';
export type TrafficMode = 'LIGHT' | 'NORMAL' | 'HEAVY' | 'GRIDLOCK';
export type TimePreset = 'DAY' | 'SUNSET' | 'NIGHT';
export type SignalState = 'GREEN' | 'AMBER' | 'RED' | 'PRIORITY';
export type DisasterKind = 'FLOOD' | 'EARTHQUAKE' | 'GRID CASCADE' | 'COMPOUND';
export type PlaceableHazardKind = 'FLOOD' | 'EARTHQUAKE' | 'FIRE';
export type ScenarioPhase = 'IDLE' | 'ONSET' | 'CASCADE' | 'RESPONSE' | 'RECOVERY';

export type LayerKey =
  | 'TRAFFIC'
  | 'HEALTHCARE'
  | 'POWER'
  | 'WATER'
  | 'EMERGENCY'
  | 'POPULATION'
  | 'WEATHER'
  | 'DEPENDENCIES';

export interface Node {
  id: number;
  x: number;
  y: number;
  col: number;
  row: number;
}

export interface Edge {
  id: string;
  key: string;
  a: number;
  b: number;
  length: number;
  corridor: string;
  arterial: boolean;
  capacity: number;
  load: number;
  closedUntil: number;
  // Live-flow calibration. TomTom provides speed/free-flow/confidence, not a
  // literal vehicle count. CITADEL therefore keeps the observed flow metrics
  // separate from its modelled agent count.
  liveCurrentSpeedKmh: number;
  liveFreeFlowSpeedKmh: number;
  liveSpeedRatio: number;
  liveConfidence: number;
  modelVehicleCount: number;
}

export interface RoadState {
  key: string;
  corridor: string;
  arterial: boolean;
  capacityPct: number;
  loadRatio: number;
  congestionPct: number;
  modelVehicleCount: number;
  currentSpeedKmh: number;
  freeFlowSpeedKmh: number;
  confidence: number;
  status: 'FREE' | 'MODERATE' | 'HEAVY' | 'GRIDLOCK' | 'CLOSED';
  source: 'LIVE+MODEL' | 'MODEL';
}

export interface RouteAlternative {
  id: string;
  corridors: string[];
  etaMinutes: number;
  deltaMinutes: number;
  distanceKm: number;
}

export interface NearbyFacilityMatch {
  id: string;
  name: string;
  kind: 'HOSPITAL' | 'FIRE' | 'POLICE' | 'SAFE';
  distanceKm: number;
  source: string;
}

export interface ResponsePlan {
  eventId: string;
  eventLabel: string;
  roadLabel: string;
  hospitals: NearbyFacilityMatch[];
  fireStations: NearbyFacilityMatch[];
  policeStations: NearbyFacilityMatch[];
  safeSites: NearbyFacilityMatch[];
  alternateRoutes: RouteAlternative[];
}


export type AssetKind = 'HOSPITAL' | 'POWER' | 'WATER' | 'FIRE' | 'EMS' | 'TRANSIT';
export type AssetStatus = 'NOMINAL' | 'ELEVATED' | 'WARNING' | 'CRITICAL' | 'FAILED' | 'RECOVERING';

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  node: number;
  x: number;
  y: number;
  primary: number;
  secondary: number;
  status: AssetStatus;
  layer: LayerKey;
}


export type DependencyCategory = 'POWER' | 'WATER' | 'ACCESS' | 'EMERGENCY' | 'OPERATIONAL' | 'BACKUP';

export interface DependencyRelation {
  id: string;
  from: string;
  to: string;
  category: DependencyCategory;
  label: string;
  strength: number;
  confidence: number;
  hidden: boolean;
  inferred: boolean;
  backup?: boolean;
  description: string;
}

export interface DependencyImpactNode {
  assetId: string;
  depth: number;
  path: string[];
  relationIds: string[];
  hiddenPath: boolean;
  consequence: string;
}

export interface DependencyAlternative {
  id: string;
  targetAssetId: string;
  replacementAssetId?: string;
  type: 'ALTERNATE CONNECTION' | 'BACKUP SYSTEM' | 'MUTUAL AID';
  label: string;
  confidence: number;
  description: string;
}

export interface DependencyAnalysis {
  sourceAssetId: string;
  direct: DependencyImpactNode[];
  indirect: DependencyImpactNode[];
  affected: DependencyImpactNode[];
  relations: DependencyRelation[];
  hiddenRelations: DependencyRelation[];
  alternatives: DependencyAlternative[];
  consequences: string[];
  cascadeRisk: number;
  estimatedPeopleAffected: number;
  algorithm: string;
}

export type VehicleKind = 'CAR' | 'BUS' | 'TRUCK' | 'EMS' | 'FIRE' | 'POLICE';

export interface Vehicle {
  id: string;
  kind: VehicleKind;
  path: number[];
  leg: number;
  t: number;
  speed: number;
  x: number;
  y: number;
  heading: number;
  emergency: boolean;
  station?: number;
  status: 'PATROL' | 'STANDBY' | 'RESPONDING' | 'ON SCENE' | 'RETURNING';
  targetIncident?: string;
  etaSeconds: number;
  // When a live TomTom route is available, emergency vehicles follow the
  // returned road geometry instead of cutting across the synthetic grid.
  geoRoute?: LiveTrafficCoordinate[];
  geoRouteIndex?: number;
  geoRouteT?: number;
  geoLat?: number;
  geoLon?: number;
  geoSpeedMps?: number;
  routeSource?: 'TOMTOM LIVE ROUTING' | 'MODEL DIJKSTRA';
  trafficDelaySeconds?: number;
  routeDistanceMeters?: number;
  label: string;
}

export interface Pedestrian {
  id: string;
  x: number;
  y: number;
  path: number[];
  leg: number;
  t: number;
  speed: number;
  fleeing: boolean;
}

export type IncidentKind =
  | 'ACCIDENT'
  | 'FIRE'
  | 'ROAD WORK'
  | 'TRAFFIC JAM'
  | 'BREAKDOWN'
  | 'WATER LEAK'
  | 'POWER FLUCTUATION'
  | 'PUBLIC EVENT'
  | 'ROAD CLOSURE'
  | 'CONSTRUCTION'
  | 'MINOR FLOODING'
  | 'SIGNAL FAILURE';

export interface Incident {
  id: string;
  kind: IncidentKind;
  severity: 'MINOR' | 'MODERATE' | 'SEVERE';
  edgeId: string;
  edgeKey: string;
  zone: string;
  x: number;
  y: number;
  openedAt: number;
  clearanceSeconds: number;
  capacityBefore: number;
  capacityAfter: number;
  assignedUnit?: string;
  corridor: number[];
  active: boolean;
  // Dynamic fire behaviour. These fields are optional so ordinary traffic /
  // utility incidents remain lightweight.
  elapsedSeconds?: number;
  fireRadius?: number;
  fireMaxRadius?: number;
  fireGrowthRate?: number;
  responseEtaSeconds?: number;
  containment?: number;
}

export interface FeedLine {
  id: number;
  stamp: string;
  text: string;
  tone: 'INFO' | 'ALERT' | 'UNIT' | 'OK';
}

export interface Notice {
  id: number;
  title: string;
  lines: string[];
  tone: 'ALERT' | 'UNIT' | 'INFO';
  bornAt: number;
}

export interface Metrics {
  populationActive: number;
  vehiclesActive: number;
  emsAvailable: number;
  emsTotal: number;
  powerLoad: number;
  waterDemand: number;
  waterOutput: number;
  waterReserve: number;
  hospitalCapacity: number;
  mobility: number;
  resilience: number;
  aqi: number;
  tempC: number;
  visibilityKm: number;
}

export interface AlgorithmTrace {
  id: string;
  label: string;
  algorithm: string;
  output: string;
  tone?: 'INFO' | 'WARN' | 'ALERT' | 'OK';
}

export interface Intervention {
  id: string;
  title: string;
  description: string;
  costLakhs: number;
  resilienceGain: number;
  cascadeReduction: number;
  etaMinutes: number;
  algorithm: string;
  applied: boolean;
  recommended?: boolean;
}

export interface RecoveryStep {
  order: number;
  assetId: string;
  label: string;
  restoreMinutes: number;
  unlocks: string[];
  score: number;
  completed: boolean;
}

export type DamageSeverity = 'NONE' | 'MINOR' | 'MODERATE' | 'SEVERE' | 'FAILED';

export interface HazardTimelineStage {
  minute: number;
  label: string;
  detail: string;
  state: 'PENDING' | 'ACTIVE' | 'COMPLETE';
}

export interface CascadePropagationEvent {
  id: string;
  minute: number;
  label: string;
  detail: string;
  tone: 'INFO' | 'WARN' | 'ALERT' | 'OK';
  revealed: boolean;
  fromX: number;
  fromY: number;
  fromLabel: string;
  toX: number;
  toY: number;
  toLabel: string;
}

export interface DisasterState {
  id: string;
  kind: DisasterKind;
  phase: ScenarioPhase;
  startedAt: number;
  elapsedSeconds: number;
  severity: number;
  magnitude?: number;
  rainfallMm?: number;
  epicenterX: number;
  epicenterY: number;
  radius: number;
  affectedEdges: string[];
  affectedAssets: string[];
  failedAssets: string[];
  evacuated: number;
  exposedPopulation: number;
  confidence: number;
  scenarioLabel: string;
  // Scenario time is deliberately accelerated for the demo: one simulation
  // second represents one model minute. The UI labels this explicitly.
  modelMinute: number;
  timeline: HazardTimelineStage[];
  // Flood propagation follows the road graph and a deterministic synthetic
  // drainage/elevation proxy instead of drawing one circular flood disk.
  floodArrivalMinuteByEdge: Record<string, number>;
  floodDepthByEdge: Record<string, number>;
  // Earthquake damage stores different severity classes per asset.
  damageByAsset: Record<string, DamageSeverity>;
  // Sequential cross-system effects rendered as animated dependency lines.
  cascadeEvents: CascadePropagationEvent[];
}

export interface Snapshot {
  simSeconds: number;
  clock: string;
  autoTime: boolean;
  weather: WeatherMode;
  traffic: TrafficMode;
  metrics: Metrics;
  vehicles: Vehicle[];
  assets: Asset[];
  roads: RoadState[];
  incidents: Incident[];
  feed: FeedLine[];
  notices: Notice[];
  layers: Record<LayerKey, boolean>;
  selectedId: string | null;
  followId: string | null;
  lightningAt: number;
  status: string;
  disaster: DisasterState | null;
  interventions: Intervention[];
  recoveryPlan: RecoveryStep[];
  algorithmTrace: AlgorithmTrace[];
  simulationSpeed: number;
  liveOps: LiveOpsState;
  responsePlan: ResponsePlan | null;
  mapProbe: MapProbeState | null;
  roadHover: RoadHoverState | null;
  dependencyAnalysis: DependencyAnalysis | null;
  hazardPlacement: PlaceableHazardKind | null;
}
