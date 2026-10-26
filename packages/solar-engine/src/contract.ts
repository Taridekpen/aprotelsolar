import { buildDesign } from './design.js';
import { calculateInputSchema, recommendInputSchema, type CalculateInput, type RecommendInput } from './schema.js';
import type { CatalogueItem, EngineOptions, SolarDesign } from './types.js';

export const ENGINE_PHASE = 4 as const;
export const ENGINE_VERSION = '1.0.0';

export interface EngineResult<TInput> {
  status: 'designed' | 'requirements_only';
  enginePhase: typeof ENGINE_PHASE;
  engineVersion: typeof ENGINE_VERSION;
  message: string;
  design: SolarDesign;
  validatedInput: TInput;
}

const CALCULATE_MESSAGE =
  'Load, battery, inverter, and array requirements are calculated from the submitted appliances. This response does not select products and is not a performance guarantee.';

const DESIGNED_MESSAGE =
  'A compatible equipment set was found among published catalogue products. The prices are catalogue equipment prices. Installation is not approved until an engineer reviews the quotation.';

const REQUIREMENTS_MESSAGE =
  'The electrical requirement is calculated. No published panel, battery, and inverter combination passed the compatibility checks, so no equipment is recommended.';

export function calculateEnergyRequirements(input: CalculateInput, options?: EngineOptions): EngineResult<CalculateInput> {
  const validatedInput = calculateInputSchema.parse(input);
  const design = buildDesign(validatedInput, [], options);
  return {
    status: 'requirements_only',
    enginePhase: ENGINE_PHASE,
    engineVersion: ENGINE_VERSION,
    message: CALCULATE_MESSAGE,
    design,
    validatedInput,
  };
}

export function recommendSystem(input: RecommendInput, catalogue: CatalogueItem[] = [], options?: EngineOptions): EngineResult<RecommendInput> {
  const validatedInput = recommendInputSchema.parse(input);
  const design = buildDesign(validatedInput, catalogue, options);
  const designed = design.selected != null;
  return {
    status: designed ? 'designed' : 'requirements_only',
    enginePhase: ENGINE_PHASE,
    engineVersion: ENGINE_VERSION,
    message: designed ? DESIGNED_MESSAGE : REQUIREMENTS_MESSAGE,
    design,
    validatedInput,
  };
}
