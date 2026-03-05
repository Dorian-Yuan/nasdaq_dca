import json
import os
from datetime import datetime, timezone, timedelta
import requests
import concurrent.futures

# ---------------------------------------------------------
# 配置参数区
# ---------------------------------------------------------

# 模型二维度权重配置
WEIGHT_VALUATION = 0.40  # 估值权重
WEIGHT_SENTIMENT = 0.30  # 情绪权重
WEIGHT_TREND = 0.30      # 趋势权重

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
        daily_return_str = None
        if tencent_res.status_code == 200 and "~" in tencent_res.text:
            parts = tencent_res.text.split("~")
            if len(parts) > 32:
                daily_return_str = parts[32]
        daily_return_tencent = float(daily_return_str) / 100.0 if daily_return_str else None

        # 第二步：获取过去 1 年的历史折线以计算 MA200 和 乖离率
        url_1y = f"https://query2.finance.yahoo.com/v8/finance/chart/{price_ticker}?metrics=high?&interval=1d&range=1y"
        res_1y = requests.get(url_1y, headers=HEADERS, timeout=10)
        data_1y = res_1y.json()
        
        meta = data_1y['chart']['result'][0]['meta']
        close_prices = data_1y['chart']['result'][0]['indicators']['quote'][0]['close']
        valid_prices = [p for p in close_prices if p is not None]
        
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
        
        if daily_return is None:
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
                        pe_percentile = 1.0 - float(data["data"]["pe_over_history"])
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

def evaluate_strategy(bias, pe_percentile, vol_score, vol_name="波动率"):
    """
    模型二：「估值-情绪-趋势」三维综合打分系统
    """
    reasons = []
    
    # 1. 估值因子 (Weight: 40%)
    # PE分位 < 70%：2.0 * (1.0 - pe_percentile)
    # PE分位 70%~80%：6.0 * (0.8 - pe_percentile)，加速平滑滑落至0
    # PE分位 > 80%：0.0 提前彻底剥夺加权
    if pe_percentile is not None:
        if pe_percentile < 0.7:
            val_score = 2.0 * (1.0 - pe_percentile)
        elif pe_percentile <= 0.8:
            val_score = 6.0 * (0.8 - pe_percentile)
        else:
            val_score = 0.0
        reasons.append(f"估值因子得分: {val_score:.2f} (PE分位 {pe_percentile*100:.1f}%)")
    else:
        val_score = 1.0
        reasons.append("估值数据缺失，由于防御性给予默认得分 1.0")

    # 2. 情绪因子 (Weight: 30%)
    # vol < 20时：(vol-10)/10.0，限制最小为0
    # vol >= 20时：min(vol/20.0, 2.0)
    if vol_score is not None:
        if vol_score < 20:
            sentiment_score = max(0.0, (vol_score - 10.0) / 10.0)
        else:
            sentiment_score = min(vol_score / 20.0, 2.0)
        reasons.append(f"情绪因子得分: {sentiment_score:.2f} ({vol_name} {vol_score:.2f})")
    else:
        sentiment_score = 1.0
        reasons.append("情绪数据缺失，给予默认得分 1.0")

    # 3. 趋势因子 (Weight: 30%)
    # 连续五段分段插值法
    if bias is not None:
        if bias <= 0:
            trend_score = 0.8
            reasons.append(f"趋势因子得分: {trend_score:.2f} (防守区，乖离率 {bias*100:.1f}%)")
        elif bias <= 0.05:
            trend_score = 0.8 + (bias / 0.05) * 0.4
            reasons.append(f"趋势因子得分: {trend_score:.2f} (上攻过渡区，乖离率 {bias*100:.1f}%)")
        elif bias <= 0.10:
            trend_score = 1.2
            reasons.append(f"趋势因子得分: {trend_score:.2f} (多头甜点区，乖离率 {bias*100:.1f}%)")
        elif bias <= 0.20:
            trend_score = 1.2 - ((bias - 0.10) / 0.10) * 1.2
            reasons.append(f"趋势因子得分: {trend_score:.2f} (超买滑坡区，乖离率 {bias*100:.1f}%)")
        else:
            trend_score = 0.0
            reasons.append(f"趋势因子得分: {trend_score:.2f} (极度泡沫区，乖离率 {bias*100:.1f}%)")
    else:
        trend_score = 1.0
        reasons.append("均线数据缺失，给予默认得分 1.0")

    # 计算综合加权系数
    final_weight = (val_score * WEIGHT_VALUATION) + (sentiment_score * WEIGHT_SENTIMENT) + (trend_score * WEIGHT_TREND)
    
    # 限制极值边界
    final_weight = max(0.0, min(3.0, final_weight))
    
    # 根据用户定义：红灯[0,0.4]，黄灯(0.4,0.7]，绿灯(0.7,+∞)
    if final_weight <= 0.4:
        decision = "🔴"
    elif final_weight <= 0.7:
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
    
    # 调整总体的 reasons 加入一条总结
    reasons.append(f"综合计算权重: {final_weight:.2f}倍")
    
    return decision, reasons, individual_decisions


def main():
    INDICES = {
        "NDX": {
            "price_ticker": "%5ENDX",
            "tencent_ticker": "us.NDX",
            "pe_code": "NDX",
            "vol_ticker": "%5EVXN",
            "vol_name": "VXN"
        },
        "SP500": {
            "price_ticker": "%5EGSPC",
            "tencent_ticker": "us.INX",
            "pe_code": "SP500",
            "vol_ticker": "%5EVIX",
            "vol_name": "VIX"
        }
    }
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    json_path = os.path.join(project_root, "data.json")
    
    # 1. 初始化多标的数据结构并尝试读取旧数据
    result_data = {
        "NDX": {"latest": {}, "history": []},
        "SP500": {"latest": {}, "history": []}
    }
    if os.path.exists(json_path):
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                old_data = json.load(f)
                # 兼容性检查：如果是新版本结构则直接继承
                if "NDX" in old_data and "history" in old_data["NDX"]:
                    result_data["NDX"]["history"] = old_data["NDX"]["history"]
                elif "QQQ" in old_data and "history" in old_data["QQQ"]:
                    result_data["NDX"]["history"] = old_data["QQQ"]["history"]
                    
                if "SP500" in old_data and "history" in old_data["SP500"]:
                    result_data["SP500"]["history"] = old_data["SP500"]["history"]
                elif "SPY" in old_data and "history" in old_data["SPY"]:
                    result_data["SP500"]["history"] = old_data["SPY"]["history"]
        except Exception as e:
            print(f"读取旧版 data.json 失败，将重新生成: {e}")

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
        
        decision, reasons, individual_decisions = evaluate_strategy(bias, pe_percentile, vol_score, config["vol_name"])
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
        
        # 组装 history entry并追加 (如果同一天重复执行则覆盖当天数据)
        new_hist_entry = {
            "date": date_str,
            "decision": decision,
            "weight": individual_decisions.get("final_weight", 0),
            "price": metrics["price"],
            "pe_percentile": metrics["pe_percentile"],
            "bias_percent": metrics["bias_percent"],
            "volatility": metrics["volatility"]
        }
        
        history = result_data[name]["history"]
        if len(history) > 0 and history[-1]["date"] == date_str:
            history[-1] = new_hist_entry
        else:
            history.append(new_hist_entry)
            
        # 限制历史天数防膨胀 (保留过去365天)
        if len(history) > 365:
            result_data[name]["history"] = history[-365:]
            
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
                "icon": "https://raw.githubusercontent.com/Dorian-Yuan/nasdaq_dca/main/icon.png",
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
