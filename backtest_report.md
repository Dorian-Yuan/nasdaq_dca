# NASDAQ DCA Strategy: 5-Year High-Fidelity Backtest Report
> Generated on: 2026-03-05 22:15:22

## Methodology
- **Capital Rules**: Base weekly injection of $1000.
- **Naive DCA**: Invests exactly $1000 every Monday unconditionally.
- **Dynamic Strategy**: Invests strictly based on the continuous model multiplier ($1000 * Weight).
- **Historical Data Scope**: 10 Years fetched to provide perfectly aligned 5-year rolling percentiles. Testing on latest 5 years.
- **Cost Basis**: Slippage & taxes are excluded.

## NDX Performance Summary
- **Backtest Horizon**: 2022-03-07 to 2026-03-09 (210 weeks)
- **Final Market Price**: 25093.68

### Naive Constant DCA
- Total Invested: $210,000.00
- Final Value: $320,636.64
- Average Cost Basis: 16435.03
- **Absolute Return**: `52.68%`

### Dynamic 3-Factor DCA
- Total Invested: $241,514.55
- Final Value: $358,049.04
- Average Cost Basis: 16926.42
- **Absolute Return**: `48.25%`

### Conclusion
The dynamic strategy resulted in a Delta (Alpha) of **-4.43%** compared to naive DCA.
---

## SP500 Performance Summary
- **Backtest Horizon**: 2022-03-07 to 2026-03-09 (210 weeks)
- **Final Market Price**: 6869.50

### Naive Constant DCA
- Total Invested: $210,000.00
- Final Value: $293,274.81
- Average Cost Basis: 4918.92
- **Absolute Return**: `39.65%`

### Dynamic 3-Factor DCA
- Total Invested: $213,110.85
- Final Value: $285,894.41
- Average Cost Basis: 5120.65
- **Absolute Return**: `34.15%`

### Conclusion
The dynamic strategy resulted in a Delta (Alpha) of **-5.50%** compared to naive DCA.
---
