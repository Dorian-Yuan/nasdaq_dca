const STRATEGY_MODELS = {
    "NDX": {
        "ndx_default": {
            "id": "ndx_default",
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
        }
    }
};

if (typeof window !== 'undefined') {
    window.STRATEGY_MODELS = STRATEGY_MODELS;
    
    // 初始化当前激活的模型库索引
    window.ACTIVE_MODELS = {
    "NDX": "custom_1772778969623",
    "SP500": "spy_default"
};
}
