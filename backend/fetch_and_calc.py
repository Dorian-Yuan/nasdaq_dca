import json
import os
from datetime import datetime, timezone, timedelta
import requests
import concurrent.futures

# ---------------------------------------------------------
# 配置参数区
# ---------------------------------------------------------

# ---------------------------------------------------------
# 配置参数区
# ---------------------------------------------------------

# 请注意：因子权重已改为每个指数独立配置（Style-Tilted Weighting），见 INDICES。

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

# ---------------------------------------------------------
# 数据获取函数
# ---------------------------------------------------------

def fetch_price_and_bias(price_ticker, tencent_ticker):
    """
    使用 Yahoo Finance 价格历史和腾讯行情 API 获取精确价格及 200 日均线乖离率
    优先使用 Yahoo Finance 数据计算当日涨跌幅 (当前价/昨日收盘价 - 1)
    如果 Yahoo 无法返回涨跌数据，备选使用腾讯官方接口
    """
    try:
        # 第一步：从腾讯调用权威行情接口作为备选
        tencent_url = f"http://qt.gtimg.cn/q={tencent_ticker}"
        tencent_res = requests.get(tencent_url, headers=HEADERS, timeout=10)
        daily_return_tencent = None
        if tencent_res.status_code == 200 and "~" in tencent_res.text:
            parts = tencent_res.text.split("~")
            # 腾讯美股接口: parts[33] 通常是百分比涨跌幅 (如 1.23 表示 1.23%)
            if len(parts) > 33:
                try:
                    daily_return_tencent = float(parts[33]) / 100.0
                except ValueError:
                    pass

        # 第二步：获取过去 1 年的历史折线以计算 MA200 和 乖离率
        url_1y = f"https://query2.finance.yahoo.com/v8/finance/chart/{price_ticker}?metrics=high?&interval=1d&range=1y"
        res_1y = requests.get(url_1y, headers=HEADERS, timeout=10)
        data_1y = res_1y.json()
        
        meta = data_1y['chart']['result'][0]['meta']
        timestamps = data_1y['chart']['result'][0].get('timestamp', [])
        close_prices = data_1y['chart']['result'][0]['indicators']['quote'][0]['close']
        
        # 将价格映射到日期（确保即使同一天有多个点，也只保留最新的）
        # Yahoo 有时会在收盘后多出一个数据点，导致简单的 valid_prices[-1] == valid_prices[-2]
        daily_prices = {}
        for ts, p in zip(timestamps, close_prices):
            if p is not None:
                # 使用 UTC 日期进行分组
                dt_str = datetime.fromtimestamp(ts, timezone.utc).strftime('%Y-%m-%d')
                daily_prices[dt_str] = p
        
        sorted_dates = sorted(daily_prices.keys())
        valid_prices = [daily_prices[d] for d in sorted_dates]
        
        daily_return = None
        current_price = valid_prices[-1] if valid_prices else None
        
        if 'regularMarketPrice' in meta and 'regularMarketPreviousClose' in meta:
            mrkt_price = meta['regularMarketPrice']
            prev_close = meta['regularMarketPreviousClose']
            if prev_close and prev_close > 0:
                daily_return = (mrkt_price - prev_close) / prev_close
                current_price = mrkt_price
        elif len(valid_prices) >= 2:
            prev_close = valid_prices[-2]
            if prev_close and prev_close > 0:
                daily_return = (current_price - prev_close) / prev_close
        
        # 如果 Yahoo 的 daily_return 为 0 (可能还是因为各种原因)，
        # 且 Tencent 有数据，可以考虑优先用 Tencent，或者至少兜底
        if (daily_return is None or daily_return == 0) and daily_return_tencent is not None:
            daily_return = daily_return_tencent
        
        if not valid_prices or len(valid_prices) < 200:
            print(f"警告：获取到的 {price_ticker} 价格历史不足 200 天，无法准确计算 MA200")
            return current_price, None, None, daily_return
            
        ma200_prices = valid_prices[-200:]
        ma200 = sum(ma200_prices) / len(ma200_prices)
        
        bias = (current_price - ma200) / ma200 if current_price and ma200 else None
        
        return current_price, ma200, bias, daily_return
    except Exception as e:
        print(f"获取 {price_ticker} 官方行情数据失败: {e}")
        return None, None, None, None


