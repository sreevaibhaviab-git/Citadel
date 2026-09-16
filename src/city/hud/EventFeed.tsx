import type { Snapshot } from '../types';

const TONE: Record<string, string> = {
  INFO: 'text-white/55',
  ALERT: 'text-[#e06a5c]',
  UNIT: 'text-[#8fc6e0]',
  OK: 'text-[#4ec9b0]',
};

export default function EventFeed({ snap }: { snap: Snapshot }) {
  const incidents = snap.incidents;
  return (
    <div className="pointer-events-auto panel w-[430px]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-[7px]">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-white/55">City events //</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/35">
          {incidents.length} ACTIVE
        </span>
      </div>

      {incidents.length > 0 && (
        <div className="border-b border-white/10 px-3 py-2">
          {incidents.slice(0, 2).map((inc) => (
            <div key={inc.id} className="flex items-baseline justify-between gap-3 py-[2px]">
              <span className="font-mono text-[10px] tracking-[0.1em] text-[#ffb9ae]">
                {inc.edgeId} {inc.kind}
              </span>
              <span className="font-mono text-[9.5px] tabular-nums tracking-[0.1em] text-white/50">
                CAP {inc.capacityBefore}% → {inc.capacityAfter}% / CLEAR{' '}
                {Math.round(inc.clearanceSeconds / 60)} MIN
                {inc.assignedUnit ? ` / ${inc.assignedUnit}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="h-[158px] overflow-y-auto px-3 py-2 feed-scroll">
        {snap.feed.map((line) => (
          <div key={line.id} className="flex gap-3 py-[1.5px]">
            <span className="font-mono text-[9.5px] tabular-nums text-white/30">{line.stamp}</span>
            <span className={`font-mono text-[9.5px] tracking-[0.08em] ${TONE[line.tone]}`}>{line.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
