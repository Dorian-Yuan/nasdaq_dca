"""
bark_notify.py - 独立的Bark推送脚本
从 data/data.json 读取策略评估结果，构建推送内容并发送到Bark。
此脚本应在 chart_generator.py 和 git push 之后执行，
确保Bark推送的图片URL指向GitHub上最新的K线图。
"""

import json
import os
from datetime import datetime
import requests
import concurrent.futures


def build_bark_messages(data):
    """从data.json构建Bark推送消息列表"""
    bark_messages = []
    cn_names = {"NDX": "纳斯达克100", "SP500": "标普500"}

    for name, info in data.items():
        latest = info.get("latest", {})
        metrics = latest.get("metrics", {})
        individual = latest.get("individual_decisions", {})
        decision = latest.get("decision", "")

        cn_name = cn_names.get(name, name)
        if metrics.get('price') and metrics.get('pe_percentile') is not None:
            msg = (f"{cn_name}：{decision} {individual.get('final_weight', '')}× | "
                   f"PE {metrics['pe_percentile']*100:.1f}％ | "
                   f"乖离 {metrics['bias_percent']}％ | "
                   f"{metrics.get('vol_name', '')} {metrics.get('volatility', '')}；")
            bark_messages.append(msg)

    return bark_messages


def send_bark_notification(key, title, body, image_url):
    """发送单条Bark推送"""
    bark_url = f"https://api.day.app/{key}/"
    payload = {
        "title": title,
        "body": body,
        "icon": "https://raw.githubusercontent.com/Dorian-Yuan/nasdaq_dca/main/web/assets/icon2.png",
        "group": "US_INDEX",
        "sound": "minuet",
        "image": image_url
    }
    if "🟢" in body:
        payload["sound"] = "alarm"
    elif "🔴" in body:
        payload["sound"] = "fail"
    try:
        response = requests.post(bark_url, json=payload, timeout=10)
        return key[:6] + "...", response.status_code
    except Exception as e:
        return key[:6] + "...", str(e)


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    json_path = os.path.join(project_root, "data", "data.json")

    if not os.path.exists(json_path):
        print(f"错误: {json_path} 不存在，请先运行 fetch_and_calc.py")
        return

    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    bark_messages = build_bark_messages(data)
    if not bark_messages:
        print("无推送内容，跳过Bark推送")
        return

    # 收集所有BARK_KEY
    bark_keys = []
    for i in range(1, 10):
        key = os.environ.get(f"BARK_KEY{i}", "").strip()
        if key:
            bark_keys.append(key)

    if not bark_keys:
        print("未配置 BARK_KEY 环境变量，跳过消息推送。")
        return

    print(f"检测到 {len(bark_keys)} 个 BARK_KEY，正在并行发送推送...")

    title = "指数定投评估"
    body = "\n".join(bark_messages)

    # 添加时间戳参数破坏缓存，确保客户端获取最新图片
    timestamp = datetime.now().strftime('%Y%m%d%H%M')
    image_url = f"https://raw.githubusercontent.com/Dorian-Yuan/nasdaq_dca/main/charts/kline_chart.png?t={timestamp}"

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(bark_keys)) as executor:
        futures = {executor.submit(send_bark_notification, key, title, body, image_url): key for key in bark_keys}
        for future in concurrent.futures.as_completed(futures):
            key_short, result = future.result()
            if result == 200:
                print(f"Bark 推送成功 (Key: {key_short})")
            else:
                print(f"Bark 推送失败 (Key: {key_short}): {result}")


if __name__ == "__main__":
    main()
