import { useEffect, useRef, useState, type CSSProperties } from 'react';
import './music-player.css';

const PLAYLIST_URL = '/assets/music/playlist.json';
const START_VOLUME = .2;

/** The song's display name: its file name without the extension. */
export const songTitle = (file: string) => file.replace(/\.[^./]+$/, '');

/** A fresh random order; `avoidFirst` keeps the song that just played from starting the next round. */
export function shufflePlaylist(files: readonly string[], random: () => number = Math.random, avoidFirst?: string): string[] {
 const order = [...files];
 for (let i = order.length - 1; i > 0; i--) {
  const j = Math.floor(random() * (i + 1));
  [order[i], order[j]] = [order[j], order[i]];
 }
 if (avoidFirst !== undefined && order.length > 1 && order[0] === avoidFirst) [order[0], order[order.length - 1]] = [order[order.length - 1], order[0]];
 return order;
}

async function loadPlaylist(): Promise<string[]> {
 try {
  const response = await fetch(PLAYLIST_URL, { cache: 'no-store' });
  const files: unknown = response.ok ? await response.json() : [];
  return Array.isArray(files) ? files.filter((file): file is string => typeof file === 'string') : [];
 } catch { return []; }
}

/** `playing` is false outside a game: the player shows its controls but holds the music. */
export function MusicPlayer({ playing }: { playing: boolean }) {
 const [playlist, setPlaylist] = useState<string[]>([]);
 const [index, setIndex] = useState(0);
 const [volume, setVolume] = useState(START_VOLUME);
 const [muted, setMuted] = useState(false);
 const audio = useRef<HTMLAudioElement>(null);
 const failures = useRef(0);
 const song = playlist[index];

 useEffect(() => {
  let live = true;
  loadPlaylist().then(files => { if (live) setPlaylist(shufflePlaylist(files)); });
  return () => { live = false; };
 }, []);

 useEffect(() => {
  const element = audio.current;
  if (!element || !song) return;
  if (!playing) { element.pause(); return; }
  // Browsers block audio until the player interacts with the page, so start on the first click or key press.
  const resume = () => { element.play().catch(() => {}); stop(); };
  const stop = () => { window.removeEventListener('pointerdown', resume); window.removeEventListener('keydown', resume); };
  element.play().catch(() => { window.addEventListener('pointerdown', resume); window.addEventListener('keydown', resume); });
  return stop;
 }, [song, playing]);

 useEffect(() => {
  if (!audio.current) return;
  audio.current.volume = volume;
  audio.current.muted = muted;
 }, [volume, muted, song]);

 async function next() {
  if (index + 1 < playlist.length) { setIndex(index + 1); return; }
  // Each new round re-reads the folder, so songs added since the last round join in.
  const files = await loadPlaylist();
  const order = shufflePlaylist(files.length ? files : playlist, Math.random, song);
  setPlaylist(order);
  setIndex(0);
  if (order[0] === song && audio.current) { audio.current.currentTime = 0; if (playing) audio.current.play().catch(() => {}); }
 }

 function skipBroken() {
  if (++failures.current < playlist.length) void next();
 }

 if (!song) return null;
 const silent = muted || volume === 0;
 const title = songTitle(song);
 return <div className='music-player' role='group' aria-label='Music player'>
  <audio ref={audio} src={`/assets/music/${encodeURIComponent(song)}`} preload='auto'
   onEnded={() => void next()} onPlaying={() => { failures.current = 0; }} onError={skipBroken}/>
  <span className='music-title' title={title}>{title}</span>
  <button type='button' className='music-mute' aria-label={silent ? 'Unmute music' : 'Mute music'} aria-pressed={silent}
   onClick={() => { if (volume === 0) { setVolume(START_VOLUME); setMuted(false); } else setMuted(!muted); }}>
   <SpeakerIcon muted={silent}/>
  </button>
  <input className='music-volume' type='range' min={0} max={100} step={1} aria-label='Music volume'
   value={Math.round(volume * 100)} data-muted={muted || undefined} style={{ '--music-fill': `${volume * 100}%` } as CSSProperties}
   onChange={event => { setVolume(Number(event.target.value) / 100); setMuted(false); }}/>
  <button type='button' className='music-next' aria-label='Next song' onClick={() => void next()}>
   <svg viewBox='0 0 16 16' aria-hidden='true'><path d='M3 3.5v9l6.5-4.5z' fill='currentColor'/><rect x='11' y='3.5' width='1.8' height='9' rx='.6' fill='currentColor'/></svg>
  </button>
 </div>;
}

function SpeakerIcon({ muted }: { muted: boolean }) {
 return <svg viewBox='0 0 16 16' aria-hidden='true'>
  <path d='M2 6h2.6L8 3.2v9.6L4.6 10H2z' fill='currentColor'/>
  {muted
   ? <path d='M10.5 6l3.5 4M14 6l-3.5 4' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' fill='none'/>
   : <path d='M10.4 5.6a3.2 3.2 0 0 1 0 4.8M12.2 3.9a5.6 5.6 0 0 1 0 8.2' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' fill='none'/>}
 </svg>;
}
