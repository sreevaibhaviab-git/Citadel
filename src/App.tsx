import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Hero from './entry/Hero';
import BootSequence from './entry/BootSequence';
import CityView from './city/CityView';

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260619_191346_9d19d66e-86a4-47f7-8dc6-712c1788c3b2.mp4';

type Phase = 'hero' | 'boot' | 'city';

export default function App({ onEnterCity }: { onEnterCity?: () => void }) {
  // Always begin with the cinematic CITADEL entry screen on a fresh load.
  // This prevents a previously visited /city URL from bypassing the welcome page.
  const [phase, setPhase] = useState<Phase>('hero');

  useEffect(() => {
    // Normalize the demo entry route without reloading.
    if (window.location.pathname !== '/') window.history.replaceState({}, '', '/');
  }, []);

  const handleComplete = useCallback(() => {
    if (onEnterCity) {
      onEnterCity();
      return;
    }
    window.history.pushState({}, '', '/city');
    setPhase('city');
  }, [onEnterCity]);

  if (phase === 'city') return <CityView />;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#010101]">
      <video
        className="absolute inset-0 h-full w-full object-cover object-center"
        src={VIDEO_SRC}
        autoPlay
        muted
        loop
        playsInline
      />

      <motion.div
        className="absolute inset-0 bg-[#010101]"
        animate={{ opacity: phase === 'boot' ? 0.72 : 0.42 }}
        transition={{ duration: 0.9, ease: 'easeInOut' }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/70" />

      <AnimatePresence mode="wait">
        {phase === 'hero' ? (
          <motion.div
            key="hero"
            className="absolute inset-0"
            exit={{ opacity: 0, filter: 'blur(2px)' }}
            transition={{ duration: 0.55, ease: 'easeInOut' }}
          >
            <Hero onEnter={() => setPhase('boot')} />
          </motion.div>
        ) : (
          <motion.div
            key="boot"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.35 }}
          >
            <BootSequence onComplete={handleComplete} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
