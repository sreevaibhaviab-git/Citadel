import type { Asset, Edge, LayerKey, Node } from './types';

/* --------------------------------------------------------------------------
   CITY GEOMETRY
   All simulation maths happens in metres relative to the city centre.
   Cesium coordinates are derived at render time (see toLonLat).
   -------------------------------------------------------------------------- */

export const CITY_NAME = 'BENGALURU CENTRAL DISTRICT';
export const CENTER_LON = 77.5946;
export const CENTER_LAT = 12.9716;

export const COLS = 8;
export const ROWS = 8;
export const SPACING = 360; // metres between parallel roads

const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LON = 111320 * Math.cos((CENTER_LAT * Math.PI) / 180);

export function toLonLat(x: number, y: number): [number, number] {
  return [CENTER_LON + x / M_PER_DEG_LON, CENTER_LAT + y / M_PER_DEG_LAT];
}

export const nodes: Node[] = [];
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    nodes.push({
      id: row * COLS + col,
      col,
      row,
      x: (col - (COLS - 1) / 2) * SPACING,
      y: (row - (ROWS - 1) / 2) * SPACING,
    });
  }
}

export const nodeAt = (col: number, row: number) => nodes[row * COLS + col];

export const edges: Edge[] = [];
const edgeIndex = new Map<string, Edge>();

function addEdge(a: number, b: number, corridor: string, arterial: boolean) {
  const na = nodes[a];
  const nb = nodes[b];
  const length = Math.hypot(nb.x - na.x, nb.y - na.y);
  const edge: Edge = {
    id: corridor,
    key: `${Math.min(a, b)}-${Math.max(a, b)}`,
    a,
    b,
    length,
    corridor,
    arterial,
    capacity: 1,
    load: 0.25,
    closedUntil: 0,
    liveCurrentSpeedKmh: 0,
    liveFreeFlowSpeedKmh: 0,
    liveSpeedRatio: 1,
    liveConfidence: 0,
    modelVehicleCount: 0,
  };
  edges.push(edge);
  edgeIndex.set(edge.key, edge);
}

for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS - 1; col++) {
    addEdge(nodeAt(col, row).id, nodeAt(col + 1, row).id, `R${row + 1}`, row === 2 || row === 5);
  }
}
for (let col = 0; col < COLS; col++) {
  for (let row = 0; row < ROWS - 1; row++) {
    addEdge(nodeAt(col, row).id, nodeAt(col, row + 1).id, `V${col + 1}`, col === 2 || col === 5);
  }
}

export function edgeBetween(a: number, b: number): Edge | undefined {
  return edgeIndex.get(`${Math.min(a, b)}-${Math.max(a, b)}`);
}

export const neighbours: number[][] = nodes.map(() => []);
edges.forEach((e) => {
  neighbours[e.a].push(e.b);
  neighbours[e.b].push(e.a);
});

export const corridors: string[] = Array.from(new Set(edges.map((e) => e.id)));

export function edgesOfCorridor(corridor: string): Edge[] {
  return edges.filter((e) => e.id === corridor);
}

/* --------------------------------------------------------------------------
   BLOCKS / BUILDINGS
   -------------------------------------------------------------------------- */

export interface Building {
  id: string;
  cx: number;
  cy: number;
  w: number;
  d: number;
  height: number;
  zone: string;
  lit: boolean;
}

let seed = 20260915;
function rnd() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

export const buildings: Building[] = [];
for (let row = 0; row < ROWS - 1; row++) {
  for (let col = 0; col < COLS - 1; col++) {
    const bx = (col - (COLS - 1) / 2 + 0.5) * SPACING;
    const by = (row - (ROWS - 1) / 2 + 0.5) * SPACING;
    const coreDist = Math.hypot(bx, by) / (SPACING * 4);
    const count = 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < count; k++) {
      const w = 48 + rnd() * 78;
      const d = 48 + rnd() * 78;
      const tall = rnd();
      const height = Math.round((18 + tall * tall * 150) * (1.35 - coreDist));
      buildings.push({
        id: `B${row}-${col}-${k}`,
        cx: bx + (rnd() - 0.5) * (SPACING - w - 70),
        cy: by + (rnd() - 0.5) * (SPACING - d - 70),
        w,
        d,
        height: Math.max(14, height),
        zone: `Z${Math.floor(row / 3) * 3 + Math.floor(col / 3) + 1}`,
        lit: rnd() > 0.42,
      });
    }
  }
}

