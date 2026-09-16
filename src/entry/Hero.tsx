import { useRef, useState } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { Menu, X } from 'lucide-react';

const NAV_LINKS = ['System', 'Capabilities', 'Simulations', 'About'];

const STATUS_STRIP = [
  'GEOSPATIAL MODEL // ONLINE',
  'DEPENDENCY ENGINE // READY',
  'SIMULATION CORE // READY',
];

function StaggeredFade({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  const variants = {
    hidden: { opacity: 0, y: 8 },
    show: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.07, duration: 0.6, ease: 'easeOut' as const },
    }),
  };

  return (
    <span ref={ref} className="inline-block">
      {text.split('').map((char, i) => (
        <motion.span
          key={`${char}-${i}`}
          custom={i}
          variants={variants}
          initial="hidden"
          animate={inView ? 'show' : 'hidden'}
          className="inline-block"
        >
          {char === ' ' ? '\u00A0' : char}
        </motion.span>
      ))}
    </span>
  );
}

export default function Hero({ onEnter }: { onEnter: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative z-10 flex h-full flex-col">
      {/* NAVIGATION */}
      <nav className="relative z-20 flex items-center justify-between px-5 pt-6 sm:px-8 sm:pt-7 md:justify-center md:gap-14 md:px-12">
        <span className="text-[0.8rem] font-light uppercase tracking-[0.25em] text-white sm:text-sm md:absolute md:left-12 md:tracking-[0.3em]">
          CITADEL
        </span>

        <div className="hidden items-center gap-10 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link}
              href="#"
              className="text-[0.7rem] font-light uppercase tracking-[0.2em] text-white/80 transition-colors duration-300 hover:text-white"
            >
              {link}
            </a>
          ))}
        </div>

        <span className="hidden text-[0.6rem] font-light uppercase tracking-[0.25em] text-white/35 md:absolute md:right-12 md:block">
          v1.0 / OPS
        </span>

        <button
          type="button"
          aria-label="Toggle menu"
          onClick={() => setMenuOpen((v) => !v)}
          className="text-white md:hidden"
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {/* MOBILE MENU */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="mobile-menu-glass fixed left-4 right-4 top-16 z-50 flex flex-col items-center gap-5 py-8 md:hidden"
          >
            {NAV_LINKS.map((link, i) => (
              <motion.a
                key={link}
                href="#"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 + i * 0.06, duration: 0.3, ease: 'easeOut' }}
                onClick={() => setMenuOpen(false)}
                className="text-[0.75rem] font-light uppercase tracking-[0.25em] text-white/90 transition-colors hover:text-white"
              >
                {link}
              </motion.a>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* HERO CONTENT */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 pb-24 pt-12 text-center sm:px-8 sm:pt-16 md:pt-20">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mb-7 flex items-center gap-3"
        >
          <span className="h-px w-8 bg-white/30" />
          <span className="font-mono text-[0.58rem] uppercase tracking-[0.3em] text-white/45">
            City Resilience Digital Twin
          </span>
          <span className="h-px w-8 bg-white/30" />
        </motion.div>

        <h1 className="font-garamond mb-6 text-4xl font-normal leading-[1.08] tracking-tight text-white sm:mb-8 sm:text-6xl md:text-7xl lg:text-8xl">
          <span className="block">
            <StaggeredFade text="SEE THE FAILURE" />
          </span>
          <span className="block">
            <StaggeredFade text="BEFORE IT SPREADS" />
          </span>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.6 }}
          className="mb-8 max-w-xs text-sm font-light leading-relaxed text-white/70 sm:mb-10 sm:max-w-md sm:text-base lg:text-lg"
        >
          Model the city. Trigger the disruption.
          <br className="hidden sm:block" />{' '}
          Understand what fails next — and stop the cascade.
        </motion.p>

        <motion.button
          type="button"
          onClick={onEnter}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 2.0 }}
          className="liquid-glass px-9 py-3.5 text-[0.68rem] font-light uppercase tracking-[0.2em] text-white/90 hover:text-white sm:px-12 sm:py-4 sm:text-[0.72rem]"
        >
          Enter City
        </motion.button>
      </div>

      {/* SYSTEM STATUS STRIP */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 2.4 }}
        className="relative z-10 px-5 pb-6 sm:px-8 md:px-12"
      >
        <div className="hairline mb-4 h-px w-full" />
        <div className="flex flex-col items-center gap-2 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-white/30 sm:flex-row sm:justify-between sm:gap-0">
          {STATUS_STRIP.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
