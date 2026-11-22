import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { engine } from '../audio/engine';
import type { TrackStatus } from '../audio/types';

const STATUS_COLOR: Record<TrackStatus, string> = {
  EMPTY: 'var(--muted)',
  ARMED: 'var(--accent)',
  'COUNT-IN': 'var(--accent)',
  REC: '#e0524a',
  PLAY: 'var(--tint, var(--accent))',
  OVERDUB: '#d98a4b',
  STOPPED: 'var(--text-secondary)',
};

export const STATUS_LABEL: Record<TrackStatus, string> = {
  EMPTY: 'track.empty',
  ARMED: 'track.armed',
  'COUNT-IN': 'track.countIn',
  REC: 'track.rec',
  PLAY: 'track.play',
  OVERDUB: 'track.overdub',
  STOPPED: 'track.stopped',
};

function wavePath(peaks: number[], width: number, height: number): string {
  const bars = 46;
  const step = width / bars;
  const mid = height / 2;
  const commands: string[] = [];
  for (let i = 0; i < bars; i += 1) {
    const value = peaks.length ? peaks[Math.min(peaks.length - 1, Math.floor((i / bars) * peaks.length))] : 0;
    const amplitude = Math.max(0.04, Math.min(1, value)) * (mid - 2);
    const x = i * step + step / 2;
    commands.push(`M${x.toFixed(2)},${(mid - amplitude).toFixed(2)}L${x.toFixed(2)},${(mid + amplitude).toFixed(2)}`);
  }
  return commands.join('');
}

function LiveScope({ trackId, size }: { trackId: number; size: number }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const data = new Float32Array(1024);
    let raf = 0;
    const draw = (): void => {
      raf = requestAnimationFrame(draw);
      const ratio = window.devicePixelRatio || 1;
      const width = size;
      const height = size * 0.34;
      if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      if (!engine.trackWaveform(trackId, data)) return;
      const styles = getComputedStyle(document.documentElement);
      context.strokeStyle = styles.getPropertyValue('--accent-text').trim() || '#8b6ce8';
      context.lineWidth = 1.2;
      context.beginPath();
      const mid = height / 2;
      const step = Math.max(1, Math.floor(data.length / width));
      for (let x = 0; x < width; x += 1) {
        let peak = 0;
        for (let i = 0; i < step; i += 1) {
          const value = Math.abs(data[x * step + i] ?? 0);
          if (value > peak) peak = value;
        }
        const y = mid - peak * mid * 1.8;
        if (x === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [trackId, size]);
  return <canvas ref={canvasRef} className="ring-scope" aria-hidden />;
}

export interface LoopRingProps {
  size: number;
  progress: number;
  status: TrackStatus;
  peaks: number[];
  trackId: number;
  bars: number;
  showScope?: boolean;
}

export function LoopRing({
  size,
  progress,
  status,
  peaks,
  trackId,
  bars,
  showScope = true,
}: LoopRingProps): JSX.Element {
  const stroke = 4;
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  const color = STATUS_COLOR[status] ?? 'var(--muted)';
  const recording = status === 'REC' || status === 'OVERDUB';
  const live = recording || status === 'COUNT-IN';
  const waveWidth = 118;
  const waveHeight = 38;

  return (
    <div className={`loop-ring ${recording ? 'is-recording' : ''}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={status}>
        <circle cx="100" cy="100" r={radius} fill="none" stroke="var(--border-soft)" strokeWidth={stroke} />
        {Array.from({ length: bars }, (_, index) => {
          const angle = (index / bars) * Math.PI * 2 - Math.PI / 2;
          const x1 = 100 + Math.cos(angle) * (radius - 8);
          const y1 = 100 + Math.sin(angle) * (radius - 8);
          const x2 = 100 + Math.cos(angle) * (radius - 13);
          const y2 = 100 + Math.sin(angle) * (radius - 13);
          return (
            <line
              key={index}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--line-strong)"
              strokeWidth={1}
              opacity={0.7}
            />
          );
        })}
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          transform="rotate(-90 100 100)"
          className="ring-progress"
        />
        <g transform={`translate(${100 - waveWidth / 2} ${100 - waveHeight / 2})`} opacity={status === 'EMPTY' ? 0.35 : 0.9}>
          <path
            d={wavePath(peaks, waveWidth, waveHeight)}
            stroke={status === 'EMPTY' ? 'var(--line-strong)' : color}
            strokeWidth={1.35}
            strokeLinecap="round"
          />
        </g>
      </svg>
      <div className="ring-center">
        {live && showScope ? (
          <LiveScope trackId={trackId} size={Math.round(size * 0.62)} />
        ) : (
          status !== 'EMPTY' && (
            // Caption row under the waveform: the percentage used to sit dead
            // centre and printed straight over the peaks.
            <span className="ring-percent tabular">
              {Math.round(clamped * 100)}%
            </span>
          )
        )}
      </div>
    </div>
  );
}
