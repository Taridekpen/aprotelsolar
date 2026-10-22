export type ApplianceDefinition = {
  name: string;
  category: string;
  wattage: number;
  wattageRange: [number, number];
  surgeWatts: number | null;
  dutyCycle: number | null;
  usage: string;
};

/** Editable planning defaults. Nameplate ratings replace these estimates. */
export const APPLIANCE_CATALOGUE: ApplianceDefinition[] = [
  { name: 'Television', category: 'entertainment', wattage: 80, wattageRange: [30, 200], surgeWatts: null, dutyCycle: null, usage: 'Runs near its nameplate while it is switched on.' },
  { name: 'Refrigerator', category: 'cooling', wattage: 150, wattageRange: [80, 300], surgeWatts: 600, dutyCycle: 0.35, usage: 'Compressor cycles. The 35% duty cycle is an estimate, not a measured cycle.' },
  { name: 'Freezer', category: 'cooling', wattage: 200, wattageRange: [100, 400], surgeWatts: 800, dutyCycle: 0.4, usage: 'Compressor cycles. The 40% duty cycle is an estimate.' },
  { name: 'Air conditioner', category: 'cooling', wattage: 1200, wattageRange: [700, 2500], surgeWatts: 3600, dutyCycle: null, usage: 'Use the cooling input watts, not the cooling capacity in British thermal units.' },
  { name: 'Fan', category: 'comfort', wattage: 70, wattageRange: [30, 120], surgeWatts: null, dutyCycle: null, usage: 'Pedestal or ceiling fan at a typical speed.' },
  { name: 'LED light', category: 'lighting', wattage: 12, wattageRange: [5, 25], surgeWatts: null, dutyCycle: null, usage: 'One lamp, not a whole room of fittings.' },
  { name: 'Computer', category: 'office', wattage: 200, wattageRange: [80, 500], surgeWatts: null, dutyCycle: null, usage: 'Desktop computer without a large workstation load.' },
  { name: 'Laptop', category: 'office', wattage: 60, wattageRange: [30, 150], surgeWatts: null, dutyCycle: null, usage: 'Charger input while the laptop is in use.' },
  { name: 'Washing machine', category: 'laundry', wattage: 500, wattageRange: [300, 2000], surgeWatts: 1000, dutyCycle: null, usage: 'Motor load. Heating cycles are much higher and should be entered from the nameplate.' },
  { name: 'Water pump', category: 'water', wattage: 750, wattageRange: [200, 2200], surgeWatts: 2250, dutyCycle: null, usage: 'Motor starting current is often several times the running load.' },
  { name: 'Microwave', category: 'kitchen', wattage: 1000, wattageRange: [600, 1800], surgeWatts: null, dutyCycle: null, usage: 'Input power, which is higher than the cooking power printed on the door.' },
  { name: 'Electric cooker', category: 'kitchen', wattage: 1500, wattageRange: [800, 5000], surgeWatts: null, dutyCycle: null, usage: 'One hotplate or a small cooker. A full oven must be entered from its nameplate.' },
  { name: 'Router', category: 'network', wattage: 12, wattageRange: [6, 30], surgeWatts: null, dutyCycle: null, usage: 'Small network device left running.' },
];
