import { Activity, Ambulance, CarFront, CloudRain, Database, HeartPulse, Radio, ShieldAlert, Users, Zap } from 'lucide-react';
import type { Snapshot } from '../types';

export default function BottomStatusBar({ snap, onEvents, onData, onOps, onScenario }: { snap: Snapshot; onEvents: () => void; onData: () => void; onOps: () => void; onScenario: () => void }) {
  const m = snap.metrics;
  return (
    <footer className="bottom-status pointer-events-auto absolute bottom-0 left-0 right-0 h-[48px] border-t border-white/10">
      <div className="status-brand">
        <span className={snap.disaster ? 'live-dot danger' : 'live-dot'} />
        <div><b>{snap.clock}</b><small>{snap.status}</small></div>
      </div>
      <div className="status-metrics">
        <div><CarFront size={13}/><span>VEH</span><b>{m.vehiclesActive}</b></div>
        <div><Users size={13}/><span>POP AGENTS</span><b>{m.populationActive.toLocaleString()}</b></div>
        <div><Ambulance size={13}/><span>EMS</span><b>{m.emsAvailable}/{m.emsTotal}</b></div>
        <div><Zap size={13}/><span>POWER</span><b>{Math.round(m.powerLoad)}%</b></div>
        <div><HeartPulse size={13}/><span>HOSP</span><b>{Math.round(m.hospitalCapacity)}%</b></div>
        <div><CloudRain size={13}/><span>{snap.weather}</span><b>{m.visibilityKm.toFixed(1)} KM</b></div>
      </div>
      <div className="status-actions">
        {(snap.disaster || snap.algorithmTrace.some((x) => x.label === 'RESILIENCE RED TEAM')) && <button className="scenario-action" onClick={onScenario}><ShieldAlert size={13}/> SCENARIO <b>{Math.round(m.resilience)}</b></button>}
        <button onClick={onOps}><Radio size={13}/> {snap.liveOps.mode === 'LIVE' ? 'LIVE OPS' : 'SCENARIO LAB'} <b>{snap.liveOps.mode === 'LIVE' ? (snap.liveOps.weather.connected ? '●' : '○') : 'SIM'}</b></button>
        <button onClick={onEvents}><Activity size={13}/> EVENTS <b>{snap.incidents.length}</b></button>
        <button onClick={onData}><Database size={13}/> SOURCES</button>
      </div>
    </footer>
  );
}
