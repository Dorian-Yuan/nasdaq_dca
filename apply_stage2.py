import re

# --- Update style.css ---
with open('style.css', 'r', encoding='utf-8') as f:
    css = f.read()

nav_css = """
/* --- 视图与导航 --- */
.view-section {
    display: none;
    animation: fadeIn 0.3s ease;
}

.view-section.active {
    display: block;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(5px); }
    to { opacity: 1; transform: translateY(0); }
}

.main-nav {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    background-color: var(--bg-card);
    border-top: 1px solid var(--border-color);
    display: flex;
    justify-content: space-around;
    padding: 8px 0;
    padding-bottom: env(safe-area-inset-bottom, 8px);
    z-index: 1000;
    box-shadow: 0 -2px 10px rgba(0,0,0,0.05);
}

.nav-item {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    flex: 1;
    padding: 6px 0;
    transition: all 0.2s ease;
}

.nav-item.active {
    color: var(--color-green);
}

.nav-item.active .nav-icon {
    transform: translateY(-2px);
}

.nav-icon {
    font-size: 20px;
    transition: transform 0.2s ease;
}

body {
    padding-bottom: 70px;
}

@media (min-width: 768px) {
    .main-nav {
        top: 0;
        bottom: 0;
        width: 80px;
        flex-direction: column;
        justify-content: flex-start;
        padding-top: 30px;
        border-top: none;
        border-right: 1px solid var(--border-color);
        box-shadow: 2px 0 10px rgba(0,0,0,0.05);
    }
    .nav-item {
        padding: 20px 0;
        flex: none;
    }
    body {
        padding-bottom: 0;
        padding-left: 80px;
    }
}

/* --- 设置页样式 --- */
.settings-group {
    background-color: var(--bg-card);
    border-radius: var(--radius-card);
    padding: 16px;
    margin-bottom: 20px;
    box-shadow: var(--shadow-md);
}

.settings-group-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 12px;
    text-transform: uppercase;
}

.settings-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid var(--border-color);
}

.settings-item:last-of-type {
    border-bottom: none;
}

.settings-item label {
    font-size: 15px;
    color: var(--text-primary);
    flex: 1;
}

.setting-input {
    background-color: var(--bg-main);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    padding: 8px 12px;
    border-radius: var(--radius-elem);
    text-align: right;
    width: 140px;
}

.setting-input:focus {
    outline: none;
    border-color: var(--color-green);
}

.btn-full {
    width: 100%;
    max-width: 100%;
    margin: 8px 0;
}
"""

if "main-nav" not in css:
    with open('style.css', 'a', encoding='utf-8') as f:
        f.write(nav_css)

# --- Update app.js ---
with open('app.js', 'r', encoding='utf-8') as f:
    app_js = f.read()

router_logic = """
    // 路由切换逻辑
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetView = e.currentTarget.getAttribute('data-view');
            
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            document.querySelectorAll('.view-section').forEach(v => {
                v.classList.remove('active');
                v.style.display = 'none';
            });
            const targetElement = document.getElementById(targetView);
            if (targetElement) {
                targetElement.classList.add('active');
                targetElement.style.display = 'block';
            }
            
            // Re-render chart if switching to sandbox
            if (targetView === 'view-sandbox' && typeof window.updateSandboxConfigs === 'function') {
                window.updateSandboxConfigs();
            }
        });
    });
"""

if "data-view" not in app_js:
    # Insert before loadData()
    app_js = app_js.replace('loadData();', router_logic + '\n    loadData();')
    with open('app.js', 'w', encoding='utf-8') as f:
        f.write(app_js)
