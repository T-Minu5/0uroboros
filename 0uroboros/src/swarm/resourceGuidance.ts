import type {
  TheatricsTier,
  UsageConstraint,
  VisualReferenceKind,
  VisualVsTechnique,
} from './contracts';

export const DEFAULT_USAGE_CONSTRAINTS: UsageConstraint[] = [
  'STUDY_PRINCIPLES_AND_TECHNIQUES',
  'DO_NOT_RECREATE_EXACT_ANIMATION_SEQUENCES',
  'DO_NOT_REPRODUCE_ANOTHER_GAME_VISUAL_IDENTITY',
  'DO_NOT_COPY_CARD_ART',
  'DO_NOT_COPY_EXACT_LAYOUTS',
  'DO_NOT_REUSE_PROPRIETARY_UI_EXPRESSION',
  'DO_NOT_LIFT_CODE_BLINDLY',
  'REMAIN_NATIVE_TO_CYBERPUNK_QUANTUM_OCCULT',
  'GAMEPLAY_READABILITY_OVERRIDES_SPECTACLE',
];

export const EFFECTS_USAGE_CONSTRAINTS: UsageConstraint[] = [
  ...DEFAULT_USAGE_CONSTRAINTS,
  'EFFECTS_SCALE_WITH_GAMEPLAY_IMPACT',
  'SMALL_EFFECTS_REMAIN_SMALL',
  'MAJOR_EVENTS_MAY_BE_CINEMATIC',
  'CARD_LOCATION_RESOLUTION_COMMUNICATES_CAUSE_TARGET_MAGNITUDE_OUTCOME',
  'WAVE_COLLAPSE_STRONGEST_CINEMATIC',
  'TECHNIQUE_REFERENCES_ARE_INSPIRATION_NOT_COPY_TARGETS',
  'SINGULARITY_LIQUID_WAVE_IS_PROMISING_NOT_LOCKED',
];

export const VIDEO_USAGE_CONSTRAINTS: UsageConstraint[] = [
  ...DEFAULT_USAGE_CONSTRAINTS,
  'QUALITY_BENCHMARK_NOT_TEMPLATE',
];

export const LIBRARY_TAG = {
  THREE_JS: '3.JS Resources',
  CODE_AND_CARD: 'Code and card examples',
  EXAMPLES_OF_GREAT: 'Examples of Great',
  EXAMPLES_OF_GOOD: 'Examples of Good',
  THEMING: 'Theming',
  EFFECTS: '3js effects reference',
  COMPETITIVE_VIDEO: 'Videos of competitive gameplay',
  FONTS: 'fonts',
  VISUAL_DESIGN_COLORS: 'visual design colors',
} as const;

export const LIBRARY_WIDE_GUIDANCE = [
  'References are inspiration and technique benchmarks, not authority. Never mimic exact protected expression.',
];

export const SECTION_SEMANTICS: Record<string, string> = {
  '3js effects reference':
    'Effects should scale with gameplay impact. Use 3-4 theatrics tiers. Small effects remain small. Major events can be cinematic. Card and Location effect resolution should communicate cause, target, magnitude, and outcome. Wave Collapse gets the strongest cinematic treatment. Technique references are inspiration, not copy targets. Effects remain Cyberpunk + Quantum Physics + Occult. The singularity + liquid-wave combination is a promising Wave Collapse direction, not a locked final animation.',
  'Competitive gameplay video benchmarks':
    'Great examples are Marvel Snap references. Good examples are the two additional competitive-gameplay videos. Study anticipation, impact, readability, hierarchy, pacing, emotional payoff, polish, and craftsmanship. These are quality benchmarks, not templates. Do not reproduce exact effects or animation sequences.',
  'Examples of Great / Good':
    'Use for game presentation, card movement, and card placing examples. Do not imitate it.',
  'Slay the Spire':
    'Use for emergent combinations, randomized adaptation, deck evolution, roguelike variability. Do not change established 0uroboros structure to imitate it.',
  'Shards of Infinity':
    'Reference agents may suggest Circuit-play enhancements and content ideas, but cannot change approved rules. Recommended output: Reference observation → 0uroboros opportunity → Proposed adaptation → Benefit → Risk.',
  Theming:
    'Theming references are inspiration. Keep Cyberpunk + Quantum Physics + Occult. Use Solarpunk very sparingly, ideally healing.',
};

