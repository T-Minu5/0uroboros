/**
 * Steamworks through steamworks.js, loaded lazily so the website build never touches the native module.
 * Session tickets go to the game server's /auth/steam; achievements and rich presence come back from the client.
 */
export type Steam = {
  personaName(): string;
  sessionTicket(): Promise<string>;
  unlockAchievement(id: string): void;
  setPresence(text: string): void;
  shutdown(): void;
};

type SteamworksClient = {
  localplayer: { getName(): string; getSteamId(): { steamId64: bigint } };
  auth: { getSessionTicketWithSteamId(steamId64: bigint): Promise<{ getBytes(): Uint8Array; cancel(): void }> };
  achievement: { activate(id: string): boolean; isActivated(id: string): boolean };
  localplayer_presence?: unknown;
  overlay?: { activateDialog(dialog: string): void };
  callback?: unknown;
  runCallbacks?(): void;
};
type Steamworks = {
  init(appId?: number): SteamworksClient;
  electronEnableSteamOverlay(disableEachFrameInvalidation?: boolean): void;
  restartAppIfNecessary(appId: number): boolean;
};

export function createSteam(appId: number): Steam | null {
  let sdk: Steamworks;
  try { sdk = require('steamworks.js') as Steamworks; } catch (error) { console.error('[steam] steamworks.js unavailable', error); return null; }
  if (appId && sdk.restartAppIfNecessary(appId)) { process.exit(0); }
  let client: SteamworksClient;
  try { client = sdk.init(appId || undefined); } catch (error) { console.error('[steam] init failed (is Steam running?)', error); return null; }
  try { sdk.electronEnableSteamOverlay(); } catch { /* overlay is optional */ }
  const steamId = client.localplayer.getSteamId().steamId64;
  const unlocked = new Set<string>();
  const presence = (client as unknown as { localplayer: { setRichPresence?(key: string, value: string | null): void } }).localplayer;
  const timer = setInterval(() => client.runCallbacks?.(), 100);
  return {
    personaName: () => client.localplayer.getName(),
    async sessionTicket() {
      const ticket = await client.auth.getSessionTicketWithSteamId(steamId);
      return Buffer.from(ticket.getBytes()).toString('hex');
    },
    unlockAchievement(id) {
      if (unlocked.has(id)) return;
      try { if (!client.achievement.isActivated(id)) client.achievement.activate(id); unlocked.add(id); } catch (error) { console.error('[steam] achievement', id, error); }
    },
    setPresence(text) { try { presence.setRichPresence?.('status', text); presence.setRichPresence?.('steam_display', '#Status'); } catch { /* presence is optional */ } },
    shutdown() { clearInterval(timer); },
  };
}
