"""
chart_generator.py - K线图生成器
从本地 data/ohlc_data.json 读取OHLC数据，生成纳指100和标普500近3个月的K线图，
包含MA20/60/250均线和RSI(14)指标，合并为一张高清图片输出到 charts/kline_chart.png。
"""

import json
import os
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
import mplfinance as mpf
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

# 设置中文字体（本地Windows可用，GitHub Actions Ubuntu可能回退到英文）
import matplotlib.font_manager as fm

def _get_chinese_font():
    """尝试获取中文字体，找不到则返回None"""
    chinese_fonts = ['SimHei', 'Microsoft YaHei', 'Arial Unicode MS',
                     'WenQuanYi Micro Hei', 'Noto Sans CJK SC', 'PingFang SC']
    available = {f.name for f in fm.fontManager.ttflist}
    for font in chinese_fonts:
        if font in available:
            return font
    return None

_CHINESE_FONT = _get_chinese_font()
if _CHINESE_FONT:
    plt.rcParams['font.sans-serif'] = [_CHINESE_FONT, 'DejaVu Sans']
    plt.rcParams['axes.unicode_minus'] = False


def load_ohlc_data(ohlc_path, index_key):
    """从本地OHLC数据文件读取数据，返回完整DataFrame"""
    if not os.path.exists(ohlc_path):
        print(f"警告: {ohlc_path} 不存在，请先运行 fetch_and_calc.py 生成OHLC数据")
        return None

    with open(ohlc_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    records = data.get(index_key, [])
    if not records:
        print(f"警告: {index_key} 无OHLC数据")
        return None

    df = pd.DataFrame(records)
    df['date'] = pd.to_datetime(df['date'])
    df = df.set_index('date')
    # 确保数值类型
    for col in ['open', 'high', 'low', 'close', 'volume']:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    df = df.dropna(subset=['open', 'high', 'low', 'close'])
    df = df.sort_index()
    return df


def calculate_rsi(series, period=14):
    """计算RSI指标（Wilder平滑方法）"""
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)

    # 使用Wilder平滑（指数移动平均，alpha=1/period）
    avg_gain = gain.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()

    rs = avg_gain / avg_loss
    rsi = 100.0 - (100.0 / (1.0 + rs))
    return rsi


def generate_single_chart(df, name_cn, months=3):
    """生成单个指数的K线图+MA+RSI，返回(figure, axes)"""
    # 计算均线
    df['MA60'] = df['close'].rolling(window=60).mean()
    df['MA20'] = df['close'].rolling(window=20).mean()
    df['MA250'] = df['close'].rolling(window=250).mean()

    # 计算RSI
    df['RSI'] = calculate_rsi(df['close'], 14)

    # 截取近3个月数据用于显示
    cutoff_date = df.index.max() - pd.DateOffset(months=months)
    df_display = df[df.index >= cutoff_date].copy()

    if len(df_display) < 5:
        print(f"警告: {name_cn} 近{months}个月数据不足，跳过")
        return None, None

    # 准备mplfinance格式的DataFrame
    ohlc_data = df_display[['open', 'high', 'low', 'close', 'volume']].copy()
    ohlc_data.columns = ['Open', 'High', 'Low', 'Close', 'Volume']

    # 构建附加均线（浅色背景配色）
    apds = [
        mpf.make_addplot(df_display['MA60'], color='#E65100', width=1.0, label='MA60'),   # 深橙色
        mpf.make_addplot(df_display['MA20'], color='#1565C0', width=1.0, label='MA20'),   # 深蓝色
        mpf.make_addplot(df_display['MA250'], color='#7B1FA2', width=1.2, label='MA250'), # 深紫色
        mpf.make_addplot(df_display['RSI'], panel=2, color='#1565C0', width=1.2,
                         ylabel='RSI(14)', secondary_y=False),
        # RSI超买超卖线（更粗更明显）
        mpf.make_addplot(pd.Series(70, index=df_display.index), panel=2,
                         color='#D32F2F', width=1.0, linestyle='--', alpha=0.9),   # 红色超买线
        mpf.make_addplot(pd.Series(30, index=df_display.index), panel=2,
                         color='#388E3C', width=1.0, linestyle='--', alpha=0.9),   # 绿色超卖线
        mpf.make_addplot(pd.Series(50, index=df_display.index), panel=2,
                         color='#9E9E9E', width=0.7, linestyle=':', alpha=0.6),    # 灰色中线
    ]

    # 日期范围字符串
    date_range = f"{df_display.index[0].strftime('%Y-%m-%d')} ~ {df_display.index[-1].strftime('%Y-%m-%d')}"

    # 标题（有中文字体用中文，否则用英文）
    if _CHINESE_FONT:
        chart_title = f'\n{name_cn} K线图  {date_range}'
    else:
        en_name = {"纳斯达克100": "NASDAQ 100", "标普500": "S&P 500"}.get(name_cn, name_cn)
        chart_title = f'\n{en_name} Candlestick  {date_range}'

    # 创建自定义样式（红涨绿跌 + 浅色背景 + 黑字）
    custom_style = mpf.make_mpf_style(
        base_mpf_style='default',
        marketcolors=mpf.make_marketcolors(
            up='#D32F2F',       # 涨 - 红色
            down='#388E3C',     # 跌 - 绿色
            edge='inherit',     # 边框继承涨跌色
            wick='inherit',     # 影线继承涨跌色
            volume='inherit',   # 成交量继承涨跌色
            ohlc='inherit',     # OHLC线继承涨跌色
        ),
        mavcolors=['#E65100', '#1565C0', '#7B1FA2'],  # MA10橙色, MA20蓝色, MA250紫色
        facecolor='#FFFFFF',    # 白色背景
        gridcolor='#E0E0E0',    # 浅灰色网格
        gridstyle='--',
        rc={
            'font.sans-serif': [_CHINESE_FONT, 'DejaVu Sans'] if _CHINESE_FONT else ['DejaVu Sans'],
            'axes.unicode_minus': False,
            'axes.labelcolor': '#333333',     # 坐标轴标签深灰色
            'xtick.color': '#333333',         # X轴刻度深灰色
            'ytick.color': '#333333',         # Y轴刻度深灰色
            'text.color': '#333333',          # 文字深灰色
            'axes.edgecolor': '#BDBDBD',      # 坐标轴边框浅灰色
        }
    )

    # 创建图表
    fig, axes = mpf.plot(
        ohlc_data,
        type='candle',
        style=custom_style,
        title=chart_title,
        addplot=apds,
        volume=True,
        volume_panel=1,
        panel_ratios=(4, 1, 2),
        figsize=(12, 7),
        returnfig=True,
        warn_too_much_data=10000
    )

    # 设置RSI面板的Y轴范围
    rsi_ax = axes[4] if len(axes) > 4 else None
    if rsi_ax:
        rsi_ax.set_ylim(10, 90)

    return fig, axes


