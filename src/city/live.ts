import { CENTER_LAT, CENTER_LON, toLonLat } from './config';
import type { LiveFacility, LiveTrafficState, LiveWeatherState } from './types';

const weatherCodeLabel = (code: number) => {
  if (code === 0) return 'CLEAR';
  if (code <= 3) return 'CLOUDY';
  if ([45, 48].includes(code)) return 'FOG';
  if (code >= 95) return 'THUNDERSTORM';
  if (code >= 80) return 'SHOWERS';
  if (code >= 61) return 'RAIN';
  return 'MIXED';
};

export async function fetchLiveWeather(): Promise<LiveWeatherState> {
  const params = new URLSearchParams({
    latitude: String(CENTER_LAT),
    longitude: String(CENTER_LON),
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'is_day',
      'precipitation',
      'rain',
      'showers',
      'weather_code',
      'cloud_cover',
      'wind_speed_10m',
      'wind_gusts_10m',
      'visibility',
    ].join(','),
    timezone: 'Asia/Kolkata',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const json = await res.json();
  const c = json.current ?? {};
  const precipitation = Number(c.precipitation ?? 0);
  const rain = Number(c.rain ?? 0) + Number(c.showers ?? 0);
  return {
    connected: true,
    provider: 'OPEN-METEO',
    observedAt: String(c.time ?? new Date().toISOString()),
    temperatureC: Number(c.temperature_2m ?? 0),
    feelsLikeC: Number(c.apparent_temperature ?? c.temperature_2m ?? 0),
    humidityPct: Number(c.relative_humidity_2m ?? 0),
    precipitationMm: precipitation,
    rainMm: rain,
    weatherCode: Number(c.weather_code ?? 0),
    condition: weatherCodeLabel(Number(c.weather_code ?? 0)),
    cloudPct: Number(c.cloud_cover ?? 0),
    windKmh: Number(c.wind_speed_10m ?? 0),
    gustKmh: Number(c.wind_gusts_10m ?? 0),
    visibilityKm: Math.max(0, Number(c.visibility ?? 10000) / 1000),
    isDay: Number(c.is_day ?? 1) === 1,
    error: '',
  };
}

const trafficSamples = [
  { id: 'T-NW2', x: -1500, y: 1500 }, { id: 'T-N1', x: -500, y: 1500 }, { id: 'T-N2', x: 500, y: 1500 }, { id: 'T-NE2', x: 1500, y: 1500 },
  { id: 'T-W1', x: -1500, y: 500 },  { id: 'T-C1', x: -500, y: 500 },  { id: 'T-C2', x: 500, y: 500 },  { id: 'T-E1', x: 1500, y: 500 },
  { id: 'T-W2', x: -1500, y: -500 }, { id: 'T-C3', x: -500, y: -500 }, { id: 'T-C4', x: 500, y: -500 }, { id: 'T-E2', x: 1500, y: -500 },
  { id: 'T-SW2', x: -1500, y: -1500 },{ id: 'T-S1', x: -500, y: -1500 },{ id: 'T-S2', x: 500, y: -1500 },{ id: 'T-SE2', x: 1500, y: -1500 },
];

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const r = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
};

function segmentLengthKm(coords: { lat: number; lon: number }[]) {
  let km = 0;
  for (let i = 1; i < coords.length; i++) km += haversineKm(coords[i - 1].lat, coords[i - 1].lon, coords[i].lat, coords[i].lon);
  return km;
}

/** TomTom Traffic Flow is observational flow/speed data. It does not return a
 * literal vehicle count. We derive a clearly-labelled estimate from segment
 * length and the observed speed ratio only for the judge-facing road card. */
function estimateVehicles(lengthKm: number, current: number, free: number, frc: string) {
  const ratio = free > 0 ? Math.max(0.05, Math.min(1.2, current / free)) : 1;
  const congestion = 1 - Math.min(1, ratio);
  const lanesProxy = ['FRC0', 'FRC1', 'FRC2'].includes(frc) ? 3 : ['FRC3', 'FRC4'].includes(frc) ? 2 : 1;
  const densityPerKmPerLane = 7 + congestion * 38;
  return Math.max(1, Math.round(Math.max(0.15, lengthKm) * lanesProxy * densityPerKmPerLane));
}

