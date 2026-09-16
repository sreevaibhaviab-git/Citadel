import { useState } from 'react';
import {
  Activity,
  Ambulance,
  Building2,
  CarFront,
  ChevronLeft,
  ChevronRight,
  CloudRain,
  Droplets,
  Eye,
  Map,
  Box,
  ZoomIn,
  ZoomOut,
  HeartPulse,
  Layers3,
  Network,
  Siren,
  Users,
  Zap,
  Waves,
  RadioTower,
  TriangleAlert,
  ShieldAlert,
} from 'lucide-react';
import { cameraPresets, LAYER_KEYS } from '../config';
import { TRAFFIC_MODES, WEATHER_MODES, type CitySim } from '../sim';
import type { LayerKey, Snapshot } from '../types';

const LAYER_META: Record<LayerKey, { label: string; sub: string; icon: any; source: string }> = {
  TRAFFIC: { label: 'Traffic flow', sub: 'live speed + model agents', icon: CarFront, source: 'SIM' },
  HEALTHCARE: { label: 'Healthcare', sub: 'hospitals + access', icon: HeartPulse, source: 'SIM' },
  POWER: { label: 'Power grid', sub: 'substations + load', icon: Zap, source: 'SIM' },
  WATER: { label: 'Water system', sub: 'treatment + demand', icon: Droplets, source: 'SIM' },
  EMERGENCY: { label: 'Emergency response', sub: 'EMS + fire units', icon: Siren, source: 'SIM' },
  POPULATION: { label: 'Population flow', sub: 'agent movement', icon: Users, source: 'SIM' },
  WEATHER: { label: 'Weather effects', sub: 'rain + visibility', icon: CloudRain, source: 'SIM' },
  DEPENDENCIES: { label: 'Dependencies', sub: 'system relationships', icon: Network, source: 'MODEL' },
};

type Tab = 'layers' | 'environment' | 'views' | 'simulate';

