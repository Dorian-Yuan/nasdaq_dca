const STRATEGY_MODELS = {
    "NDX": {
        "ndx_default": {
            id: "ndx_default",
            name: "默认经典策略",
            weights: { pe: 0.30, vxn: 0.30, bias: 0.40 },
            formula_pe: "if (x < 0.2) return 1.5;\nif (x < 0.4) return 1.2;\nif (x < 0.6) return 1.0;\nif (x < 0.8) return 0.8;\nreturn 0.5;",
            formula_vxn: "if (x > 30) return 1.5;\nif (x > 25) return 1.2;\nif (x > 20) return 1.0;\nif (x > 15) return 0.8;\nreturn 0.5;",
            formula_bias: "if (x < -0.05) return 1.5;\nif (x < 0) return 1.2;\nif (x < 0.05) return 1.0;\nif (x < 0.1) return 0.8;\nreturn 0.5;"
        }
    },
    "SP500": {
        "spy_default": {
            id: "spy_default",
            name: "默认经典策略",
            weights: { pe: 0.30, vxn: 0.30, bias: 0.40 },
            formula_pe: "if (x < 0.2) return 1.5;\nif (x < 0.4) return 1.2;\nif (x < 0.6) return 1.0;\nif (x < 0.8) return 0.8;\nreturn 0.5;",
            formula_vxn: "if (x > 30) return 1.5;\nif (x > 25) return 1.2;\nif (x > 20) return 1.0;\nif (x > 15) return 0.8;\nreturn 0.5;",
            formula_bias: "if (x < -0.05) return 1.5;\nif (x < 0) return 1.2;\nif (x < 0.05) return 1.0;\nif (x < 0.1) return 0.8;\nreturn 0.5;"
        }
    }
};

if (typeof window !== 'undefined') {
    window.STRATEGY_MODELS = STRATEGY_MODELS;

    // 初始化当前激活的模型库索引
    window.ACTIVE_MODELS = {
        "NDX": "ndx_default",
        "SP500": "spy_default"
    };
}