export async function fetchLiveTraffic(): Promise<LiveTrafficState> {
  const key = import.meta.env.VITE_TOMTOM_API_KEY?.trim();
  if (!key) {
    return {
      connected: false,
      provider: 'TOMTOM',
      observedAt: '',
      avgCurrentSpeedKmh: 0,
      avgFreeFlowSpeedKmh: 0,
      speedRatio: 1,
      congestionPct: 0,
      confidence: 0,
      samples: [],
      error: 'VITE_TOMTOM_API_KEY not configured',
    };
  }

  const settled = await Promise.allSettled(
    trafficSamples.map(async (sample) => {
      const [lon, lat] = toLonLat(sample.x, sample.y);
      const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${lat},${lon}&unit=KMPH&openLr=false&key=${encodeURIComponent(key)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`TomTom ${res.status}`);
      const json = await res.json();
      const d = json.flowSegmentData ?? {};
      const coords = (d.coordinates?.coordinate ?? [])
        .map((c: any) => ({ lat: Number(c.latitude), lon: Number(c.longitude) }))
        .filter((c: any) => Number.isFinite(c.lat) && Number.isFinite(c.lon));
      const lengthKm = segmentLengthKm(coords);
      const current = Number(d.currentSpeed ?? 0);
      const free = Number(d.freeFlowSpeed ?? 0);
      const frc = String(d.frc ?? '');
      return {
        id: sample.id,
        lat,
        lon,
        currentSpeedKmh: current,
        freeFlowSpeedKmh: free,
        confidence: Number(d.confidence ?? 0),
        currentTravelTimeSec: Number(d.currentTravelTime ?? 0),
        freeFlowTravelTimeSec: Number(d.freeFlowTravelTime ?? 0),
        roadClosure: Boolean(d.roadClosure),
        frc,
        coordinates: coords,
        estimatedVehicleCount: estimateVehicles(lengthKm, current, free, frc),
        segmentLengthKm: lengthKm,
      };
    })
  );

  const sampleResults = settled.filter((x): x is PromiseFulfilledResult<any> => x.status === 'fulfilled').map((x) => x.value);
  const valid = sampleResults.filter((s) => s.freeFlowSpeedKmh > 0 && s.currentSpeedKmh >= 0);
  if (!valid.length) throw new Error('TomTom returned no usable flow segments');
  const avg = (field: 'currentSpeedKmh' | 'freeFlowSpeedKmh' | 'confidence') => valid.reduce((sum, s) => sum + s[field], 0) / valid.length;
  const current = avg('currentSpeedKmh');
  const free = avg('freeFlowSpeedKmh');
  const ratio = free > 0 ? Math.max(0.05, Math.min(1.3, current / free)) : 1;
  return {
    connected: true,
    provider: 'TOMTOM',
    observedAt: new Date().toISOString(),
    avgCurrentSpeedKmh: current,
    avgFreeFlowSpeedKmh: free,
    speedRatio: ratio,
    congestionPct: Math.max(0, Math.min(100, (1 - ratio) * 100)),
    confidence: avg('confidence'),
    samples: valid,
    error: settled.some((x) => x.status === 'rejected') ? 'PARTIAL COVERAGE' : '',
  };
}

