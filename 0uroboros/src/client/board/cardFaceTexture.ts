/**
 * Paint a placeholder card face onto a canvas texture.
 *
 * The 3D card has to carry its own readable face because Html overlays fight
 * the drag gesture. Final art replaces this painter without changing the mesh.
 */

import { CanvasTexture, SRGBColorSpace } from 'three';

import type { CardDefinition, CardInstance } from '../../game/types';
import { cardPowerOf } from '../selectors';

const KIND_LABELS: Record<CardDefinition['kind'], string> = {
  character: 'CHARACTER',
  crypto: 'CRYPTO',
  victoryPoint: 'VICTORY POINT',
  base: 'BASE',
  chaos: 'CHAOS',
};

const W = 384;
const H = 540;

export function createCardFaceTexture(
  definition: CardDefinition,
  card?: CardInstance,
  options: { playable?: boolean } = {},
): CanvasTexture {
  const playable = options.playable ?? true;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable for card face');

  paintCardFace(ctx, definition, card, playable);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function paintCardFace(
  ctx: CanvasRenderingContext2D,
  definition: CardDefinition,
  card: CardInstance | undefined,
  playable: boolean,
): void {
  // CARD_READABILITY_V3: larger face raster so board-scale text stays legible.
  ctx.fillStyle = playable ? '#1b2838' : '#141820';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = playable ? '#3fbfe0' : '#3a4554';
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, W - 12, H - 12);

  ctx.fillStyle = '#12202e';
  ctx.fillRect(24, 78, W - 48, 168);

  ctx.fillStyle = playable ? '#3fbfe0' : '#6b7787';
  ctx.globalAlpha = 0.22;
  ctx.beginPath();
  ctx.arc(W / 2, 160, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  const power = card ? cardPowerOf(card) : definition.power;
  ctx.fillStyle = '#e8eef6';
  ctx.font = '700 42px "Chakra Petch", sans-serif';
  ctx.textAlign = 'right';
  if (definition.deployable) ctx.fillText(String(power), W - 28, 52);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#e0a13f';
  ctx.font = '600 24px "IBM Plex Mono", monospace';
  ctx.fillText(`${definition.cost}c`, 28, 50);

  ctx.fillStyle = '#f2f6fb';
  ctx.font = '700 36px "Chakra Petch", sans-serif'; // CARD_FACE_LEGIBILITY_V3
  wrapText(ctx, definition.name, 28, 280, W - 56, 34);

  ctx.fillStyle = '#8b99ab';
  ctx.font = '600 18px "IBM Plex Mono", monospace';
  const kind = KIND_LABELS[definition.kind] + (definition.duration ? '  ·  DURATION' : '');
  ctx.fillText(kind, 28, 360);

  const rules = definition.effects.map((effect) => effect.text).join(' ');
  ctx.fillStyle = '#d5deea';
  ctx.font = '600 24px "Chakra Petch", sans-serif';
  wrapText(ctx, rules, 28, 396, W - 56, 28, 5);

  if (!playable) {
    ctx.fillStyle = 'rgba(8, 12, 18, 0.45)';
    ctx.fillRect(0, 0, W, H);
  }
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 2,
): void {
  if (!text) return;
  const words = text.split(' ');
  let line = '';
  let row = 0;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, y + row * lineHeight);
      line = word;
      row += 1;
      if (row >= maxLines) return;
    } else {
      line = next;
    }
  }
  if (row < maxLines) ctx.fillText(line, x, y + row * lineHeight);
}
