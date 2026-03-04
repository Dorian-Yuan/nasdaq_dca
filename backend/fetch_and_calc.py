import json
import os
from datetime import datetime, timezone, timedelta
import requests

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

def fetch_qqq_price_and_bias():
    """
    使用 Yahoo Finance Chart API 获取 QQQ 当前价格及 200 日均线乖离率
    """
    try:
        url = "https://query2.finance.yahoo.com/v8/finance/chart/QQQ?metrics=high?&interval=1d&range=1y"
        response = requests.get(url, headers=HEADERS, timeout=10)
        data = response.json()
        
        close_prices = data['chart']['result'][0]['indicators']['quote'][0]['close']
        valid_prices = [p for p in close_prices if p is not None]
        
        if not valid_prices or len(valid_prices) < 200:
            print("警告：获取到的 QQQ 价格数据不足 200 天，无法准确计算 MA200")
            return None, None, None
            
        current_price = valid_prices[-1]
        ma200_prices = valid_prices[-200:]
        ma200 = sum(ma200_prices) / len(ma200_prices)
        bias = (current_price - ma200) / ma200
        
        return current_price, ma200, bias
    except Exception as e:
        print(f"获取 QQQ 价格及 MA200 失败: {e}")
        return None, None, None


def fetch_ndx_pe_from_danjuan():
    """
    从雪球/蛋卷基金 API 获取纳指100的实时估值（PE 及百分位）
    """
    try:
        url = "https://danjuanapp.com/djapi/index_eva/detail/NDX"
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
                        print("蛋卷 API 响应格式异常或未包含 PE 数据")
                        return None, None
                else:
                    print(f"尝试 {attempt+1}: 请求失败，状态码 {response.status_code}")
            except requests.exceptions.RequestException as e:
                print(f"尝试 {attempt+1}: 请求异常 {e}")
        return None, None
    except Exception as e:
        print(f"获取纳指 PE 失败: {e}")
        return None, None

def fetch_fear_and_greed_index():
    """
    获取恐慌与贪婪指数 (0-100)
    由于 CNN 的 API 限制严格（容易返回403），这里使用 alternative.me 的 Crypto 恐慌指数作为平替，
    虽然是加密市场的，但通常与纳斯达克的宏观情绪高度正相关。
    """
    try:
        url = "https://api.alternative.me/fng/?limit=1"
        response = requests.get(url, timeout=10)
        data = response.json()
        
        if data and "data" in data and len(data["data"]) > 0:
            score = int(data["data"][0]["value"])
            rating = data["data"][0]["value_classification"]
            return score, rating
        else:
            return None, "未知"
            
    except Exception as e:
        print(f"获取恐慌与贪婪指数失败: {e}")
        return None, "未知"

# ---------------------------------------------------------
# 评估逻辑与主函数
# ---------------------------------------------------------

def evaluate_strategy(bias, pe_percentile, fg_score):
    """
    模型二：「估值-情绪-趋势」三维综合打分系统
    分别计算得分系数，再加权得出最终定投倍数，由倍数决定红绿灯状态。
    """
    reasons = []
    
    # 1. 估值因子 (Weight: 40%)
    # PE百分位越低，得分越高。公式： 2.0 - PE百分位 (以小数计, 如 0.20 -> 1.8)
    if pe_percentile is not None:
        val_score = 2.0 - pe_percentile
        reasons.append(f"估值因子得分: {val_score:.2f} (PE分位 {pe_percentile*100:.1f}%)")
    else:
        val_score = 1.0
        reasons.append("估值数据缺失，由于防御性给予默认得分 1.0")

    # 2. 情绪因子 (Weight: 30%)
    # 恐慌贪婪指数越低 (越恐慌)，得分越高。公式：(100 - FG) / 50
    if fg_score is not None:
        sentiment_score = (100 - fg_score) / 50.0
        reasons.append(f"情绪因子得分: {sentiment_score:.2f} (FG指数 {fg_score})")
    else:
        sentiment_score = 1.0
        reasons.append("情绪数据缺失，给予默认得分 1.0")

    # 3. 趋势因子 (Weight: 30%)
    if bias is not None:
        if bias > 0.15:
            # 严重超买，存在均值回归风险，趋势分大减
            trend_score = 0.5
            reasons.append(f"趋势因子得分: {trend_score:.2f} (严重超买，乖离率 {bias*100:.1f}%)")
        elif bias > 0:
            # 均线之上，顺势增强
            trend_score = 1.2
            reasons.append(f"趋势因子得分: {trend_score:.2f} (多头排列，乖离率 {bias*100:.1f}%)")
        else:
            # 均线之下，熊市防守
            trend_score = 0.8
            reasons.append(f"趋势因子得分: {trend_score:.2f} (空头排列，乖离率 {bias*100:.1f}%)")
    else:
        trend_score = 1.0
        reasons.append("均线数据缺失，给予默认得分 1.0")

    # 计算综合加权系数
    final_weight = (val_score * WEIGHT_VALUATION) + (sentiment_score * WEIGHT_SENTIMENT) + (trend_score * WEIGHT_TREND)
    
    # 限制极值边界
    final_weight = max(0.0, min(3.0, final_weight))
    
    # 根据用户定义：红灯[0,0.4]，黄灯(0.4,0.7]，绿灯(0.7,+∞)
    if final_weight <= 0.4:
        decision = "暂停定投"
    elif final_weight <= 0.7:
        decision = "普通定投"
    else:
        decision = "加倍定投"
        
    # 保存单个指标的判断结果，供前端展示倍数
    individual_decisions = {
        "bias_decision": f"{trend_score:.2f}x",
        "pe_decision": f"{val_score:.2f}x",
        "fg_decision": f"{sentiment_score:.2f}x",
        "final_weight": round(final_weight, 2)
    }
    
    # 调整总体的 reasons 加入一条总结
    reasons.append(f"综合计算权重: {final_weight:.2f}倍")
    
    return decision, reasons, individual_decisions

