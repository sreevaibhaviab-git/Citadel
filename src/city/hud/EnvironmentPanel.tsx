import { cameraPresets, LAYER_KEYS } from '../config';
import type { CitySim } from '../sim';
import { TRAFFIC_MODES, WEATHER_MODES } from '../sim';
import type { Snapshot } from '../types';
import { Btn, Panel, Row } from './ui';

export default function EnvironmentPanel({
  sim,
  snap,
  onPreset,
}: {
  sim: CitySim;
  snap: Snapshot;
  onPreset: (id: string) => void;
}) {
  return (
    <div className="flex w-[228px] flex-col gap-2">
      <Panel
        title="Environment"
        right={
          <button
            type="button"
            onClick={() => sim.toggleAutoTime()}
            className={`font-mono text-[9px] uppercase tracking-[0.18em] ${
              snap.autoTime ? 'text-[#4ec9b0]' : 'text-white/35 hover:text-white/70'
            }`}
          >
            auto time
          </button>
        }
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-white/40">time</span>
          <div className="flex items-center gap-1.5">
            <Btn onClick={() => sim.nudgeTime(-30)}>−</Btn>
            <span className="min-w-[44px] text-center font-mono text-[12px] tabular-nums text-white">
              {snap.clock}
            </span>
            <Btn onClick={() => sim.nudgeTime(30)}>+</Btn>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-4 gap-1">
          {[
            ['06:00', 6],
            ['12:00', 12],
            ['18:00', 18],
            ['00:00', 0],
          ].map(([label, h]) => (
            <Btn key={label as string} onClick={() => sim.setTime((h as number) * 3600)}>
              {label as string}
            </Btn>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-3 gap-1">
          {(['DAY', 'SUNSET', 'NIGHT'] as const).map((p) => (
            <Btn key={p} onClick={() => sim.setPreset(p)}>
              {p}
            </Btn>
          ))}
        </div>

        <div className="mt-3 border-t border-white/10 pt-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-white/40">weather</span>
            <div className="flex items-center gap-1.5">
              <Btn onClick={() => sim.cycleWeather(-1)}>◀</Btn>
              <span className="min-w-[78px] text-center font-mono text-[10px] tracking-[0.1em] text-white">
                {snap.weather}
              </span>
              <Btn onClick={() => sim.cycleWeather(1)}>▶</Btn>
            </div>
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-1">
            {WEATHER_MODES.map((w) => (
              <Btn key={w} active={snap.weather === w} onClick={() => sim.setWeather(w)}>
                {w === 'HEAVY RAIN' ? 'HVY RAIN' : w}
              </Btn>
            ))}
          </div>
        </div>

        <div className="mt-3 border-t border-white/10 pt-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-white/40">traffic</span>
            <div className="flex items-center gap-1.5">
              <Btn onClick={() => sim.cycleTraffic(-1)}>◀</Btn>
              <span className="min-w-[78px] text-center font-mono text-[10px] tracking-[0.1em] text-white">
                {snap.traffic}
              </span>
              <Btn onClick={() => sim.cycleTraffic(1)}>▶</Btn>
            </div>
          </div>
          <div className="mt-1.5 grid grid-cols-4 gap-1">
            {TRAFFIC_MODES.map((t) => (
              <Btn key={t} active={snap.traffic === t} onClick={() => sim.setTraffic(t)}>
                {t === 'GRIDLOCK' ? 'LOCK' : t}
              </Btn>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="Layers">
        <div className="grid grid-cols-2 gap-1">
          {LAYER_KEYS.map((k) => (
            <Btn key={k} active={snap.layers[k]} onClick={() => sim.toggleLayer(k)}>
              {k === 'DEPENDENCIES' ? 'DEPEND' : k === 'POPULATION' ? 'PEOPLE' : k}
            </Btn>
          ))}
        </div>
      </Panel>

      <Panel title="Camera">
        <div className="flex flex-col gap-1">
          {cameraPresets.map((p) => (
            <Btn key={p.id} wide onClick={() => onPreset(p.id)}>
              {p.label}
            </Btn>
          ))}
        </div>
      </Panel>

      <Panel title="Air Quality">
        <Row
          label="AQI"
          value={Math.round(snap.metrics.aqi)}
          tone={snap.metrics.aqi > 120 ? 'alert' : snap.metrics.aqi > 80 ? 'warn' : 'ok'}
        />
        <Row
          label="Status"
          value={snap.metrics.aqi > 120 ? 'POOR' : snap.metrics.aqi > 80 ? 'MODERATE' : 'FAIR'}
          tone={snap.metrics.aqi > 120 ? 'alert' : snap.metrics.aqi > 80 ? 'warn' : 'ok'}
        />
      </Panel>
    </div>
  );
}
