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

def fetch_yahoo_history(ticker, period="10y"):
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

def fetch_danjuan_pe_history(index_code, period="all"):
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
    
    # Join PE and calculate rolling historical percentile (10-year rolling window = roughly 2500 trading days)
    # Using 'all' from Danjuan to get maximum historical data
    pe_reindexed = pe_df.reindex(df.index, method='ffill')
    df['PE'] = pe_reindexed['PE']
    # Expanding percentile: for dot i, what percentage of values from 0 to i are lower than pe[i]?
    def expanding_percentile(s):
        if len(s) < 100: return None # need at least 100 days of PE history to rank
        
        # Calculate exactly how Danjuan does it: 1 - percentage of historical days below current day
        # Actually our Python code evaluates pe_percentile as: 0 == expensive, 1.0 == cheap
        # wait! Danjuan returns "pe_over_history" which is "higher than X% of history".
        # In fetch_and_calc: 1.0 - pe_over_history.
        # So we need the percentage of historical PEs that are HIGHER than the current PE.
        # Which is exactly: (s >= s.iloc[-1]).mean()
        return (s >= s.iloc[-1]).mean()
    
    df['PE_Percentile'] = df['PE'].expanding(min_periods=100).apply(expanding_percentile, raw=False)
    
    # Join Volatility
    vol_reindexed = vol_df.reindex(df.index, method='ffill')
    df['Volatility'] = vol_reindexed['Close']
    
    # Drop rows without MA200 or PE Percentile
    df_clean = df.dropna(subset=['MA200', 'PE_Percentile', 'Volatility', 'Bias']).copy()
    return df_clean

def export_to_js(results, output_path):
    # Convert dataframes to dictionaries for JSON serialization
    export_data = {}
    for name, df in results.items():
        # df index is Date
        records = []
        for date, row in df.iterrows():
            records.append({
                "date": date.strftime('%Y-%m-%d'),
                "price": round(row['Close'], 2),
                "ma200": round(row['MA200'], 2),
                "bias": round(row['Bias'], 4),
                "pe": round(row['PE'], 4),
                "pe_percentile": round(row['PE_Percentile'], 4),
                "volatility": round(row['Volatility'], 4)
            })
        export_data[name] = records
        
    js_content = f"// Automatically generated by backtest.py\nconst BACKTEST_DATA = {json.dumps(export_data, indent=2)};\nif (typeof window !== 'undefined') {{ window.BACKTEST_DATA = BACKTEST_DATA; }}"
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(js_content)
    
    print(f"Data successfully exported to {output_path}")

def main():
    print("Initializing Data Fetcher for Interactive GUI...")
    
    configs = {
        "NDX": {"price": "^NDX", "pe": "NDX", "vol": "^VXN"},
        "SP500": {"price": "^GSPC", "pe": "SP500", "vol": "^VIX"}
    }
    
    results = {}
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        fs = {}
        for name, cfg in configs.items():
            fs[f"{name}_price"] = executor.submit(fetch_yahoo_history, cfg['price'], '10y')
            fs[f"{name}_pe"] = executor.submit(fetch_danjuan_pe_history, cfg['pe'], 'all')
            fs[f"{name}_vol"] = executor.submit(fetch_yahoo_history, cfg['vol'], '10y')
            
        print("Data fetching in progress...")
        
        for name in configs.keys():
            print(f"Aligning {name} data...")
            price_df = fs[f"{name}_price"].result()
            pe_df = fs[f"{name}_pe"].result()
            vol_df = fs[f"{name}_vol"].result()
            
            clean_df = align_and_calculate_factors(price_df, pe_df, vol_df)
            
            # Start backtest from 2022 to now to ensure stable percentiles
            backtest_start_date = pd.to_datetime('2022-01-01')
            sim_df = clean_df[clean_df.index >= backtest_start_date].copy()
            # Resample to weekly here to reduce JS array size to ~200 items per index
            df_weekly = sim_df.resample('W-MON').first().dropna()
            
            results[name] = df_weekly
            
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    js_path = os.path.join(project_root, "backtest_data.js")
    
    export_to_js(results, js_path)

if __name__ == "__main__":
    main()