function parseFacilityElement(el: any): LiveFacility | null {
  const tags = el.tags ?? {};
  const lat = Number(el.lat ?? el.center?.lat);
  const lon = Number(el.lon ?? el.center?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const amenity = tags.amenity;
  const emergency = tags.emergency;
  let kind: LiveFacility['kind'] | null = null;
  if (amenity === 'hospital' || amenity === 'clinic') kind = 'HOSPITAL';
  else if (amenity === 'fire_station') kind = 'FIRE';
  else if (amenity === 'police') kind = 'POLICE';
  else if (emergency === 'assembly_point' || amenity === 'shelter') kind = 'SAFE';
  if (!kind) return null;
  return {
    id: `OSM-${el.type}-${el.id}`,
    kind,
    name: tags.name || tags['name:en'] || `${kind} FACILITY`,
    lat,
    lon,
    source: 'OPENSTREETMAP',
  };
}

export async function fetchFacilitiesAround(lat: number, lon: number, radiusMeters = 15000): Promise<LiveFacility[]> {
  const radius = Math.max(1000, Math.min(20000, Math.round(radiusMeters)));
  const query = `[out:json][timeout:25];(\n` +
    `nwr["amenity"~"hospital|clinic|fire_station|police|shelter"](around:${radius},${lat},${lon});\n` +
    `nwr["emergency"="assembly_point"](around:${radius},${lat},${lon});\n` +
    `);out center tags;`;
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  let lastError = '';
  for (const endpoint of endpoints) {
    try {
      const url = `${endpoint}?data=${encodeURIComponent(query)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const json = await res.json();
      const facilities = (json.elements ?? []).map(parseFacilityElement).filter(Boolean) as LiveFacility[];
      const unique = new Map(facilities.map((f) => [f.id, f]));
      return [...unique.values()].slice(0, 400);
    } catch (err: any) {
      lastError = err?.message ?? String(err);
    }
  }
  throw new Error(lastError || 'Overpass unavailable');
}

export async function fetchLiveFacilities(): Promise<LiveFacility[]> {
  return fetchFacilitiesAround(CENTER_LAT, CENTER_LON, 15000);
}

export const sourceDocumentation = {
  weather: 'Open-Meteo current weather / model-derived current conditions',
  traffic: 'TomTom Traffic Flow Segment Data when VITE_TOMTOM_API_KEY is configured',
  facilities: 'OpenStreetMap Overpass read-only POI query',
};


export interface LocationSearchResult {
  id: string;
  displayName: string;
  lat: number;
  lon: number;
  type: string;
}

/** Lightweight location search for Bengaluru. Nominatim is only queried after
 * the user types, never continuously. Keep requests human-scale / low volume. */
export async function searchLocations(query: string): Promise<LocationSearchResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const params = new URLSearchParams({
    q: `${q}, Bengaluru, Karnataka`,
    format: 'jsonv2',
    limit: '6',
    addressdetails: '1',
    countrycodes: 'in',
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { 'Accept-Language': 'en' },
  });
  if (!res.ok) throw new Error(`Location search ${res.status}`);
  const rows = await res.json();
  return (rows ?? [])
    .map((row: any) => ({
      id: String(row.place_id),
      displayName: String(row.display_name ?? q),
      lat: Number(row.lat),
      lon: Number(row.lon),
      type: String(row.type ?? row.addresstype ?? 'place'),
    }))
    .filter((row: LocationSearchResult) => Number.isFinite(row.lat) && Number.isFinite(row.lon));
}

export interface TrafficAwareRoute {
  coordinates: { lat: number; lon: number }[];
  lengthMeters: number;
  travelTimeSeconds: number;
  trafficDelaySeconds: number;
}

/** TomTom traffic-aware road routing. This is what emergency vehicles use in
 * LIVE mode so their visible path follows actual road geometry and current
 * traffic instead of flying directly between simulation nodes. */
export async function fetchTrafficAwareRoute(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
): Promise<TrafficAwareRoute> {
  const key = import.meta.env.VITE_TOMTOM_API_KEY?.trim();
  if (!key) throw new Error('VITE_TOMTOM_API_KEY not configured');
  const locations = `${fromLat},${fromLon}:${toLat},${toLon}`;
  const params = new URLSearchParams({
    key,
    traffic: 'true',
    travelMode: 'car',
    routeType: 'fastest',
    instructionsType: 'text',
    computeTravelTimeFor: 'all',
  });
  const res = await fetch(`https://api.tomtom.com/routing/1/calculateRoute/${locations}/json?${params.toString()}`);
  if (!res.ok) throw new Error(`TomTom Routing ${res.status}`);
  const json = await res.json();
  const route = json.routes?.[0];
  if (!route) throw new Error('TomTom returned no route');
  const coordinates = (route.legs ?? [])
    .flatMap((leg: any) => leg.points ?? [])
    .map((pt: any) => ({ lat: Number(pt.latitude), lon: Number(pt.longitude) }))
    .filter((pt: any) => Number.isFinite(pt.lat) && Number.isFinite(pt.lon));
  if (coordinates.length < 2) throw new Error('TomTom route geometry unavailable');
  const summary = route.summary ?? {};
  return {
    coordinates,
    lengthMeters: Number(summary.lengthInMeters ?? 0),
    travelTimeSeconds: Number(summary.travelTimeInSeconds ?? 0),
    trafficDelaySeconds: Number(summary.trafficDelayInSeconds ?? 0),
  };
}
