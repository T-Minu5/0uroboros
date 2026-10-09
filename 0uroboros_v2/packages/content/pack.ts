import manifest from './art-manifest.json';

/** Files (relative to the repo root, `assets/...`) that the client build ships. Nothing else leaves the studio. */
export const SHIPPED_ASSETS: readonly string[] = manifest.files;
/** Revision of the authored content the manifest was generated from. */
export const MANIFEST_PACK_REVISION: number | null = manifest.packRevision;

/** Shipped files under a folder, as `/assets/...` URLs. */
export const shippedUnder = (folder: string): string[] => {
  const prefix = folder.replace(/^\/+/, '').replace(/\/?$/, '/');
  return SHIPPED_ASSETS.filter(file => file.startsWith(prefix)).map(file => `/${file}`);
};
