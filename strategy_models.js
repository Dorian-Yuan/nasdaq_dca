const STRATEGY_MODELS = {
    "NDX": {
        "custom_1772778969623": {
            "id": "custom_1772778969623",
            "name": "5x²全PE百分位",
            "timestamp": 1772778969623,
            "return_5y": 38.3632165509057,
            "weights": {
                "pe": 1,
                "vxn": 0,
                "bias": 0
            },
            "formula_pe": "return 5*x*x",
            "formula_vxn": "return 0",
            "formula_bias": "return 0"
        },
        "custom_1772958646904": {
            "id": "custom_1772958646904",
            "name": "全VXN恐慌策略",
            "timestamp": 1772958646908,
            "return_5y": 8.777643004960689,
            "weights": {
                "pe": 0,
                "vxn": 1,
                "bias": 0
            },
            "formula_pe": "return 5*x*x",
            "formula_vxn": "return 1+(x-22)/12",
            "formula_bias": "return 0"
        },
        "custom_1773019017226": {
            "id": "custom_1773019017226",
            "name": "PE6/VXN4",
            "timestamp": 1773019017227,
            "return_5y": 21.726301011071335,
            "weights": {
                "pe": 0.6,
                "vxn": 0.4,
                "bias": 0
            },
            "formula_pe": "return 5*x*x",
            "formula_vxn": "return 1+(x-22)/12",
            "formula_bias": "return 0"
        },
        "custom_1773019191138": {
            "id": "custom_1773019191138",
            "name": "Gemini权衡策略",
            "timestamp": 1773019191139,
            "return_5y": 24.67402757327851,
            "weights": {
                "pe": 0.4,
                "vxn": 0.3,
                "bias": 0.3
            },
            "formula_pe": "return 5 * x * x;",
            "formula_vxn": "var p = Math.max(0, Math.min(1, (x - 12) / 48));\nreturn 0.25 + 4.75 * p * p * p;",
            "formula_bias": "var p = Math.max(0, Math.min(1, (x + 0.15) / 0.40));\nreturn 5 * (1 - p) * (1 - p);"
        },
        "custom_1773019955909": {
            "id": "custom_1773019955909",
            "name": "三因子权衡策略",
            "timestamp": 1773019955912,
            "return_5y": 23.57934621345591,
            "weights": {
                "pe": 0.4,
                "vxn": 0.3,
                "bias": 0.3
            },
            "formula_pe": "return 5 * x * x;",
            "formula_vxn": "var p = Math.max(0, Math.min(1, (x - 12) / 48));\nreturn 0.25 + 4.75 * p * p ;",
            "formula_bias": "var p = Math.max(0, Math.min(1, (x + 0.15) / 0.40));\nreturn 5 * (1 - p) * (1 - p);"
        }
    },
    "SP500": {
        "spy_default": {
            "id": "spy_default",
            "name": "默认经典策略",
            "weights": {
                "pe": 0.4,
                "vxn": 0.3,
                "bias": 0.3
            },
            "formula_pe": "if (x > 0.7) return 1.0 + ((x - 0.7) / 0.3) * 1.0;\nif (x >= 0.3) return 1.0;\nreturn 0.5 + (x / 0.3) * 0.5;",
            "formula_vxn": "if (x < 14) return 0.8;\nif (x <= 20) return 1.0;\nif (x <= 30) return 1.0 + ((x - 20) / 10.0) * 0.8;\nreturn Math.min(2.5, 1.8 + (x - 30) / 10.0);",
            "formula_bias": "if (x < -0.10) return 2.0;\nif (x < 0) return 1.0 + (Math.abs(x) / 0.10) * 1.0;\nif (x <= 0.10) return 1.0;\nif (x <= 0.20) return 1.0 - ((x - 0.10) / 0.10) * 0.5;\nreturn 0.5;"
        },
        "custom_1773020513754": {
            "id": "custom_1773020513754",
            "name": "PE6/VIX4",
            "timestamp": 1773020513758,
            "return_5y": 19.192086316929363,
            "weights": {
                "pe": 0.6,
                "vxn": 0.4,
                "bias": 0
            },
            "formula_pe": "return 5*x*x",
            "formula_vxn": "// x 现在代表当前的 VIX 数值\n// 将起点从 12 降为 10，将区间跨度从 48 降为 40（即上限为 50）\nvar p = Math.max(0, Math.min(1, (x - 10) / 40));\n\n// 这里保留了作者原版的 p 的三次幂 (p*p*p)，如果你倾向上一轮骤增发力的方案，可以改为 p*p\nreturn 0.25 + 4.75 * p * p * p; ",
            "formula_bias": "if (x < -0.10) return 2.0;\nif (x < 0) return 1.0 + (Math.abs(x) / 0.10) * 1.0;\nif (x <= 0.10) return 1.0;\nif (x <= 0.20) return 1.0 - ((x - 0.10) / 0.10) * 0.5;\nreturn 0.5;"
        },
        "custom_1773020787426": {
            "id": "custom_1773020787426",
            "name": "三因子策略",
            "timestamp": 1773020787428,
            "return_5y": 14.381645120684356,
            "weights": {
                "pe": 0.4,
                "vxn": 0.3,
                "bias": 0.3
            },
            "formula_pe": "return 5*x*x",
            "formula_vxn": "// x 现在代表当前的 VIX 数值\n// 将起点从 12 降为 10，将区间跨度从 48 降为 40（即上限为 50）\nvar p = Math.max(0, Math.min(1, (x - 10) / 40));\n\n// 这里保留了作者原版的 p 的三次幂 (p*p*p)，如果你倾向上一轮骤增发力的方案，可以改为 p*p\nreturn 0.25 + 4.75 * p * p * p; ",
            "formula_bias": "var p = Math.max(0, Math.min(1, (x + 0.15) / 0.40));\nreturn 5 * (1 - p) * (1 - p);"
        }
    }
};

if (typeof window !== 'undefined') {
    window.STRATEGY_MODELS = STRATEGY_MODELS;
    
    // 初始化当前激活的模型库索引
    window.ACTIVE_MODELS = {
    "NDX": "custom_1773019191138",
    "SP500": "custom_1773020787426"
};
}
