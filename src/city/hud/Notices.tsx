import { AnimatePresence, motion } from 'framer-motion';
import type { Snapshot } from '../types';

export default function Notices({ snap }: { snap: Snapshot }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-[63px] z-20 flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence>
        {snap.notices.map((n) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28 }}
            className="border border-[#e06a5c]/40 bg-[#0d0807]/92 px-5 py-2 text-center shadow-[0_12px_30px_rgba(0,0,0,.28)]"
          >
            <div className="font-mono text-[8px] uppercase tracking-[0.24em] text-[#e06a5c]">{n.title}</div>
            {n.lines.map((l) => (
              <div key={l} className="font-mono text-[9.5px] tracking-[0.11em] text-white/80">{l}</div>
            ))}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
