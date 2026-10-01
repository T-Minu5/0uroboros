import { shouldConsultContent } from './content';
import { isHarnessInfrastructureRequest } from './harnessRouting';
import { shouldConsultLookDev } from './lookdev';
import { shouldConsultResearch } from './research';
import { shouldConsultSystems } from './systems';
import { shouldConsultWorldbuilding } from './worldbuilding';

export { isHarnessInfrastructureRequest } from './harnessRouting';

const PRODUCT_RE =
  /\b(product (?:lead|requirement|requirements|scope|acceptance|priorit)|player-facing|feature scope|player experience requirements|acceptance criteria|mvp vs|product sequencing|spectator mode|mode\/feature|cross-functional product)\b/i;

const UX_RE =
  /\b(ux lead|interaction design|information hierarchy|usability|accessibility|player comprehension|player flows?|board interaction|interface behavior|hud)\b/i;

const ENGINEERING_RE =
  /\b(lead engineering|engineering plan|implementation architecture|game contract|server\/client|client\/server|trust boundary|networking|state representation|framework\/api|api suitability|implementation planning|repository implementation|technical feasibility|implementation(?:-ready)? correction)\b/i;

const CREATIVE_COLLAB_RE =
  /\b(content (?:and|&|plus) worldbuilding|worldbuilding contribution|chaos character candidate|card (?:ideation|concept)|world lore|thematic exploration)\b/i;

export function isCreativeCollaborationTask(objective: string): boolean {
  if (PRODUCT_RE.test(objective) || UX_RE.test(objective) || ENGINEERING_RE.test(objective)) {
    return false;
  }
  if (shouldConsultLookDev(objective) && !CREATIVE_COLLAB_RE.test(objective)) {
    return false;
  }
  return (
    CREATIVE_COLLAB_RE.test(objective) ||
    ((shouldConsultContent(objective) || shouldConsultWorldbuilding(objective)) &&
      !/\bhud\b/i.test(objective) &&
      !ENGINEERING_RE.test(objective) &&
      !PRODUCT_RE.test(objective) &&
      !UX_RE.test(objective))
  );
}

export function shouldConsultProduct(objective: string): boolean {
  if (!objective.trim()) return false;
  if (isHarnessInfrastructureRequest(objective) && !PRODUCT_RE.test(objective)) return false;
  if (isCreativeCollaborationTask(objective) && !PRODUCT_RE.test(objective)) return false;
  return PRODUCT_RE.test(objective);
}

export function shouldConsultUx(objective: string): boolean {
  if (!objective.trim()) return false;
  if (isHarnessInfrastructureRequest(objective) && !/\b(hud|usability|accessibility|hierarchy|player flow)\b/i.test(objective)) {
    return false;
  }
  if (isCreativeCollaborationTask(objective) && !UX_RE.test(objective)) return false;
  return UX_RE.test(objective);
}

export function shouldConsultEngineering(objective: string): boolean {
  if (!objective.trim()) return false;
  if (isHarnessInfrastructureRequest(objective) && !ENGINEERING_RE.test(objective)) return false;
  if (isCreativeCollaborationTask(objective) && !ENGINEERING_RE.test(objective)) return false;
  return ENGINEERING_RE.test(objective);
}

export function shouldConsultLead(
  role: 'product' | 'ux' | 'engineering',
  objective: string,
): boolean {
  if (role === 'product') return shouldConsultProduct(objective);
  if (role === 'ux') return shouldConsultUx(objective);
  return shouldConsultEngineering(objective);
}

export function advisoryRoutingEligibility(objective: string): {
  product: boolean;
  ux: boolean;
  engineering: boolean;
  systems: boolean;
  research: boolean;
  lookdev: boolean;
  content: boolean;
  worldbuilding: boolean;
} {
  return {
    product: shouldConsultProduct(objective),
    ux: shouldConsultUx(objective),
    engineering: shouldConsultEngineering(objective),
    systems: shouldConsultSystems(objective),
    research: shouldConsultResearch(objective),
    lookdev: shouldConsultLookDev(objective),
    content: shouldConsultContent(objective),
    worldbuilding: shouldConsultWorldbuilding(objective),
  };
}
