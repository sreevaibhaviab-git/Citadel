import { CircleDot, Search } from 'lucide-react';
import type { Snapshot } from '../types';

export default function CommandBar({ snap }: { snap: Snapshot }) {
  const statusTone = snap.status === 'STABLE' ? 'text-[#61c7a7]' : snap.status === 'DEGRADED' ? 'text-[#e26b5b]' : 'text-[#dfbf55]';
  return (
    <header className="top-command pointer-events-auto absolute left-0 right-0 top-0 h-[49px] border-b border-white/10">
      <div className="flex h-full items-center">
        <div className="brand-block">
          <div className="brand-title">CITADEL</div>
          <div className="brand-sub">BENGALURU // RESILIENCE TWIN</div>
        </div>
        <div className="top-separator" />
        <div className="top-context hidden md:flex"><CircleDot size={11}/><span>REAL 3D BASE</span><i>//</i><span className={snap.liveOps.mode === 'LIVE' ? 'geo-text' : 'sim-text'}>{snap.liveOps.mode === 'LIVE' ? 'LIVE DATA FUSION' : 'SCENARIO LAB'}</span></div>
        <div className="ml-auto flex h-full items-stretch">
          <div className="top-field hidden lg:flex"><span>SCENARIO</span><b>{snap.disaster?.scenarioLabel ?? (snap.incidents.length ? 'ACTIVE CITY EVENT' : 'NORMAL OPERATIONS')}</b></div>
          <div className="top-field"><span>RESILIENCE</span><b>{Math.round(snap.metrics.resilience)}<i>/100</i></b></div>
          <div className="top-field"><span>SYSTEM</span><b className={statusTone}>{snap.status}</b></div>
          <button className="top-icon" title="Search objects"><Search size={15}/></button>
        </div>
      </div>
    </header>
  );
}
