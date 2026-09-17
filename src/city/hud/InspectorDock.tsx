import { X } from 'lucide-react';
import { assetById } from '../config';
import type { CitySim } from '../sim';
import { etaString } from '../sim';
import type { Snapshot } from '../types';

function Metric({ label, value, tone = '' }: { label: string; value: string | number; tone?: string }) {
  return <div className="inspector-metric"><span>{label}</span><b className={tone}>{value}</b></div>;
}

const assetName = (id: string) => assetById(id)?.name ?? id;

export default function InspectorDock({ sim, snap }: { sim: CitySim; snap: Snapshot }) {
  const asset = snap.selectedId ? assetById(snap.selectedId) : undefined;
  const unit = snap.vehicles.find((v) => v.id === snap.selectedId);
  const roadKey = snap.selectedId?.startsWith('ROAD:') ? snap.selectedId.slice(5) : null;
  const road = roadKey ? snap.roads.find((r) => r.key === roadKey) : undefined;
  const liveRoadId = snap.selectedId?.startsWith('LIVE_TRAFFIC:') ? snap.selectedId.slice('LIVE_TRAFFIC:'.length) : null;
  const liveRoad = liveRoadId ? snap.liveOps.traffic.samples.find((r) => r.id === liveRoadId) : undefined;
  const probe = snap.selectedId?.startsWith('MAP:') ? snap.mapProbe : null;
  const dep = asset ? snap.dependencyAnalysis : null;
  if (!asset && !unit && !road && !liveRoad && !probe) return null;

  return (
    <aside className="inspector-dock pointer-events-auto absolute bottom-[48px] right-0 top-[49px] w-[330px] border-l border-white/10">
      <div className="dock-head">
        <div>
          <div className="dock-kicker">OBJECT INSPECTOR</div>
          <div className="dock-title">{asset ? asset.id : unit ? unit.id : road ? `${road.corridor} // ${road.key}` : liveRoad ? `LIVE ROAD // ${liveRoad.id}` : probe ? 'POINT QUERY // 15 KM' : ''}</div>
        </div>
        <button className="dock-icon-btn" onClick={() => probe ? sim.clearMapProbe() : sim.select(null)}><X size={15}/></button>
      </div>

      {asset && (
        <div className="dock-scroll">
          <section className="inspect-hero">
            <div className="inspect-name">{asset.name}</div>
            <div className="inspect-class">{asset.kind} // INFRASTRUCTURE OBJECT</div>
          </section>

          <section className="dock-section">
            <div className="dock-section-title">CURRENT STATE</div>
            <Metric label="STATUS" value={asset.status} tone={asset.status === 'CRITICAL' ? 'tone-alert' : asset.status === 'WARNING' ? 'tone-warn' : 'tone-ok'} />
            <Metric label={asset.kind === 'WATER' ? 'OUTPUT' : 'LOAD / CAPACITY'} value={`${Math.round(asset.primary)}%`} />
            <div className="metric-track"><i style={{ width: `${Math.min(100, Math.max(0, asset.primary))}%` }} /></div>
            <Metric label="LAYER" value={asset.layer} />
          </section>

          {dep && (<>
            <section className="dock-section">
              <div className="dock-section-title">DEPENDENCY INTELLIGENCE</div>
              <Metric label="DIRECT DEPENDENTS" value={dep.direct.length} />
              <Metric label="INDIRECT DEPENDENTS" value={dep.indirect.length} />
              <Metric label="HIDDEN RELATIONSHIPS" value={dep.hiddenRelations.length} tone={dep.hiddenRelations.length ? 'tone-warn' : ''} />
              <Metric label="CASCADE RISK" value={`${dep.cascadeRisk}/100`} tone={dep.cascadeRisk >= 75 ? 'tone-alert' : dep.cascadeRisk >= 50 ? 'tone-warn' : 'tone-ok'} />
              <Metric label="MODELLED PEOPLE EXPOSED" value={dep.estimatedPeopleAffected.toLocaleString()} />
              <p className="dock-note mt-2">{dep.algorithm}</p>
            </section>

            <section className="dock-section">
              <div className="dock-section-title">IF {asset.id} IS LOST</div>
              {dep.consequences.slice(0, 6).map((text, i) => (
                <div className="provenance-line" key={`c-${i}`}><span>{String(i + 1).padStart(2, '0')}</span><b>{text}</b></div>
              ))}
            </section>

            <section className="dock-section">
              <div className="dock-section-title">DEPENDENCY CHAIN</div>
              {dep.direct.map((n) => (
                <div className="provenance-line" key={`d-${n.assetId}`}><span>DIRECT // D1</span><b>{n.assetId} · {assetName(n.assetId)}</b></div>
              ))}
              {dep.indirect.slice(0, 7).map((n) => (
                <div className="provenance-line" key={`i-${n.assetId}`}><span>INDIRECT // D{n.depth}</span><b>{n.assetId} · {assetName(n.assetId)}</b></div>
              ))}
              {!dep.affected.length && <p className="dock-note">No downstream assets found in the current model.</p>}
            </section>

            {!!dep.hiddenRelations.length && (
              <section className="dock-section">
                <div className="dock-section-title">HIDDEN RELATIONSHIPS DISCOVERED</div>
                {dep.hiddenRelations.slice(0, 6).map((r) => (
                  <div key={r.id} className="mb-2">
                    <div className="provenance-line"><span>{r.from} → {r.to}</span><b className="sim">{Math.round(r.confidence * 100)}% CONF.</b></div>
                    <p className="dock-note">{r.label} // {r.description}</p>
                  </div>
                ))}
              </section>
            )}

            <section className="dock-section">
              <div className="dock-section-title">BACKUPS + ALTERNATIVE CONNECTIONS</div>
              {dep.alternatives.length ? dep.alternatives.map((a) => (
                <div key={a.id} className="mb-2">
                  <div className="provenance-line"><span>{a.type}</span><b>{a.label}</b></div>
                  <p className="dock-note">{a.description}</p>
                </div>
              )) : <p className="dock-note">No alternate connection found in the current model.</p>}
            </section>
          </>)}

          <section className="dock-section">
            <div className="dock-section-title">MODEL TRACE</div>
            <div className="provenance-line"><span>GEOGRAPHIC CONTEXT</span><b>REAL / STREAMED</b></div>
            <div className="provenance-line"><span>DEPENDENCY NETWORK</span><b className="sim">MODEL + INFERENCE</b></div>
            <div className="provenance-line"><span>HIDDEN LINKS</span><b className="sim">INFERRED</b></div>
          </section>

          <section className="dock-section">
            <button className="full-action" onClick={() => sim.traceAssetDependencies(asset.id)}>DISCOVER + TRACE DEPENDENCIES</button>
          </section>
        </div>
      )}

      {road && (
        <div className="dock-scroll">
          <section className="inspect-hero">
            <div className="inspect-name">ROAD SEGMENT {road.corridor}</div>
            <div className="inspect-class">{road.source === 'LIVE+MODEL' ? 'LIVE TOMTOM FLOW + CITADEL AGENTS' : 'CITADEL TRAFFIC MODEL'}</div>
          </section>
          <section className="dock-section">
            <div className="dock-section-title">TRAFFIC STATE</div>
            <Metric label="STATUS" value={road.status} tone={road.status === 'CLOSED' || road.status === 'GRIDLOCK' ? 'tone-alert' : road.status === 'HEAVY' ? 'tone-warn' : 'tone-ok'} />
            <Metric label="CURRENT SPEED" value={`${road.currentSpeedKmh.toFixed(0)} KM/H`} />
            <Metric label="FREE-FLOW SPEED" value={`${road.freeFlowSpeedKmh.toFixed(0)} KM/H`} />
            <Metric label="CONGESTION" value={`${road.congestionPct.toFixed(0)}%`} />
            <Metric label="ROAD CAPACITY" value={`${road.capacityPct}%`} />
            <Metric label="MODELLED VEHICLES" value={road.modelVehicleCount} />
            <Metric label="FLOW CONFIDENCE" value={road.source === 'LIVE+MODEL' ? `${Math.round(road.confidence * 100)}%` : 'MODEL'} />
          </section>
          <section className="dock-section">
            <div className="dock-section-title">WHAT IS REAL?</div>
            <div className="provenance-line"><span>SPEED / FREE FLOW</span><b>{road.source === 'LIVE+MODEL' ? 'TOMTOM LIVE' : 'MODEL'}</b></div>
            <div className="provenance-line"><span>VEHICLE COUNT</span><b className="sim">MODELLED</b></div>
            <div className="provenance-line"><span>AGENT MOVEMENT</span><b className="sim">CALIBRATED</b></div>
            <p className="dock-note mt-2">TomTom supplies live flow speed, not a literal car count. CITADEL moves its agents using the observed road-speed ratio and reports the visible/modelled vehicles separately.</p>
          </section>
        </div>
      )}

      {liveRoad && (
        <div className="dock-scroll">
          <section className="inspect-hero">
            <div className="inspect-name">LIVE TRAFFIC SEGMENT</div>
            <div className="inspect-class">TOMTOM TRAFFIC FLOW // OBSERVED ROAD SPEED</div>
          </section>
          <section className="dock-section">
            <div className="dock-section-title">LIVE ROAD STATE</div>
            <Metric label="CURRENT SPEED" value={`${liveRoad.currentSpeedKmh.toFixed(0)} KM/H`} />
            <Metric label="FREE-FLOW SPEED" value={`${liveRoad.freeFlowSpeedKmh.toFixed(0)} KM/H`} />
            <Metric label="CONGESTION" value={`${Math.max(0, Math.min(100, (1 - liveRoad.currentSpeedKmh / Math.max(1, liveRoad.freeFlowSpeedKmh)) * 100)).toFixed(0)}%`} />
            <Metric label="EST. CARS ON SEGMENT" value={liveRoad.estimatedVehicleCount} />
            <Metric label="SEGMENT LENGTH" value={`${liveRoad.segmentLengthKm.toFixed(2)} KM`} />
            <Metric label="FLOW CONFIDENCE" value={`${Math.round(liveRoad.confidence * 100)}%`} />
            <Metric label="ROAD CLOSURE" value={liveRoad.roadClosure ? 'YES' : 'NO'} tone={liveRoad.roadClosure ? 'tone-alert' : 'tone-ok'} />
          </section>
          <section className="dock-section">
            <div className="dock-section-title">DATA TRACE</div>
            <div className="provenance-line"><span>SPEED / FREE FLOW</span><b>TOMTOM LIVE</b></div>
            <div className="provenance-line"><span>ROAD GEOMETRY</span><b>TOMTOM</b></div>
            <div className="provenance-line"><span>CAR COUNT</span><b className="sim">ESTIMATED</b></div>
            <p className="dock-note mt-2">TomTom provides real-time road-flow speed and geometry, not a literal vehicle count. CITADEL estimates cars from segment length, road class and observed congestion.</p>
          </section>
        </div>
      )}

      {probe && (
        <div className="dock-scroll">
          <section className="inspect-hero">
            <div className="inspect-name">15 KM RESPONSE RADIUS</div>
            <div className="inspect-class">OPENSTREETMAP LIVE FACILITY QUERY</div>
          </section>
          <section className="dock-section">
            <div className="dock-section-title">FACILITIES AROUND SELECTED POINT</div>
            {probe.loading ? <div className="dock-note">QUERYING MAPPED FACILITIES...</div> : probe.error ? <div className="dock-note">QUERY FAILED // {probe.error}</div> : <>
              <Metric label="HOSPITALS / CLINICS" value={probe.facilities.filter((f) => f.kind === 'HOSPITAL').length} />
              <Metric label="POLICE STATIONS" value={probe.facilities.filter((f) => f.kind === 'POLICE').length} />
              <Metric label="FIRE STATIONS" value={probe.facilities.filter((f) => f.kind === 'FIRE').length} />
              <Metric label="SAFE / ASSEMBLY SITES" value={probe.facilities.filter((f) => f.kind === 'SAFE').length} />
              <Metric label="TOTAL MAPPED" value={probe.facilities.length} />
            </>}
          </section>
          {!probe.loading && !probe.error && (
            <section className="dock-section">
              <div className="dock-section-title">NEAREST RESPONSE FACILITIES</div>
              {probe.facilities.slice().sort((a,b) => {
                const da=(a.lat-probe.lat)**2+(a.lon-probe.lon)**2; const db=(b.lat-probe.lat)**2+(b.lon-probe.lon)**2; return da-db;
              }).slice(0,8).map((f) => <div className="provenance-line" key={f.id}><span>{f.kind}</span><b>{f.name}</b></div>)}
            </section>
          )}
        </div>
      )}

      {unit && (
        <div className="dock-scroll">
          <section className="inspect-hero">
            <div className="inspect-name">{unit.label}</div>
            <div className="inspect-class">{unit.kind} // MOBILE AGENT</div>
          </section>
          <section className="dock-section">
            <div className="dock-section-title">UNIT STATE</div>
            <Metric label="STATUS" value={unit.status} />
            <Metric label="ETA" value={etaString(unit.etaSeconds)} />
            <Metric label="ROUTE LEGS" value={unit.path.length} />
          </section>
          <section className="dock-section">
            <button className={snap.followId === unit.id ? 'full-action active' : 'full-action'} onClick={() => sim.follow(snap.followId === unit.id ? null : unit.id)}>
              {snap.followId === unit.id ? 'RELEASE CAMERA' : 'FOLLOW UNIT'}
            </button>
          </section>
        </div>
      )}
    </aside>
  );
}
