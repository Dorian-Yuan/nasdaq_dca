import os
import json
import concurrent.futures
from datetime import datetime
import pandas as pd
import requests

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}

WEIGHT_VALUATION = 0.40
WEIGHT_SENTIMENT = 0.30
WEIGHT_TREND = 0.30

# 复用原策略评估逻辑
def evaluate_strategy(bias, pe_percentile, vol_score, vol_name="波动率"):
    if pe_percentile is not None:
        if pe_percentile < 0.7:
            val_score = 2.0 * (1.0 - pe_percentile)
        elif pe_percentile <= 0.8:
            val_score = 6.0 * (0.8 - pe_percentile)
        else:
            val_score = 0.0
    else:
        val_score = 1.0

    if vol_score is not None:
        if vol_score < 20:
            sentiment_score = max(0.0, (vol_score - 10.0) / 10.0)
        else:
            sentiment_score = min(vol_score / 20.0, 2.0)
    else:
        sentiment_score = 1.0

    if bias is not None:
        if bias <= 0:
            trend_score = 0.8
        elif bias <= 0.05:
            trend_score = 0.8 + (bias / 0.05) * 0.4
        elif bias <= 0.10:
            trend_score = 1.2
        elif bias <= 0.20:
            trend_score = 1.2 - ((bias - 0.10) / 0.10) * 1.2
        else:
            trend_score = 0.0
    else:
        trend_score = 1.0

    final_weight = (val_score * WEIGHT_VALUATION) + (sentiment_score * WEIGHT_SENTIMENT) + (trend_score * WEIGHT_TREND)
    final_weight = max(0.0, min(3.0, final_weight))
    
    if final_weight <= 0.4:
        decision = "🔴"
    elif final_weight <= 0.7:
        decision = "🟡"
    else:
        decision = "🟢"
        
    return decision, final_weight

def fetch_yahoo_history(ticker, period="5y"):
    url = f"https://query2.finance.yahoo.com/v8/finance/chart/{ticker}?metrics=high?&interval=1d&range={period}"
    res = requests.get(url, headers=HEADERS)
    data = res.json()
    
    timestamps = data['chart']['result'][0]['timestamp']
    closes = data['chart']['result'][0]['indicators']['quote'][0]['close']
    
    dates = [datetime.fromtimestamp(ts).strftime('%Y-%m-%d') for ts in timestamps]
    
    df = pd.DataFrame({'Date': dates, 'Close': closes})
    df['Date'] = pd.to_datetime(df['Date'])
    df = df.dropna().drop_duplicates(subset=['Date']).sort_values('Date').set_index('Date')
    return df

def fetch_danjuan_pe_history(index_code, period="5y"):
    url = f"https://danjuanapp.com/djapi/index_eva/pe_history/{index_code}?day={period}"
    res = requests.get(url, headers=HEADERS)
    data = res.json()['data']['index_eva_pe_growths']
    
    dates = [datetime.fromtimestamp(item['ts']/1000).strftime('%Y-%m-%d') for item in data]
    pes = [item['pe'] for item in data]
    
    df = pd.DataFrame({'Date': dates, 'PE': pes})
    df['Date'] = pd.to_datetime(df['Date'])
    df = df.dropna().drop_duplicates(subset=['Date']).sort_values('Date').set_index('Date')
    return df

def align_and_calculate_factors(price_df, pe_df, vol_df):
    # Align on price dates
    df = price_df.copy()
    
    # Calculate 200-day moving average and bias
    df['MA200'] = df['Close'].rolling(window=200, min_periods=200).mean()
    df['Bias'] = (df['Close'] - df['MA200']) / df['MA200']
    
    # Join PE and calculate rolling historical percentile (5-year rolling window = roughly 1250 trading days)
    # The Danjuan API only gives us 5 years of PE. To get a historical percentile for any given day,
    # we simulate an expanding or rolling window of past PE values.
    # To have enough data for a meaningful percentile, we evaluate from year 2 onwards.
    pe_reindexed = pe_df.reindex(df.index, method='ffill')
    df['PE'] = pe_reindexed['PE']
    # Expanding percentile: for dot i, what percentage of values from 0 to i are lower than pe[i]?
    def expanding_percentile(s):
        if len(s) < 100: return None # need at least 100 days of PE history to rank
        return (s < s.iloc[-1]).mean()
    
    df['PE_Percentile'] = df['PE'].expanding(min_periods=100).apply(expanding_percentile, raw=False)
    
    # Join Volatility
    vol_reindexed = vol_df.reindex(df.index, method='ffill')
    df['Volatility'] = vol_reindexed['Close']
    
    # Drop rows without MA200 or PE Percentile
    df_clean = df.dropna(subset=['MA200', 'PE_Percentile', 'Volatility', 'Bias']).copy()
    return df_clean