export default function LayerDock({
  sim,
  snap,
  onPreset,
  viewMode,
  onViewMode,
  onZoom,
}: {
  sim: CitySim;
  snap: Snapshot;
  onPreset: (id: string) => void;
  viewMode: '2D' | '3D';
  onViewMode: (mode: '2D' | '3D') => void;
  onZoom: (direction: 'IN' | 'OUT') => void;
}) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>('layers');

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="map-tool left-[14px] top-[66px]"
        title="Open map layers"
      >
        <Layers3 size={16} />
        <span>LAYERS</span>
        <ChevronRight size={13} />
      </button>
    );
  }

  return (
    <aside className="citadel-dock pointer-events-auto absolute bottom-[48px] left-0 top-[49px] w-[304px] border-r border-white/10">
      <div className="dock-head">
        <div>
          <div className="dock-kicker">MAP CONTENT</div>
          <div className="dock-title">BENGALURU DIGITAL TWIN</div>
        </div>
        <button onClick={() => setOpen(false)} className="dock-icon-btn" title="Collapse">
          <ChevronLeft size={15} />
        </button>
      </div>

      <div className="dock-tabs">
        {([
          ['layers', 'LAYERS'],
          ['environment', 'ENV'],
          ['views', 'VIEWS'],
          ['simulate', 'SIM'],
        ] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={tab === id ? 'dock-tab dock-tab-active' : 'dock-tab'}>
            {label}
          </button>
        ))}
      </div>

      <div className="dock-scroll">
        {tab === 'layers' && (
          <>
            <section className="dock-section">
              <div className="dock-section-title">BASE MAP</div>
              <div className="map-mode-switch">
                <button className={viewMode === '2D' ? 'map-mode active' : 'map-mode'} onClick={() => onViewMode('2D')}>
                  <Map size={14} /><span>NORMAL MAP</span><small>2D</small>
                </button>
                <button className={viewMode === '3D' ? 'map-mode active' : 'map-mode'} onClick={() => onViewMode('3D')}>
                  <Box size={14} /><span>CITY FABRIC</span><small>3D</small>
                </button>
              </div>
              <div className="layer-row layer-row-static">
                <span className={viewMode === '3D' ? 'layer-check layer-check-on' : 'layer-check'} />
                <Building2 size={15} />
                <div className="min-w-0 flex-1">
                  <div className="layer-name">Photorealistic city fabric</div>
                  <div className="layer-sub">real-world 3D source; coverage varies</div>
                </div>
                <span className="source-tag source-real">GEO</span>
              </div>
              <div className="layer-row layer-row-static">
                <span className="layer-check layer-check-on" />
                <Eye size={15} />
                <div className="min-w-0 flex-1">
                  <div className="layer-name">Real-world geography</div>
                  <div className="layer-sub">Bengaluru coordinate context</div>
                </div>
                <span className="source-tag source-real">GEO</span>
              </div>
            </section>

            <section className="dock-section">
              <div className="dock-section-title">OPERATIONAL LAYERS</div>
              {LAYER_KEYS.map((key) => {
                const meta = LAYER_META[key];
                const Icon = meta.icon;
                return (
                  <button key={key} className="layer-row" onClick={() => sim.toggleLayer(key)}>
                    <span className={snap.layers[key] ? 'layer-check layer-check-on' : 'layer-check'} />
                    <Icon size={15} strokeWidth={1.6} />
                    <div className="min-w-0 flex-1 text-left">
                      <div className="layer-name">{meta.label}</div>
                      <div className="layer-sub">{meta.sub}</div>
                    </div>
                    {key === 'TRAFFIC' && snap.liveOps.mode === 'LIVE' && snap.liveOps.traffic.connected ? (
                      <span className="source-tag source-real">LIVE</span>
                    ) : (
                      <span className={meta.source === 'SIM' ? 'source-tag source-sim' : 'source-tag source-model'}>{meta.source}</span>
                    )}
                  </button>
                );
              })}
            </section>

            <section className="dock-section">
              <div className="dock-section-title">LEGEND</div>
              <div className="legend-grid">
                <span><i className="legend-dot bg-[#54c68a]" />FREE ROAD</span>
                <span><i className="legend-dot bg-[#d6b447]" />MODERATE</span>
                <span><i className="legend-dot bg-[#d98232]" />HEAVY</span>
                <span><i className="legend-dot bg-[#c8453a]" />GRIDLOCK / CLOSED</span>
              </div>
              <p className="dock-note mt-2">Click any coloured road to inspect live speed, free-flow speed, congestion, capacity and modelled vehicles.</p>
            </section>
          </>
        )}

        {tab === 'environment' && (
          <>
            <section className="dock-section">
              <div className="dock-section-title">DATA CONTROL</div>
              <div className="env-value-row"><span>MODE</span><b>{snap.liveOps.mode}</b></div>
              <button className="full-action" onClick={() => sim.setDataMode(snap.liveOps.mode === 'LIVE' ? 'SIMULATION' : 'LIVE')}>SWITCH TO {snap.liveOps.mode === 'LIVE' ? 'SCENARIO LAB' : 'LIVE FUSION'}</button>
              <p className="dock-note mt-2">Manual weather or traffic selection automatically enters Scenario Lab.</p>
            </section>
            <section className="dock-section">
              <div className="dock-section-title">TIME OF DAY</div>
              <div className="env-value-row"><span>CITY CLOCK</span><b>{snap.clock}</b></div>
              <div className="compact-grid cols-4">
                {[
                  ['06:00', 6],
                  ['12:00', 12],
                  ['18:00', 18],
                  ['00:00', 0],
                ].map(([label, h]) => (
                  <button key={label as string} className="square-action" onClick={() => sim.setTime((h as number) * 3600)}>{label as string}</button>
                ))}
              </div>
              <div className="compact-grid cols-3 mt-1">
                {(['DAY', 'SUNSET', 'NIGHT'] as const).map((p) => (
                  <button key={p} className="square-action" onClick={() => sim.setPreset(p)}>{p}</button>
                ))}
              </div>
              <button className={snap.autoTime ? 'full-action active' : 'full-action'} onClick={() => sim.toggleAutoTime()}>
                AUTO TIME {snap.autoTime ? 'ON' : 'OFF'}
              </button>
            </section>

            <section className="dock-section">
              <div className="dock-section-title">WEATHER MODEL</div>
              <div className="env-value-row"><span>CURRENT</span><b>{snap.weather}</b></div>
              <div className="compact-grid cols-2">
                {WEATHER_MODES.map((w) => (
                  <button key={w} className={snap.weather === w ? 'square-action active' : 'square-action'} onClick={() => { if (snap.liveOps.mode === 'LIVE') sim.setDataMode('SIMULATION'); sim.setWeather(w); }}>{w}</button>
                ))}
              </div>
            </section>

            <section className="dock-section">
              <div className="dock-section-title">TRAFFIC DEMAND</div>
              <div className="env-value-row"><span>STATE</span><b>{snap.traffic}</b></div>
              <div className="compact-grid cols-2">
                {TRAFFIC_MODES.map((t) => (
                  <button key={t} className={snap.traffic === t ? 'square-action active' : 'square-action'} onClick={() => { if (snap.liveOps.mode === 'LIVE') sim.setDataMode('SIMULATION'); sim.setTraffic(t); }}>{t}</button>
                ))}
              </div>
            </section>
          </>
        )}

        {tab === 'views' && (
          <>
            <section className="dock-section">
              <div className="dock-section-title">CAMERA CONTROL</div>
              <div className="camera-control-row">
                <button onClick={() => onZoom('IN')}><ZoomIn size={15}/><span>ZOOM IN</span></button>
                <button onClick={() => onZoom('OUT')}><ZoomOut size={15}/><span>ZOOM OUT</span></button>
              </div>
              <p className="dock-note mt-2">Smoothed camera motion with a protected minimum altitude to prevent uncomfortable dives.</p>
            </section>
            <section className="dock-section">
              <div className="dock-section-title">CAMERA PRESETS</div>
              {cameraPresets.map((p, i) => (
                <button key={p.id} className="view-row" onClick={() => onPreset(p.id)}>
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <b>{p.label}</b>
                  <ChevronRight size={13} />
                </button>
              ))}
            </section>
          </>
        )}

        {tab === 'simulate' && (
          <>
            <section className="dock-section">
              <div className="dock-section-title">CITY EVENT TESTS</div>
              <p className="dock-note">Operational events below are synthetic scenario inputs used to test response behaviour.</p>
              <button className="scenario-row" onClick={() => sim.triggerAccident()}>
                <Activity size={15} /><span><b>Road collision</b><small>capacity drop + EMS dispatch</small></span>
              </button>
              <button className="scenario-row" onClick={() => sim.triggerFire()}>
                <Siren size={15} /><span><b>Urban fire</b><small>fire unit + priority route</small></span>
              </button>
              <button className="scenario-row" onClick={() => sim.triggerJam()}>
                <CarFront size={15} /><span><b>Traffic surge</b><small>network congestion event</small></span>
              </button>
              <button className="scenario-row" onClick={() => sim.triggerMinorEvent()}>
                <Ambulance size={15} /><span><b>Random city event</b><small>synthetic operational disturbance</small></span>
              </button>
            </section>
            <section className="dock-section">
              <div className="dock-section-title">MAJOR DISASTER LAB</div>
              <p className="dock-note">Real Bengaluru geography + synthetic, algorithm-driven hazard and infrastructure response.</p>
              <button className="scenario-row scenario-major" onClick={() => { sim.triggerDisaster('FLOOD'); setOpen(false); }}>
                <Waves size={15} /><span><b>Urban flood</b><small>rainfall × drainage × exposure</small></span>
              </button>
              <button className="scenario-row scenario-major" onClick={() => { sim.triggerDisaster('EARTHQUAKE'); setOpen(false); }}>
                <TriangleAlert size={15} /><span><b>M6.4 earthquake</b><small>fragility + probabilistic damage</small></span>
              </button>
              <button className="scenario-row scenario-major" onClick={() => { sim.triggerDisaster('GRID CASCADE'); setOpen(false); }}>
                <RadioTower size={15} /><span><b>Grid cascade</b><small>load redistribution + dependencies</small></span>
              </button>
              <button className="scenario-row scenario-major danger" onClick={() => { sim.triggerDisaster('COMPOUND'); setOpen(false); }}>
                <ShieldAlert size={15} /><span><b>Compound crisis</b><small>storm + seismic + grid stress</small></span>
              </button>
            </section>
            <section className="dock-section">
              <div className="dock-section-title">RESILIENCE RED TEAM</div>
              <button className="full-action" onClick={() => sim.runRedTeam()}>FIND HIDDEN WEAKNESS</button>
              {snap.disaster && <button className="full-action mt-1" onClick={() => sim.resetDisaster()}>RESET MAJOR SCENARIO</button>}
            </section>
          </>
        )}
      </div>

      <div className="dock-foot">
        <div><span className="source-dot geo" />GEO = real geospatial layer</div>
        <div><span className="source-dot sim" />SIM = synthetic telemetry</div>
      </div>
    </aside>
  );
}
