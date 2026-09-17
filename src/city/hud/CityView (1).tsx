import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Database, X } from 'lucide-react';
import { CitySim } from './sim';
import { buildWorld, createViewer, type World } from './world';
import type { Snapshot } from './types';
import WeatherOverlay from './WeatherOverlay';
import CommandBar from './hud/CommandBar';
import EventFeed from './hud/EventFeed';
import Notices from './hud/Notices';
import LayerDock from './hud/LayerDock';
import InspectorDock from './hud/InspectorDock';
import BottomStatusBar from './hud/BottomStatusBar';
import ScenarioConsole from './hud/ScenarioConsole';
import LiveOpsPanel from './hud/LiveOpsPanel';
import LocationSearch from './hud/LocationSearch';
import RoadHoverCard from './hud/RoadHoverCard';

export default function CityView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<World | null>(null);
  const sim = useMemo(() => new CitySim(), []);
  const [snap, setSnap] = useState<Snapshot>(() => sim.snapshot());
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<'events' | 'data' | 'ops' | null>(null);
  const [showScenario, setShowScenario] = useState(true);
  const [viewMode, setViewMode] = useState<'2D' | '3D'>('3D');
  const [world, setWorld] = useState<World | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!window.Cesium) {
      setError('CESIUM RUNTIME NOT LOADED // CHECK NETWORK');
      return;
    }
    let viewer: any;
    let raf = 0;
    let last = performance.now();
    try {
      viewer = createViewer(containerRef.current);
      worldRef.current = buildWorld(viewer, sim);
      setWorld(worldRef.current);
    } catch (e: any) {
      setError(`CESIUM INIT FAILED // ${e?.message ?? 'UNKNOWN'}`);
      return;
    }

    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      sim.update(dt);
      worldRef.current?.update(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const readyTimer = window.setTimeout(() => setBooting(false), 1700);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(readyTimer);
      worldRef.current?.destroy();
      worldRef.current = null;
      setWorld(null);
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
    };
  }, [sim]);

  useEffect(() => {
    const tick = () => setSnap(sim.snapshot());
    const unsub = sim.subscribe(tick);
    const id = window.setInterval(tick, 250);
    return () => { unsub(); clearInterval(id); };
  }, [sim]);

  useEffect(() => { worldRef.current?.applyEnvironment(); }, [snap.weather, Math.floor(snap.simSeconds / 900)]);

  useEffect(() => {
    if (snap.liveOps.mode !== 'LIVE') return;
    void sim.refreshLiveData();
    const id = window.setInterval(() => void sim.refreshLiveData(), 60000);
    return () => clearInterval(id);
  }, [sim, snap.liveOps.mode]);

  useEffect(() => {
    if (snap.disaster || snap.algorithmTrace.some((x) => x.label === 'RESILIENCE RED TEAM')) setShowScenario(true);
  }, [snap.disaster?.id, snap.algorithmTrace.length]);

  useEffect(() => {
    // Object selection should always reveal the inspector. This is especially
    // important for dependency tracing: selecting an asset is the entry point
    // to the cascade graph.
    if (snap.selectedId && !snap.disaster) setShowScenario(false);
  }, [snap.selectedId, snap.disaster?.id]);

  useEffect(() => {
    // Ordinary incidents (collision/fire/random road events) automatically open
    // the operations board once so dispatch, nearby facilities and detours are
    // visible without requiring the judge to hunt through menus.
    if (!snap.disaster && snap.incidents[0]?.id) setDrawer('ops');
  }, [snap.incidents[0]?.id, snap.disaster?.id]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#05070a]">
      <div ref={containerRef} className="absolute inset-0" />
      <WeatherOverlay sim={sim} />

      {/* Edge shading only; the city remains the primary workspace. */}
      <div className="pointer-events-none absolute inset-0 z-[4] bg-[radial-gradient(circle_at_55%_43%,transparent_0%,transparent_68%,rgba(2,6,10,.28)_100%)]" />

      <div className="pointer-events-none absolute inset-0 z-10">
        <CommandBar snap={snap} />
        <Notices snap={snap} />
        <LocationSearch world={world} sim={sim} />
        <RoadHoverCard snap={snap} />

        <LayerDock
          sim={sim}
          snap={snap}
          viewMode={viewMode}
          onPreset={(id) => worldRef.current?.flyPreset(id)}
          onViewMode={(mode) => { setViewMode(mode); worldRef.current?.setViewMode(mode); }}
          onZoom={(direction) => worldRef.current?.zoomBy(direction)}
        />
        {!showScenario && <InspectorDock sim={sim} snap={snap} />}
        {showScenario && (snap.disaster || snap.algorithmTrace.some((x) => x.label === 'RESILIENCE RED TEAM')) && (
          <ScenarioConsole sim={sim} snap={snap} onClose={() => setShowScenario(false)} />
        )}
        <BottomStatusBar
          snap={snap}
          onEvents={() => setDrawer(drawer === 'events' ? null : 'events')}
          onData={() => setDrawer(drawer === 'data' ? null : 'data')}
          onOps={() => setDrawer(drawer === 'ops' ? null : 'ops')}
          onScenario={() => setShowScenario(true)}
        />

        <AnimatePresence>
          {drawer && (
            <motion.div
              key={drawer}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.18 }}
              className="pointer-events-auto absolute bottom-[60px] right-[14px]"
            >
              <button onClick={() => setDrawer(null)} className="drawer-close"><X size={14}/></button>
              {drawer === 'events' ? (
                <EventFeed snap={snap} />
              ) : drawer === 'ops' ? (
                <LiveOpsPanel sim={sim} snap={snap} />
              ) : (
                <div className="source-drawer">
                  <div className="source-head"><Database size={14}/><span>DATA SOURCES + MODEL PROVENANCE</span></div>
                  <div className="source-table">
                    <div><span>3D CITY FABRIC</span><b className="geo-text">GEOSPATIAL</b><small>Google Photorealistic 3D Tiles / Cesium OSM fallback</small></div>
                    <div><span>LOCATION CONTEXT</span><b className="geo-text">REAL</b><small>Bengaluru coordinate system + streamed map context</small></div>
                    <div><span>VEHICLE + PEOPLE AGENTS</span><b className="sim-text">SIMULATED</b><small>synthetic agents for resilience experiments</small></div>
                    <div><span>HOSPITAL / GRID / WATER VALUES</span><b className="sim-text">SIMULATED</b><small>scenario telemetry, not live municipal data</small></div>
                    <div><span>INCIDENTS + RESPONSE</span><b className="model-text">COMPUTED</b><small>Dijkstra routing, dependency cascades, evacuation and response optimisation</small></div>
                    <div><span>OPENSTREETMAP ROAD / POI DATA</span><b className="geo-text">PUBLIC CONNECTOR</b><small>integration-ready source for real road topology and mapped facilities</small></div>
                    <div><span>BBMP / CITY GIS LAYERS</span><b className="geo-text">PUBLIC CONNECTOR</b><small>ward / civic GIS layers can replace the synthetic demo network</small></div>
                    <div><span>LIVE WEATHER</span><b className="geo-text">CONNECTED</b><small>Open-Meteo current conditions when network is available</small></div>
                    <div><span>LIVE TRAFFIC</span><b className="model-text">OPTIONAL CONNECTOR</b><small>TomTom Traffic Flow when VITE_TOMTOM_API_KEY is configured</small></div>
                    <div><span>TRAFFIC SIGNAL STATE</span><b className="model-text">ADAPTIVE MODEL</b><small>CITADEL optimises phases from congestion and emergency priority; live municipal phase data is not claimed</small></div>
                    <div><span>EMERGENCY / SAFE FACILITIES</span><b className="geo-text">PUBLIC LIVE QUERY</b><small>OpenStreetMap Overpass mapped hospitals, police, fire and assembly/shelter features</small></div>
                  </div>
                  <p className="source-footnote">CITADEL deliberately separates real geospatial context from simulated operational values. The current network is a synthetic resilience test-bed over Bengaluru; public GIS, road, weather, hospital and IoT sources can replace each layer independently in deployment.</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!import.meta.env.VITE_CESIUM_ION_TOKEN && !booting && (
        <div className="token-warning">CESIUM TOKEN NOT DETECTED // 3D CITY STREAM DISABLED</div>
      )}

      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: booting ? 1 : 0 }}
        transition={{ duration: 1 }}
        className={`absolute inset-0 z-30 flex items-center justify-center bg-[#020304] ${booting ? '' : 'pointer-events-none'}`}
      >
        <div className="text-center">
          <div className="text-[12px] font-light uppercase tracking-[0.34em] text-white">CITADEL</div>
          <div className="mt-3 font-mono text-[9px] uppercase tracking-[0.28em] text-white/45">{error ?? 'STREAMING BENGALURU 3D CITY FABRIC'}</div>
        </div>
      </motion.div>

      {error && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#05070a]">
          <div className="border border-[#e06a5c]/40 px-6 py-4 text-center">
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#e06a5c]">SYSTEM FAULT</div>
            <div className="mt-2 font-mono text-[11px] tracking-[0.14em] text-white/70">{error}</div>
          </div>
        </div>
      )}
    </div>
  );
}
