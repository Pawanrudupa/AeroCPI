# AeroCPI Index Methodology

## Time-Axis: Observation Date (Not Departure Date)

The AeroCPI daily price index is bucketed by **observation date** — the calendar date on which each fare quote was scraped from the web — not by the flight's departure date. This design choice directly aligns with standard CPI methodology:

- **MoSPI CPI Div 07.3** (Passenger transport services) tracks prices at the **time of purchase/observation**, not at the time of future travel.
- By using observation-date bucketing, AeroCPI's monthly rollups can be directly overlaid against MoSPI CPI releases for the same calendar month.

### Advance-Purchase Window

The advance-purchase window (T+7, T+15, T+30) remains a per-quote attribute. It captures how far in advance a traveler would be booking relative to the departure date. This attribute is used for:

- **Elasticity analysis**: Understanding how fares change as departure approaches.
- **Per-window breakdowns**: The heatmap matrix and elasticity curve use this attribute.

However, the window does **not** influence the headline index's time axis. A T+30 quote scraped on September 15 contributes to the September 15 daily index point, not to an October index point.

## GEKS-Törnqvist Multilateral Price Index

The daily index is computed using the **GEKS-Törnqvist** multilateral method:

1. **Bilateral Törnqvist log ratios** are computed between every pair of observation dates, weighted by DGCA passenger traffic shares across the 6 core domestic routes (DEL-BOM, DEL-BLR, BOM-BLR, DEL-CCU, BLR-HYD, MAA-DEL).
2. The **GEKS geometric mean** over all bilateral comparisons ensures transitivity (no chain drift) and base-period invariance.
3. Weekly and monthly series are derived via **geometric mean aggregation** of daily index values.

### Base Period

The index is set to 100.0 on the earliest observation date in the dataset.

## MoSPI CPI Benchmark

AeroCPI is benchmarked against the official **Ministry of Statistics and Programme Implementation (MoSPI) Consumer Price Index, Division 07.3: Passenger transport services** (All-India, Base 2024=100).

- MoSPI CPI data is ingested manually via an admin-only endpoint with strict provenance requirements (source document, publication date, source URL).
- Correlation and tracking error are computed only for months with actual calendar overlap between AeroCPI observation dates and MoSPI publication periods.
- No synthetic or interpolated benchmark values are used.

## Data Provenance

Every fare quote carries an explicit `source_type` flag:
- `live`: Captured via automated web scraping (SerpAPI / Google Flights).
- `seeded`: Calibrated fallback snapshots from known-good historical fare data, used during initial system bootstrapping.

Index points that include any seeded data are flagged with `has_seeded_data = true`.
