# Solar planning engine

The engine in this package is deterministic. It does not invent equipment, prices, or a promise of runtime. Product selection happens only from the catalogue passed in by the API. That catalogue is limited to published products, and a product is eligible only when an administrator has verified its specification, it has a price above zero, and stock is available.

## Load

Energy for one appliance, in watt-hours:

`watts × quantity × operating hours × duty cycle`

Daily energy is the sum of those watt-hours. Connected load is the sum of the nameplate watts and ignores duty cycle. Peak coincident load is the highest hour in which appliances marked simultaneous are on together. An appliance marked not simultaneous is compared on its own and is not added to that group.

If daytime and nighttime hours are both supplied, daytime hours start at 07:00 and nighttime hours at 18:00. If the split is missing, hours are placed from 18:00 forward so the backup case is conservative. A duty cycle reduces energy, not the nameplate peak. Only one appliance is assumed to start at a time.

## Battery

For hybrid backup, delivered energy is the energy inside the backup window, starting at 18:00. Critical appliances are used when any appliance is marked critical. Otherwise every appliance is included.

For the independence mode, delivered energy is the full daily energy multiplied by the requested autonomy days, and the array is sized on the worst-month sun figure.

`nominal watt-hours = delivered watt-hours × 1.10 / (depth of discharge × inverter efficiency × 0.95 battery discharge efficiency × 0.90 end-of-life fraction)`

The 10 percent reserve and the 10 percent aging allowance are each applied once. Before a battery is chosen, depth of discharge comes from platform settings (default 80 percent) and inverter efficiency is 90 percent. A selected battery uses its own published depth of discharge, capped near the chemistry default, and the selected inverter’s published efficiency.

Batteries are combined only when the product’s supported-configuration text contains “series” or “parallel”. Nominal voltage must land within 10 percent of the inverter battery voltage. Discharge current must cover `required continuous watts / (bank voltage × inverter efficiency)`.

## Inverter

`required watts = coincident watts × (1 + safety margin)`

The safety margin comes from platform settings and is clamped between 10 and 50 percent. The engine default, when settings are not supplied, is 25 percent.

`required volt-amps = required watts / power factor`

The default power factor is 0.8. A VA rating is never treated as watts. A missing surge rating does not pass the surge check; the configuration is allowed only with a warning that startup current was not confirmed. A published surge below the requirement rejects the inverter.

## Array

`array watts = daytime watt-hours / (direct factor × sun hours) + nighttime watt-hours / (stored factor × sun hours)`

The direct factor is `0.90 temperature × 0.95 soiling × 0.98 wiring × inverter efficiency × 0.97 mismatch`. The stored factor also multiplies `0.95 × 0.95` battery round-trip efficiency. Inverter efficiency is not counted a second time.

Sun hours come from the state table in `solar-resource.ts`. Those values are indicative annual averages for planning, not a site survey and not a weather feed. Southern states use a lower figure than northern states. Worst month is 75 percent of the annual figure in the south, 80 percent in the middle belt, and 85 percent in the north. A customer-supplied peak-sun value replaces the table and is labelled as such. An unknown state uses the platform fallback, otherwise 4.0 hours, and raises a warning.

A panel string is accepted only when cold open-circuit voltage at 15°C cell temperature stays under the inverter maximum, hot maximum-power voltage at 65°C stays inside the MPPT window, and `1.25 × Isc × parallel strings` stays inside the published PV current. Vmp uses the Voc temperature coefficient because a separate Vmp coefficient is not stored. Missing MPPT data rejects the pairing. The array is not chosen from wattage alone.

## Runtime

Battery-only hours divide usable watt-hours by the average load in the backup window. Usable energy applies the published depth of discharge, discharge efficiency, inverter efficiency, and the end-of-life fraction. Daytime solar hours compare estimated array output in the annual case and the worst-month case. These are scenarios, not a guarantee.

## Modes

- Runtime meets the backup duration with the full load.
- Budget keeps a technically valid set only when its equipment total is within the budget. If it is not, noncritical loads are removed from the largest energy user downward. An undersized inverter is not presented as meeting the original load.
- Independence sizes storage for the requested autonomy and sizes the array on the worst-month sun figure. The inverter must be hybrid or off-grid.

## Cost

The engine total is the sum of current catalogue selling prices for the selected quantities. Accessories, installation, delivery, and tax are left empty. The quotation service prices those when a quotation is created. Historical quotations keep the snapshot that was submitted.

## What this does not do

It does not size cables, breakers, earthing, or protection devices. It does not claim a measured yield. It does not recommend a product whose specification is unverified, unpriced, out of stock, or electrically incompatible.
