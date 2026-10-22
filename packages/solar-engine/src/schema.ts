import { z } from 'zod';

export const applianceSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    wattage: z.number().positive().max(100000),
    quantity: z.number().int().positive().max(1000),
    hoursPerDay: z.number().positive().max(24),
    dayHours: z.number().min(0).max(11).optional(),
    nightHours: z.number().min(0).max(13).optional(),
    dutyCycle: z.number().gt(0).max(1).optional(),
    critical: z.boolean().optional(),
    simultaneous: z.boolean().optional(),
    surgeWatts: z.number().positive().max(200000).optional(),
    surgeDurationSeconds: z.number().positive().max(60).optional(),
  })
  .superRefine((appliance, context) => {
    const hasDay = appliance.dayHours != null;
    const hasNight = appliance.nightHours != null;
    if (hasDay !== hasNight) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['dayHours'], message: 'Provide both daytime and nighttime hours, or neither.' });
    }
    if (hasDay && hasNight && Math.abs(appliance.dayHours! + appliance.nightHours! - appliance.hoursPerDay) > 0.05) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['hoursPerDay'],
        message: 'Daytime hours plus nighttime hours must equal the operating hours per day.',
      });
    }
    if (appliance.surgeWatts != null && appliance.surgeWatts + 0.001 < appliance.wattage) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['surgeWatts'], message: 'Startup power cannot be below the running wattage.' });
    }
  });

export const calculateInputSchema = z.object({
  appliances: z.array(applianceSchema).min(1).max(100),
  location: z
    .object({
      state: z.string().trim().min(2).max(80).optional(),
      peakSunHours: z.number().min(1).max(12).optional(),
    })
    .optional(),
  systemVoltage: z.number().positive().max(1000).optional(),
  autonomyDays: z.number().min(0.5).max(7).optional(),
});

export const recommendInputSchema = calculateInputSchema.extend({
  preferences: z
    .object({
      budgetNaira: z.number().positive().optional(),
      backupHours: z.number().positive().max(72).optional(),
      gridTied: z.boolean().optional(),
      mode: z.enum(['budget', 'runtime', 'independence']).optional(),
      powerFactor: z.number().gt(0).max(1).optional(),
    })
    .optional(),
});

export type ApplianceInput = z.infer<typeof applianceSchema>;
export type CalculateInput = z.infer<typeof calculateInputSchema>;
export type RecommendInput = z.infer<typeof recommendInputSchema>;