def generate_combined_chart(ohlc_path, output_path):
    """生成两个指数的合并K线图"""
    indices = [
        ("NDX", "纳斯达克100"),
        ("SP500", "标普500")
    ]

    figures = []
    for key, name_cn in indices:
        df = load_ohlc_data(ohlc_path, key)
        if df is None:
            continue
        fig, axes = generate_single_chart(df, name_cn)
        if fig is not None:
            figures.append(fig)

    if not figures:
        print("无可用数据，跳过图表生成")
        return

    # 合并为一张图片
    # 保存每个figure为临时图片，然后合并
    import matplotlib.image as mpimg
    from matplotlib.backends.backend_agg import FigureCanvasAgg

    temp_paths = []
    for i, fig in enumerate(figures):
        temp_path = output_path.replace('.png', f'_temp_{i}.png')
        fig.savefig(temp_path, dpi=150, bbox_inches='tight',
                    facecolor='#FFFFFF', edgecolor='none')
        plt.close(fig)
        temp_paths.append(temp_path)

    # 读取临时图片并合并
    images = [mpimg.imread(p) for p in temp_paths]

    # 计算合并后的尺寸
    max_width = max(img.shape[1] for img in images)
    total_height = sum(img.shape[0] for img in images)

    # 创建合并画布
    combined_fig, combined_ax = plt.subplots(1, 1, figsize=(max_width / 150, total_height / 150), dpi=150)
    combined_ax.set_facecolor('#FFFFFF')
    combined_fig.set_facecolor('#FFFFFF')
    combined_ax.axis('off')

    y_offset = 0
    for img in images:
        # 计算居中偏移
        x_offset = (max_width - img.shape[1]) / 2
        combined_ax.imshow(img, extent=[x_offset, x_offset + img.shape[1],
                                        total_height - y_offset - img.shape[0],
                                        total_height - y_offset])
        y_offset += img.shape[0]

    combined_ax.set_xlim(0, max_width)
    combined_ax.set_ylim(0, total_height)

    combined_fig.savefig(output_path, dpi=150, bbox_inches='tight',
                         facecolor='#FFFFFF', edgecolor='none', pad_inches=0.1)
    plt.close(combined_fig)

    # 清理临时文件
    for p in temp_paths:
        try:
            os.remove(p)
        except Exception:
            pass

    print(f"K线图已生成: {output_path}")


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    ohlc_path = os.path.join(project_root, "data", "ohlc_data.json")
    charts_dir = os.path.join(project_root, "charts")
    os.makedirs(charts_dir, exist_ok=True)

    output_path = os.path.join(charts_dir, "kline_chart.png")
    generate_combined_chart(ohlc_path, output_path)


if __name__ == "__main__":
    main()
