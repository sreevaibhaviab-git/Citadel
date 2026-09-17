import { Search, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { searchLocations, type LocationSearchResult } from '../live';
import type { CitySim } from '../sim';
import type { World } from '../world';

const LOCAL: LocationSearchResult[] = [
  { id:'local-mg-road', displayName:'MG Road, Bengaluru, Karnataka', lat:12.9756, lon:77.6069, type:'local fallback' },
  { id:'local-cubbon', displayName:'Cubbon Park, Bengaluru, Karnataka', lat:12.9763, lon:77.5929, type:'local fallback' },
  { id:'local-indiranagar', displayName:'Indiranagar, Bengaluru, Karnataka', lat:12.9784, lon:77.6408, type:'local fallback' },
  { id:'local-jayanagar', displayName:'Jayanagar, Bengaluru, Karnataka', lat:12.9250, lon:77.5938, type:'local fallback' },
  { id:'local-koramangala', displayName:'Koramangala, Bengaluru, Karnataka', lat:12.9352, lon:77.6245, type:'local fallback' },
  { id:'local-majestic', displayName:'Majestic, Bengaluru, Karnataka', lat:12.9767, lon:77.5713, type:'local fallback' },
  { id:'local-whitefield', displayName:'Whitefield, Bengaluru, Karnataka', lat:12.9698, lon:77.7500, type:'local fallback' },
  { id:'local-jp-nagar', displayName:'JP Nagar, Bengaluru, Karnataka', lat:12.9077, lon:77.5850, type:'local fallback' },
  { id:'local-electronic-city', displayName:'Electronic City, Bengaluru, Karnataka', lat:12.8399, lon:77.6770, type:'local fallback' },
  { id:'local-yeshwanthpur', displayName:'Yeshwanthpur, Bengaluru, Karnataka', lat:13.0280, lon:77.5409, type:'local fallback' },
];

const key = (s:string) => s.toLowerCase().replace(/[^a-z0-9 ]/g,' ');

export default function LocationSearch({ world, sim }: { world: World | null; sim: CitySim }) {
  const [q,setQ]=useState('');
  const [remote,setRemote]=useState<LocationSearchResult[]>([]);
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const requestId=useRef(0);

  const localMatches = useMemo(()=>{
    const query=key(q.trim());
    if (query.length < 2) return [];
    return LOCAL.filter((r)=>key(r.displayName).includes(query)).slice(0,5);
  },[q]);

  const rows = useMemo(()=>{
    const seen=new Set<string>();
    return [...localMatches,...remote].filter((r)=>{
      const k=`${r.lat.toFixed(4)},${r.lon.toFixed(4)}`;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    }).slice(0,7);
  },[localMatches,remote]);

  const runSearch=async(e?:FormEvent)=>{
    e?.preventDefault();
    const query=q.trim();
    if (query.length < 2) return;
    const id=++requestId.current;
    setBusy(true); setError(''); setOpen(true);
    try {
      const result=await searchLocations(query);
      if (id===requestId.current) setRemote(result);
    } catch {
      if (id===requestId.current) {
        setRemote([]);
        setError(localMatches.length ? 'LIVE SEARCH OFFLINE // USING LOCAL BENGALURU INDEX' : 'LIVE SEARCH UNAVAILABLE');
      }
    } finally {
      if (id===requestId.current) setBusy(false);
    }
  };

  const choose=(row:LocationSearchResult)=>{
    setQ(row.displayName.split(',')[0]);
    setOpen(false); setError(''); setRemote([]);
    if (!world) return;
    sim.follow(null);
    window.requestAnimationFrame(()=>{
      world.flyToLonLat(row.lon,row.lat,950);
      window.setTimeout(()=>void sim.probeMapPoint(row.lat,row.lon,15),350);
    });
  };

  return (
    <form onSubmit={runSearch} className="pointer-events-auto absolute left-1/2 top-[66px] z-[60] w-[410px] -translate-x-1/2">
      <div className="flex h-[40px] items-center border border-white/15 bg-[#071018]/90 px-3 shadow-2xl backdrop-blur-xl">
        <Search size={14} className="text-[#75d8ff]"/>
        <input
          value={q}
          onChange={(e)=>{setQ(e.target.value);setRemote([]);setError('');setOpen(e.target.value.trim().length>=2)}}
          onFocus={()=>q.trim().length>=2&&setOpen(true)}
          placeholder="SEARCH BENGALURU // PRESS ENTER"
          className="ml-3 min-w-0 flex-1 bg-transparent font-mono text-[9px] uppercase tracking-[0.12em] text-white outline-none placeholder:text-white/30"
        />
        {busy ? <span className="font-mono text-[7px] tracking-[0.14em] text-cyan-100/50">LOCATING</span> : (
          <button type="submit" className="border border-cyan-200/20 px-2 py-1 font-mono text-[7px] uppercase tracking-[0.12em] text-cyan-100/80 hover:bg-cyan-100/10">GO</button>
        )}
        {!!q && <button type="button" onClick={()=>{setQ('');setRemote([]);setError('');setOpen(false)}} className="ml-2 text-white/40 hover:text-white"><X size={13}/></button>}
      </div>
      {open && (
        <div className="mt-1 max-h-[290px] overflow-auto border border-white/15 bg-[#071018]/95 shadow-2xl backdrop-blur-xl">
          {error && <div className="border-b border-white/8 px-3 py-2 font-mono text-[7px] uppercase tracking-[0.1em] text-amber-200/70">{error}</div>}
          {rows.length ? rows.map((r)=><button type="button" key={r.id} onClick={()=>choose(r)} className="block w-full border-b border-white/8 px-3 py-3 text-left hover:bg-white/[0.06]">
            <div className="flex items-center justify-between gap-3"><span className="text-[10px] text-white/90">{r.displayName.split(',')[0]}</span><span className="font-mono text-[7px] uppercase tracking-[0.1em] text-cyan-100/45">{r.id.startsWith('local-')?'LOCAL':'OSM'}</span></div>
            <div className="mt-1 line-clamp-1 font-mono text-[7px] uppercase tracking-[0.1em] text-white/35">{r.displayName}</div>
          </button>) : (
            <div className="px-3 py-3 font-mono text-[8px] uppercase tracking-[0.12em] text-white/35">PRESS ENTER TO SEARCH THE LIVE MAP</div>
          )}
        </div>
      )}
    </form>
  );
}