def run_backtest(df, initial_weekly_investment=1000):
    # Resample to weekly execution (e.g., every Monday)
    df_weekly = df.resample('W-MON').first().dropna()
    
    total_invested_naive = 0
    shares_naive = 0
    
    total_invested_dynamic = 0
    shares_dynamic = 0
    
    history_log = []
    
    for date, row in df_weekly.iterrows():
        price = row['Close']
        bias = row['Bias']
        pe_pct = row['PE_Percentile']
        vol = row['Volatility']
        
        decision, weight = evaluate_strategy(bias, pe_pct, vol)
        
        # Naive DCA: $1000 every week unconditionally
        total_invested_naive += initial_weekly_investment
        shares_naive += initial_weekly_investment / price
        
        # Dynamic DCA: Modulate based on decision light
        if decision == "🟢":
            invest_amount = initial_weekly_investment * 2.0
        elif decision == "🟡":
            invest_amount = initial_weekly_investment * 1.0
        else: # 🔴
            invest_amount = 0.0
            
        total_invested_dynamic += invest_amount
        if invest_amount > 0:
            shares_dynamic += invest_amount / price
            
        history_log.append({
            'Date': date.strftime('%Y-%m-%d'),
            'Price': round(price, 2),
            'Decision': decision,
            'Weight': round(weight, 2)
        })

    final_price = df['Close'].iloc[-1]
    
    naive_value = shares_naive * final_price
    naive_return = ((naive_value - total_invested_naive) / total_invested_naive) * 100 if total_invested_naive > 0 else 0
    
    dynamic_value = shares_dynamic * final_price
    dynamic_return = ((dynamic_value - total_invested_dynamic) / total_invested_dynamic) * 100 if total_invested_dynamic > 0 else 0
    
    stats = {
        'Final Price': final_price,
        'Naive Total Invested': total_invested_naive,
        'Naive Final Value': naive_value,
        'Naive Return %': naive_return,
        'Naive Avg Cost': total_invested_naive / shares_naive if shares_naive > 0 else 0,
        
        'Dynamic Total Invested': total_invested_dynamic,
        'Dynamic Final Value': dynamic_value,
        'Dynamic Return %': dynamic_return,
        'Dynamic Avg Cost': total_invested_dynamic / shares_dynamic if shares_dynamic > 0 else 0,
        
        'Alpha (Overperformance %)' : dynamic_return - naive_return
    }
    
    return stats, pd.DataFrame(history_log)

def main():
    print("Initializing Multi-Index 5-Year Backtest...")
    
    configs = {
        "NDX": {"price": "^NDX", "pe": "NDX", "vol": "^VXN"},
        "SP500": {"price": "^GSPC", "pe": "SP500", "vol": "^VIX"}
    }
    
    results = {}
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        fs = {}
        for name, cfg in configs.items():
            fs[f"{name}_price"] = executor.submit(fetch_yahoo_history, cfg['price'], '6y') # Fetch 6y to allow 1yr MA200 warmup
            fs[f"{name}_pe"] = executor.submit(fetch_danjuan_pe_history, cfg['pe'], '5y')
            fs[f"{name}_vol"] = executor.submit(fetch_yahoo_history, cfg['vol'], '6y')
            
        print("Data fetching in progress...")
        
        for name in configs.keys():
            print(f"Aligning and backtesting {name}...")
            price_df = fs[f"{name}_price"].result()
            pe_df = fs[f"{name}_pe"].result()
            vol_df = fs[f"{name}_vol"].result()
            
            clean_df = align_and_calculate_factors(price_df, pe_df, vol_df)
            
            # Start backtest from 2021 to now (giving roughly 3-4 years of pure out-of-sample data)
            backtest_start_date = pd.to_datetime('today') - pd.DateOffset(years=4)
            sim_df = clean_df[clean_df.index >= backtest_start_date].copy()
            
            stats, log_df = run_backtest(sim_df)
            results[name] = stats
            
    # Generate Markdown Report
    report_lines = [
        "# NASDAQ DCA Strategy: 4-Year Backtest Report",
        f"> Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "## Methodology",
        "- **Capital Rules**: Weekly injection of $1000.",
        "- **Naive DCA**: Invests $1000 every Monday unconditionally.",
        "- **Dynamic Strategy**: Invests $2000 on Green 🟢, $1000 on Yellow 🟡, and $0 on Red 🔴.",
        "- **Cost Basis**: Slippage & taxes are excluded.",
        ""
    ]
    
    for name, stats in results.items():
        report_lines.extend([
            f"## {name} Performance Summary",
            f"- **Final Market Price**: {stats['Final Price']:.2f}",
            "",
            "### Naive Constant DCA",
            f"- Total Invested: ${stats['Naive Total Invested']:,.2f}",
            f"- Final Value: ${stats['Naive Final Value']:,.2f}",
            f"- Average Cost Basis: {stats['Naive Avg Cost']:.2f}",
            f"- **Absolute Return**: `{stats['Naive Return %']:.2f}%`",
            "",
            "### Dynamic 3-Factor DCA",
            f"- Total Invested: ${stats['Dynamic Total Invested']:,.2f}",
            f"- Final Value: ${stats['Dynamic Final Value']:,.2f}",
            f"- Average Cost Basis: {stats['Dynamic Avg Cost']:.2f}",
            f"- **Absolute Return**: `{stats['Dynamic Return %']:.2f}%`",
            "",
            "### Conclusion",
            f"The dynamic strategy resulted in a Delta (Alpha) of **{stats['Alpha (Overperformance %)']:.2f}%** compared to naive DCA.",
            "---",
            ""
        ])
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    md_path = os.path.join(project_root, "backtest_report.md")
    
    with open(md_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(report_lines))
        
    print(f"Backtest complete! Report generated at: {md_path}")

if __name__ == "__main__":
    main()
