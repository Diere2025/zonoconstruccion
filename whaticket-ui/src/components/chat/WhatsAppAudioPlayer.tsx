import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Play, Pause, Mic } from 'lucide-react';
import { toast } from 'sonner';

interface WhatsAppAudioPlayerProps {
  src: string;
  isMe?: boolean;
  timestamp?: string;
  ack?: number;
}

export const WhatsAppAudioPlayer: React.FC<WhatsAppAudioPlayerProps> = ({
  src,
  isMe = false,
  timestamp,
  ack
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1.5);
  const [isLoaded, setIsLoaded] = useState(false);

  // Generar alturas consistentes de onda de audio basadas en el hash de la URL
  const waveBars = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < src.length; i++) {
      hash = (hash << 5) - hash + src.charCodeAt(i);
      hash |= 0;
    }
    const count = 34;
    const bars: number[] = [];
    for (let i = 0; i < count; i++) {
      const pseudo = Math.abs(Math.sin(hash + i * 13.37));
      bars.push(Math.round(4 + pseudo * 18));
    }
    return bars;
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
        setIsLoaded(true);
      }
    };

    const onDurationChange = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
        setIsLoaded(true);
      }
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if ((!duration || !isFinite(duration)) && audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
        setIsLoaded(true);
      }
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [src, duration]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch((err) => {
        console.warn('Error al reproducir audio:', err);
      });
    }
  };

  const handleSpeedToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextSpeed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current || !audioRef.current || !duration) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percent = clickX / rect.width;
    const targetTime = percent * duration;
    audioRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || !isFinite(secs) || secs <= 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const activeBarIndex = Math.floor((progressPercent / 100) * waveBars.length);

  return (
    <div className="w-full min-w-[240px] sm:min-w-[270px] max-w-[320px] select-none py-1">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Contenedor Principal Estilo Whaticket / WhatsApp Web */}
      <div className="flex items-center gap-2">
        {/* Botón Play / Pause Triángulo Whaticket */}
        <button
          type="button"
          onClick={togglePlay}
          className="p-1 text-[#54656f] dark:text-[#8696a0] hover:opacity-75 active:scale-95 transition-transform flex-shrink-0 cursor-pointer"
          title={isPlaying ? 'Pausar' : 'Reproducir'}
        >
          {isPlaying ? (
            <Pause className="w-6 h-6 fill-current text-[#54656f] dark:text-[#8696a0]" />
          ) : (
            <Play className="w-6 h-6 fill-current text-[#54656f] dark:text-[#8696a0] ml-0.5" />
          )}
        </button>

        {/* Ondas de Audio (Waveform) */}
        <div
          ref={waveformRef}
          onClick={handleWaveformClick}
          className="flex-1 h-7 flex items-center gap-[2.5px] cursor-pointer relative py-1 mx-1"
          title="Haz clic para avanzar o retroceder"
        >
          {waveBars.map((height, idx) => {
            const isPlayed = idx <= activeBarIndex;
            return (
              <span
                key={idx}
                className={`w-[2.5px] rounded-full transition-colors duration-150 ${
                  isPlayed
                    ? 'bg-[#54656f] dark:bg-[#00a884]'
                    : 'bg-[#54656f]/35 dark:bg-white/30'
                }`}
                style={{ height: `${height}px` }}
              />
            );
          })}

          {/* Cabezal de reproducción (Punto activo blanco) */}
          {progressPercent > 0 && progressPercent < 100 && (
            <span
              className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full pointer-events-none shadow-xs transition-all duration-75 border border-black/20"
              style={{ left: `calc(${progressPercent}% - 4px)` }}
            />
          )}
        </div>

        {/* Botón de Velocidad 1x / 1.5x / 2x */}
        <button
          type="button"
          onClick={handleSpeedToggle}
          className="px-2.5 py-0.5 text-xs font-semibold rounded-2xl transition-all cursor-pointer shadow-2xs flex-shrink-0 bg-black/10 dark:bg-white/10 text-[#54656f] dark:text-[#8696a0] hover:bg-black/15"
          title="Cambiar velocidad de reproducción"
        >
          {speed}x
        </button>
      </div>

      {/* Tiempo transcurrido / Duración (Alineado con el waveform) */}
      <div className="text-[11px] font-mono text-[#667781] dark:text-[#8696a0] pl-8 -mt-0.5 select-none">
        <span>{isPlaying ? formatTime(currentTime) : formatTime(duration || currentTime)}</span>
      </div>

      {/* Fila inferior: "Transcribir" a la izquierda y Hora / Ticks / Micrófono a la derecha */}
      <div className="mt-1 flex items-center justify-between pt-0.5">
        <button
          type="button"
          onClick={() => toast.info('Función de transcripción no disponible en este momento')}
          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer select-none"
        >
          Transcribir
        </button>

        {timestamp && (
          <div className="flex items-center gap-1 text-[10px] select-none text-[#667781] dark:text-[#8696a0]">
            <span className="leading-none">{timestamp}</span>
            {isMe && (
              <span
                className={`leading-none font-bold ${
                  (ack ?? 0) >= 3 || (ack ?? 0) === 2 ? 'text-[#53bdeb]' : 'text-[#8696a0]'
                }`}
              >
                {(ack ?? 0) >= 3 ? '✓✓' : (ack ?? 0) === 2 ? '✓✓' : '✓'}
              </span>
            )}
            <Mic className="w-3.5 h-3.5 text-[#53bdeb] ml-0.5 inline-block flex-shrink-0" />
          </div>
        )}
      </div>
    </div>
  );
};
