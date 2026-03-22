import { useState, useRef, useCallback, useEffect } from 'react';

interface AudioPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isReady: boolean;
}

interface AudioPlayerControls {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (time: number) => void;
}

export type UseAudioPlayerReturn = AudioPlayerState & AudioPlayerControls;

export function useAudioPlayer(src: string | null, fallbackDuration?: number): UseAudioPlayerReturn {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [rawDuration, setRawDuration] = useState(0);
  const [isReady, setIsReady] = useState(false);

  const duration = Number.isFinite(rawDuration) && rawDuration > 0
    ? rawDuration
    : (fallbackDuration ?? 0);

  useEffect(() => {
    if (!src) return;

    const audio = new Audio(src);
    audioRef.current = audio;

    const trySetDuration = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setRawDuration(audio.duration);
      }
    };

    const onLoaded = () => {
      trySetDuration();
      setIsReady(true);
    };

    const onDurationChange = () => {
      trySetDuration();
    };

    const onEnded = () => {
      setIsPlaying(false);
      cancelAnimationFrame(rafRef.current);
      trySetDuration();
    };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);

    return () => {
      cancelAnimationFrame(rafRef.current);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnded);
      audio.pause();
      audioRef.current = null;
    };
  }, [src]);

  const tick = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const play = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.play();
    setIsPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const pause = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    setIsPlaying(false);
    cancelAnimationFrame(rafRef.current);
  }, []);

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, play, pause]);

  const seek = useCallback((time: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  }, []);

  return { isPlaying, currentTime, duration, isReady, play, pause, toggle, seek };
}
