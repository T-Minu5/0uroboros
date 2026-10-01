import { defaultSwarmPackageRoot } from '../src/swarm/context';
import { syncCanonicalFromMarkdown } from '../src/swarm/canonicalSync';

const written = syncCanonicalFromMarkdown(defaultSwarmPackageRoot());
for (const path of written) {
  console.log(path);
}
