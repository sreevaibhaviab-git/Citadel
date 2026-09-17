import type { Snapshot } from '../types';

const kmBetween = (lat1:number, lon1:number, lat2:number, lon2:number) => {
  const dy = (lat2-lat1) * 110.54;
  const dx = (lon2-lon1) * 111.32 * Math.cos(((lat1+lat2)/2) * Math.PI/180);
  return Math.hypot(dx,dy);
};

export default function RoadHoverCard({ snap }: { snap: Snapshot }) {
  const h = snap.roadHover;
  if (!h) return null;

  const nearest = (kind:'HOSPITAL'|'POLICE'|'FIRE') => snap.liveOps.facilities
    .filter((f)=>f.kind===kind)
    .map((f)=>({f, km:kmBetween(h.lat,h.lon,f.lat,f.lon)}))
    .sort((a,b)=>a.km-b.km)[0];

  const hospital = nearest('HOSPITAL');
  const police = nearest('POLICE');
  const fire = nearest('FIRE');
  const left = Math.min(window.innerWidth - 310, h.screenX + 18);
  const top = Math.min(window.innerHeight - 250, h.screenY + 18);

  return (
    <div
      className="pointer-events-none fixed z-[70] w-[292px] border border-cyan-300/25 bg-[#061018]/92 p-3 shadow-2xl backdrop-blur-xl"
      style={{ left: Math.max(10,left), top: Math.max(10,top) }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-cyan-200/55">ROAD INTELLIGENCE</div>
          <div className="mt-1 truncate text-[11px] font-medium text-white">{h.label}</div>
        </div>
        <div className="border border-white/10 px-2 py-1 font-mono text-[7px] tracking-[0.14em] text-cyan-200">{h.kind}</div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-y border-white/10 py-3 font-mono text-[8px]">
        <div><span className="block text-white/35">CURRENT SPEED</span><b className="mt-1 block text-white">{h.currentSpeedKmh.toFixed(0)} KM/H</b></div>
        <div><span className="block text-white/35">FREE FLOW</span><b className="mt-1 block text-white">{h.freeFlowSpeedKmh.toFixed(0)} KM/H</b></div>
        <div><span className="block text-white/35">CONGESTION</span><b className="mt-1 block text-white">{h.congestionPct.toFixed(0)}%</b></div>
        <div><span className="block text-white/35">{h.vehicleCountLabel} CARS</span><b className="mt-1 block text-white">{h.vehicleCount}</b></div>
      </div>

      <div className="mt-3 space-y-1.5 font-mono text-[7px] uppercase tracking-[0.08em]">
        <div className="flex justify-between gap-2"><span className="text-white/35">NEAREST HOSPITAL</span><b className="max-w-[150px] truncate text-white/75">{hospital ? `${hospital.f.name} · ${hospital.km.toFixed(1)} KM` : 'NO MAPPED RESULT'}</b></div>
        <div className="flex justify-between gap-2"><span className="text-white/35">NEAREST POLICE</span><b className="max-w-[150px] truncate text-white/75">{police ? `${police.f.name} · ${police.km.toFixed(1)} KM` : 'NO MAPPED RESULT'}</b></div>
        <div className="flex justify-between gap-2"><span className="text-white/35">NEAREST FIRE</span><b className="max-w-[150px] truncate text-white/75">{fire ? `${fire.f.name} · ${fire.km.toFixed(1)} KM` : 'NO MAPPED RESULT'}</b></div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2 font-mono text-[7px] uppercase tracking-[0.12em] text-white/35">
        <span>{h.source}</span><span className="text-cyan-200/70">CLICK ROAD FOR DETAILS</span>
      </div>
    </div>
  );
}
