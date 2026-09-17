import type { CitySim } from '../sim';
import { etaString } from '../sim';
import type { Snapshot, Vehicle } from '../types';

function missionTone(unit: Vehicle) {
  if (unit.status === 'ON SCENE') return 'text-[#69e4a6]';
  if ((unit.currentCongestionPct ?? 0) >= 70 || (unit.rerouteCount ?? 0) > 0) return 'text-[#ff806f]';
  return 'text-[#8bdfff]';
}

export default function EmergencyResponseHUD({ sim, snap }: { sim: CitySim; snap: Snapshot }) {
  const active = snap.vehicles
    .filter((v) => v.emergency && ['RESPONDING', 'ON SCENE', 'RETURNING'].includes(v.status) && v.missionStartedAt !== undefined)
    .sort((a, b) => (b.missionStartedAt ?? 0) - (a.missionStartedAt ?? 0));
  const unit = active[0];
  if (!unit) return null;
  const event = unit.missionEvents?.[0];
  const route = unit.routeSource ?? 'CALCULATING';
  const congestion = Math.round(unit.currentCongestionPct ?? 0);

  return (
    <div className="pointer-events-auto absolute left-[348px] top-[64px] z-[25] w-[360px] border border-white/12 bg-[#050a0f]/94 shadow-2xl backdrop-blur-md">
      <div className="flex items-start justify-between border-b border-white/8 px-3 py-2">
        <div>
          <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-white/38">LIVE EMERGENCY RESPONSE</div>
          <div className={`mt-1 text-[11px] font-medium tracking-[0.1em] ${missionTone(unit)}`}>{unit.id} // {unit.status}</div>
        </div>
        <button onClick={() => sim.follow(snap.followId === unit.id ? null : unit.id)} className="border border-white/12 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-white/62 hover:bg-white/8">
          {snap.followId === unit.id ? 'RELEASE' : 'FOLLOW'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-2 font-mono uppercase">
        <div><div className="text-[7px] tracking-[0.14em] text-white/28">DISPATCH ORIGIN</div><div className="mt-0.5 truncate text-[8px] tracking-[0.08em] text-white/72">{unit.missionOriginLabel ?? 'BASE'}</div></div>
        <div><div className="text-[7px] tracking-[0.14em] text-white/28">INCIDENT</div><div className="mt-0.5 truncate text-[8px] tracking-[0.08em] text-white/72">{unit.missionDestinationLabel ?? 'FIELD TARGET'}</div></div>
        <div><div className="text-[7px] tracking-[0.14em] text-white/28">{unit.status === 'RESPONDING' ? 'ARRIVAL ETA' : unit.status === 'ON SCENE' ? 'ON-SCENE TIMER' : 'RETURN TIMER'}</div><div className="mt-0.5 text-[15px] font-semibold tracking-[0.08em] text-white">{etaString(unit.etaSeconds)}</div></div>
        <div><div className="text-[7px] tracking-[0.14em] text-white/28">CONGESTION</div><div className={`mt-0.5 text-[15px] font-semibold tracking-[0.08em] ${congestion >= 70 ? 'text-[#ff806f]' : congestion >= 50 ? 'text-[#e6bd62]' : 'text-[#69e4a6]'}`}>{congestion}%</div></div>
      </div>

      <div className="border-t border-white/8 px-3 py-2 font-mono uppercase">
        <div className="flex items-center justify-between gap-2 text-[7px] tracking-[0.12em] text-white/34"><span>ROUTE ENGINE</span><span className="truncate text-right text-white/62">{route}</span></div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[7px] tracking-[0.12em] text-white/34"><span>REROUTES</span><span className={(unit.rerouteCount ?? 0) ? 'text-[#ff806f]' : 'text-white/62'}>{unit.rerouteCount ?? 0}</span></div>
        {unit.lastRerouteReason && <div className="mt-1.5 border-l border-[#ff806f]/40 pl-2 text-[7px] leading-4 tracking-[0.08em] text-[#ffb0a5]">{unit.lastRerouteReason}</div>}
      </div>

      {event && (
        <div className="border-t border-white/8 bg-white/[0.02] px-3 py-2 font-mono uppercase">
          <div className="text-[7px] tracking-[0.14em] text-white/28">LATEST MISSION EVENT</div>
          <div className="mt-1 flex items-center justify-between gap-2"><span className="text-[8px] tracking-[0.1em] text-white/82">{event.label}</span><span className="text-[7px] tracking-[0.1em] text-white/32">{event.kind}</span></div>
          <div className="mt-1 text-[7px] leading-4 tracking-[0.07em] text-white/45">{event.detail}</div>
        </div>
      )}
    </div>
  );
}
