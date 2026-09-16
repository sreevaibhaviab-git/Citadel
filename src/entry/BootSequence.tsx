import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const LINES = [
  'GEOSPATIAL LAYER ........ READY',
  'INFRASTRUCTURE GRAPH .... READY',
  'SIMULATION CORE ......... READY',
  'CITY MODEL .............. ONLINE',
];

const LINE_DELAY = 430;
const FIRST_LINE_AT = 900;
const HOLD_AFTER = 900;

export default function BootSequence({ onComplete }: { onComplete: () => void }) {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    const timers: number[] = [];

    LINES.forEach((_, i) => {
      timers.push(
        window.setTimeout(() => setVisible(i + 1), FIRST_LINE_AT + i * LINE_DELAY)
      );
    });

    timers.push(
      window.setTimeout(
        onComplete,
        FIRST_LINE_AT + LINES.length * LINE_DELAY + HOLD_AFTER
      )
    );

    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  const progress = visible / LINES.length;

  return (
    <div className="relative z-10 flex h-full flex-col items-center justify-center px-6">
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="mb-10 font-mono text-[0.65rem] uppercase tracking-[0.34em] text-white/75 sm:text-[0.72rem]"
      >
        Initializing City Model
      </motion.span>

      <div className="w-full max-w-[22rem] sm:max-w-[26rem]">
        <div className="mb-8 h-px w-full bg-white/10">
          <motion.div
            className="h-px bg-white/55"
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>

        <div className="flex flex-col gap-2.5">
          {LINES.map((line, i) => (
            <motion.span
              key={line}
              initial={{ opacity: 0 }}
              animate={{ opacity: i < visible ? 1 : 0 }}
              transition={{ duration: 0.28 }}
              className="whitespace-pre font-mono text-[0.58rem] uppercase tracking-[0.16em] text-white/55 sm:text-[0.65rem]"
            >
              {line}
            </motion.span>
          ))}
        </div>
      </div>
    </div>
  );
}
