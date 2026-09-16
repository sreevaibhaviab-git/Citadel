import { useMemo, useState } from 'react';
import {
  Activity,
  BrainCircuit,
  Check,
  ChevronRight,
  Gauge,
  RotateCcw,
  Route,
  ShieldCheck,
  Siren,
  TimerReset,
  UsersRound,
  Wrench,
  X,
} from 'lucide-react';
import type { CitySim } from '../sim';
import type { Snapshot } from '../types';

type Tab = 'live' | 'response' | 'recovery' | 'algorithms';

const fmtTime = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `T+${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

function Stat({ label, value, tone = '' }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="scenario-stat">
      <span>{label}</span>
      <b className={tone}>{value}</b>
    </div>
  );
}

export default function ScenarioConsole({ sim, snap, onClose }: { sim: CitySim; snap: Snapshot; onClose?: () => void }) {
  const [tab, setTab] = useState<Tab>('live');
  const d = snap.disaster;
  const impact = snap.liveOps.impact;
  const response = snap.responsePlan;
  const redTeamOnly = !d && snap.algorithmTrace.some((x) => x.label === 'RESILIENCE RED TEAM');

  const best = useMemo(
    () => snap.interventions.find((x) => x.recommended && !x.applied) ?? snap.interventions.find((x) => !x.applied),
    [snap.interventions]
  );

  if (!d && !redTeamOnly) return null;

  if (!d && redTeamOnly) {
    return (
      <aside className="scenario-console pointer-events-auto absolute bottom-[48px] right-0 top-[49px] w-[382px] border-l border-white/10">
        <div className="scenario-head">
          <div>
            <div className="dock-kicker">RESILIENCE RED TEAM</div>
            <div className="dock-title">HIDDEN WEAKNESS SEARCH</div>
          </div>
          <button className="dock-icon-btn" onClick={onClose}><X size={15}/></button>
        </div>
        <div className="dock-scroll">
          <section className="scenario-alert-block">
            <ShieldCheck size={18}/>
            <div>
              <b>STRUCTURAL STRESS TEST COMPLETE</b>
              <span>Pairwise infrastructure combinations were scored for systemic cascade potential.</span>
            </div>
          </section>
          <section className="dock-section">
            <div className="dock-section-title">ALGORITHM OUTPUT</div>
            {snap.algorithmTrace.slice(0, 8).map((t) => (
              <div key={t.id} className="algo-row">
                <div><b>{t.label}</b><span>{t.algorithm}</span></div>
                <p>{t.output}</p>
              </div>
            ))}
          </section>
          <section className="dock-section">
            <div className="dock-section-title">NEXT ACTION</div>
            <p className="dock-note">Run a major disaster scenario to watch the vulnerability propagate through traffic, utilities, emergency response and population flow.</p>
          </section>
        </div>
      </aside>
    );
  }

  if (!d) return null;

  return (
    <aside className="scenario-console pointer-events-auto absolute bottom-[48px] right-0 top-[49px] w-[382px] border-l border-white/10">
      <div className="scenario-head">
        <div className="min-w-0">
          <div className="dock-kicker">LIVE RESILIENCE SIMULATION</div>
          <div className="dock-title truncate">{d.kind}</div>
        </div>
        <button className="dock-icon-btn" onClick={onClose}><X size={15}/></button>
      </div>

      <div className="scenario-phasebar">
        <span className={`phase-dot phase-${d.phase.toLowerCase()}`} />
        <b>{d.phase}</b>
        <i />
        <span>{fmtTime(d.elapsedSeconds)}</span>
        <i />
        <span>CONF {Math.round(d.confidence * 100)}%</span>
      </div>

      <div className="scenario-tabs">
        {([
          ['live', 'LIVE'],
          ['response', 'RESPOND'],
          ['recovery', 'RECOVER'],
          ['algorithms', 'ALGO'],
        ] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={tab === id ? 'scenario-tab active' : 'scenario-tab'}>{label}</button>
        ))}
      </div>

      <div className="dock-scroll">
        {tab === 'live' && (
          <>
            <section className="scenario-alert-block danger">
              <Siren size={18}/>
              <div>
                <b>{d.scenarioLabel}</b>
                <span>Algorithmic synthetic scenario on real Bengaluru geospatial context.</span>
              </div>
            </section>

            <section className="dock-section">
              <div className="dock-section-title">SYSTEM IMPACT</div>
              <div className="scenario-stat-grid">
                <Stat label="RESILIENCE" value={`${Math.round(snap.metrics.resilience)}/100`} tone={snap.metrics.resilience < 55 ? 'tone-alert' : 'tone-warn'} />
                <Stat label="MOBILITY" value={`${Math.round(snap.metrics.mobility)}%`} tone={snap.metrics.mobility < 55 ? 'tone-alert' : ''} />
                <Stat label="ROADS AFFECTED" value={d.affectedEdges.length} />
                <Stat label="ASSETS AFFECTED" value={d.affectedAssets.length} />
                <Stat label="FAILED ASSETS" value={d.failedAssets.length} tone={d.failedAssets.length ? 'tone-alert' : ''} />
                <Stat label="EVACUATION" value={d.evacuated.toLocaleString()} />
              </div>
              <div className="resilience-track"><i style={{ width: `${snap.metrics.resilience}%` }} /></div>
            </section>

            <section className="dock-section">
              <div className="dock-section-title">HUMAN IMPACT ESTIMATE</div>
              <div className="scenario-stat-grid">
                <Stat label="PEOPLE AFFECTED" value={impact.estimatedPeopleAffected.toLocaleString()} tone="tone-warn" />
                <Stat label="HIGH RISK" value={impact.highRiskPopulation.toLocaleString()} tone={impact.highRiskPopulation > 10000 ? 'tone-alert' : ''} />
                <Stat label="ROAD USERS DELAYED" value={impact.roadUsersDelayed.toLocaleString()} />
                <Stat label="EVAC RECOMMENDED" value={impact.evacuationRecommended.toLocaleString()} />
              </div>
              <p className="dock-note mt-2">MODEL ESTIMATE // {impact.basis}</p>
            </section>

            <section className="dock-section">
              <div className="dock-section-title">RESPONSE CAPACITY + ETA</div>
              <div className="scenario-kv"><span>HOSPITALS AVAILABLE</span><b>{impact.hospitalsAvailable}</b></div>
              <div className="scenario-kv"><span>FIRE STATIONS</span><b>{impact.fireStationsAvailable}</b></div>
              <div className="scenario-kv"><span>POLICE STATIONS</span><b>{impact.policeStationsAvailable}</b></div>
              <div className="scenario-kv"><span>EMS RESPONSE BATCHES</span><b>{impact.emsBatchesRequired}</b></div>
              <div className="scenario-kv"><span>FIRE / POLICE BATCHES</span><b>{impact.fireBatchesRequired} / {impact.policeBatchesRequired}</b></div>
              <div className="scenario-kv"><span>ROAD CLEARANCE EST.</span><b>{impact.estimatedRoadClearanceMinutes} MIN</b></div>
              <div className="scenario-kv"><span>NETWORK STABILISATION</span><b>{impact.estimatedStabilizationMinutes} MIN</b></div>
              <div className="scenario-kv"><span>ALTERNATE ROUTE PENALTY</span><b>+{impact.alternateRouteMinutes} MIN</b></div>
              <div className="scenario-kv"><span>NEAREST SAFE SITE</span><b>{impact.nearestSafeSiteDistanceKm.toFixed(2)} KM</b></div>
              <p className="dock-note mt-2">{impact.nearestSafeSiteName}</p>
            </section>

            {response && (
              <section className="dock-section">
                <div className="dock-section-title">NEAREST RESPONSE NETWORK</div>
                {[['HOSPITAL', response.hospitals], ['FIRE', response.fireStations], ['POLICE', response.policeStations], ['SAFE', response.safeSites]].map(([label, list]) => (
                  <div key={label as string} className="scenario-response-group">
                    <span>{label as string}</span>
                    {(list as any[]).length ? (list as any[]).slice(0, 3).map((f) => (
                      <div key={f.id}><b>{f.name}</b><small>{f.distanceKm.toFixed(1)} KM</small></div>
                    )) : <small>NO MAPPED RESULT IN CURRENT QUERY</small>}
                  </div>
                ))}
                <div className="dock-section-title mt-3">ROAD ALTERNATIVES</div>
                {response.alternateRoutes.length ? response.alternateRoutes.map((r) => (
                  <div className="scenario-route-alt" key={r.id}>
                    <b>{r.id} // {r.corridors.join(' → ') || 'LOCAL DETOUR'}</b>
                    <small>{r.distanceKm.toFixed(1)} KM · {r.etaMinutes} MIN · +{r.deltaMinutes} MIN</small>
                  </div>
                )) : <p className="dock-note">No blocked-segment detour is required for this event.</p>}
              </section>
            )}

            <section className="dock-section">
              <div className="dock-section-title">HAZARD INPUT</div>
              <div className="scenario-kv"><span>SEVERITY</span><b>{Math.round(d.severity * 100)}%</b></div>
              {d.magnitude && <div className="scenario-kv"><span>MAGNITUDE</span><b>M{d.magnitude.toFixed(1)}</b></div>}
              {d.rainfallMm && <div className="scenario-kv"><span>RAINFALL INPUT</span><b>{d.rainfallMm} MM</b></div>}
              <div className="scenario-kv"><span>EXPOSED POPULATION</span><b>{d.exposedPopulation.toLocaleString()}</b></div>
            </section>

            <section className="dock-section">
              <div className="dock-section-title">SIMULATION RATE</div>
              <div className="compact-grid cols-4">
                {[0.5, 1, 2, 4].map((s) => (
                  <button key={s} className={snap.simulationSpeed === s ? 'square-action active' : 'square-action'} onClick={() => sim.setSimulationSpeed(s)}>{s}X</button>
                ))}
              </div>
            </section>

            <section className="dock-section">
              <div className="dock-section-title">LIVE CASCADE</div>
              {snap.feed.slice(0, 8).map((f) => (
                <div key={f.id} className={`scenario-feed tone-${f.tone.toLowerCase()}`}><span>{f.stamp}</span><b>{f.text}</b></div>
              ))}
            </section>
          </>
        )}

        {tab === 'response' && (
          <>
            <section className="scenario-alert-block response">
              <Route size={18}/>
              <div>
                <b>RESPONSE OPTIMIZER</b>
                <span>Actions ranked by resilience gain, cascade reduction, cost and deployment time.</span>
              </div>
            </section>
            {snap.interventions.map((item) => (
              <section key={item.id} className={item.recommended ? 'intervention-card recommended' : 'intervention-card'}>
                <div className="intervention-head">
                  <div><span>{item.recommended ? 'RECOMMENDED' : 'OPTION'}</span><b>{item.title}</b></div>
                  {item.applied && <Check size={16}/>} 
                </div>
                <p>{item.description}</p>
                <div className="intervention-metrics">
                  <span>COST <b>₹{item.costLakhs.toFixed(1)}L</b></span>
                  <span>GAIN <b>+{item.resilienceGain}</b></span>
                  <span>CASCADE <b>-{item.cascadeReduction}%</b></span>
                  <span>ETA <b>{item.etaMinutes}M</b></span>
                </div>
                <div className="intervention-algo"><BrainCircuit size={12}/><span>{item.algorithm}</span></div>
                <button disabled={item.applied} onClick={() => sim.applyIntervention(item.id)} className={item.applied ? 'full-action applied' : 'full-action'}>
                  {item.applied ? 'ACTION APPLIED' : 'APPLY ACTION'}
                </button>
              </section>
            ))}
            {best && <button className="primary-response" onClick={() => sim.applyBestIntervention()}><ShieldCheck size={15}/> APPLY BEST RESPONSE <ChevronRight size={14}/></button>}
          </>
        )}

        {tab === 'recovery' && (
          <>
            <section className="scenario-alert-block recovery">
              <Wrench size={18}/>
              <div>
                <b>RECOVERY SEQUENCER</b>
                <span>Prioritises repairs by criticality, dependencies unlocked and estimated restoration time.</span>
              </div>
            </section>
            <button className="full-action" onClick={() => sim.optimizeRecovery()}>RECOMPUTE RECOVERY ORDER</button>
            <div className="recovery-list">
              {snap.recoveryPlan.length === 0 && <div className="future-callout">NO CRITICAL ASSET REPAIR REQUIRED</div>}
              {snap.recoveryPlan.map((step) => (
                <div key={`${step.order}-${step.assetId}`} className={step.completed ? 'recovery-row done' : 'recovery-row'}>
                  <span className="recovery-order">{String(step.order).padStart(2, '0')}</span>
                  <div className="flex-1 min-w-0"><b>{step.assetId} // {step.label}</b><small>{step.unlocks.length ? `UNLOCKS ${step.unlocks.join(' + ')}` : 'DIRECT SERVICE RECOVERY'}</small></div>
                  <div className="recovery-time">{step.restoreMinutes}M</div>
                </div>
              ))}
            </div>
            <button className="primary-response" onClick={() => sim.runRecoveryStep()}><TimerReset size={15}/> RUN NEXT RECOVERY STEP <ChevronRight size={14}/></button>
          </>
        )}

        {tab === 'algorithms' && (
          <>
            <section className="dock-section">
              <div className="dock-section-title">ALGORITHM TRACE</div>
              {snap.algorithmTrace.map((t) => (
                <div key={t.id} className={`algo-row algo-${(t.tone ?? 'INFO').toLowerCase()}`}>
                  <div><b>{t.label}</b><span>{t.algorithm}</span></div>
                  <p>{t.output}</p>
                </div>
              ))}
            </section>
            <section className="dock-section">
              <div className="dock-section-title">MODEL STACK</div>
              <div className="model-stack-row"><Gauge size={13}/><span><b>TRAFFIC</b>Dijkstra weighted routing + dynamic capacity</span></div>
              <div className="model-stack-row"><Activity size={13}/><span><b>CASCADE</b>dependency propagation + overload thresholds</span></div>
              <div className="model-stack-row"><UsersRound size={13}/><span><b>EVACUATION</b>safe-zone agent rerouting</span></div>
              <div className="model-stack-row"><BrainCircuit size={13}/><span><b>DECISION</b>benefit-cost intervention ranking</span></div>
            </section>
            <section className="dock-section">
              <div className="dock-section-title">DATA PROVENANCE</div>
              <div className="provenance-line"><span>3D GEOSPATIAL BASE</span><b>REAL / STREAMED</b></div>
              <div className="provenance-line"><span>ROAD / ASSET NETWORK</span><b className="sim">SYNTHETIC DEMO MODEL</b></div>
              <div className="provenance-line"><span>HAZARD TELEMETRY</span><b className="sim">SIMULATED</b></div>
              <div className="provenance-line"><span>ALGORITHM OUTPUTS</span><b className="sim">COMPUTED</b></div>
            </section>
          </>
        )}
      </div>

      <div className="scenario-foot">
        <button onClick={() => sim.resetDisaster()}><RotateCcw size={13}/> RESET SCENARIO</button>
        <span>{d.id}</span>
      </div>
    </aside>
  );
}