export interface ResourceGuidanceOverlay {
  user_guidance?: string[];
  reference_types?: VisualReferenceKind[];
  theatrics_tiers?: TheatricsTier[];
  extra_tags?: string[];
  visual_vs_technique?: VisualVsTechnique;
}

const URL_GUIDANCE: Record<string, ResourceGuidanceOverlay> = {
  'https://tympanus.net/Tutorials/GeometryPainterThreeJS/': {
    user_guidance: ['specifically geometry rendering and animation, not drawing'],
    reference_types: ['TECHNIQUE_REFERENCE', 'MATERIAL_SHADER_REFERENCE'],
    theatrics_tiers: ['TIER_2', 'TIER_3'],
    visual_vs_technique: 'TECHNIQUE_REFERENCE',
  },
  'https://tympanus.net/Development/ScanEffect/effect1/': {
    user_guidance: ['this one is really cool, like the depth-mapped effect'],
    reference_types: ['TECHNIQUE_REFERENCE', 'MATERIAL_SHADER_REFERENCE', 'MOTION_THEATRICS_REFERENCE'],
    theatrics_tiers: ['TIER_2', 'TIER_3'],
    visual_vs_technique: 'VISUAL_AND_TECHNIQUE',
  },
  'https://tympanus.net/Development/ScanEffect/effect2/': {
    user_guidance: ['this one is really cool, like the depth-mapped effect'],
    reference_types: ['TECHNIQUE_REFERENCE', 'MATERIAL_SHADER_REFERENCE', 'MOTION_THEATRICS_REFERENCE'],
    theatrics_tiers: ['TIER_2', 'TIER_3'],
    visual_vs_technique: 'VISUAL_AND_TECHNIQUE',
  },
  'https://tympanus.net/Development/ScanEffect/effect3/': {
    user_guidance: ['this one is really cool, like the depth-mapped effect'],
    reference_types: ['TECHNIQUE_REFERENCE', 'MATERIAL_SHADER_REFERENCE', 'MOTION_THEATRICS_REFERENCE'],
    theatrics_tiers: ['TIER_2', 'TIER_3'],
    visual_vs_technique: 'VISUAL_AND_TECHNIQUE',
  },
  'https://tympanus.net/Development/Origami/': {
    user_guidance: ['these may combine great with Origami'],
    reference_types: ['TECHNIQUE_REFERENCE', 'INTERACTION_REFERENCE', 'CARD_RENDERING_REFERENCE'],
    theatrics_tiers: ['TIER_2'],
    visual_vs_technique: 'VISUAL_AND_TECHNIQUE',
  },
  'https://github.com/d3adrabbit/origami': {
    user_guidance: ['these may combine great with Origami'],
    reference_types: ['TECHNIQUE_REFERENCE'],
    theatrics_tiers: ['TIER_2'],
    visual_vs_technique: 'TECHNIQUE_REFERENCE',
  },
  'https://singularity.misterprada.com/': {
    user_guidance: ['combine singularity + liquid wave for Wave Collapse'],
    reference_types: ['MATERIAL_SHADER_REFERENCE', 'MOTION_THEATRICS_REFERENCE', 'INSPIRATION_ONLY'],
    theatrics_tiers: ['TIER_4'],
    visual_vs_technique: 'VISUAL_AND_TECHNIQUE',
  },
  'https://projects.arkon.digital/threejs/wavy-cubes/': {
    user_guidance: ['combine singularity + liquid wave for Wave Collapse'],
    reference_types: ['MATERIAL_SHADER_REFERENCE', 'MOTION_THEATRICS_REFERENCE', 'INSPIRATION_ONLY'],
    theatrics_tiers: ['TIER_3', 'TIER_4'],
    visual_vs_technique: 'VISUAL_AND_TECHNIQUE',
  },
  'https://www.youtube.com/watch?v=eKrOIG5tqJ4': {
    user_guidance: ['Marvel Snap is a Great benchmark for emotional polish'],
    extra_tags: [LIBRARY_TAG.EXAMPLES_OF_GREAT, LIBRARY_TAG.COMPETITIVE_VIDEO],
    reference_types: ['VISUAL_QUALITY_BENCHMARK', 'GAMEPLAY_PRESENTATION_REFERENCE', 'MOTION_THEATRICS_REFERENCE'],
    visual_vs_technique: 'VISUAL_REFERENCE',
  },
  'https://www.youtube.com/watch?v=hUi0eFuTi-g': {
    user_guidance: ['Marvel Snap is a Great benchmark for emotional polish'],
    extra_tags: [LIBRARY_TAG.EXAMPLES_OF_GREAT, LIBRARY_TAG.COMPETITIVE_VIDEO],
    reference_types: ['VISUAL_QUALITY_BENCHMARK', 'GAMEPLAY_PRESENTATION_REFERENCE', 'MOTION_THEATRICS_REFERENCE'],
    visual_vs_technique: 'VISUAL_REFERENCE',
  },
  'https://www.youtube.com/watch?v=NmkuxuKK_nU': {
    user_guidance: ['Good competitive-gameplay benchmark. Not a template.'],
    extra_tags: [LIBRARY_TAG.EXAMPLES_OF_GOOD, LIBRARY_TAG.COMPETITIVE_VIDEO],
    reference_types: ['VISUAL_QUALITY_BENCHMARK', 'GAMEPLAY_PRESENTATION_REFERENCE'],
    visual_vs_technique: 'VISUAL_REFERENCE',
  },
  'https://www.youtube.com/watch?v=zosDFA7_3M4': {
    user_guidance: ['Good competitive-gameplay benchmark. Not a template.'],
    extra_tags: [LIBRARY_TAG.EXAMPLES_OF_GOOD, LIBRARY_TAG.COMPETITIVE_VIDEO],
    reference_types: ['VISUAL_QUALITY_BENCHMARK', 'GAMEPLAY_PRESENTATION_REFERENCE'],
    visual_vs_technique: 'VISUAL_REFERENCE',
  },
  'https://aesthetics.fandom.com/wiki/Solarpunk': {
    user_guidance: ['use Solarpunk very sparingly, ideally healing'],
    reference_types: ['THEMING_REFERENCE', 'INSPIRATION_ONLY'],
    visual_vs_technique: 'VISUAL_REFERENCE',
  },
  'https://threejs.org/docs/#EffectComposer': {
    user_guidance: ['Technical technique reference for post-processing. Engineering decides fitness.'],
    reference_types: ['TECHNIQUE_REFERENCE'],
    visual_vs_technique: 'TECHNIQUE_REFERENCE',
  },
  'https://codepen.io/the-red-reddington/full/yyarRpa': {
    reference_types: ['INTERACTION_REFERENCE', 'CARD_RENDERING_REFERENCE', 'TECHNIQUE_REFERENCE'],
    theatrics_tiers: ['TIER_2'],
    visual_vs_technique: 'TECHNIQUE_REFERENCE',
  },
};

export function overlayForUrl(url: string): ResourceGuidanceOverlay | undefined {
  return URL_GUIDANCE[url];
}

export function constraintsForTags(tags: string[]): UsageConstraint[] {
  if (tags.includes(LIBRARY_TAG.EFFECTS) || tags.includes('3js effects reference')) {
    return EFFECTS_USAGE_CONSTRAINTS;
  }
  if (
    tags.includes(LIBRARY_TAG.COMPETITIVE_VIDEO) ||
    tags.includes(LIBRARY_TAG.EXAMPLES_OF_GREAT) ||
    tags.includes(LIBRARY_TAG.EXAMPLES_OF_GOOD)
  ) {
    return VIDEO_USAGE_CONSTRAINTS;
  }
  return DEFAULT_USAGE_CONSTRAINTS;
}
