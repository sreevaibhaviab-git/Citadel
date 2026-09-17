import type { HazardTimelineStage, Snapshot } from '../types';

function stateClass(state: HazardTimelineStage['state']) {
  if (state === 'ACTIVE') return 'border-[#71d8ff]/80 bg-[#0c2531]/92 text-white shadow-[0_0_24px_rgba(75,190,235,.16)]';
  if (state === 'COMPLETE') return 'border-[#5fcf9a]/35 bg-[#091713]/88 text-white/74';
  return 'border-white/10 bg-[#070b10]/82 text-white/32';
}

function fireTimeline(snap: Snapshot): { title: string; minute: number; stages: HazardTimelineStage[]; detail: string } | null {
  const fire = snap.incidents.find((i) => i.active && i.kind === 'FIRE');
  if (!fire) return null;
  const minute = fire.elapsedSeconds ?? 0;
  const source = [
    { minute: 0, label: 'IGNITION', detail: 'initial structure fire footprint' },
    { minute: 5, label: 'FIRE GROWTH', detail: 'spread rate responds to appliance ETA' },
    { minute: 15, label: 'RESPONSE WINDOW', detail: 'road traffic determines arrival delay' },
    { minute: 30, label: 'CONTAIN / ESCALATE', detail: 'suppression slows or reverses spread' },
  ];
  const stages: HazardTimelineStage[] = source.map((stage, index) => {
    const next = source[index + 1]?.minute ?? Number.POSITIVE_INFINITY;
    return {
      ...stage,
      state: minute < stage.minute ? 'PENDING' : minute >= next ? 'COMPLETE' : 'ACTIVE',
    };
  });
  const eta = Math.max(0, Math.round((fire.responseEtaSeconds ?? 0) / 60));
  const radius = Math.round(fire.fireRadius ?? 35);
  const containment = Math.round((fire.containment ?? 0) * 100);
  return {
    title: 'DYNAMIC FIRE MODEL',
    minute,
    stages,
    detail: `SPREAD ${radius}M // FIRE ETA ${eta}M // CONTAINMENT ${containment}%`,
  };
}

export default function HazardTimeline({ snap }: { snap: Snapshot }) {
  const fire = !snap.disaster ? fireTimeline(snap) : null;
  const disaster = snap.disaster;
  if (!disaster && !fire) return null;

  const title = disaster?.scenarioLabel ?? fire!.title;
  const minute = disaster?.modelMinute ?? fire!.minute;
  const stages = disaster?.timeline ?? fire!.stages;
  const detail = disaster
    ? `${disaster.phase} // ${disaster.affectedEdges.length} ROAD LINKS // ${disaster.affectedAssets.length} ASSETS // MODEL TIME ACCELERATED`
    : fire!.detail;

  return (
    <div className="pointer-events-none absolute bottom-[72px] left-1/2 z-[24] w-[min(760px,calc(100vw-420px))] -translate-x-1/2">
      <div className="border border-white/12 bg-[#050a0f]/92 px-3 py-2 shadow-2xl backdrop-blur-md">
        <div className="mb-2 flex items-center justify-between gap-4 font-mono uppercase">
          <div className="min-w-0">
            <div className="truncate text-[9px] tracking-[0.18em] text-white/72">HAZARD EVOLUTION // {title}</div>
            <div className="mt-0.5 truncate text-[8px] tracking-[0.13em] text-white/34">{detail}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[8px] tracking-[0.16em] text-white/35">MODEL MINUTE</div>
            <div className="text-[16px] font-semibold tracking-[0.08em] text-[#8bdfff]">T+{String(Math.floor(minute)).padStart(2, '0')}</div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {stages.map((stage, index) => (
            <div key={`${stage.minute}-${stage.label}`} className={`relative border px-2 py-1.5 ${stateClass(stage.state)}`}>
              {index < stages.length - 1 && (
                <div className={`absolute left-full top-[13px] h-px w-1.5 ${stage.state === 'COMPLETE' ? 'bg-[#5fcf9a]/55' : 'bg-white/12'}`} />
              )}
              <div className="font-mono text-[8px] tracking-[0.16em] opacity-55">T+{String(stage.minute).padStart(2, '0')}</div>
              <div className="mt-0.5 truncate text-[9px] font-medium uppercase tracking-[0.08em]">{stage.label}</div>
              <div className="mt-0.5 line-clamp-1 font-mono text-[7px] uppercase tracking-[0.06em] opacity-50">{stage.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
