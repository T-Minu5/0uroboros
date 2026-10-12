import { describe, expect, it } from 'vitest';
import { shufflePlaylist, songTitle } from '../src/MusicPlayer';

describe('music player', () => {
  it('names songs without their file extension', () => {
    expect(songTitle('Cthulhu Awakens.mp3')).toBe('Cthulhu Awakens');
    expect(songTitle("Make 'em bleed.mp3")).toBe("Make 'em bleed");
    expect(songTitle('Vintage_Neon.final.m4a')).toBe('Vintage_Neon.final');
  });

  it('shuffles every song exactly once and never repeats the last song first', () => {
    const files = ['a.mp3', 'b.mp3', 'c.mp3', 'd.mp3'];
    for (let seed = 0; seed < 50; seed++) {
      let state = seed + 1;
      const random = () => (state = (state * 16807) % 2147483647) / 2147483647;
      const order = shufflePlaylist(files, random, 'a.mp3');
      expect([...order].sort()).toEqual(files);
      expect(order[0]).not.toBe('a.mp3');
    }
    const orders = new Set(Array.from({ length: 30 }, () => shufflePlaylist(files).join()));
    expect(orders.size).toBeGreaterThan(1);
  });
});