export const zones = Array.from(new Set(buildings.map((b) => b.zone))).sort();

/* --------------------------------------------------------------------------
   INFRASTRUCTURE ASSETS
   -------------------------------------------------------------------------- */

function asset(
  id: string,
  name: string,
  kind: Asset['kind'],
  col: number,
  row: number,
  primary: number,
  secondary: number,
  layer: LayerKey
): Asset {
  const n = nodeAt(col, row);
  return { id, name, kind, node: n.id, x: n.x, y: n.y, primary, secondary, status: 'NOMINAL', layer };
}

export const assets: Asset[] = [
  asset('H1', 'CENTRAL GENERAL HOSPITAL', 'HOSPITAL', 2, 5, 63, 12, 'HEALTHCARE'),
  asset('H2', 'EAST TRAUMA CENTRE', 'HOSPITAL', 6, 2, 76, 8, 'HEALTHCARE'),
  asset('P1', 'SUBSTATION NORTH', 'POWER', 1, 6, 67, 0, 'POWER'),
  asset('P2', 'SUBSTATION CENTRAL', 'POWER', 4, 3, 81, 0, 'POWER'),
  asset('P3', 'SUBSTATION SOUTH', 'POWER', 6, 0, 58, 0, 'POWER'),
  asset('W1', 'WATER TREATMENT WORKS', 'WATER', 0, 2, 76, 69, 'WATER'),
  asset('F1', 'FIRE STATION ONE', 'FIRE', 3, 1, 100, 0, 'EMERGENCY'),
  asset('F2', 'FIRE STATION TWO', 'FIRE', 5, 6, 100, 0, 'EMERGENCY'),
  asset('E1', 'EMS DEPOT ALPHA', 'EMS', 2, 3, 100, 0, 'EMERGENCY'),
  asset('E2', 'EMS DEPOT BRAVO', 'EMS', 5, 4, 100, 0, 'EMERGENCY'),
  asset('T1', 'CENTRAL TRANSIT HUB', 'TRANSIT', 4, 6, 71, 0, 'TRAFFIC'),
];

export const assetById = (id: string) => assets.find((a) => a.id === id);

/* --------------------------------------------------------------------------
   CAMERA PRESETS
   -------------------------------------------------------------------------- */

export interface CameraPreset {
  id: string;
  label: string;
  x: number;
  y: number;
  range: number;
  pitch: number;
  heading: number;
}

export const cameraPresets: CameraPreset[] = [
  { id: 'OVERVIEW', label: 'CITY OVERVIEW', x: 0, y: 0, range: 4200, pitch: -42, heading: 18 },
  { id: 'TRANSPORT', label: 'TRANSPORT', x: 0, y: 720, range: 2100, pitch: -34, heading: 0 },
  { id: 'HEALTHCARE', label: 'HEALTHCARE', x: -540, y: 540, range: 1500, pitch: -32, heading: 30 },
  { id: 'ENERGY', label: 'ENERGY', x: 180, y: -180, range: 1600, pitch: -30, heading: -20 },
  { id: 'EMERGENCY', label: 'EMERGENCY', x: -180, y: -900, range: 1700, pitch: -30, heading: 12 },
];

export const LAYER_KEYS: LayerKey[] = [
  'TRAFFIC',
  'HEALTHCARE',
  'POWER',
  'WATER',
  'EMERGENCY',
  'POPULATION',
  'WEATHER',
  'DEPENDENCIES',
];