def fetch_pe_from_danjuan(index_code):
    """
    从雪球/蛋卷基金 API 获取对应指数的实时估值（PE 及百分位）
    """
    try:
        url = f"https://danjuanapp.com/djapi/index_eva/detail/{index_code}"
        # 增加重试机制和更长的超时时间
        for attempt in range(3):
            try:
                response = requests.get(url, headers=HEADERS, timeout=15)
                if response.status_code == 200:
                    data = response.json()
                    if data.get("result_code") == 0 and "pe" in data["data"]:
                        pe = float(data["data"]["pe"])
                        # 蛋卷的 pe_over_history 若为 0.3308，表示“比过去33.08%的时间低”，即实际处于 66.92% 的历史分位
                        # 蛋卷 pe_over_history: 越大=越低估(便宜), 越小=越高估(昂贵)
                        # 与回测 (historical >= current).mean() 一致, 直接使用
                        pe_percentile = float(data["data"]["pe_over_history"])
                        return pe, pe_percentile
                    else:
                        print(f"蛋卷 API 响应格式异常或未包含 {index_code} PE 数据")
                        return None, None
                else:
                    print(f"尝试 {attempt+1}: 请求失败，状态码 {response.status_code}")
            except requests.exceptions.RequestException as e:
                print(f"尝试 {attempt+1}: 请求异常 {e}")
        return None, None
    except Exception as e:
        print(f"获取 {index_code} PE 失败: {e}")
        return None, None


def fetch_volatility(ticker):
    """
    使用 Yahoo Finance 获取波动率指数 (如 ^VXN 或 ^VIX)
    """
    try:
        url = f"https://query2.finance.yahoo.com/v8/finance/chart/{ticker}?metrics=high?&interval=1d&range=5d"
        response = requests.get(url, headers=HEADERS, timeout=10)
        data = response.json()
        
        close_prices = data['chart']['result'][0]['indicators']['quote'][0]['close']
        valid_prices = [p for p in close_prices if p is not None]
        
        if not valid_prices:
            print(f"警告：获取到的 {ticker} 价格数据为空")
            return None
            
        current_vol = valid_prices[-1]
        return current_vol
    except Exception as e:
        print(f"获取 {ticker} 失败: {e}")
        return None


# ---------------------------------------------------------
# 评估逻辑与主函数
# ---------------------------------------------------------

