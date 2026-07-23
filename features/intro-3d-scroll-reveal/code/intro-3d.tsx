'use client';

import { useRef } from 'react';
import Image from 'next/image';
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  type MotionValue,
} from 'framer-motion';

const TITLE = 'RENDEZVOUS';
const LETTERS = TITLE.split('');

export function Intro3D() {
  const ref = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });

  const progress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    mass: 0.4,
  });

  const stageOpacity = useTransform(progress, [0.85, 1], [1, 0]);
  const stageZ = useTransform(progress, [0, 0.6, 1], [0, 0, 600]);
  const stageScale = useTransform(progress, [0, 0.6, 1], [1, 1, 1.4]);
  const eyebrowOpacity = useTransform(progress, [0, 0.08, 0.55, 0.7], [0, 1, 1, 0]);
  const eyebrowY = useTransform(progress, [0, 0.08], [16, 0]);
  const logoOpacity = useTransform(progress, [0.55, 0.7, 0.85, 0.95], [0, 1, 1, 0]);
  const logoY = useTransform(progress, [0.55, 0.7], [24, 0]);
  const vignetteOpacity = useTransform(progress, [0, 0.4, 0.9], [0.7, 0.55, 1]);

  // Letterbox bars: full-screen black bars that retract as letters resolve
  const barHeight = useTransform(progress, [0, 0.55, 0.7], ['18vh', '18vh', '0vh']);
  // Parallax background haze layer (moves slower than scroll)
  const hazeY = useTransform(progress, [0, 1], ['0%', '-30%']);
  // Halation tint behind title peaks when letters land
  const haloOpacity = useTransform(progress, [0.3, 0.6, 0.85], [0, 0.6, 0]);

  return (
    <section
      ref={ref}
      className="relative h-[260vh] bg-density"
      aria-label="Rendezvous intro"
    >
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        {/* Parallax background haze layer */}
        <motion.div
          aria-hidden
          style={{ y: hazeY }}
          className="absolute -inset-y-[20%] inset-x-0 bg-[radial-gradient(ellipse_at_30%_40%,rgba(201,163,95,0.06),transparent_60%),radial-gradient(ellipse_at_70%_60%,rgba(255,94,58,0.04),transparent_55%)]"
        />

        <motion.div
          aria-hidden
          style={{ opacity: vignetteOpacity }}
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#0A0907_75%)]"
        />

        {/* Halation bloom that peaks when letters resolve */}
        <motion.div
          aria-hidden
          style={{ opacity: haloOpacity }}
          className="absolute inset-0 bg-[radial-gradient(ellipse_50%_25%_at_50%_50%,rgba(255,94,58,0.18),transparent_70%)] mix-blend-screen"
        />

        {/* Letterbox bars */}
        <motion.div
          aria-hidden
          style={{ height: barHeight }}
          className="absolute inset-x-0 top-0 z-20 bg-density"
        />
        <motion.div
          aria-hidden
          style={{ height: barHeight }}
          className="absolute inset-x-0 bottom-0 z-20 bg-density"
        />

        {/* Reel marker */}
        <div className="absolute top-6 left-6 z-30 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-bone/40 md:top-10 md:left-10">
          <span className="block h-2 w-2 rounded-full bg-halation/70" />
          <span>Reel 00</span>
          <span className="block h-px w-6 bg-bone/20" />
          <span>Kodak Vision 3</span>
        </div>
        <div className="absolute top-6 right-6 z-30 font-mono text-[10px] uppercase tracking-[0.3em] text-bone/40 md:top-10 md:right-10">
          24.000 fps
        </div>

        <motion.div
          style={{
            opacity: stageOpacity,
            translateZ: stageZ,
            scale: stageScale,
            transformStyle: 'preserve-3d',
            perspective: 1600,
          }}
          className="relative flex h-full w-full flex-col items-center justify-center px-6 gate-weave"
        >
          <motion.p
            style={{ opacity: eyebrowOpacity, y: eyebrowY }}
            className="mb-10 text-[10px] uppercase tracking-[0.5em] text-bone/60 md:text-xs"
          >
            Film by
          </motion.p>

          <h1
            className="font-serif text-[clamp(3.5rem,14vw,14rem)] leading-[0.9] tracking-tightest text-bone"
            style={{ transformStyle: 'preserve-3d', perspective: 1600 }}
          >
            <span className="sr-only">{TITLE}</span>
            <span aria-hidden className="flex flex-wrap justify-center">
              {LETTERS.map((letter, i) => (
                <Letter
                  key={`${letter}-${i}`}
                  letter={letter}
                  index={i}
                  total={LETTERS.length}
                  progress={progress}
                />
              ))}
            </span>
          </h1>

          <motion.div
            style={{ opacity: logoOpacity, y: logoY }}
            className="mt-14 flex flex-col items-center gap-4"
          >
            <Image
              src="/logo.png"
              alt="Rendezvous"
              width={220}
              height={64}
              priority
              className="opacity-90"
            />
            <p className="text-[10px] uppercase tracking-[0.5em] text-bone/40">
              Est. 2026 · Los Angeles
            </p>
          </motion.div>
        </motion.div>

        <ScrollHint progress={progress} />
      </div>
    </section>
  );
}

function Letter({
  letter,
  index,
  total,
  progress,
}: {
  letter: string;
  index: number;
  total: number;
  progress: MotionValue<number>;
}) {
  const start = 0.08 + (index / total) * 0.42;
  const end = start + 0.18;

  const z = useTransform(progress, [start, end], [-1400, 0]);
  const rotateX = useTransform(progress, [start, end], [70, 0]);
  const rotateY = useTransform(
    progress,
    [start, end],
    [index % 2 === 0 ? -32 : 32, 0]
  );
  const opacity = useTransform(progress, [start, start + 0.04, end], [0, 1, 1]);
  const blur = useTransform(
    progress,
    [start, end],
    ['blur(20px)', 'blur(0px)']
  );

  return (
    <motion.span
      style={{
        translateZ: z,
        rotateX,
        rotateY,
        opacity,
        filter: blur,
        transformStyle: 'preserve-3d',
        display: 'inline-block',
      }}
      className="px-[0.01em]"
    >
      {letter}
    </motion.span>
  );
}

function ScrollHint({ progress }: { progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [0, 0.15], [1, 0]);
  return (
    <motion.div
      style={{ opacity }}
      className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 text-[10px] uppercase tracking-[0.4em] text-bone/40"
    >
      <span>Scroll</span>
      <motion.span
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        className="block h-10 w-px bg-bone/30"
      />
    </motion.div>
  );
}
