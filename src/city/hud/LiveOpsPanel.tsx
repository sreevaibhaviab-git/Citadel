import {
  Ambulance,
  Building2,
  CarFront,
  CloudRain,
  Flame,
  Hospital,
  MapPin,
  Radio,
  RefreshCcw,
  Route,
  Shield,
  Siren,
  TrafficCone,
  Users,
} from 'lucide-react';
import type { CitySim } from '../sim';
import { TRAFFIC_MODES, WEATHER_MODES } from '../sim';
import type { Snapshot } from '../types';

const stamp = (value: string) => {
  if (!value) return 'WAITING';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return <div className="ops-stat"><span>{label}</span><b>{value}</b>{sub && <small>{sub}</small>}</div>;
}

function FacilityList({ title, items }: { title: string; items: any[] }) {
  return (
    <div className="response-facility-group">
      <div className="ops-subhead">{title}</div>
      {items.length ? items.map((f: any) => (
        <div className="facility-name-row" key={f.id}>
          <span>{f.name}</span><b>{f.distanceKm.toFixed(1)} KM</b>
        </div>
      )) : <div className="facility-empty">NO MAPPED FACILITY IN CURRENT QUERY</div>}
    </div>
  );
}

export default function LiveOpsPanel({ sim, snap }: { sim: CitySim; snap: Snapshot }) {
  const live = snap.liveOps;
  const impact = live.impact;
  const activeIncident = snap.incidents[0];
  const response = snap.responsePlan;
  const facilityCounts = {
    hospital: live.facilities.filter((f) => f.kind === 'HOSPITAL').length,
    fire: live.facilities.filter((f) => f.kind === 'FIRE').length,
    police: live.facilities.filter((f) => f.kind === 'POLICE').length,
    safe: live.facilities.filter((f) => f.kind === 'SAFE').length,
  };

  return (
    <div className="live-ops-panel">
      <div className="source-head"><Radio size={14}/><span>LIVE OPERATIONS + SCENARIO CONTROL</span></div>

      <section className="ops-section">
        <div className="dock-section-title">DATA MODE</div>
        <div className="mode-switch">
          <button className={live.mode === 'LIVE' ? 'mode-btn active' : 'mode-btn'} onClick={() => sim.setDataMode('LIVE')}>LIVE FUSION</button>
          <button className={live.mode === 'SIMULATION' ? 'mode-btn active' : 'mode-btn'} onClick={() => sim.setDataMode('SIMULATION')}>SCENARIO LAB</button>
        </div>
        <div className="ops-note">
          {live.mode === 'LIVE'
            ? 'Live weather and available traffic feeds drive the city model. Signal phases remain an adaptive CITADEL model; municipal controller states are not claimed as live.'
            : 'Live feed influence is paused. Weather, traffic and hazards can be set manually for repeatable what-if experiments.'}
        </div>
      </section>

      {live.mode === 'LIVE' ? (
        <section className="ops-section">
          <div className="dock-section-title">LIVE CONNECTORS</div>
          <div className="connector-row"><CloudRain size={14}/><div><b>WEATHER // OPEN-METEO</b><small>{live.weather.connected ? `${live.weather.condition} · ${live.weather.temperatureC.toFixed(1)}°C · ${live.weather.precipitationMm.toFixed(1)} mm` : live.weather.error || 'connecting'}</small></div><span className={live.weather.connected ? 'feed-state ok' : 'feed-state'}>{live.weather.connected ? 'LIVE' : 'OFF'}</span></div>
          <div className="connector-row"><CarFront size={14}/><div><b>TRAFFIC // TOMTOM FLOW</b><small>{live.traffic.connected ? `${live.traffic.avgCurrentSpeedKmh.toFixed(0)} / ${live.traffic.avgFreeFlowSpeedKmh.toFixed(0)} km/h · ${live.traffic.congestionPct.toFixed(0)}% congestion` : live.traffic.error || 'connecting'}</small></div><span className={live.traffic.connected ? 'feed-state ok' : 'feed-state'}>{live.traffic.connected ? 'LIVE' : 'KEY'}</span></div>
          <div className="connector-row"><Building2 size={14}/><div><b>CIVIC POIs // OPENSTREETMAP</b><small>{live.facilities.length ? `${live.facilities.length} mapped response / safe-site features loaded` : live.facilitiesError || 'connecting'}</small></div><span className={live.facilities.length ? 'feed-state ok' : 'feed-state'}>{live.facilities.length ? 'LIVE' : 'OFF'}</span></div>
          <div className="connector-row"><TrafficCone size={14}/><div><b>TRAFFIC SIGNALS</b><small>{live.signalControl} · congestion-aware green time + emergency priority</small></div><span className="feed-state model">MODEL</span></div>
          <button className="full-action" disabled={live.syncing} onClick={() => void sim.refreshLiveData()}><RefreshCcw size={13}/>{live.syncing ? 'SYNCING LIVE DATA...' : `SYNC NOW // ${stamp(live.lastSyncAt)}`}</button>
        </section>
      ) : (
        <section className="ops-section">
          <div className="dock-section-title">MANUAL CONDITIONS</div>
          <div className="ops-subhead">WEATHER</div>
          <div className="compact-grid cols-2">{WEATHER_MODES.map((w) => <button key={w} className={snap.weather === w ? 'square-action active' : 'square-action'} onClick={() => sim.setWeather(w)}>{w}</button>)}</div>
          <div className="ops-subhead mt-2">TRAFFIC</div>
          <div className="compact-grid cols-2">{TRAFFIC_MODES.map((t) => <button key={t} className={snap.traffic === t ? 'square-action active' : 'square-action'} onClick={() => sim.setTraffic(t)}>{t}</button>)}</div>
        </section>
      )}

      {response && (
        <section className="ops-section event-command-board">
          <div className="dock-section-title">ACTIVE EVENT // RESPONSE BOARD</div>
          <div className="event-board-head">
            <div><span>EVENT</span><b>{response.eventLabel}</b></div>
            <div><span>ROAD / ZONE</span><b>{response.roadLabel}</b></div>
          </div>
          <div className="event-count-strip">
            <div><span>HOSPITALS</span><b>{facilityCounts.hospital || impact.hospitalsAvailable}</b></div>
            <div><span>FIRE</span><b>{facilityCounts.fire || impact.fireStationsAvailable}</b></div>
            <div><span>POLICE</span><b>{facilityCounts.police || impact.policeStationsAvailable}</b></div>
            <div><span>EMS BATCHES</span><b>{impact.emsBatchesRequired}</b></div>
          </div>
          <FacilityList title="NEAREST HOSPITALS" items={response.hospitals} />
          <FacilityList title="NEAREST FIRE STATIONS" items={response.fireStations} />
          <FacilityList title="NEAREST POLICE" items={response.policeStations} />
          <FacilityList title="SAFE / ASSEMBLY SITES" items={response.safeSites} />
          <div className="ops-subhead">ROAD ALTERNATIVES // DIJKSTRA</div>
          {response.alternateRoutes.length ? (
            <div className="route-alt-list">
              {response.alternateRoutes.map((r) => (
                <div className="route-alt" key={r.id}>
                  <div><b>{r.id}</b><span>{r.corridors.join(' → ') || 'LOCAL DETOUR'}</span></div>
                  <small>{r.distanceKm.toFixed(1)} KM · {r.etaMinutes} MIN · +{r.deltaMinutes} MIN</small>
                </div>
              ))}
            </div>
          ) : <div className="facility-empty">NO DETOUR REQUIRED / ROUTE GRAPH CLEAR</div>}
          <p className="ops-model-note"><Shield size={12}/> NAMES/DISTANCES ARE FROM MAPPED OSM FACILITIES WHEN AVAILABLE. BATCH COUNTS + ROUTE TIMES ARE CITADEL MODEL OUTPUTS.</p>
        </section>
      )}

      <section className="ops-section">
        <div className="dock-section-title">RECOMMENDED NOW</div>
        <div className="response-lines">
          <div><Ambulance size={13}/><span>EMS POSTURE</span><b>{impact.highRiskPopulation > 5000 ? 'PRE-POSITION' : 'STANDBY'}</b></div>
          <div><Route size={13}/><span>TRAFFIC ACTION</span><b>{snap.traffic === 'HEAVY' || snap.traffic === 'GRIDLOCK' ? 'DYNAMIC REROUTE' : 'MONITOR'}</b></div>
          <div><CloudRain size={13}/><span>WEATHER ACTION</span><b>{snap.weather === 'STORM' || snap.weather === 'HEAVY RAIN' ? 'FLOOD WATCH' : 'NORMAL'}</b></div>
          <div><MapPin size={13}/><span>SAFE-SITE READINESS</span><b>{impact.evacuationRecommended > 1000 ? 'PREPARE' : 'AVAILABLE'}</b></div>
        </div>
      </section>

      <section className="ops-section impact-block">
        <div className="dock-section-title">MODELLED HUMAN IMPACT</div>
        <div className="ops-grid cols-2">
          <Stat label="PEOPLE POTENTIALLY AFFECTED" value={impact.estimatedPeopleAffected.toLocaleString()} sub="weather + access + hazard estimate" />
          <Stat label="HIGH-RISK POPULATION" value={impact.highRiskPopulation.toLocaleString()} sub="priority response cohort" />
          <Stat label="ROAD USERS DELAYED" value={impact.roadUsersDelayed.toLocaleString()} sub="agent-weighted estimate" />
          <Stat label="EVACUATION RECOMMENDED" value={impact.evacuationRecommended.toLocaleString()} sub="model output, not observed count" />
        </div>
        <p className="ops-model-note"><Shield size={12}/> ESTIMATE BASIS // {impact.basis.toUpperCase()}</p>
      </section>

      <section className="ops-section">
        <div className="dock-section-title">RESPONSE CAPACITY</div>
        <div className="resource-grid">
          <div><Hospital size={14}/><span>HOSPITALS</span><b>{facilityCounts.hospital || impact.hospitalsAvailable}</b></div>
          <div><Flame size={14}/><span>FIRE STATIONS</span><b>{facilityCounts.fire || impact.fireStationsAvailable}</b></div>
          <div><Siren size={14}/><span>POLICE</span><b>{facilityCounts.police || impact.policeStationsAvailable}</b></div>
          <div><MapPin size={14}/><span>SAFE SITES</span><b>{facilityCounts.safe || impact.safeSitesAvailable}</b></div>
        </div>
        <div className="response-lines">
          <div><Ambulance size={13}/><span>EMS RESPONSE BATCHES</span><b>{impact.emsBatchesRequired}</b></div>
          <div><Flame size={13}/><span>FIRE RESPONSE BATCHES</span><b>{impact.fireBatchesRequired}</b></div>
          <div><Siren size={13}/><span>POLICE / TRAFFIC BATCHES</span><b>{impact.policeBatchesRequired}</b></div>
          <div><Route size={13}/><span>ALTERNATE ROUTE PENALTY</span><b>+{impact.alternateRouteMinutes} MIN</b></div>
          <div><TrafficCone size={13}/><span>ROAD CLEARANCE EST.</span><b>{impact.estimatedRoadClearanceMinutes} MIN</b></div>
          <div><Users size={13}/><span>NETWORK STABILISATION</span><b>{impact.estimatedStabilizationMinutes} MIN</b></div>
        </div>
      </section>

      {activeIncident && (
        <section className="ops-section">
          <div className="dock-section-title">ACTIVE ROAD RESPONSE</div>
          <div className="response-lines">
            <div><TrafficCone size={13}/><span>INCIDENT</span><b>{activeIncident.kind} // {activeIncident.edgeId}</b></div>
            <div><Route size={13}/><span>ROAD CAPACITY</span><b>{activeIncident.capacityBefore}% → {activeIncident.capacityAfter}%</b></div>
            <div><Ambulance size={13}/><span>PRIMARY UNIT</span><b>{activeIncident.assignedUnit ?? 'DISPATCHING'}</b></div>
            <div><Route size={13}/><span>REROUTE</span><b>DIJKSTRA // +{impact.alternateRouteMinutes} MIN</b></div>
            <div><TrafficCone size={13}/><span>CLEAR / REPAIR ETA</span><b>{Math.max(1, Math.round(activeIncident.clearanceSeconds / 60))} MIN</b></div>
          </div>
        </section>
      )}

      <section className="ops-section safe-site-block">
        <div className="dock-section-title">NEAREST SAFE ASSEMBLY CANDIDATE</div>
        <div className="safe-site"><MapPin size={15}/><div><b>{impact.nearestSafeSiteName}</b><small>{impact.nearestSafeSiteDistanceKm.toFixed(2)} KM from current impact centre</small></div></div>
        <p className="ops-note">Mapped OSM assembly/shelter candidates are used when available; otherwise CITADEL uses synthetic safe zones for the scenario.</p>
      </section>
    </div>
  );
}