def main():
    print("开始获取核心指标...")
    
    # 1. 获取 QQQ 价格与均线
    current_price, ma200, bias = fetch_qqq_price_and_bias()
    print(f"-> QQQ 价格: {current_price}, MA200: {ma200}, 乖离率: {bias}")
    
    # 2. 获取纳指 PE 与历史百分位
    pe, pe_percentile = fetch_ndx_pe_from_danjuan()
    print(f"-> 纳指100 PE: {pe}, 历史百分位: {pe_percentile}")
    
    # 3. 获取恐慌与贪婪指数
    fg_score, fg_rating = fetch_fear_and_greed_index()
    print(f"-> 市场情緖: {fg_score} ({fg_rating})")
    
    # 评估策略
    decision, reasons, individual_decisions = evaluate_strategy(bias, pe_percentile, fg_score)
    print(f"\n=> 最终建议: {decision}")
    print(f"=> 理由: {', '.join(reasons)}")
    
    # 获取北京时间
    beijing_tz = timezone(timedelta(hours=8))
    bj_time = datetime.now(beijing_tz).strftime("%Y-%m-%d %H:%M:%S")

    # 拼装最终要写入 JSON 的数据
    result_data = {
        "update_time": bj_time,
        "decision": decision,
        "reasons": reasons,
        "individual_decisions": individual_decisions,
        "metrics": {
            "qqq_price": round(current_price, 2) if current_price else None,
            "ma200": round(ma200, 2) if ma200 else None,
            "bias_percent": round(bias * 100, 2) if bias else None,
            "pe": pe,
            "pe_percentile": pe_percentile,
            "fear_greed_score": fg_score,
            "fear_greed_rating": fg_rating
        }
    }
    
    # 确定输出路径 (放置在项目根目录，方便 Github Pages 的 index.html 读取)
    # 当前脚本在 backend/ 下，所以写入上一级目录即根目录
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    json_path = os.path.join(project_root, "data.json")
    
    # 将字典转换为 JSON 并写入文件
    try:
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(result_data, f, ensure_ascii=False, indent=2)
        print(f"\n成功生成行情评估文件: {json_path}")
    except Exception as e:
        print(f"写入文件失败: {e}")

    # 发送 Bark 推送 (如果配置了 BARK_KEY 环境变量)
    bark_key = os.environ.get("BARK_KEY")
    if bark_key:
        print("\n检测到 BARK_KEY，正在发送由推送...")
        try:
            # 构建消息标题和内容
            title = f"纳指定投评估 - {decision}"
            
            # 使用 URL 编码的换行符
            body_lines = [
                f"当前建议: {decision}",
                f"QQQ价格: ${result_data['metrics']['qqq_price']}",
                f"均线乖离: {result_data['metrics']['bias_percent']}%",
                f"纳指100 PE: {result_data['metrics']['pe']} ({result_data['metrics']['pe_percentile']*100:.1f}%)",
                f"市场情绪: {result_data['metrics']['fear_greed_score']} ({result_data['metrics']['fear_greed_rating']})"
            ]
            body = "\n".join(body_lines)
            
            # 发送 POST 请求到 Bark API
            bark_url = f"https://api.day.app/{bark_key}/"
            payload = {
                "title": title,
                "body": body,
                "icon": "https://raw.githubusercontent.com/Dorian-Yuan/nasdaq_dca/main/icon.png",
                "group": "NASDAQ",
                "sound": "minuet"
            }
            
            # 如果是加倍买入，使用更响亮的提示音
            if decision == "加倍定投":
                payload["sound"] = "alarm"
            elif decision == "暂停定投":
                payload["sound"] = "fail"
                
            response = requests.post(bark_url, json=payload, timeout=10)
            if response.status_code == 200:
                print("Bark 推送成功！")
            else:
                print(f"Bark 推送失败，状态码: {response.status_code}, 返回数据: {response.text}")
        except Exception as e:
            print(f"发送 Bark 推送异常: {e}")
    else:
        print("\n未配置 BARK_KEY 环境变量，跳过消息推送。")

if __name__ == "__main__":
    main()
