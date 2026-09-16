import { useState } from 'react';
import type { CitySim } from '../sim';
import { Btn, Panel } from './ui';

export default function DemoPanel({ sim }: { sim: CitySim }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cmd pointer-events-auto"
        title="Demo controls (D)"
      >
        demo control
      </button>
    );
  }

  return (
    <Panel
      title="Demo control"
      right={
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/35 hover:text-white/70"
        >
          hide
        </button>
      }
      className="w-[228px]"
    >
      <div className="grid grid-cols-2 gap-1">
        <Btn onClick={() => sim.setWeather('RAIN')}>rain</Btn>
        <Btn onClick={() => sim.setWeather('STORM')}>storm</Btn>
        <Btn onClick={() => sim.setPreset('NIGHT')}>night</Btn>
        <Btn onClick={() => sim.setPreset('DAY')}>day</Btn>
        <Btn onClick={() => sim.triggerJam()}>traffic jam</Btn>
        <Btn onClick={() => sim.triggerMinorEvent()}>minor event</Btn>
      </div>
      <div className="mt-1 flex flex-col gap-1">
        <Btn wide tone="alert" onClick={() => sim.triggerAccident()}>
          road accident + ems
        </Btn>
        <Btn wide tone="alert" onClick={() => sim.triggerFire()}>
          fire response
        </Btn>
      </div>
      <p className="mt-2 font-mono text-[8.5px] leading-relaxed tracking-[0.12em] text-white/25">
        HOTKEYS // A ACCIDENT · F FIRE · R RAIN · S STORM · C CLEAR · N NIGHT
      </p>
    </Panel>
  );
}