def evaluate_strategy(symbol, bias, pe_percentile, vol_score, vol_name="波动率"):
    """
    使用 Node.js 动态执行 strategy_models.js 中激活的策略
    """
    import subprocess
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    models_path = os.path.join(project_root, "web", "js", "strategy_models.js")
    
    # 构造并执行 JS 代码
    js_runner = f"""
const fs = require('fs');
const code = fs.readFileSync('{models_path.replace(os.sep, '/')}');
const window = {{}};
eval(code.toString('utf-8'));
const activeId = window.ACTIVE_MODELS['{symbol}'];
const model = window.STRATEGY_MODELS['{symbol}'][activeId];

const x_pe = {pe_percentile if pe_percentile is not None else 'null'};
const x_vxn = {vol_score if vol_score is not None else 'null'};
const x_bias = {bias if bias is not None else 'null'};

let pe_score = 1.0;
if (x_pe !== null) {{
    try {{ pe_score = (new Function('x', model.formula_pe))(x_pe); }} catch(e) {{}}
}}

let vxn_score = 1.0;
if (x_vxn !== null) {{
    try {{ vxn_score = (new Function('x', model.formula_vxn))(x_vxn); }} catch(e) {{}}
}}

let bias_score = 1.0;
if (x_bias !== null) {{
    try {{ bias_score = (new Function('x', model.formula_bias))(x_bias); }} catch(e) {{}}
}}

let w_pe = model.weights.pe;
let w_vxn = model.weights.vxn;
let w_bias = model.weights.bias;

let total_w = w_pe + w_vxn + w_bias;
let final_weight = total_w > 0 ? (pe_score * w_pe + vxn_score * w_vxn + bias_score * w_bias) / total_w : 1.0;

// 获取全局阈值配置 (后端适配)
const config = window.GLOBAL_CONFIG || {{ threshold_red: 0.4, threshold_green: 0.7 }};

console.log(JSON.stringify({{
    model_name: model.name,
    pe_score: pe_score,
    vxn_score: vxn_score,
    bias_score: bias_score,
    final_weight: final_weight,
    thresholds: config
}}));
"""
    reasons = []
    
    try:
        res = subprocess.run(["node", "-e", js_runner], capture_output=True, text=True, check=True, encoding='utf-8')
        result = json.loads(res.stdout)
        
        val_score = result['pe_score']
        sentiment_score = result['vxn_score']
        trend_score = result['bias_score']
        final_weight = result['final_weight']
        model_name = result['model_name']
        thresholds = result.get('thresholds', {'threshold_red': 0.4, 'threshold_green': 0.7})
        
        reasons.append(f"使用动态策略模型: {model_name}")
        if pe_percentile is not None:
            reasons.append(f"估值因子得分: {val_score:.2f} (PE分位 {pe_percentile*100:.1f}%)")
        else:
            reasons.append("估值数据缺失，给予默认得分 1.0")
            
        if vol_score is not None:
            reasons.append(f"情绪因子得分: {sentiment_score:.2f} ({vol_name} {vol_score:.2f})")
        else:
            reasons.append("情绪数据缺失，给予默认得分 1.0")
            
        if bias is not None:
            reasons.append(f"趋势因子得分: {trend_score:.2f} (乖离率 {bias*100:.1f}%)")
        else:
            reasons.append("均线数据缺失，给予默认得分 1.0")
            
    except Exception as e:
        print(f"动态策略执行失败，回退到默认分值 1.0: {e}")
        val_score = sentiment_score = trend_score = final_weight = 1.0
        thresholds = {'threshold_red': 0.4, 'threshold_green': 0.7}
        reasons.append("策略执行失败，使用默认 1.0 倍权重")

    # 限制极值边界
    final_weight = max(0.0, min(3.0, final_weight))
    
    # 动态阈值判定
    t_red = float(thresholds['threshold_red'])
    t_green = float(thresholds['threshold_green'])
    
    if final_weight <= t_red:
        decision = "🔴"
    elif final_weight <= t_green:
        decision = "🟡"
    else:
        decision = "🟢"
        
    # 保存单个指标的判断结果，供前端展示倍数
    individual_decisions = {
        "bias_decision": f"{trend_score:.2f}x",
        "pe_decision": f"{val_score:.2f}x",
        "vol_decision": f"{sentiment_score:.2f}x",
        "final_weight": round(final_weight, 2)
    }
    
    reasons.append(f"综合计算权重: {final_weight:.2f}倍")
    
    return decision, reasons, individual_decisions


