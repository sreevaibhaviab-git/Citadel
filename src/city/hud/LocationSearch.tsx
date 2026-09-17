import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { searchLocations, type LocationSearchResult } from '../live';
import type { CitySim } from '../sim';
import type { World } from '../world';

export default function LocationSearch({ world, sim }: { world: World | null; sim: CitySim }) {
  const [q,setQ]=useState('');
  const [rows,setRows]=useState<LocationSearchResult[]>([]);
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const requestId=useRef(0);

  useEffect(() => {
    if (q.trim().length < 3) { setRows([]); setOpen(false); return; }
    const id=++requestId.current;
    const timer=window.setTimeout(async()=>{
      setBusy(true);
      try {
        const result=await searchLocations(q);
        if (id===requestId.current) { setRows(result); setOpen(true); }
      } catch {
        if (id===requestId.current) { setRows([]); setOpen(true); }
      } finally { if (id===requestId.current) setBusy(false); }
    },450);
    return ()=>clearTimeout(timer);
  },[q]);

  const choose=(row:LocationSearchResult)=>{
    setQ(row.displayName.split(',')[0]);
    setOpen(false);
    world?.flyToLonLat(row.lon,row.lat,900);
    void sim.probeMapPoint(row.lat,row.lon,15);
  };

  return (
    <div className="pointer-events-auto absolute left-1/2 top-[66px] z-[26] w-[390px] -translate-x-1/2">
      <div className="flex h-[38px] items-center border border-white/15 bg-[#071018]/72 px-3 shadow-xl backdrop-blur-xl">
        <Search size={14} className="text-[#75d8ff]"/>
        <input value={q} onChange={(e)=>setQ(e.target.value)} onFocus={()=>rows.length&&setOpen(true)} placeholder="SEARCH BENGALURU LOCATION / ROAD / POI" className="ml-3 min-w-0 flex-1 bg-transparent font-mono text-[9px] uppercase tracking-[0.12em] text-white outline-none placeholder:text-white/30"/>
        {busy && <span className="font-mono text-[7px] tracking-[0.14em] text-white/35">SEARCHING</span>}
        {!!q && !busy && <button onClick={()=>{setQ('');setRows([]);setOpen(false)}} className="text-white/40 hover:text-white"><X size={13}/></button>}
      </div>
      {open && (
        <div className="mt-1 max-h-[260px] overflow-auto border border-white/15 bg-[#071018]/88 shadow-2xl backdrop-blur-xl">
          {rows.length ? rows.map((r)=><button key={r.id} onClick={()=>choose(r)} className="block w-full border-b border-white/8 px-3 py-3 text-left hover:bg-white/[0.05]">
            <div className="text-[10px] text-white/85">{r.displayName.split(',')[0]}</div>
            <div className="mt-1 line-clamp-1 font-mono text-[7px] uppercase tracking-[0.12em] text-white/35">{r.displayName}</div>
          </button>) : <div className="px-3 py-3 font-mono text-[8px] tracking-[0.12em] text-white/35">NO LOCATION MATCH</div>}
        </div>
      )}
    </div>
  );
}
