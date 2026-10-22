import { DEFAULT_INVERTER_SAFETY_MARGIN, DEFAULT_POWER_FACTOR } from './assumptions.js';

export function inverterRequirement(peakW: number, surgeW: number, powerFactor: number, safetyMargin: number) {
  const margin = Number.isFinite(safetyMargin) ? safetyMargin : DEFAULT_INVERTER_SAFETY_MARGIN;
  const factor = Number.isFinite(powerFactor) && powerFactor > 0 ? powerFactor : DEFAULT_POWER_FACTOR;
  const requiredContinuousW = peakW * (1 + margin);
  return {
    requiredContinuousW,
    requiredSurgeW: Math.max(surgeW, requiredContinuousW),
    requiredVa: requiredContinuousW / factor,
    powerFactor: factor,
    safetyMarginFraction: margin,
  };
}