def main():
    INDICES = {
        "NDX": {
            "price_ticker": "%5ENDX",
            "tencent_ticker": "us.NDX",
            "pe_code": "NDX",
            "vol_ticker": "%5EVXN",
            "vol_name": "VXN",
            "weights": {"val": 3.0, "sent": 3.0, "trend": 4.0} # 偏向趋势跟踪
        },
        "SP500": {
            "price_ticker": "%5EGSPC",
            "tencent_ticker": "us.INX",
            "pe_code": "SP500",
            "vol_ticker": "%5EVIX",
            "vol_name": "VIX",
            "weights": {"val": 4.0, "sent": 3.0, "trend": 3.0} # 偏向价值估值
        }
    }
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    json_path = os.path.join(project_root, "data", "data.json")
    
    # 1. 初始化多标的数据结构
    result_data = {
        "NDX": {"latest": {}},
        "SP500": {"latest": {}}
    }

    # 获取北京时间作为时间戳
    beijing_tz = timezone(timedelta(hours=8))
    now = datetime.now(beijing_tz)
    bj_time_str = now.strftime("%Y-%m-%d %H:%M:%S")
    date_str = now.strftime("%Y-%m-%d")

    bark_messages = []

    # 2. 遍历两大宽基指数进行计算
    for name, config in INDICES.items():
        print(f"\n=========================================")
        print(f"开始获取核心指标: {name}")
        print(f"=========================================")
        
        # 使用并发执行 API 请求以降低耗时
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            future_price = executor.submit(fetch_price_and_bias, config["price_ticker"], config["tencent_ticker"])
            future_pe = executor.submit(fetch_pe_from_danjuan, config["pe_code"])
            future_vol = executor.submit(fetch_volatility, config["vol_ticker"])
            
            # 收集结果
            current_price, ma200, bias, daily_return = future_price.result()
            pe, pe_percentile = future_pe.result()
            vol_score = future_vol.result()
            
        print(f"-> {name} 价格: {current_price}, MA200: {ma200}, 乖离率: {bias}, 相对涨跌幅: {daily_return}")
        print(f"-> {config['pe_code']} PE: {pe}, 历史百分位: {pe_percentile}")
        print(f"-> 市场情緖: {config['vol_name']} = {vol_score}")
        
        decision, reasons, individual_decisions = evaluate_strategy(name, bias, pe_percentile, vol_score, config["vol_name"])
        print(f"\n=> 最终建议: {decision}")
        
        metrics = {
            "price": round(current_price, 2) if current_price else None,
            "ma200": round(ma200, 2) if ma200 else None,
            "bias_percent": round(bias * 100, 2) if bias else None,
            "daily_return_percent": round(daily_return * 100, 2) if daily_return is not None else None,
            "pe": pe,
            "pe_percentile": pe_percentile,
            "volatility": round(vol_score, 2) if vol_score else None,
            "vol_name": config["vol_name"]
        }
        
        latest_obj = {
            "update_time": bj_time_str,
            "decision": decision,
            "reasons": reasons,
            "individual_decisions": individual_decisions,
            "metrics": metrics
        }
        
        # 更新 latest 字段
        result_data[name]["latest"] = latest_obj
        
        # 整理推送信息
        cn_name = {"NDX": "纳斯达克100", "SP500": "标普500"}.get(name, name)
        if metrics['price'] and metrics['pe_percentile'] is not None:
            bark_messages.append(f"{cn_name}：{decision} {individual_decisions['final_weight']}× | PE {metrics['pe_percentile']*100:.1f}％ | 乖离 {metrics['bias_percent']}％ | {config['vol_name']} {metrics['volatility']}；")

    # 3. 写入跨标的数据 JSON 文件
    try:
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(result_data, f, ensure_ascii=False, indent=2)
        print(f"\n成功生成多标的行情评估文件: {json_path}")
    except Exception as e:
        print(f"写入文件失败: {e}")

    # 4. 发送 Bark 推送 (如果有多个标的则发送聚合消息)
    bark_key = os.environ.get("BARK_KEY")
    if bark_key:
        print("\n检测到 BARK_KEY，正在发送合并推送...")
        try:
            title = "指数定投评估"
            body = "\n".join(bark_messages)
            
            bark_url = f"https://api.day.app/{bark_key}/"
            payload = {
                "title": title,
                "body": body,
                "icon": "https://raw.githubusercontent.com/Dorian-Yuan/nasdaq_dca/main/icon2.png",
                "group": "US_INDEX",
                "sound": "minuet"
            }
            # 如果任何一个标的出现绿灯，就用高音
            if "🟢" in body:
                payload["sound"] = "alarm"
            elif "🔴" in body:
                payload["sound"] = "fail"
                
            response = requests.post(bark_url, json=payload, timeout=10)
            if response.status_code == 200:
                print("Bark 推送成功！")
            else:
                print(f"Bark 推送失败: {response.status_code}")
        except Exception as e:
            print(f"发送 Bark 推送异常: {e}")
    else:
        print("\n未配置 BARK_KEY 环境变量，跳过消息推送。")


if __name__ == "__main__":
    main()
