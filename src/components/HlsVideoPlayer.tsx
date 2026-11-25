/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';

interface HlsVideoPlayerProps {
  src: string;
  kind?: 'hls' | 'mp4';
  muted?: boolean;
  controls?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  playsInline?: boolean;
  fadeInOnReady?: boolean;
  poster?: string;
  className?: string;
  style?: React.CSSProperties;
  showControlsOverlay?: boolean;
  'data-testid'?: string;
  onReady?: () => void;
  onError?: () => void;
}

export function HlsVideoPlayer({
  src,
  kind = 'hls',
  muted = true,
  controls = false,
  autoPlay = true,
  loop = true,
  playsInline = true,
  fadeInOnReady = false,
  poster,
  className = '',
  style,
  showControlsOverlay = false,
  'data-testid': testId,
  onReady,
  onError,
}: HlsVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isMuted, setIsMuted] = useState(muted);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !src) return;
    setReady(false);

    const isHls = kind === 'hls' || /\.m3u8(\?|$)/i.test(src) || src.includes('/api/video/hls') || src.includes('/api/lamovie/hls');

    if (!isHls) {
      videoEl.src = src;
      if (autoPlay) {
        videoEl.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      }
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        startLevel: 0,
        capLevelToPlayerSize: true,
        maxBufferLength: 14,
      });
      hls.loadSource(src);
      hls.attachMedia(videoEl);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (autoPlay) {
          videoEl.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        }
      });
      hls.on(Hls.Events.ERROR, (_ev, data) => {
        if (data.fatal) {
          hls.destroy();
          onError?.();
        }
      });
      return () => {
        hls.destroy();
      };
    }

    if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      videoEl.src = src;
      if (autoPlay) {
        videoEl.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      }
      return;
    }

    onError?.();
  }, [autoPlay, kind, onError, src]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const formatTime = (secs: number) => {
    if (Number.isNaN(secs) || secs <= 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const computedStyle = fadeInOnReady
    ? {
        ...style,
        opacity: ready ? style?.opacity ?? 1 : 0,
      }
    : style;

  return (
    <div className="relative w-full h-full group">
      <video
        ref={videoRef}
        data-testid={testId}
        muted={isMuted}
        controls={controls && !showControlsOverlay}
        autoPlay={autoPlay}
        loop={loop}
        playsInline={playsInline}
        poster={poster}
        preload="auto"
        onTimeUpdate={() => {
          if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
        }}
        onDurationChange={() => {
          if (videoRef.current && Number.isFinite(videoRef.current.duration)) {
            setDuration(videoRef.current.duration);
          }
        }}
        onPlaying={() => {
          setReady(true);
          setIsPlaying(true);
          onReady?.();
        }}
        onCanPlay={() => {
          setReady(true);
          onReady?.();
        }}
        onPause={() => setIsPlaying(false)}
        onError={() => onError?.()}
        className={className}
        style={computedStyle}
      />

      {showControlsOverlay && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex items-center gap-3 px-4 py-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-90 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={togglePlay}
            className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white cursor-pointer"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
          </button>

          <span className="text-xs font-mono-tabular text-white shrink-0">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (videoRef.current) videoRef.current.currentTime = val;
              setCurrentTime(val);
            }}
            className="flex-1 h-1.5 bg-white/30 rounded-lg appearance-none cursor-pointer accent-[#E50914]"
          />

          <button
            type="button"
            onClick={() => setIsMuted((m) => !m)}
            className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white cursor-pointer"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
