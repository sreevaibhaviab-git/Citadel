import { assetById } from '../config';
import type { CitySim } from '../sim';
import { etaString } from '../sim';
import type { Snapshot } from '../types';
import { Bar, Btn, Panel, Row } from './ui';

export default function CityPulse({ sim, snap }: { sim: CitySim; snap: Snapshot }) {
  const m = snap.metrics;
  const selectedAsset = snap.selectedId ? assetById(snap.selectedId) : undefined;
  const selectedUnit = snap.vehicles.find((v) => v.id === snap.selectedId);
  const hospitals = snap.assets.filter((a) => a.kind === 'HOSPITAL');
  const power = snap.assets.filter((a) => a.kind === 'POWER');
  const responding = snap.vehicles.filter((v) => v.status !== 'STANDBY');

  return (
    <div className="flex w-[244px] flex-col gap-2">
      <Panel title="Scenario Telemetry // Simulated">
        <Row label="Scenario population" value={m.populationActive.toLocaleString()} />
        <Row label="Sim vehicles" value={m.vehiclesActive} />
        <Row
          label="EMS units available"
          value={`${m.emsAvailable}/${m.emsTotal}`}
          tone={m.emsAvailable === 0 ? 'alert' : m.emsAvailable < 2 ? 'warn' : 'default'}
        />
        <Row label="Power load" value={`${Math.round(m.powerLoad)}%`} tone={m.powerLoad > 88 ? 'warn' : 'default'} />
        <Bar value={m.powerLoad} tone={m.powerLoad > 88 ? 'warn' : 'default'} />
        <Row label="Water demand" value={`${Math.round(m.waterDemand)}%`} />
        <Bar value={m.waterDemand} />
        <Row
          label="Hospital capacity"
          value={`${Math.round(m.hospitalCapacity)}%`}
          tone={m.hospitalCapacity > 90 ? 'alert' : m.hospitalCapacity > 82 ? 'warn' : 'default'}
        />
        <Bar value={m.hospitalCapacity} tone={m.hospitalCapacity > 90 ? 'alert' : 'default'} />
        <Row label="Mobility index" value={Math.round(m.mobility)} tone={m.mobility < 70 ? 'warn' : 'ok'} />
        <Row label="Traffic" value={snap.traffic} tone={snap.traffic === 'GRIDLOCK' ? 'alert' : 'default'} />
      </Panel>

      <Panel title="Scenario Grid + Utilities">
        {power.map((p) => (
          <Row
            key={p.id}
            label={`${p.id} load`}
            value={`${Math.round(p.primary)}%`}
            tone={p.status === 'CRITICAL' ? 'alert' : p.status === 'WARNING' ? 'warn' : 'default'}
          />
        ))}
        <div className="my-1.5 h-px bg-white/10" />
        <Row label="W1 output" value={`${Math.round(m.waterOutput)}%`} />
        <Row label="W1 demand" value={`${Math.round(m.waterDemand)}%`} />
        <Row label="W1 reserve" value={`${Math.round(m.waterReserve)}%`} tone={m.waterReserve < 45 ? 'warn' : 'default'} />
        <div className="my-1.5 h-px bg-white/10" />
        {hospitals.map((h) => (
          <Row
            key={h.id}
            label={`${h.id} capacity`}
            value={`${Math.round(h.primary)}%`}
            tone={h.status === 'CRITICAL' ? 'alert' : h.status === 'WARNING' ? 'warn' : 'default'}
          />
        ))}
      </Panel>

      <Panel title="Active Units">
        {responding.length === 0 && (
          <span className="font-mono text-[10px] tracking-[0.12em] text-white/30">ALL UNITS IN STATION</span>
        )}
        {responding.map((u) => (
          <div key={u.id} className="border-b border-white/5 py-1 last:border-0">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[10.5px] tracking-[0.12em] text-white">{u.id}</span>
              <span
                className={`font-mono text-[9px] uppercase tracking-[0.16em] ${
                  u.status === 'RESPONDING' ? 'text-[#e06a5c]' : 'text-white/50'
                }`}
              >
                {u.status}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">eta</span>
              <span className="font-mono text-[10px] tabular-nums text-white/70">{etaString(u.etaSeconds)}</span>
            </div>
            <div className="mt-1 flex gap-1">
              <Btn
                active={snap.followId === u.id}
                onClick={() => sim.follow(snap.followId === u.id ? null : u.id)}
              >
                {snap.followId === u.id ? 'release camera' : 'follow unit'}
              </Btn>
            </div>
          </div>
        ))}
      </Panel>

      {(selectedAsset || selectedUnit) && (
        <Panel
          title="Inspector"
          right={
            <button
              type="button"
              onClick={() => sim.select(null)}
              className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/35 hover:text-white/70"
            >
              close
            </button>
          }
        >
          {selectedAsset && (
            <>
              <Row label="Asset" value={selectedAsset.id} />
              <Row label="Name" value={<span className="text-[9.5px]">{selectedAsset.name}</span>} />
              <Row label="Class" value={selectedAsset.kind} />
              <Row
                label={selectedAsset.kind === 'WATER' ? 'Output' : 'Load'}
                value={`${Math.round(selectedAsset.primary)}%`}
                tone={selectedAsset.status === 'CRITICAL' ? 'alert' : selectedAsset.status === 'WARNING' ? 'warn' : 'default'}
              />
              <Bar value={selectedAsset.primary} />
              <Row
                label="Status"
                value={selectedAsset.status}
                tone={selectedAsset.status === 'NOMINAL' ? 'ok' : selectedAsset.status === 'WARNING' ? 'warn' : 'default'}
              />
            </>
          )}
          {selectedUnit && (
            <>
              <Row label="Unit" value={selectedUnit.id} />
              <Row label="Class" value={selectedUnit.kind} />
              <Row label="Status" value={selectedUnit.status} />
              <Row label="ETA" value={etaString(selectedUnit.etaSeconds)} />
              <div className="mt-1.5">
                <Btn
                  wide
                  active={snap.followId === selectedUnit.id}
                  onClick={() => sim.follow(snap.followId === selectedUnit.id ? null : selectedUnit.id)}
                >
                  {snap.followId === selectedUnit.id ? 'release camera' : 'follow unit'}
                </Btn>
              </div>
            </>
          )}
        </Panel>
      )}
    </div>
  );
}
