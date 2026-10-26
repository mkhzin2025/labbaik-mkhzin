import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Play, Pause, Mic } from 'lucide-react';

const BAR_COUNT = 36;

// Fallback bars when the browser can't decode the file (e.g. Safari + ogg/opus).
function placeholderBars(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return Array.from({ length: BAR_COUNT }, () => {
    h = (h * 1103515245 + 12345) >>> 0;
    return 0.25 + ((h >>> 16) % 1000) / 1333;
  });
}

async function decodePeaks(src: string): Promise<{ peaks: number[]; duration: number }> {
  const buffer = await (await fetch(src)).arrayBuffer();
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx: AudioContext = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(buffer);
    const data = audio.getChannelData(0);
    const block = Math.max(1, Math.floor(data.length / BAR_COUNT));
    const raw = Array.from({ length: BAR_COUNT }, (_, i) => {
      let sum = 0;
      for (let j = i * block; j < Math.min((i + 1) * block, data.length); j++) sum += Math.abs(data[j]);
      return sum / block;
    });
    const max = Math.max(...raw) || 1;
    return { peaks: raw.map((v) => 0.15 + (v / max) * 0.85), duration: audio.duration };
  } finally {
    ctx.close().catch(() => {});
  }
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function VoiceNotePlayer({ src, mine = false }: { src: string; mine?: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [peaks, setPeaks] = useState<number[]>(() => placeholderBars(src));

  useEffect(() => {
    let active = true;
    decodePeaks(src).then((result) => {
      if (!active) return;
      setPeaks(result.peaks);
      if (Number.isFinite(result.duration)) setDuration(result.duration);
    }).catch(() => {});
    return () => { active = false; };
  }, [src]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  };

  const seek = (event: MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrent(audio.currentTime);
  };

  const progress = duration ? current / duration : 0;
  const playedBar = mine ? 'bg-white' : 'bg-labbaik-blue';
  const idleBar = mine ? 'bg-white/40' : 'bg-neutral-400/50 dark:bg-white/25';

  return (
    <div dir="ltr" className="mt-2 flex w-64 max-w-full items-center gap-3">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrent(0); }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => { if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration); }}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'إيقاف مؤقت' : 'تشغيل الرسالة الصوتية'}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${mine ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-labbaik-blue text-labbaik-on-accent hover:opacity-90'}`}
      >
        {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="translate-x-px" />}
      </button>
      <div className="min-w-0 flex-1">
        <div
          role="slider"
          aria-label="موضع التشغيل"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(current)}
          tabIndex={0}
          onClick={seek}
          onKeyDown={(e) => {
            const audio = audioRef.current;
            if (!audio || !duration) return;
            if (e.key === 'ArrowRight') audio.currentTime = Math.min(duration, audio.currentTime + 5);
            if (e.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
          }}
          className="flex h-8 cursor-pointer items-center gap-0.5"
        >
          {peaks.map((peak, i) => (
            <span
              key={i}
              className={`flex-1 rounded-full transition-colors ${i / peaks.length < progress ? playedBar : idleBar}`}
              style={{ height: `${Math.round(peak * 100)}%` }}
            />
          ))}
        </div>
        <div className={`mt-0.5 flex items-center gap-1 text-[11px] font-bold tabular-nums ${mine ? 'text-white/80' : 'text-labbaik-text-muted'}`}>
          <Mic size={11} />
          {formatTime(playing || current ? current : duration)}
        </div>
      </div>
    </div>
  );
}
