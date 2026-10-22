export type EquipmentRole = 'solar_panel' | 'battery' | 'inverter';

export type CatalogueItem = {
  id: string;
  slug: string;
  name: string;
  sku: string;
  brand: string;
  profile: EquipmentRole;
  sellingPriceNaira: number;
  inventoryQuantity: number;
  warranty: string;
  imageId?: string | null;
  specificationsVerified: boolean;
  specifications: Record<string, unknown>;
  branches?: Array<{ branchId: string; branchName: string; available: number }>;
};

export type EngineOptions = {
  /** Fraction added to continuous inverter demand. Clamped to 0.10–0.50. */
  safetyMarginFraction?: number;
  /** Used only when neither a known state nor a customer peak-sun figure is available. */
  fallbackPeakSunHours?: number;
  /** Generic depth of discharge used before a verified battery chemistry is chosen. */
  genericDod?: number;
};

export type Assumption = { id: string; text: string };
export type DesignWarning = { id: string; message: string };

export type RecommendedProduct = {
  role: EquipmentRole;
  id: string;
  slug: string;
  name: string;
  sku: string;
  brand: string;
  quantity: number;
  unitPriceNaira: number;
  lineTotalNaira: number;
  warranty: string;
  imageId: string | null;
  reason: string;
};

export type RuntimeScenario = {
  id: string;
  title: string;
  estimatedHours: number | null;
  lowHours: number | null;
  highHours: number | null;
  detail: string;
};

export type SystemConfiguration = {
  id: 'lower_cost' | 'balanced' | 'higher_capacity' | 'budget_reduced';
  label: string;
  covers: 'full_load' | 'reduced_load';
  omittedAppliances: string[];
  products: RecommendedProduct[];
  inverterContinuousW: number;
  batteryNominalWh: number;
  batteryUsableWh: number;
  pvArrayW: number;
  panelCount: number;
  seriesCount: number | null;
  parallelCount: number | null;
  equipmentCostNaira: number;
  runtime: RuntimeScenario[];
  reasons: string[];
  warnings: string[];
};

export type SolarDesign = {
  mode: 'budget' | 'runtime' | 'independence';
  load: {
    connectedLoadW: number;
    dailyEnergyWh: number;
    dailyEnergyKwh: number;
    daytimeEnergyWh: number;
    nighttimeEnergyWh: number;
    criticalEnergyWh: number;
    noncriticalEnergyWh: number;
    peakSimultaneousW: number;
    surgeDemandW: number;
    averageBackupW: number;
  };
  battery: {
    deliveredEnergyWh: number;
    nominalEnergyWh: number;
    depthOfDischarge: number;
    inverterEfficiency: number;
    dischargeEfficiency: number;
    reserveFraction: number;
    endOfLifeFraction: number;
    backupHours: number;
    autonomyDays: number;
  };
  inverter: {
    requiredContinuousW: number;
    requiredSurgeW: number;
    requiredVa: number;
    powerFactor: number;
    safetyMarginFraction: number;
  };
  pv: {
    requiredArrayW: number;
    annualPeakSunHours: number;
    sizingPeakSunHours: number;
    worstMonthPeakSunHours: number;
    solarResource: string;
    performanceFactorDirect: number;
    performanceFactorStored: number;
  };
  runtime: RuntimeScenario[];
  recommendations: SystemConfiguration[];
  selected: SystemConfiguration | null;
  alternatives: SystemConfiguration[];
  unmet: { message: string; equipmentCostNaira: number | null } | null;
  cost: {
    equipmentNaira: number | null;
    accessoriesNaira: null;
    installationNaira: null;
    deliveryNaira: null;
    taxNaira: null;
    totalNaira: number | null;
    provisional: true;
    note: string;
  };
  assumptions: Assumption[];
  warnings: DesignWarning[];
  engineeringApprovalRequired: true;
  narrative: string[];
};
