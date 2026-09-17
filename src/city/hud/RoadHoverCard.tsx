import type { Snapshot } from '../types';

const km = (lat1:number, lon1:number, lat2:number, lon2:number) => {
  const r=6371;
  const dLat=(lat2-lat1)*Math.PI/180;
  const dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return 2*r*Math.asin(Math.sqrt(a));
};

export default function RoadHoverCard({ snap }: { snap: Snapshot }) {
  const h = snap.roadHover;
  if (!h) return null;

  const nearby = snap.liveOps.facilities
    .map((f) => ({ ...f, distanceKm: km(h.lat, h.lon, f.lat, f.lon) }))
    .filter((f) => f.distanceKm <= 5)
    .sort((a,b) => a.distanceKm-b.distanceKm);
  const nearestHospital = nearby.find((f) => f.kind === 'HOSPITAL');
  const nearestPolice = nearby.find((f) => f.kind === 'POLICE');
  const nearestFire = nearby.find((f) => f.kind === 'FIRE');
  const hospitals = nearby.filter((f) => f.kind === 'HOSPITAL').length;
  const police = nearby.filter((f) => f.kind === 'POLICE').length;
  const fire = nearby.filter((f) => f.kind === 'FIRE').length;

  const left = Math.min(h.screenX + 18, Math.max(12, window.innerWidth - 355));
  const top = Math.min(h.screenY + 18, Math.max(60, window.innerHeight - 300));

  return (
    <div
      className="pointer-events-none absolute z-[28] w-[330px] overflow-hidden border border-white/15 bg-[#081018]/75 shadow-2xl backdrop-blur-xl"
      style={{ left, top }}
    >
      <div className="border-b border-white/10 px-4 py-3">
        <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#75d8ff]">ROAD INTELLIGENCE // HOVER</div>
        <div className="mt-1 text-[13px] font-medium tracking-[0.04em] text-white">{h.label}</div>
        <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.16em] text-white/40">{h.source}</div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-white/10">
        <Metric label="CURRENT SPEED" value={`${Math.round(h.currentSpeedKmh)} KM/H`} />
        <Metric label="FREE FLOW" value={`${Math.round(h.freeFlowSpeedKmh)} KM/H`} />
        <Metric label="CONGESTION" value={`${Math.round(h.congestionPct)}%`} />
        <Metric label={`${h.vehicleCountLabel} CARS`} value={h.vehicleCount} />
      </div>

      <div className="px-4 py-3">
        <div className="mb-2 font-mono text-[8px] uppercase tracking-[0.2em] text-white/35">EMERGENCY COVERAGE // 5 KM</div>
        <div className="grid grid-cols-3 gap-2">
          <Mini label="HOSPITAL" value={hospitals} />
          <Mini label="POLICE" value={police} />
          <Mini label="FIRE" value={fire} />
        </div>
        <div className="mt-3 space-y-1 font-mono text-[8px] leading-4 text-white/55">
          {nearestHospital && <div><span className="text-[#7ee0c0]">HOSP</span> {nearestHospital.name} // {nearestHospital.distanceKm.toFixed(1)} KM</div>}
          {nearestPolice && <div><span className="text-[#79bfff]">POLICE</span> {nearestPolice.name} // {nearestPolice.distanceKm.toFixed(1)} KM</div>}
          {nearestFire && <div><span className="text-[#ff8b75]">FIRE</span> {nearestFire.name} // {nearestFire.distanceKm.toFixed(1)} KM</div>}
          {!nearby.length && <div>NO MAPPED RESPONSE FACILITIES FOUND WITHIN 5 KM</div>}
        </div>
      </div>
    </div>
  );
}

function Metric({label,value}:{label:string;value:string|number}) {
  return <div className="bg-[#071018]/85 px-4 py-3"><div className="font-mono text-[7px] uppercase tracking-[0.16em] text-white/35">{label}</div><div className="mt-1 font-mono text-[13px] text-white">{value}</div></div>;
}
function Mini({label,value}:{label:string;value:number}) {
  return <div className="border border-white/10 bg-white/[0.025] px-2 py-2 text-center"><div className="font-mono text-[7px] tracking-[0.12em] text-white/35">{label}</div><div className="mt-1 font-mono text-[12px] text-white/85">{value}</div></div>;
}
