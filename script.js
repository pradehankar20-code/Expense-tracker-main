/**
 * SpendWise AI - Modern Expense Tracker & UPI Financial Suite
 * Pure Vanilla JavaScript implementation with Local Storage, Chart.js, PWA, and Mobile UPI integration.
 */

// ==========================================================================
// STATE MANAGEMENT & DATA PERSISTENCE
// ==========================================================================
const STORAGE_KEYS = {
    TRANSACTIONS: "spendwise_transactions_v2",
    LEGACY_DATA: "data", // Backward compatibility with previous version
    BUDGET: "spendwise_monthly_budget",
    CURRENCY: "spendwise_currency",
    THEME: "spendwise_theme",
    GEMINI_KEY: "spendwise_gemini_key",
    CHAT_HISTORY: "spendwise_chat_history",
    AUTH: "spendwise_auth_user"
};

// Dummy Accounts for Authentication
const DUMMY_USERS = [
    { username: "admin", password: "admin123", name: "Administrator", role: "Admin" },
    { username: "user", password: "password123", name: "Demo User", role: "User" }
];

// Global Application State
let state = {
    transactions: [],
    budget: 30000,
    currency: "INR",
    currencySymbol: "₹",
    theme: "dark",
    geminiKey: "",
    activeTab: "dashboard",
    filterType: "all",
    filterCategory: "all",
    searchQuery: "",
    sortBy: "date-desc",
    currentDeleteId: null
};

// Category Metadata: Icons and Accent Colors
const CATEGORY_META = {
    "Food & Groceries": { icon: "fa-solid fa-utensils", color: "#f97316", bg: "rgba(249, 115, 22, 0.15)" },
    "Shopping": { icon: "fa-solid fa-bag-shopping", color: "#ec4899", bg: "rgba(236, 72, 153, 0.15)" },
    "Transportation": { icon: "fa-solid fa-car-side", color: "#06b6d4", bg: "rgba(6, 182, 212, 0.15)" },
    "Housing & Utilities": { icon: "fa-solid fa-bolt", color: "#eab308", bg: "rgba(234, 179, 8, 0.15)" },
    "Entertainment": { icon: "fa-solid fa-gamepad", color: "#a855f7", bg: "rgba(168, 85, 247, 0.15)" },
    "Insurance & Healthcare": { icon: "fa-solid fa-heart-pulse", color: "#ef4444", bg: "rgba(239, 68, 68, 0.15)" },
    "Debt Repayment": { icon: "fa-solid fa-hand-holding-dollar", color: "#f43f5e", bg: "rgba(244, 63, 94, 0.15)" },
    "Personal care": { icon: "fa-solid fa-spa", color: "#14b8a6", bg: "rgba(20, 184, 166, 0.15)" },
    "Education": { icon: "fa-solid fa-graduation-cap", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.15)" },
    "Savings & Investments": { icon: "fa-solid fa-piggy-bank", color: "#10b981", bg: "rgba(16, 185, 129, 0.15)" },
    "Salary / Wages": { icon: "fa-solid fa-money-bill-wave", color: "#10b981", bg: "rgba(16, 185, 129, 0.15)" },
    "Gift & Donation": { icon: "fa-solid fa-gift", color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.15)" },
    "Miscellaneous": { icon: "fa-solid fa-ellipsis", color: "#64748b", bg: "rgba(100, 116, 139, 0.15)" }
};

// Chart.js instances
let categoryChartInstance = null;
let cashflowChartInstance = null;

// PWA Deferred Prompt
let deferredPwaPrompt = null;

// Camera QR Scanner instance
let html5QrScanner = null;

// ==========================================================================
// INITIALIZATION & LIFECYCLE
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

function initApp() {
    registerServiceWorker();
    loadSettings();
    applyTheme(state.theme);
    const isLoggedIn = checkAuthStatus();
    loadTransactions();
    setupEventListeners();
    refreshAllViews();
    handleIncomingShareOrAction();
    if (isLoggedIn) {
        setTimeout(() => renderCharts(), 100);
    }
}

/**
 * Register Service Worker for PWA Offline & Share Target Support
 */
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SpendWise PWA Service Worker Registered', reg))
            .catch(err => console.log('Service Worker Registration failed', err));
    }

    // Capture PWA install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPwaPrompt = e;
        const installBtn = document.getElementById("pwaInstallBtn");
        if (installBtn) installBtn.style.display = "inline-flex";
    });
}

function triggerPwaInstall() {
    if (deferredPwaPrompt) {
        deferredPwaPrompt.prompt();
        deferredPwaPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                showToast("SpendWise installed on your phone!", "success");
            }
            deferredPwaPrompt = null;
            const installBtn = document.getElementById("pwaInstallBtn");
            if (installBtn) installBtn.style.display = "none";
        });
    } else {
        openPhoneConnectModal();
    }
}

/**
 * Handle incoming Android Web Share Target or PWA App Shortcuts
 */
function handleIncomingShareOrAction() {
    const params = new URLSearchParams(window.location.search);
    
    // Check for shared text from Android native share sheet (PhonePe, GPay, SMS)
    const sharedText = params.get("share_text") || params.get("text");
    if (sharedText) {
        switchTab("upi");
        setTimeout(() => {
            const input = document.getElementById("smsRawInput");
            if (input) {
                input.value = decodeURIComponent(sharedText);
                parseSmsTransaction();
                showToast("Received shared transaction from your phone!", "success");
            }
        }, 300);
        return;
    }

    // Check for app action shortcuts
    const action = params.get("action");
    if (action === "scan_qr") {
        setTimeout(openCameraQrScanner, 400);
    } else if (action === "scan_receipt") {
        setTimeout(openScreenshotOcrModal, 400);
    } else if (action === "add_tx") {
        setTimeout(openAddModal, 400);
    }
}

/**
 * Loads preferences from localStorage
 */
function loadSettings() {
    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
    if (savedTheme) state.theme = savedTheme;

    const savedBudget = localStorage.getItem(STORAGE_KEYS.BUDGET);
    if (savedBudget) state.budget = Number(savedBudget);

    const savedCurrency = localStorage.getItem(STORAGE_KEYS.CURRENCY);
    if (savedCurrency) {
        state.currency = savedCurrency;
        state.currencySymbol = getCurrencySymbol(savedCurrency);
        const curSelect = document.getElementById("currencySelect");
        if (curSelect) curSelect.value = savedCurrency;
    }

    const savedGeminiKey = localStorage.getItem(STORAGE_KEYS.GEMINI_KEY);
    if (savedGeminiKey) {
        state.geminiKey = savedGeminiKey;
        const keyInput = document.getElementById("geminiApiKeyInput");
        if (keyInput) keyInput.value = savedGeminiKey;
        updateAiEngineStatus();
    }
}

/**
 * Loads transactions with backward compatibility migration
 */
function loadTransactions() {
    const savedTx = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    
    if (savedTx) {
        try {
            state.transactions = JSON.parse(savedTx);
        } catch (e) {
            console.error("Failed to parse transactions:", e);
            state.transactions = [];
        }
    } else {
        // Check for old legacy format: { income, expense, balance, entries: [...] }
        const legacy = localStorage.getItem(STORAGE_KEYS.LEGACY_DATA);
        if (legacy) {
            try {
                const parsedLegacy = JSON.parse(legacy);
                if (parsedLegacy && Array.isArray(parsedLegacy.entries)) {
                    state.transactions = parsedLegacy.entries.map((item, idx) => ({
                        id: "legacy_" + Date.now() + "_" + idx,
                        text: item.text || "Transaction",
                        amount: Number(item.amount) || 0,
                        CATEGORY: mapLegacyCategory(item.CATEGORY),
                        DATE: item.DATE || new Date().toISOString().split("T")[0],
                        type: item.type === "income" ? "income" : "expense",
                        paymentMethod: "UPI",
                        upiRef: "",
                        createdAt: Date.now()
                    }));
                    saveTransactions();
                }
            } catch (err) {
                console.error("Legacy migration error:", err);
            }
        }
    }

    // Default demo data if brand new
    if (state.transactions.length === 0) {
        state.transactions = getInitialDemoTransactions();
        saveTransactions();
    }
}

function mapLegacyCategory(cat) {
    if (!cat || cat === "none") return "Miscellaneous";
    if (cat.includes("Housing")) return "Housing & Utilities";
    if (cat.includes("Transpoartation") || cat.includes("Transportation")) return "Transportation";
    if (cat.includes("Food")) return "Food & Groceries";
    if (cat.includes("Enterainment") || cat.includes("Entertainment")) return "Entertainment";
    if (cat.includes("Savings")) return "Savings & Investments";
    return cat;
}

function saveTransactions() {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(state.transactions));
}

// ==========================================================================
// EVENT LISTENERS & NAVIGATION
// ==========================================================================
function setupEventListeners() {
    // Currency change
    const curSelect = document.getElementById("currencySelect");
    if (curSelect) {
        curSelect.addEventListener("change", (e) => {
            state.currency = e.target.value;
            state.currencySymbol = getCurrencySymbol(state.currency);
            localStorage.setItem(STORAGE_KEYS.CURRENCY, state.currency);
            refreshAllViews();
            showToast(`Currency changed to ${state.currency}`, "info");
        });
    }

    // Theme toggle
    const themeBtn = document.getElementById("themeToggleBtn");
    if (themeBtn) {
        themeBtn.addEventListener("click", () => {
            state.theme = state.theme === "dark" ? "light" : "dark";
            applyTheme(state.theme);
            localStorage.setItem(STORAGE_KEYS.THEME, state.theme);
            renderCharts();
        });
    }

    // Backup button
    const backupBtn = document.getElementById("dataBackupBtn");
    if (backupBtn) {
        backupBtn.addEventListener("click", () => {
            openModal("dataModal");
        });
    }

    // Default date input in modal to today
    const dateInput = document.getElementById("txDate");
    if (dateInput) {
        dateInput.value = new Date().toISOString().split("T")[0];
    }
    const upiDateInput = document.getElementById("parsedDate");
    if (upiDateInput) {
        upiDateInput.value = new Date().toISOString().split("T")[0];
    }

    // Drag and Drop for CSV dropzone
    const dropZone = document.getElementById("csvDropZone");
    if (dropZone) {
        ["dragenter", "dragover"].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.add("dragover");
            }, false);
        });

        ["dragleave", "drop"].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.remove("dragover");
            }, false);
        });

        dropZone.addEventListener("drop", (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                parseCsvFile(files[0]);
            }
        });
    }

    // Listen for user returning to browser from mobile UPI app (GPay, PhonePe)
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            checkPendingUpiReturn();
        }
    });
}

function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const themeIcon = document.querySelector("#themeToggleBtn i");
    if (themeIcon) {
        themeIcon.className = theme === "dark" ? "fa-solid fa-sun" : "fa-solid fa-moon";
    }
    const loginThemeIcon = document.getElementById("loginThemeIcon");
    if (loginThemeIcon) {
        loginThemeIcon.className = theme === "dark" ? "fa-solid fa-sun" : "fa-solid fa-moon";
    }
}

function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme(state.theme);
    localStorage.setItem(STORAGE_KEYS.THEME, state.theme);
    if (categoryChartInstance || cashflowChartInstance) {
        renderCharts();
    }
}

// ==========================================================================
// AUTHENTICATION & LOGIN MANAGEMENT
// ==========================================================================
function getAuthenticatedUser() {
    try {
        const stored = localStorage.getItem(STORAGE_KEYS.AUTH) || sessionStorage.getItem(STORAGE_KEYS.AUTH);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.error("Error reading auth state", e);
    }
    return null;
}

function checkAuthStatus() {
    const user = getAuthenticatedUser();
    const loginScreen = document.getElementById("loginScreen");
    const appLayout = document.getElementById("appLayout");
    const profileBadge = document.getElementById("userProfileBadge");
    const usernameDisplay = document.getElementById("loggedInUsername");

    if (user && user.username) {
        if (loginScreen) loginScreen.style.display = "none";
        if (appLayout) appLayout.style.display = "flex";
        if (profileBadge) profileBadge.style.display = "inline-flex";
        if (usernameDisplay) usernameDisplay.textContent = user.name || user.username;
        return true;
    } else {
        if (loginScreen) loginScreen.style.display = "flex";
        if (appLayout) appLayout.style.display = "none";
        if (profileBadge) profileBadge.style.display = "none";
        const userInput = document.getElementById("loginUsername");
        if (userInput) userInput.focus();
        return false;
    }
}

function handleLoginSubmit(event) {
    if (event) event.preventDefault();

    const usernameInput = document.getElementById("loginUsername");
    const passwordInput = document.getElementById("loginPassword");
    const errorBox = document.getElementById("loginErrorMsg");
    const errorText = document.getElementById("loginErrorText");
    const rememberMe = document.getElementById("rememberMeCheckbox");

    if (!usernameInput || !passwordInput) return;

    const enteredUser = usernameInput.value.trim();
    const enteredPass = passwordInput.value;

    const matchedUser = DUMMY_USERS.find(u => 
        u.username.toLowerCase() === enteredUser.toLowerCase() && u.password === enteredPass
    );

    if (matchedUser) {
        if (errorBox) errorBox.style.display = "none";
        
        const authData = {
            username: matchedUser.username,
            name: matchedUser.name,
            role: matchedUser.role,
            loggedInAt: Date.now()
        };

        if (rememberMe && rememberMe.checked) {
            localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify(authData));
            sessionStorage.removeItem(STORAGE_KEYS.AUTH);
        } else {
            sessionStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify(authData));
            localStorage.removeItem(STORAGE_KEYS.AUTH);
        }

        passwordInput.value = "";
        checkAuthStatus();
        showToast(`Welcome back, ${matchedUser.name}!`, "success");

        setTimeout(() => {
            renderCharts();
        }, 150);
    } else {
        if (errorBox) {
            errorBox.style.display = "flex";
            if (errorText) errorText.textContent = "Invalid User ID or Password. Try ID: admin, Pass: admin123";
        }
        passwordInput.focus();
        passwordInput.select();
    }
}

function autoFillDemoCredentials() {
    const usernameInput = document.getElementById("loginUsername");
    const passwordInput = document.getElementById("loginPassword");
    const errorBox = document.getElementById("loginErrorMsg");

    if (usernameInput && passwordInput) {
        usernameInput.value = "admin";
        passwordInput.value = "admin123";
        if (errorBox) errorBox.style.display = "none";
        showToast("Demo credentials loaded! Click 'Sign In'", "info");
    }
}

function togglePasswordVisibility() {
    const passwordInput = document.getElementById("loginPassword");
    const toggleIcon = document.getElementById("togglePasswordIcon");
    if (!passwordInput) return;

    if (passwordInput.type === "password") {
        passwordInput.type = "text";
        if (toggleIcon) {
            toggleIcon.classList.remove("fa-eye");
            toggleIcon.classList.add("fa-eye-slash");
        }
    } else {
        passwordInput.type = "password";
        if (toggleIcon) {
            toggleIcon.classList.remove("fa-eye-slash");
            toggleIcon.classList.add("fa-eye");
        }
    }
}

function handleLogout() {
    localStorage.removeItem(STORAGE_KEYS.AUTH);
    sessionStorage.removeItem(STORAGE_KEYS.AUTH);
    
    const usernameInput = document.getElementById("loginUsername");
    const passwordInput = document.getElementById("loginPassword");
    const errorBox = document.getElementById("loginErrorMsg");

    if (passwordInput) passwordInput.value = "";
    if (errorBox) errorBox.style.display = "none";

    checkAuthStatus();
    showToast("Signed out successfully.", "info");
}

function getCurrencySymbol(curr) {
    switch (curr) {
        case "INR": return "₹";
        case "USD": return "$";
        case "EUR": return "€";
        case "GBP": return "£";
        case "AED": return "AED ";
        default: return "₹";
    }
}

function formatAmount(val) {
    const num = Number(val) || 0;
    return `${state.currencySymbol}${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ==========================================================================
// TAB SWITCHING
// ==========================================================================
function switchTab(tabId) {
    state.activeTab = tabId;

    // Update Tab Buttons
    document.querySelectorAll(".nav-tab").forEach(tab => {
        if (tab.getAttribute("data-tab") === tabId) {
            tab.classList.add("active");
        } else {
            tab.classList.remove("active");
        }
    });

    // Update Tab Panes
    document.querySelectorAll(".tab-pane").forEach(pane => {
        if (pane.id === `tab-${tabId}`) {
            pane.classList.add("active");
        } else {
            pane.classList.remove("active");
        }
    });

    // Specific tab triggers
    if (tabId === "dashboard") {
        setTimeout(renderCharts, 100);
    } else if (tabId === "transactions") {
        filterTransactions();
    }
}

// ==========================================================================
// CORE COMPUTATION & UI REFRESH
// ==========================================================================
function refreshAllViews() {
    updateKpis();
    renderRecentTransactions();
    renderCharts();
    updateBudgetDisplay();
    updateFinancialHealth();
    generateSmartInsights();
    filterTransactions();
    updateAiEngineStatus();
}

function updateKpis() {
    let totalIncome = 0;
    let totalExpense = 0;
    let incomeCount = 0;
    let expenseCount = 0;

    state.transactions.forEach(t => {
        const amt = Number(t.amount) || 0;
        if (t.type === "income") {
            totalIncome += amt;
            incomeCount++;
        } else {
            totalExpense += amt;
            expenseCount++;
        }
    });

    const netBal = totalIncome - totalExpense;

    // DOM Updates
    const balEl = document.getElementById("balValue");
    const incEl = document.getElementById("incValue");
    const expEl = document.getElementById("expValue");
    const headerBalEl = document.getElementById("headerNetBal");
    const incCountText = document.getElementById("incCountText");
    const expRatioText = document.getElementById("expRatioText");
    const txBadge = document.getElementById("txCountBadge");

    if (balEl) balEl.innerText = formatAmount(netBal);
    if (incEl) incEl.innerText = formatAmount(totalIncome);
    if (expEl) expEl.innerText = formatAmount(totalExpense);
    if (headerBalEl) headerBalEl.innerText = formatAmount(netBal);
    if (incCountText) incCountText.innerText = `${incomeCount} credits recorded`;
    if (txBadge) txBadge.innerText = state.transactions.length;

    if (expRatioText) {
        if (totalIncome > 0) {
            const ratio = Math.round((totalExpense / totalIncome) * 100);
            expRatioText.innerText = `${ratio}% of total income`;
        } else {
            expRatioText.innerText = "No income logged yet";
        }
    }

    const netStatusEl = document.getElementById("kpiNetStatus");
    if (netStatusEl) {
        if (netBal >= 0) {
            netStatusEl.innerHTML = `<i class="fa-solid fa-arrow-trend-up"></i> Positive net cashflow`;
            netStatusEl.style.color = "var(--success)";
        } else {
            netStatusEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Net deficit this period`;
            netStatusEl.style.color = "var(--danger)";
        }
    }
}

function updateBudgetDisplay() {
    const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    
    // Sum expenses for current month
    let monthlySpend = 0;
    state.transactions.forEach(t => {
        if (t.type === "expense" && t.DATE && t.DATE.startsWith(currentMonth)) {
            monthlySpend += Number(t.amount) || 0;
        }
    });

    const limit = state.budget || 30000;
    const percentUsed = Math.min(Math.round((monthlySpend / limit) * 100), 100);
    const remaining = Math.max(limit - monthlySpend, 0);

    const spentEl = document.getElementById("budgetSpentVal");
    const limitEl = document.getElementById("budgetLimitVal");
    const badgeEl = document.getElementById("budgetPercentBadge");
    const barEl = document.getElementById("budgetProgressBar");
    const remainEl = document.getElementById("budgetRemainingText");

    if (spentEl) spentEl.innerText = formatAmount(monthlySpend);
    if (limitEl) limitEl.innerText = formatAmount(limit);
    if (badgeEl) badgeEl.innerText = `${percentUsed}% Used`;
    if (barEl) {
        barEl.style.width = `${percentUsed}%`;
        if (percentUsed > 90) {
            barEl.style.background = "var(--danger)";
        } else if (percentUsed > 70) {
            barEl.style.background = "var(--warning)";
        } else {
            barEl.style.background = "var(--brand-gradient)";
        }
    }
    if (remainEl) {
        if (monthlySpend > limit) {
            remainEl.innerText = `Exceeded budget by ${formatAmount(monthlySpend - limit)}!`;
            remainEl.style.color = "var(--danger)";
        } else {
            remainEl.innerText = `${formatAmount(remaining)} left to spend this month`;
            remainEl.style.color = "var(--text-muted)";
        }
    }
}

// ==========================================================================
// CHARTS & ANALYTICS (CHART.JS)
// ==========================================================================
function renderCharts() {
    renderCategoryDoughnut();
    renderCashflowBar();
}

function renderCategoryDoughnut() {
    const canvas = document.getElementById("categoryChart");
    const emptyPlaceholder = document.getElementById("noDataChartPlaceholder");
    if (!canvas) return;

    // Aggregate expenses by category
    const categoryTotals = {};
    let totalExpense = 0;

    state.transactions.forEach(t => {
        if (t.type === "expense") {
            const cat = t.CATEGORY || "Miscellaneous";
            const amt = Number(t.amount) || 0;
            categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
            totalExpense += amt;
        }
    });

    const labels = Object.keys(categoryTotals);
    const dataValues = Object.values(categoryTotals);

    if (labels.length === 0 || totalExpense === 0) {
        canvas.style.display = "none";
        if (emptyPlaceholder) emptyPlaceholder.style.display = "flex";
        const topBadge = document.getElementById("topCategoryBadge");
        if (topBadge) topBadge.innerText = "Top: None";
        if (categoryChartInstance) {
            categoryChartInstance.destroy();
            categoryChartInstance = null;
        }
        return;
    }

    canvas.style.display = "block";
    if (emptyPlaceholder) emptyPlaceholder.style.display = "none";

    // Find highest category
    let maxCat = labels[0];
    let maxVal = dataValues[0];
    labels.forEach((cat, i) => {
        if (dataValues[i] > maxVal) {
            maxVal = dataValues[i];
            maxCat = cat;
        }
    });
    const topBadge = document.getElementById("topCategoryBadge");
    if (topBadge) {
        const pct = Math.round((maxVal / totalExpense) * 100);
        topBadge.innerText = `Top: ${maxCat} (${pct}%)`;
    }

    const backgroundColors = labels.map(cat => CATEGORY_META[cat]?.color || "#64748b");

    if (categoryChartInstance) {
        categoryChartInstance.destroy();
    }

    const isDark = state.theme === "dark";
    const textColor = isDark ? "#f8fafc" : "#0f172a";

    categoryChartInstance = new Chart(canvas, {
        type: "doughnut",
        data: {
            labels: labels,
            datasets: [{
                data: dataValues,
                backgroundColor: backgroundColors,
                borderWidth: 2,
                borderColor: isDark ? "#111827" : "#ffffff",
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "right",
                    labels: {
                        color: textColor,
                        boxWidth: 12,
                        padding: 10,
                        font: { family: "Plus Jakarta Sans", size: 11, weight: "600" }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const val = context.raw || 0;
                            const pct = Math.round((val / totalExpense) * 100);
                            return ` ${context.label}: ${formatAmount(val)} (${pct}%)`;
                        }
                    }
                }
            },
            cutout: "68%"
        }
    });
}

function renderCashflowBar() {
    const canvas = document.getElementById("cashflowChart");
    if (!canvas) return;

    // Group by month
    const monthlyData = {};
    state.transactions.forEach(t => {
        const m = (t.DATE || "").slice(0, 7) || "Recent";
        if (!monthlyData[m]) {
            monthlyData[m] = { income: 0, expense: 0 };
        }
        const amt = Number(t.amount) || 0;
        if (t.type === "income") {
            monthlyData[m].income += amt;
        } else {
            monthlyData[m].expense += amt;
        }
    });

    const months = Object.keys(monthlyData).sort().slice(-6); // last 6 months
    const incomeData = months.map(m => monthlyData[m].income);
    const expenseData = months.map(m => monthlyData[m].expense);

    if (cashflowChartInstance) {
        cashflowChartInstance.destroy();
    }

    const isDark = state.theme === "dark";
    const textColor = isDark ? "#94a3b8" : "#64748b";
    const gridColor = isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)";

    cashflowChartInstance = new Chart(canvas, {
        type: "bar",
        data: {
            labels: months.map(m => formatMonthLabel(m)),
            datasets: [
                {
                    label: "Income",
                    data: incomeData,
                    backgroundColor: "#10b981",
                    borderRadius: 6,
                    barPercentage: 0.6
                },
                {
                    label: "Expense",
                    data: expenseData,
                    backgroundColor: "#f43f5e",
                    borderRadius: 6,
                    barPercentage: 0.6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (ctx) {
                            return ` ${ctx.dataset.label}: ${formatAmount(ctx.raw)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: textColor, font: { family: "Plus Jakarta Sans" } }
                },
                y: {
                    grid: { color: gridColor },
                    ticks: {
                        color: textColor,
                        font: { family: "Inter" },
                        callback: function (val) {
                            return state.currencySymbol + (val >= 1000 ? (val / 1000) + "k" : val);
                        }
                    }
                }
            }
        }
    });
}

function formatMonthLabel(mStr) {
    if (!mStr || mStr.length < 7) return mStr;
    const parts = mStr.split("-");
    const date = new Date(parts[0], parts[1] - 1);
    return date.toLocaleString("en-US", { month: "short", year: "2-digit" });
}

// ==========================================================================
// FINANCIAL HEALTH & SMART INSIGHTS
// ==========================================================================
function updateFinancialHealth() {
    let totalIncome = 0;
    let totalExpense = 0;
    let needsSpend = 0;
    let wantsSpend = 0;
    let savingsSpend = 0;

    const needsCategories = ["Housing & Utilities", "Food & Groceries", "Transportation", "Insurance & Healthcare", "Debt Repayment"];
    const wantsCategories = ["Shopping", "Entertainment", "Personal care", "Gift & Donation", "Miscellaneous"];
    const savingsCategories = ["Savings & Investments", "Education"];

    state.transactions.forEach(t => {
        const amt = Number(t.amount) || 0;
        if (t.type === "income") {
            totalIncome += amt;
        } else {
            totalExpense += amt;
            const cat = t.CATEGORY || "";
            if (needsCategories.includes(cat)) needsSpend += amt;
            else if (wantsCategories.includes(cat)) wantsSpend += amt;
            else if (savingsCategories.includes(cat)) savingsSpend += amt;
            else wantsSpend += amt;
        }
    });

    // 50/30/20 percentages
    const denom = totalIncome > 0 ? totalIncome : totalExpense || 1;
    const needsPct = Math.round((needsSpend / denom) * 100);
    const wantsPct = Math.round((wantsSpend / denom) * 100);
    const savingsPct = Math.max(0, Math.round(((totalIncome - totalExpense + savingsSpend) / denom) * 100));

    // Update Progress Bars
    const needsBar = document.getElementById("needsProgressBar");
    const wantsBar = document.getElementById("wantsProgressBar");
    const savingsBar = document.getElementById("savingsProgressBar");

    if (needsBar) needsBar.style.width = `${Math.min(needsPct, 100)}%`;
    if (wantsBar) wantsBar.style.width = `${Math.min(wantsPct, 100)}%`;
    if (savingsBar) savingsBar.style.width = `${Math.min(savingsPct, 100)}%`;

    const nText = document.getElementById("needsPercentText");
    const wText = document.getElementById("wantsPercentText");
    const sText = document.getElementById("savingsPercentText");

    if (nText) nText.innerText = `${needsPct}% (Goal: 50%)`;
    if (wText) wText.innerText = `${wantsPct}% (Goal: 30%)`;
    if (sText) sText.innerText = `${savingsPct}% (Goal: 20%)`;

    // Calculate Financial Health Score (0 - 100)
    let score = 70;
    if (totalIncome > 0) {
        const savingsRatio = (totalIncome - totalExpense) / totalIncome;
        if (savingsRatio >= 0.3) score += 20;
        else if (savingsRatio >= 0.15) score += 10;
        else if (savingsRatio < 0) score -= 30;

        if (needsPct > 65) score -= 10;
        if (wantsPct > 40) score -= 10;
    }
    score = Math.max(20, Math.min(score, 98));

    const scoreVal = document.getElementById("healthScoreVal");
    const gradeBadge = document.getElementById("healthGradeBadge");
    const scoreDesc = document.getElementById("healthScoreDesc");

    if (scoreVal) scoreVal.innerText = score;
    if (gradeBadge) {
        if (score >= 80) {
            gradeBadge.innerText = "Excellent";
            gradeBadge.className = "badge badge-success";
        } else if (score >= 60) {
            gradeBadge.innerText = "Good";
            gradeBadge.className = "badge badge-success";
        } else {
            gradeBadge.innerText = "Needs Attention";
            gradeBadge.className = "badge badge-danger";
        }
    }
    if (scoreDesc) {
        if (score >= 80) {
            scoreDesc.innerText = "Superb discipline! Your savings rate is strong and spending is well within limits.";
        } else if (score >= 60) {
            scoreDesc.innerText = "Stable finances. Try trimming minor lifestyle wants to boost monthly investments.";
        } else {
            scoreDesc.innerText = "Caution: Monthly expenses are outpacing income. Check high-cost categories.";
        }
    }
}

function generateSmartInsights() {
    const list = document.getElementById("insightsList");
    if (!list) return;

    const insights = [];
    let totalIncome = 0;
    let totalExpense = 0;
    const catSpends = {};

    state.transactions.forEach(t => {
        const amt = Number(t.amount) || 0;
        if (t.type === "income") totalIncome += amt;
        else {
            totalExpense += amt;
            const cat = t.CATEGORY || "Miscellaneous";
            catSpends[cat] = (catSpends[cat] || 0) + amt;
        }
    });

    // Check top spending category
    let topCat = null;
    let topAmt = 0;
    for (const cat in catSpends) {
        if (catSpends[cat] > topAmt) {
            topAmt = catSpends[cat];
            topCat = cat;
        }
    }

    if (topCat && totalExpense > 0) {
        const pct = Math.round((topAmt / totalExpense) * 100);
        insights.push({
            type: pct > 40 ? "warning" : "info",
            icon: pct > 40 ? "fa-solid fa-triangle-exclamation" : "fa-solid fa-chart-pie",
            title: `Heavy ${topCat} Spend`,
            desc: `You spent ${formatAmount(topAmt)} (${pct}% of all expenses) on ${topCat}. Look for recurring subscriptions or bulk savings.`
        });
    }

    // Savings rate insight
    if (totalIncome > 0) {
        const savings = totalIncome - totalExpense;
        const rate = Math.round((savings / totalIncome) * 100);
        if (rate >= 20) {
            insights.push({
                type: "success",
                icon: "fa-solid fa-trophy",
                title: "Healthy Savings Momentum!",
                desc: `You've retained ${rate}% of your earnings this period (${formatAmount(savings)}). Consider allocating surplus into an SIP or emergency fund.`
            });
        } else if (rate < 0) {
            insights.push({
                type: "warning",
                icon: "fa-solid fa-bolt",
                title: "Negative Cashflow Alert",
                desc: `Expenses exceed total income by ${formatAmount(Math.abs(savings))}. Pause non-essential shopping to balance the books.`
            });
        }
    }

    // Mobile Direct Spend Tip
    insights.push({
        type: "info",
        icon: "fa-solid fa-mobile-screen",
        title: "Log UPI Direct from Phone",
        desc: "Tap 'Connect Phone' to open this app on your phone, scan merchant QR standees, or share GPay receipts directly from your phone's share sheet!"
    });

    list.innerHTML = insights.map(item => `
        <div class="insight-card">
            <div class="insight-icon ${item.type}"><i class="${item.icon}"></i></div>
            <div class="insight-body">
                <h4>${item.title}</h4>
                <p>${item.desc}</p>
            </div>
        </div>
    `).join("");
}

function renderRecentTransactions() {
    const container = document.getElementById("recentTransactionsList");
    if (!container) return;

    const recent = [...state.transactions].sort((a, b) => new Date(b.DATE || 0) - new Date(a.DATE || 0)).slice(0, 5);

    if (recent.length === 0) {
        container.innerHTML = `<div class="mini-tx-item" style="justify-content: center; color: var(--text-muted);">No transactions recorded yet</div>`;
        return;
    }

    container.innerHTML = recent.map(t => {
        const meta = CATEGORY_META[t.CATEGORY] || CATEGORY_META["Miscellaneous"];
        const isIncome = t.type === "income";
        const sign = isIncome ? "+" : "-";
        return `
            <div class="mini-tx-item">
                <div class="mini-tx-left">
                    <div class="mini-tx-icon" style="color: ${meta.color}; background: ${meta.bg};">
                        <i class="${meta.icon}"></i>
                    </div>
                    <div class="mini-tx-info">
                        <h5>${escapeHtml(t.text)}</h5>
                        <span>${escapeHtml(t.CATEGORY)} • ${formatDate(t.DATE)}</span>
                    </div>
                </div>
                <div class="mini-tx-amount ${t.type}">
                    ${sign}${formatAmount(t.amount)}
                </div>
            </div>
        `;
    }).join("");
}

// ==========================================================================
// TRANSACTIONS TAB & FILTERING
// ==========================================================================
function filterTransactions() {
    const listEl = document.getElementById("txList");
    const emptyState = document.getElementById("txEmptyState");
    const statsText = document.getElementById("filteredStatsText");
    const searchInput = document.getElementById("txSearchInput");
    const clearSearchBtn = document.getElementById("clearSearchBtn");
    const catSelect = document.getElementById("categoryFilterSelect");
    const sortSelect = document.getElementById("sortSelect");

    if (!listEl) return;

    state.searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : "";
    state.filterCategory = catSelect ? catSelect.value : "all";
    state.sortBy = sortSelect ? sortSelect.value : "date-desc";

    if (clearSearchBtn) {
        clearSearchBtn.style.display = state.searchQuery ? "block" : "none";
    }

    let filtered = state.transactions.filter(t => {
        // Type filter
        if (state.filterType !== "all" && t.type !== state.filterType) return false;
        
        // Category filter
        if (state.filterCategory !== "all" && t.CATEGORY !== state.filterCategory) return false;

        // Search query
        if (state.searchQuery) {
            const textMatch = (t.text || "").toLowerCase().includes(state.searchQuery);
            const catMatch = (t.CATEGORY || "").toLowerCase().includes(state.searchQuery);
            const upiMatch = (t.upiRef || "").toLowerCase().includes(state.searchQuery);
            const amtMatch = String(t.amount || "").includes(state.searchQuery);
            if (!textMatch && !catMatch && !upiMatch && !amtMatch) return false;
        }

        return true;
    });

    // Sorting
    filtered.sort((a, b) => {
        if (state.sortBy === "date-desc") return new Date(b.DATE || 0) - new Date(a.DATE || 0);
        if (state.sortBy === "date-asc") return new Date(a.DATE || 0) - new Date(b.DATE || 0);
        if (state.sortBy === "amount-desc") return Number(b.amount) - Number(a.amount);
        if (state.sortBy === "amount-asc") return Number(a.amount) - Number(b.amount);
        return 0;
    });

    if (statsText) {
        statsText.innerText = `Showing ${filtered.length} of ${state.transactions.length} entries`;
    }

    if (filtered.length === 0) {
        listEl.innerHTML = "";
        if (emptyState) emptyState.style.display = "block";
        return;
    }

    if (emptyState) emptyState.style.display = "none";

    listEl.innerHTML = filtered.map(t => {
        const meta = CATEGORY_META[t.CATEGORY] || CATEGORY_META["Miscellaneous"];
        const isIncome = t.type === "income";
        const sign = isIncome ? "+" : "-";
        const method = t.paymentMethod || "UPI";

        return `
            <li class="tx-card-item">
                <div class="tx-item-left">
                    <div class="tx-cat-avatar" style="color: ${meta.color}; background: ${meta.bg};">
                        <i class="${meta.icon}"></i>
                    </div>
                    <div class="tx-main-details">
                        <div class="tx-title-row">
                            <span class="tx-desc">${escapeHtml(t.text)}</span>
                            <span class="payment-method-badge">
                                <i class="${getMethodIcon(method)}"></i> ${method}
                            </span>
                            ${t.upiRef ? `<span class="payment-method-badge" title="UPI Ref: ${escapeHtml(t.upiRef)}"><i class="fa-solid fa-fingerprint"></i> ${escapeHtml(t.upiRef.slice(0, 10))}...</span>` : ""}
                        </div>
                        <div class="tx-meta-row">
                            <span><i class="fa-solid fa-tag"></i> ${escapeHtml(t.CATEGORY)}</span>
                            <span>•</span>
                            <span><i class="fa-regular fa-calendar"></i> ${formatDate(t.DATE)}</span>
                        </div>
                    </div>
                </div>

                <div class="tx-item-right">
                    <div class="tx-amount-display ${t.type}">
                        ${sign}${formatAmount(t.amount)}
                    </div>
                    <div class="tx-action-icons">
                        <button class="tx-action-btn" title="Edit Entry" onclick="openEditModal('${t.id}')">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="tx-action-btn delete-btn" title="Delete Entry" onclick="openDeleteConfirm('${t.id}')">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>
            </li>
        `;
    }).join("");
}

function setTypeFilter(type) {
    state.filterType = type;
    document.querySelectorAll(".filter-pill").forEach(pill => {
        if (pill.getAttribute("data-filter") === type) {
            pill.classList.add("active");
        } else {
            pill.classList.remove("active");
        }
    });
    filterTransactions();
}

function clearSearch() {
    const input = document.getElementById("txSearchInput");
    if (input) input.value = "";
    filterTransactions();
}

function getMethodIcon(method) {
    if (method === "UPI") return "fa-solid fa-bolt";
    if (method.includes("Card")) return "fa-solid fa-credit-card";
    if (method === "Cash") return "fa-solid fa-money-bill-1";
    if (method.includes("Bank")) return "fa-solid fa-building-columns";
    return "fa-solid fa-wallet";
}

// ==========================================================================
// MODAL: ADD / EDIT TRANSACTION
// ==========================================================================
function openAddModal() {
    const form = document.getElementById("txForm");
    if (form) form.reset();

    const title = document.getElementById("txModalTitle");
    if (title) title.innerHTML = `<i class="fa-solid fa-circle-plus"></i> Add Transaction`;

    document.getElementById("editingTxId").value = "";
    document.getElementById("typeExpense").checked = true;
    document.getElementById("txDate").value = new Date().toISOString().split("T")[0];
    document.getElementById("txCategory").value = "Food & Groceries";
    document.getElementById("txPaymentMethod").value = "UPI";

    openModal("txModal");
}

function openEditModal(id) {
    const tx = state.transactions.find(t => t.id === id);
    if (!tx) return;

    document.getElementById("editingTxId").value = tx.id;
    const title = document.getElementById("txModalTitle");
    if (title) title.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Edit Transaction`;

    if (tx.type === "income") {
        document.getElementById("typeIncome").checked = true;
    } else {
        document.getElementById("typeExpense").checked = true;
    }

    document.getElementById("txDesc").value = tx.text || "";
    document.getElementById("txAmount").value = tx.amount || "";
    document.getElementById("txDate").value = tx.DATE || new Date().toISOString().split("T")[0];
    document.getElementById("txCategory").value = tx.CATEGORY || "Miscellaneous";
    document.getElementById("txPaymentMethod").value = tx.paymentMethod || "UPI";
    document.getElementById("txUpiRef").value = tx.upiRef || "";

    openModal("txModal");
}

function handleTxSubmit(e) {
    e.preventDefault();

    const editId = document.getElementById("editingTxId").value;
    const desc = document.getElementById("txDesc").value.trim();
    const amount = Number(document.getElementById("txAmount").value);
    const date = document.getElementById("txDate").value;
    const category = document.getElementById("txCategory").value;
    const paymentMethod = document.getElementById("txPaymentMethod").value;
    const upiRef = document.getElementById("txUpiRef").value.trim();
    const type = document.getElementById("typeIncome").checked ? "income" : "expense";

    if (!desc || isNaN(amount) || amount <= 0 || !date) {
        showToast("Please fill in all required fields accurately", "error");
        return;
    }

    if (editId) {
        // Updating existing
        const idx = state.transactions.findIndex(t => t.id === editId);
        if (idx !== -1) {
            state.transactions[idx] = {
                ...state.transactions[idx],
                text: desc,
                amount: amount,
                DATE: date,
                CATEGORY: category,
                paymentMethod: paymentMethod,
                upiRef: upiRef,
                type: type
            };
            showToast("Transaction updated successfully", "success");
        }
    } else {
        // Adding new
        const newTx = {
            id: "tx_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
            text: desc,
            amount: amount,
            DATE: date,
            CATEGORY: category,
            paymentMethod: paymentMethod,
            upiRef: upiRef,
            type: type,
            createdAt: Date.now()
        };
        state.transactions.unshift(newTx);
        showToast("Transaction added successfully", "success");
    }

    saveTransactions();
    refreshAllViews();
    closeModal("txModal");
}

function handleTypeChange() {
    const isIncome = document.getElementById("typeIncome").checked;
    const catSelect = document.getElementById("txCategory");
    if (isIncome && catSelect) {
        catSelect.value = "Salary / Wages";
    } else if (catSelect && catSelect.value === "Salary / Wages") {
        catSelect.value = "Food & Groceries";
    }
}

// ==========================================================================
// MODAL: BUDGET SETTINGS
// ==========================================================================
function openBudgetModal() {
    const input = document.getElementById("budgetInput");
    if (input) input.value = state.budget;
    openModal("budgetModal");
}

function handleBudgetSubmit(e) {
    e.preventDefault();
    const val = Number(document.getElementById("budgetInput").value);
    if (val && val >= 100) {
        state.budget = val;
        localStorage.setItem(STORAGE_KEYS.BUDGET, val);
        updateBudgetDisplay();
        showToast(`Monthly budget set to ${formatAmount(val)}`, "success");
        closeModal("budgetModal");
    } else {
        showToast("Please enter a valid budget amount", "error");
    }
}

// ==========================================================================
// DELETE & CLEAR CONFIRMATION
// ==========================================================================
function openDeleteConfirm(id) {
    state.currentDeleteId = id;
    const modalText = document.getElementById("confirmModalText");
    const confirmBtn = document.getElementById("confirmActionBtn");

    if (modalText) modalText.innerText = "Are you sure you want to delete this transaction?";
    if (confirmBtn) {
        confirmBtn.onclick = () => {
            state.transactions = state.transactions.filter(t => t.id !== state.currentDeleteId);
            saveTransactions();
            refreshAllViews();
            closeModal("confirmModal");
            showToast("Transaction deleted", "info");
        };
    }
    openModal("confirmModal");
}

function openClearAllConfirm() {
    const modalText = document.getElementById("confirmModalText");
    const confirmBtn = document.getElementById("confirmActionBtn");

    if (modalText) modalText.innerText = "Warning: This will permanently delete ALL recorded transactions and reset your dashboard.";
    if (confirmBtn) {
        confirmBtn.onclick = () => {
            state.transactions = [];
            saveTransactions();
            refreshAllViews();
            closeModal("confirmModal");
            showToast("All data cleared successfully", "info");
        };
    }
    openModal("confirmModal");
}

// ==========================================================================
// PHONE CONNECT & LOCAL NETWORK QR MODAL
// ==========================================================================
function openPhoneConnectModal() {
    const defaultHost = "10.75.105.165:8000";
    let targetUrl = window.location.origin;
    if (targetUrl.includes("localhost") || targetUrl.includes("127.0.0.1")) {
        targetUrl = `http://${defaultHost}`;
    }

    const input = document.getElementById("phoneConnectUrlInput");
    if (input) input.value = targetUrl;

    const qrContainer = document.getElementById("phoneConnectQrContainer");
    if (qrContainer) {
        qrContainer.innerHTML = "";
        if (typeof QRCode !== "undefined") {
            new QRCode(qrContainer, {
                text: targetUrl,
                width: 140,
                height: 140,
                colorDark: "#0b0f19",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.M
            });
        }
    }

    openModal("phoneConnectModal");
}

function copyPhoneUrl() {
    const input = document.getElementById("phoneConnectUrlInput");
    if (input) {
        navigator.clipboard.writeText(input.value)
            .then(() => showToast("Phone URL copied to clipboard!", "success"))
            .catch(() => showToast("Please copy URL manually", "info"));
    }
}

// ==========================================================================
// CAMERA LIVE UPI QR SCANNER (PHONE CAMERA)
// ==========================================================================
let scannedUpiData = null;

function openCameraQrScanner() {
    openModal("cameraQrModal");
    const resultBox = document.getElementById("cameraScanResult");
    if (resultBox) resultBox.style.display = "none";

    const readerEl = document.getElementById("qrCameraReader");
    if (!readerEl) return;
    readerEl.innerHTML = "";

    if (typeof Html5Qrcode === "undefined") {
        showToast("Camera scanner library loading...", "info");
        return;
    }

    html5QrScanner = new Html5Qrcode("qrCameraReader");
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrScanner.start({ facingMode: "environment" }, config, onQrCodeSuccess, onQrCodeError)
        .catch(err => {
            console.error("Camera access error:", err);
            readerEl.innerHTML = `
                <div style="padding: 2rem; text-align: center; color: var(--text-muted);">
                    <i class="fa-solid fa-camera-slash" style="font-size: 2rem; margin-bottom: 0.5rem; color: var(--danger);"></i>
                    <p>Unable to access phone camera. Please grant camera permission in your browser.</p>
                </div>
            `;
        });
}

function onQrCodeSuccess(decodedText) {
    if (html5QrScanner) {
        html5QrScanner.stop().catch(() => {});
    }

    scannedUpiData = parseUpiUri(decodedText);

    const resultBox = document.getElementById("cameraScanResult");
    const titleEl = document.getElementById("scanResultTitle");
    const vpaEl = document.getElementById("scanResultVpa");
    const amtInput = document.getElementById("scanResultAmount");
    const payBtn = document.getElementById("scanPayIntentBtn");

    if (resultBox) resultBox.style.display = "block";
    if (titleEl) titleEl.innerText = scannedUpiData.name || "Merchant Standee";
    if (vpaEl) vpaEl.innerText = `VPA: ${scannedUpiData.vpa || "Unknown"}`;
    if (amtInput) amtInput.value = scannedUpiData.amount || "";

    if (payBtn) {
        payBtn.href = decodedText.startsWith("upi://") ? decodedText : `upi://pay?pa=${encodeURIComponent(scannedUpiData.vpa)}&pn=${encodeURIComponent(scannedUpiData.name)}`;
    }

    showToast("QR Code Scanned Successfully!", "success");
}

function onQrCodeError(error) {
    // Silent scanning error
}

function closeCameraQrScanner() {
    if (html5QrScanner) {
        html5QrScanner.stop().then(() => {
            html5QrScanner = null;
        }).catch(() => {
            html5QrScanner = null;
        });
    }
    closeModal("cameraQrModal");
}

function parseUpiUri(uri) {
    const data = { vpa: "", name: "Merchant", amount: "", note: "" };
    if (!uri) return data;

    if (uri.startsWith("upi://pay")) {
        const query = uri.split("?")[1] || "";
        const p = new URLSearchParams(query);
        data.vpa = p.get("pa") || "";
        data.name = p.get("pn") || "Merchant Store";
        data.amount = p.get("am") || "";
        data.note = p.get("tn") || "";
    } else {
        data.vpa = uri;
    }
    return data;
}

function commitCameraScannedUpi() {
    if (!scannedUpiData) return;

    const amt = parseFloat(document.getElementById("scanResultAmount").value);
    if (isNaN(amt) || amt <= 0) {
        showToast("Please enter the amount paid", "error");
        return;
    }

    const cat = inferCategory(scannedUpiData.name + " " + scannedUpiData.note);
    const newTx = {
        id: "tx_cam_" + Date.now(),
        text: scannedUpiData.name || "QR Payment",
        amount: amt,
        DATE: new Date().toISOString().split("T")[0],
        CATEGORY: cat,
        paymentMethod: "UPI",
        upiRef: scannedUpiData.vpa ? `VPA: ${scannedUpiData.vpa}` : "Scanned QR",
        type: "expense",
        createdAt: Date.now()
    };

    state.transactions.unshift(newTx);
    saveTransactions();
    refreshAllViews();
    closeCameraQrScanner();
    showToast(`Recorded ₹${amt} expense to ${scannedUpiData.name}!`, "success");
}

// ==========================================================================
// UPI PAYMENT SCREENSHOT & RECEIPT OCR
// ==========================================================================
function openScreenshotOcrModal() {
    const progressBox = document.getElementById("ocrProgressBox");
    const resultCard = document.getElementById("ocrResultCard");
    const fileInput = document.getElementById("ocrFileInput");

    if (progressBox) progressBox.style.display = "none";
    if (resultCard) resultCard.style.display = "none";
    if (fileInput) fileInput.value = "";

    openModal("screenshotOcrModal");
}

function handleOcrImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const previewImg = document.getElementById("ocrPreviewImg");
    const progressBox = document.getElementById("ocrProgressBox");
    const statusText = document.getElementById("ocrStatusText");
    const resultCard = document.getElementById("ocrResultCard");

    if (resultCard) resultCard.style.display = "none";
    if (progressBox) progressBox.style.display = "block";

    const reader = new FileReader();
    reader.onload = (event) => {
        if (previewImg) previewImg.src = event.target.result;

        if (typeof Tesseract === "undefined") {
            if (statusText) statusText.innerText = "OCR library unavailable. Please type manually.";
            return;
        }

        if (statusText) statusText.innerText = "Scanning text with on-device OCR...";

        Tesseract.recognize(
            event.target.result,
            'eng',
            { logger: m => {
                if (m.status === 'recognizing text' && statusText) {
                    statusText.innerText = `Analyzing image: ${Math.round(m.progress * 100)}%`;
                }
            }}
        ).then(({ data: { text } }) => {
            if (progressBox) progressBox.style.display = "none";
            parseOcrTextResult(text);
        }).catch(err => {
            console.error("OCR Error:", err);
            if (statusText) statusText.innerText = "OCR could not process image.";
        });
    };
    reader.readAsDataURL(file);
}

function parseOcrTextResult(rawText) {
    const lower = rawText.toLowerCase();

    // 1. Amount Extraction
    let amount = 0;
    const amtMatch = rawText.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i) || rawText.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:rs|inr)/i);
    if (amtMatch && amtMatch[1]) {
        amount = parseFloat(amtMatch[1].replace(/,/g, ""));
    }

    // 2. Payee Extraction
    let payee = "";
    const paidToMatch = rawText.match(/(?:paid to|payment to|to|sent to)\s+([A-Za-z0-9\s&.\-_]+)/i);
    if (paidToMatch && paidToMatch[1]) {
        payee = paidToMatch[1].split("\n")[0].trim().slice(0, 30);
    } else {
        payee = "UPI Merchant";
    }

    // 3. UTR / Ref Extraction
    let ref = "";
    const refMatch = rawText.match(/(?:utr|txn id|transaction id|ref no|upi ref)[\s#:.-]*([0-9a-zA-Z]{8,18})/i);
    if (refMatch && refMatch[1]) {
        ref = refMatch[1];
    }

    const cat = inferCategory(payee + " " + rawText);

    // Populate OCR Result Card
    const resultCard = document.getElementById("ocrResultCard");
    const amtEl = document.getElementById("ocrParsedAmount");
    const titleInput = document.getElementById("ocrParsedTitle");
    const catSelect = document.getElementById("ocrParsedCategory");
    const refInput = document.getElementById("ocrParsedRef");
    const dateInput = document.getElementById("ocrParsedDate");

    if (resultCard) resultCard.style.display = "flex";
    if (amtEl) amtEl.innerText = formatAmount(amount);
    if (titleInput) titleInput.value = payee;
    if (catSelect) catSelect.value = cat;
    if (refInput) refInput.value = ref ? `UTR: ${ref}` : "";
    if (dateInput) dateInput.value = new Date().toISOString().split("T")[0];

    showToast("Extracted payment details from screenshot!", "success");
}

function commitOcrTransaction() {
    const title = document.getElementById("ocrParsedTitle").value.trim() || "Receipt Expense";
    const category = document.getElementById("ocrParsedCategory").value;
    const ref = document.getElementById("ocrParsedRef").value.trim();
    const date = document.getElementById("ocrParsedDate").value || new Date().toISOString().split("T")[0];
    const amtStr = document.getElementById("ocrParsedAmount").innerText.replace(/[^0-9.]/g, "");
    const amount = parseFloat(amtStr) || 0;

    if (amount <= 0) {
        showToast("Please enter a valid amount", "error");
        return;
    }

    const newTx = {
        id: "tx_ocr_" + Date.now(),
        text: title,
        amount: amount,
        DATE: date,
        CATEGORY: category,
        paymentMethod: "UPI",
        upiRef: ref || "From Screenshot OCR",
        type: "expense",
        createdAt: Date.now()
    };

    state.transactions.unshift(newTx);
    saveTransactions();
    refreshAllViews();
    closeModal("screenshotOcrModal");

    showToast(`Added ${formatAmount(amount)} (${title}) to expenses!`, "success");
}

// ==========================================================================
// UPI HUB: DYNAMIC QR & MOBILE INTENT LAUNCHER
// ==========================================================================
let lastGeneratedUpiPayment = null;

function generateUpiPayment() {
    const vpa = document.getElementById("upiVpa").value.trim();
    const name = document.getElementById("upiPayeeName").value.trim() || "Merchant";
    const amount = Number(document.getElementById("upiAmount").value);
    const note = document.getElementById("upiNote").value.trim() || "Expense Payment";
    const category = document.getElementById("upiCategory").value;

    if (!vpa || !vpa.includes("@")) {
        showToast("Please enter a valid UPI ID (e.g. name@icici, mobile@paytm)", "error");
        return;
    }

    if (isNaN(amount) || amount <= 0) {
        showToast("Please enter a valid amount", "error");
        return;
    }

    // Standard NPCI UPI URI Specification
    const upiUri = `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(name)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;

    lastGeneratedUpiPayment = {
        vpa, name, amount, note, category, upiUri
    };

    // Render QR Code
    const qrContainer = document.getElementById("upiQrcodeContainer");
    if (qrContainer) {
        qrContainer.innerHTML = "";
        if (typeof QRCode !== "undefined") {
            new QRCode(qrContainer, {
                text: upiUri,
                width: 140,
                height: 140,
                colorDark: "#0b0f19",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.M
            });
        }
    }

    // Update details display
    const titleEl = document.getElementById("upiDisplayTitle");
    const vpaEl = document.getElementById("upiDisplayVpa");
    const intentBtn = document.getElementById("upiMobileIntentBtn");
    const resultBox = document.getElementById("upiResultBox");

    if (titleEl) titleEl.innerText = `Pay ₹${amount.toLocaleString("en-IN")} to ${name}`;
    if (vpaEl) vpaEl.innerText = `UPI VPA: ${vpa} • Note: ${note}`;
    if (intentBtn) {
        intentBtn.href = upiUri;
    }
    if (resultBox) {
        resultBox.style.display = "flex";
        resultBox.scrollIntoView({ behavior: "smooth" });
    }

    showToast("UPI QR Code & Mobile Link Generated!", "success");
}

function handleMobileUpiIntentClick() {
    if (lastGeneratedUpiPayment) {
        sessionStorage.setItem("pending_upi_payment", JSON.stringify(lastGeneratedUpiPayment));
    }
}

function checkPendingUpiReturn() {
    const pending = sessionStorage.getItem("pending_upi_payment");
    if (!pending) return;

    try {
        const data = JSON.parse(pending);
        const confirmText = document.getElementById("upiReturnConfirmText");
        const confirmBtn = document.getElementById("upiReturnConfirmBtn");

        if (confirmText) {
            confirmText.innerText = `Did you complete your payment of ₹${data.amount} to ${data.name}?`;
        }

        if (confirmBtn) {
            confirmBtn.onclick = () => {
                const newTx = {
                    id: "tx_upi_ret_" + Date.now(),
                    text: `${data.name} (${data.note})`,
                    amount: Number(data.amount),
                    DATE: new Date().toISOString().split("T")[0],
                    CATEGORY: data.category,
                    paymentMethod: "UPI",
                    upiRef: `${data.vpa}`,
                    type: "expense",
                    createdAt: Date.now()
                };
                state.transactions.unshift(newTx);
                saveTransactions();
                refreshAllViews();
                sessionStorage.removeItem("pending_upi_payment");
                closeModal("upiReturnConfirmModal");
                showToast(`Recorded ₹${data.amount} to ${data.name}!`, "success");
            };
        }

        openModal("upiReturnConfirmModal");
    } catch (e) {
        sessionStorage.removeItem("pending_upi_payment");
    }
}

function recordUpiPaymentAsExpense() {
    if (!lastGeneratedUpiPayment) {
        showToast("Generate a payment first", "error");
        return;
    }

    const { name, amount, note, category, vpa } = lastGeneratedUpiPayment;
    const refNum = "UPI" + Date.now().toString().slice(-8);

    const newTx = {
        id: "tx_upi_" + Date.now(),
        text: `${name} (${note})`,
        amount: amount,
        DATE: new Date().toISOString().split("T")[0],
        CATEGORY: category,
        paymentMethod: "UPI",
        upiRef: `${vpa} | Ref: ${refNum}`,
        type: "expense",
        createdAt: Date.now()
    };

    state.transactions.unshift(newTx);
    saveTransactions();
    refreshAllViews();

    if (typeof confetti === "function") {
        confetti({ particleCount: 40, spread: 60, origin: { y: 0.8 } });
    }

    showToast(`Recorded ₹${amount} expense to ${name}!`, "success");
}

function loadFrequentUpiContact(vpa, name, amt, cat, note) {
    document.getElementById("upiVpa").value = vpa;
    document.getElementById("upiPayeeName").value = name;
    document.getElementById("upiAmount").value = amt;
    document.getElementById("upiCategory").value = cat;
    document.getElementById("upiNote").value = note;
    generateUpiPayment();
}

// ==========================================================================
// UPI HUB: SMS / PUSH NOTIFICATION PARSER
// ==========================================================================
const SAMPLE_SMS = {
    swiggy: "Paid Rs. 420.00 to SWIGGY via UPI Ref 418294719273 on 21-10-2026. Bal: Rs. 14,250.00 - HDFC Bank",
    salary: "Dear Customer, your A/c ending 4892 is credited with Rs 65,000.00 on 20-Oct-26 by transfer from TECH LABS CORP UPI Ref 3829104821. Net Bal: Rs 82,410.00 - SBI",
    flipkart: "Sent Rs. 1,499.00 to FLIPKART PAYMENTS UPI ID: flipkart@icici Ref: 9948271048 on 19-10-2026. Avail Bal: Rs 12,751.00",
    petrol: "Rs. 500.00 debited from A/c XX1234 at INDIAN OIL PETROL PUMP on 21-Oct-26 via UPI Ref 4910283741. Avl Bal Rs. 8,300.00"
};

function fillSampleSms(key) {
    const input = document.getElementById("smsRawInput");
    if (input && SAMPLE_SMS[key]) {
        input.value = SAMPLE_SMS[key];
        parseSmsTransaction();
    }
}

function clearSmsInput() {
    const input = document.getElementById("smsRawInput");
    if (input) input.value = "";
    const card = document.getElementById("parsedResultCard");
    if (card) card.style.display = "none";
}

async function pasteFromClipboard() {
    try {
        if (navigator.clipboard && navigator.clipboard.readText) {
            const text = await navigator.clipboard.readText();
            const input = document.getElementById("smsRawInput");
            if (input && text) {
                input.value = text;
                parseSmsTransaction();
                showToast("Pasted from clipboard", "info");
            }
        } else {
            showToast("Clipboard access not supported. Please paste with Ctrl+V.", "info");
        }
    } catch (e) {
        showToast("Please paste text using Ctrl+V", "info");
    }
}

/**
 * Intelligent regex and heuristic parser for Indian Bank & UPI transaction SMS
 */
function parseSmsTransaction() {
    const raw = (document.getElementById("smsRawInput").value || "").trim();
    if (!raw) {
        showToast("Please paste SMS or alert text first", "error");
        return;
    }

    const lower = raw.toLowerCase();

    // 1. Determine Type: Credit vs Debit
    let type = "expense";
    const creditKeywords = ["credited", "received", "deposited", "refund", "salary", "added to"];
    if (creditKeywords.some(k => lower.includes(k))) {
        type = "income";
    }

    // 2. Extract Amount
    let amount = 0;
    const amtRegex = /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i;
    const amtMatch = raw.match(amtRegex);
    if (amtMatch && amtMatch[1]) {
        amount = parseFloat(amtMatch[1].replace(/,/g, ""));
    }

    // 3. Extract Payee / Merchant / Description
    let payee = "";
    const toMatch = raw.match(/(?:to|at|from)\s+([A-Za-z0-9\s&.\-_]+?)(?=\s+(?:via|on|ref|upi|using|bal|avail|\.|\n|$))/i);
    if (toMatch && toMatch[1]) {
        payee = toMatch[1].trim();
    } else {
        payee = type === "income" ? "Deposit / Income" : "UPI Payment";
    }

    // 4. Extract UPI Ref / UTR
    let refNum = "";
    const refMatch = raw.match(/(?:ref|utr|rrn|txn)[\s#:.-]*([0-9]{6,16})/i);
    if (refMatch && refMatch[1]) {
        refNum = refMatch[1];
    }

    // 5. Categorize based on merchant keywords
    let category = inferCategory(payee + " " + raw);
    if (type === "income" && (lower.includes("salary") || lower.includes("payroll"))) {
        category = "Salary / Wages";
    }

    // Display parsed result
    const card = document.getElementById("parsedResultCard");
    const badge = document.getElementById("parsedTypeBadge");
    const amtEl = document.getElementById("parsedAmount");
    const titleInput = document.getElementById("parsedTitle");
    const catInput = document.getElementById("parsedCategory");
    const refInput = document.getElementById("parsedRef");
    const dateInput = document.getElementById("parsedDate");

    if (card) card.style.display = "flex";
    if (badge) {
        badge.innerText = type.toUpperCase();
        badge.className = type === "income" ? "parsed-badge badge-success" : "parsed-badge badge-danger";
        badge.style.background = type === "income" ? "var(--success-bg)" : "var(--danger-bg)";
        badge.style.color = type === "income" ? "var(--success)" : "var(--danger)";
    }
    if (amtEl) {
        amtEl.innerText = formatAmount(amount);
        amtEl.style.color = type === "income" ? "var(--success)" : "var(--danger)";
    }
    if (titleInput) titleInput.value = payee || (type === "income" ? "Income Credit" : "Expense");
    if (catInput) catInput.value = category;
    if (refInput) refInput.value = refNum ? `UPI Ref: ${refNum}` : "";
    if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().split("T")[0];

    showToast("Extracted transaction details! Review & click Add.", "success");
}

function inferCategory(text) {
    const t = text.toLowerCase();

    if (t.includes("swiggy") || t.includes("zomato") || t.includes("blinkit") || t.includes("zepto") || 
        t.includes("mcdonald") || t.includes("starbucks") || t.includes("cafe") || t.includes("chai") || 
        t.includes("hotel") || t.includes("restaurant") || t.includes("food") || t.includes("grocery")) {
        return "Food & Groceries";
    }
    if (t.includes("uber") || t.includes("ola") || t.includes("rapido") || t.includes("metro") || 
        t.includes("petrol") || t.includes("fuel") || t.includes("diesel") || t.includes("indian oil") || 
        t.includes("bpcl") || t.includes("hpcl") || t.includes("shell") || t.includes("fastag")) {
        return "Transportation";
    }
    if (t.includes("amazon") || t.includes("flipkart") || t.includes("myntra") || t.includes("meesho") || 
        t.includes("zara") || t.includes("ajio") || t.includes("shopping") || t.includes("croma")) {
        return "Shopping";
    }
    if (t.includes("netflix") || t.includes("spotify") || t.includes("hotstar") || t.includes("prime") || 
        t.includes("bookmyshow") || t.includes("pvr") || t.includes("inox") || t.includes("steam") || t.includes("cinema")) {
        return "Entertainment";
    }
    if (t.includes("bescom") || t.includes("electricity") || t.includes("power") || t.includes("airtel") || 
        t.includes("jio") || t.includes("water") || t.includes("gas") || t.includes("rent") || t.includes("maintenance")) {
        return "Housing & Utilities";
    }
    if (t.includes("apollo") || t.includes("pharmeasy") || t.includes("1mg") || t.includes("hospital") || 
        t.includes("clinic") || t.includes("doctor") || t.includes("pharmacy")) {
        return "Insurance & Healthcare";
    }
    if (t.includes("zerodha") || t.includes("groww") || t.includes("angelone") || t.includes("kuvera") || 
        t.includes("mutual fund") || t.includes("sip")) {
        return "Savings & Investments";
    }
    if (t.includes("salary") || t.includes("payroll") || t.includes("stipend") || t.includes("bonus")) {
        return "Salary / Wages";
    }

    return "Miscellaneous";
}

function commitParsedTransaction() {
    const title = document.getElementById("parsedTitle").value.trim();
    const category = document.getElementById("parsedCategory").value;
    const ref = document.getElementById("parsedRef").value.trim();
    const date = document.getElementById("parsedDate").value || new Date().toISOString().split("T")[0];
    const badgeText = document.getElementById("parsedTypeBadge").innerText.toLowerCase();
    const type = badgeText.includes("income") ? "income" : "expense";

    const amtStr = document.getElementById("parsedAmount").innerText.replace(/[^0-9.]/g, "");
    const amount = parseFloat(amtStr) || 0;

    if (!title || amount <= 0) {
        showToast("Invalid transaction fields", "error");
        return;
    }

    const newTx = {
        id: "tx_sms_" + Date.now(),
        text: title,
        amount: amount,
        DATE: date,
        CATEGORY: category,
        paymentMethod: "UPI",
        upiRef: ref,
        type: type,
        createdAt: Date.now()
    };

    state.transactions.unshift(newTx);
    saveTransactions();
    refreshAllViews();

    document.getElementById("parsedResultCard").style.display = "none";
    document.getElementById("smsRawInput").value = "";

    showToast(`Added ${formatAmount(amount)} (${title}) to transactions!`, "success");
}

// ==========================================================================
// CSV IMPORT / EXPORT
// ==========================================================================
function exportToCsv() {
    if (state.transactions.length === 0) {
        showToast("No transactions to export", "info");
        return;
    }

    const headers = ["ID", "Date", "Description", "Category", "Type", "Amount", "Payment Method", "UPI Ref"];
    const rows = state.transactions.map(t => [
        t.id,
        t.DATE,
        `"${(t.text || "").replace(/"/g, '""')}"`,
        `"${(t.CATEGORY || "").replace(/"/g, '""')}"`,
        t.type,
        t.amount,
        t.paymentMethod || "UPI",
        `"${(t.upiRef || "").replace(/"/g, '""')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `SpendWise_Transactions_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("CSV exported successfully", "success");
}

function exportToJsonBackup() {
    const backupData = {
        version: "2.0",
        exportDate: new Date().toISOString(),
        budget: state.budget,
        currency: state.currency,
        transactions: state.transactions
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `SpendWise_Backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast("Full backup downloaded", "success");
}

function handleJsonRestore(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            if (Array.isArray(data.transactions)) {
                state.transactions = data.transactions;
                if (data.budget) state.budget = data.budget;
                if (data.currency) state.currency = data.currency;
                saveTransactions();
                refreshAllViews();
                closeModal("dataModal");
                showToast(`Restored ${state.transactions.length} transactions from backup!`, "success");
            } else {
                showToast("Invalid backup file format", "error");
            }
        } catch (err) {
            showToast("Failed to parse JSON file", "error");
        }
    };
    reader.readAsText(file);
}

function handleCsvUpload(e) {
    const file = e.target.files[0];
    if (file) parseCsvFile(file);
}

function parseCsvFile(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
        const text = event.target.result;
        const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
        if (lines.length < 2) {
            showToast("Empty CSV file", "error");
            return;
        }

        let importedCount = 0;
        // Skip header row
        for (let i = 1; i < lines.length; i++) {
            const cols = parseCsvLine(lines[i]);
            if (cols.length >= 3) {
                const date = cols[0] || new Date().toISOString().split("T")[0];
                const desc = cols[1] || "Imported Item";
                const amt = parseFloat(cols[2]) || 0;
                const type = (cols[3] || "").toLowerCase().includes("income") ? "income" : "expense";
                const cat = cols[4] || inferCategory(desc);

                if (amt > 0) {
                    state.transactions.push({
                        id: "tx_csv_" + Date.now() + "_" + i,
                        text: desc,
                        amount: amt,
                        DATE: date,
                        CATEGORY: mapLegacyCategory(cat),
                        type: type,
                        paymentMethod: "Bank/UPI",
                        upiRef: "",
                        createdAt: Date.now()
                    });
                    importedCount++;
                }
            }
        }

        if (importedCount > 0) {
            saveTransactions();
            refreshAllViews();
            showToast(`Imported ${importedCount} transactions from statement CSV!`, "success");
        } else {
            showToast("Could not recognize transactions in CSV", "error");
        }
    };
    reader.readAsText(file);
}

function parseCsvLine(text) {
    const result = [];
    let insideQuote = false;
    let entry = "";
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') {
            insideQuote = !insideQuote;
        } else if (c === ',' && !insideQuote) {
            result.push(entry.trim());
            entry = "";
        } else {
            entry += c;
        }
    }
    result.push(entry.trim());
    return result;
}

function downloadSampleCsvTemplate() {
    const template = "Date,Description,Amount,Type,Category\n" +
                     "2026-10-21,Swiggy Dinner,350,expense,Food & Groceries\n" +
                     "2026-10-20,Uber to Office,180,expense,Transportation\n" +
                     "2026-10-15,Monthly Salary,65000,income,Salary / Wages\n";
    const blob = new Blob([template], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "sample_expense_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==========================================================================
// FINAI CHAT ASSISTANT & NATURAL LANGUAGE PROCESSOR
// ==========================================================================
function sendAiPrompt(promptText) {
    const input = document.getElementById("aiChatInput");
    if (input) {
        input.value = promptText;
        handleAiSubmit(new Event("submit"));
    }
}

async function handleAiSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();

    const input = document.getElementById("aiChatInput");
    const query = input.value.trim();
    if (!query) return;

    // Append User Bubble
    appendChatMessage("user", query);
    input.value = "";

    // Show temporary bot typing indicator
    const typingBubble = appendTypingIndicator();

    // Check if Gemini API Key is set; if so, try Gemini first, else Local Smart NLP Engine
    if (state.geminiKey) {
        try {
            const geminiReply = await queryGeminiApi(query);
            typingBubble.remove();
            appendChatMessage("bot", geminiReply);
            return;
        } catch (err) {
            console.warn("Gemini call failed, falling back to local engine:", err);
        }
    }

    // Process with Local Smart NLP Financial Engine
    setTimeout(() => {
        typingBubble.remove();
        const localReply = processLocalFinancialEngine(query);
        appendChatMessage("bot", localReply.text, localReply.actionCard);
    }, 400);
}

/**
 * Intelligent Local Rule & Financial Reasoning Engine
 */
function processLocalFinancialEngine(query) {
    const q = query.toLowerCase();

    // 1. Check for Natural Language Transaction Creation
    const addExpenseMatch = q.match(/(?:spent|paid|bought|expense of|add expense|spend)\s*(?:rs\.?|inr|₹)?\s*(\d+(?:\.\d{1,2})?)\s*(?:for|on|at)?\s*(.+)/i);
    const addIncomeMatch = q.match(/(?:got|received|credited|earned|add income|income of)\s*(?:rs\.?|inr|₹)?\s*(\d+(?:\.\d{1,2})?)\s*(?:for|from|as)?\s*(.+)/i);

    if (addExpenseMatch) {
        const amt = parseFloat(addExpenseMatch[1]);
        const desc = addExpenseMatch[2].trim();
        const cat = inferCategory(desc);

        const newTx = {
            id: "tx_ai_" + Date.now(),
            text: desc.charAt(0).toUpperCase() + desc.slice(1),
            amount: amt,
            DATE: new Date().toISOString().split("T")[0],
            CATEGORY: cat,
            paymentMethod: "UPI",
            upiRef: "Logged by FinAI",
            type: "expense",
            createdAt: Date.now()
        };

        state.transactions.unshift(newTx);
        saveTransactions();
        refreshAllViews();

        return {
            text: `Done! I've automatically recorded an expense of <b>${formatAmount(amt)}</b> for "<b>${escapeHtml(desc)}</b>" under <b>${cat}</b>.`,
            actionCard: `<div class="action-card-result"><i class="fa-solid fa-circle-check"></i> Expense logged & dashboard updated</div>`
        };
    }

    if (addIncomeMatch) {
        const amt = parseFloat(addIncomeMatch[1]);
        const desc = addIncomeMatch[2].trim();
        const cat = "Salary / Wages";

        const newTx = {
            id: "tx_ai_" + Date.now(),
            text: desc.charAt(0).toUpperCase() + desc.slice(1),
            amount: amt,
            DATE: new Date().toISOString().split("T")[0],
            CATEGORY: cat,
            paymentMethod: "Bank/UPI",
            upiRef: "Logged by FinAI",
            type: "income",
            createdAt: Date.now()
        };

        state.transactions.unshift(newTx);
        saveTransactions();
        refreshAllViews();

        return {
            text: `Great news! I've added <b>${formatAmount(amt)}</b> of income for "<b>${escapeHtml(desc)}</b>".`,
            actionCard: `<div class="action-card-result"><i class="fa-solid fa-circle-check"></i> Income logged & dashboard updated</div>`
        };
    }

    // 2. Spending Query: Specific Category
    for (const cat in CATEGORY_META) {
        const catLower = cat.toLowerCase();
        const keywords = catLower.split(/[\s&/]+/);
        if (keywords.some(k => k.length > 3 && q.includes(k))) {
            let catTotal = 0;
            let count = 0;
            state.transactions.forEach(t => {
                if (t.type === "expense" && t.CATEGORY === cat) {
                    catTotal += Number(t.amount) || 0;
                    count++;
                }
            });

            return {
                text: `You have recorded <b>${count} transactions</b> in <b>${cat}</b> totaling <b>${formatAmount(catTotal)}</b>.<br><br>` +
                      (catTotal > 5000 ? `💡 <i>Tip: This is one of your higher spend areas. Consider setting a weekly sub-limit for ${cat}.</i>` : `Looking steady! Keep tracking daily.`)
            };
        }
    }

    // 3. Largest Expense
    if (q.includes("largest") || q.includes("highest") || q.includes("biggest") || q.includes("maximum")) {
        const expenses = state.transactions.filter(t => t.type === "expense");
        if (expenses.length === 0) {
            return { text: "You don't have any recorded expenses yet." };
        }
        expenses.sort((a, b) => Number(b.amount) - Number(a.amount));
        const top = expenses[0];
        return {
            text: `Your largest single expense is <b>${formatAmount(top.amount)}</b> for "<b>${escapeHtml(top.text)}</b>" (${top.CATEGORY}) on ${formatDate(top.DATE)}.`
        };
    }

    // 4. Affordability Check
    const affordMatch = q.match(/(?:afford|buy|purchase|spend)\s*(?:rs\.?|inr|₹)?\s*(\d+)/i);
    if (affordMatch) {
        const targetAmt = parseFloat(affordMatch[1]);
        let totalIncome = 0;
        let totalExpense = 0;
        state.transactions.forEach(t => {
            if (t.type === "income") totalIncome += Number(t.amount) || 0;
            else totalExpense += Number(t.amount) || 0;
        });
        const currentBal = totalIncome - totalExpense;

        if (currentBal >= targetAmt * 2) {
            return {
                text: `Yes, you can comfortably afford this! Your current balance is <b>${formatAmount(currentBal)}</b>, which covers ${formatAmount(targetAmt)} with a safe buffer remaining (${formatAmount(currentBal - targetAmt)}).`
            };
        } else if (currentBal >= targetAmt) {
            return {
                text: `You have enough balance (<b>${formatAmount(currentBal)}</b>), but spending ${formatAmount(targetAmt)} will leave you with only ${formatAmount(currentBal - targetAmt)}. Make sure no upcoming essential bills are due first!`
            };
        } else {
            return {
                text: `⚠️ Caution: Your current balance is <b>${formatAmount(currentBal)}</b>, which is below ${formatAmount(targetAmt)}. It is recommended to defer this purchase or look for savings.`
            };
        }
    }

    // 5. General Analysis / Budget Recommendations
    if (q.includes("analyze") || q.includes("recommend") || q.includes("habits") || q.includes("advice") || q.includes("how to save")) {
        let totalIncome = 0;
        let totalExpense = 0;
        state.transactions.forEach(t => {
            if (t.type === "income") totalIncome += Number(t.amount) || 0;
            else totalExpense += Number(t.amount) || 0;
        });

        const savings = totalIncome - totalExpense;
        const rate = totalIncome > 0 ? Math.round((savings / totalIncome) * 100) : 0;

        return {
            text: `Here is your current financial analysis:<br>` +
                  `• <b>Total Income:</b> ${formatAmount(totalIncome)}<br>` +
                  `• <b>Total Expenses:</b> ${formatAmount(totalExpense)}<br>` +
                  `• <b>Savings Rate:</b> ${rate}% (${formatAmount(savings)})<br><br>` +
                  `<b>3 Actionable Recommendations:</b><br>` +
                  `1. <b>Follow the 50/30/20 Rule:</b> Cap essential needs at 50% and direct at least 20% to emergency savings.<br>` +
                  `2. <b>Micro-UPI Audits:</b> Frequent ₹30-₹150 quick payments add up rapidly over a month. Review your Food & Cafe expenses.<br>` +
                  `3. <b>Zero-Spend Days:</b> Try planning 2 days a week where you incur zero discretionary purchases.`
        };
    }

    // Default conversational reply
    return {
        text: `I'm analyzing your finances! You can ask me specific questions like:
               <br>• "How much did I spend on food?"
               <br>• "What is my biggest expense?"
               <br>• "Add expense: 250 for taxi"
               <br>• "Can I afford ₹8,000?"`
    };
}

/**
 * Optional Google Gemini API Integration for deep financial coaching
 */
async function queryGeminiApi(userQuery) {
    let summary = `User transactions summary:\n`;
    summary += `Currency: ${state.currency}\nTotal entries: ${state.transactions.length}\n`;
    
    let inc = 0, exp = 0;
    const catMap = {};
    state.transactions.forEach(t => {
        if (t.type === "income") inc += t.amount;
        else {
            exp += t.amount;
            catMap[t.CATEGORY] = (catMap[t.CATEGORY] || 0) + t.amount;
        }
    });
    summary += `Total Income: ${inc}, Total Expense: ${exp}, Balance: ${inc - exp}\n`;
    summary += `Category breakdown: ${JSON.stringify(catMap)}\n`;

    const systemPrompt = `You are FinAI, an expert, encouraging personal financial advisor inside the SpendWise Expense Tracker app. Give concise, helpful, practical financial advice formatted in clean markdown. Do not mention system details. Ground your answers in the user's spending data provided.`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${state.geminiKey}`;

    const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [
                {
                    role: "user",
                    parts: [{ text: `${systemPrompt}\n\n${summary}\n\nUser Question: ${userQuery}` }]
                }
            ]
        })
    });

    if (!res.ok) {
        throw new Error(`Gemini API Error: ${res.statusText}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return candidate ? formatMarkdownToHtml(candidate) : "I couldn't process that response.";
}

function formatMarkdownToHtml(md) {
    return md
        .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
        .replace(/\*(.*?)\*/g, "<i>$1</i>")
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\n\n/g, "<br><br>")
        .replace(/\n/g, "<br>");
}

function appendChatMessage(role, contentHtml, actionCardHtml = "") {
    const chatContainer = document.getElementById("aiChatMessages");
    if (!chatContainer) return;

    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${role === "user" ? "user-bubble" : "bot-bubble"}`;

    if (role === "bot") {
        bubble.innerHTML = `
            <div class="bot-badge-icon"><i class="fa-solid fa-robot"></i></div>
            <div class="bubble-content">
                <p>${contentHtml}</p>
                ${actionCardHtml || ""}
            </div>
        `;
    } else {
        bubble.innerHTML = `
            <div class="bubble-content">
                <p>${escapeHtml(contentHtml)}</p>
            </div>
        `;
    }

    chatContainer.appendChild(bubble);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function appendTypingIndicator() {
    const chatContainer = document.getElementById("aiChatMessages");
    const bubble = document.createElement("div");
    bubble.className = "chat-bubble bot-bubble";
    bubble.innerHTML = `
        <div class="bot-badge-icon"><i class="fa-solid fa-robot"></i></div>
        <div class="bubble-content">
            <span style="color: var(--text-muted); font-style: italic;">
                <i class="fa-solid fa-circle-notch fa-spin"></i> FinAI is thinking...
            </span>
        </div>
    `;
    chatContainer.appendChild(bubble);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return bubble;
}

function clearAiChat() {
    const chatContainer = document.getElementById("aiChatMessages");
    if (!chatContainer) return;
    chatContainer.innerHTML = `
        <div class="chat-bubble bot-bubble">
            <div class="bot-badge-icon"><i class="fa-solid fa-robot"></i></div>
            <div class="bubble-content">
                <p>Conversation reset. How can I assist with your budgeting and UPI expenses today?</p>
            </div>
        </div>
    `;
}

// Voice input support (SpeechRecognition)
let recognition = null;
function toggleVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showToast("Voice recognition is not supported in this browser.", "info");
        return;
    }

    const micIcon = document.getElementById("voiceMicIcon");

    if (recognition) {
        recognition.stop();
        recognition = null;
        if (micIcon) micIcon.className = "fa-solid fa-microphone";
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;

    if (micIcon) micIcon.className = "fa-solid fa-microphone-lines fa-fade";

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const input = document.getElementById("aiChatInput");
        if (input) {
            input.value = transcript;
            handleAiSubmit(new Event("submit"));
        }
    };

    recognition.onerror = () => {
        if (micIcon) micIcon.className = "fa-solid fa-microphone";
        recognition = null;
    };

    recognition.onend = () => {
        if (micIcon) micIcon.className = "fa-solid fa-microphone";
        recognition = null;
    };

    recognition.start();
}

function updateAiEngineStatus() {
    const statusEl = document.getElementById("aiEngineStatus");
    if (!statusEl) return;
    if (state.geminiKey) {
        statusEl.innerHTML = `<i class="fa-solid fa-sparkles"></i> Connected to Google Gemini LLM`;
        statusEl.style.color = "var(--accent-primary)";
    } else {
        statusEl.innerHTML = `<i class="fa-solid fa-bolt"></i> Local Smart Financial Engine Active (Instant & Private)`;
        statusEl.style.color = "var(--text-muted)";
    }
}

function openAiSettingsModal() {
    openModal("aiSettingsModal");
}

function saveGeminiKey() {
    const key = document.getElementById("geminiApiKeyInput").value.trim();
    state.geminiKey = key;
    localStorage.setItem(STORAGE_KEYS.GEMINI_KEY, key);
    updateAiEngineStatus();
    closeModal("aiSettingsModal");
    showToast(key ? "Gemini API key saved!" : "Local engine active", "success");
}

function removeGeminiKey() {
    state.geminiKey = "";
    localStorage.removeItem(STORAGE_KEYS.GEMINI_KEY);
    document.getElementById("geminiApiKeyInput").value = "";
    updateAiEngineStatus();
    closeModal("aiSettingsModal");
    showToast("Gemini key removed, using local offline engine", "info");
}

// ==========================================================================
// TOAST NOTIFICATIONS & MODALS
// ==========================================================================
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = "flex";
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = "none";
}

function showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    let icon = "fa-solid fa-info-circle";
    if (type === "success") icon = "fa-solid fa-circle-check";
    if (type === "error") icon = "fa-solid fa-circle-exclamation";

    toast.innerHTML = `<i class="${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(10px)";
        toast.style.transition = "all 0.3s ease";
        setTimeout(() => toast.remove(), 300);
    }, 3200);
}

// ==========================================================================
// HELPER UTILITIES
// ==========================================================================
function formatDate(dateStr) {
    if (!dateStr) return "Today";
    const [year, month, day] = dateStr.split("-");
    if (!year || !month || !day) return dateStr;
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Rich realistic Indian UPI and household expense demo records
 */
function getInitialDemoTransactions() {
    const today = new Date();
    const fmt = (d) => d.toISOString().split("T")[0];
    const subDays = (n) => {
        const d = new Date();
        d.setDate(today.getDate() - n);
        return fmt(d);
    };

    return [
        {
            id: "tx_demo_1",
            text: "Monthly Salary Credit",
            amount: 65000,
            DATE: subDays(1),
            CATEGORY: "Salary / Wages",
            type: "income",
            paymentMethod: "Net Banking",
            upiRef: "NEFT-TECH-CORP-9921",
            createdAt: Date.now() - 86400000
        },
        {
            id: "tx_demo_2",
            text: "Swiggy Gourmet Dinner",
            amount: 480,
            DATE: subDays(1),
            CATEGORY: "Food & Groceries",
            type: "expense",
            paymentMethod: "UPI",
            upiRef: "swiggy@icici | Ref 418294719273",
            createdAt: Date.now() - 72000000
        },
        {
            id: "tx_demo_3",
            text: "Uber Ride to Tech Park",
            amount: 240,
            DATE: subDays(2),
            CATEGORY: "Transportation",
            type: "expense",
            paymentMethod: "UPI",
            upiRef: "uber@axisbank | Ref 38291048",
            createdAt: Date.now() - 172800000
        },
        {
            id: "tx_demo_4",
            text: "Electricity Bill (BESCOM)",
            amount: 1450,
            DATE: subDays(4),
            CATEGORY: "Housing & Utilities",
            type: "expense",
            paymentMethod: "UPI",
            upiRef: "bescom@hdfcbank | Ref 8829104",
            createdAt: Date.now() - 345600000
        },
        {
            id: "tx_demo_5",
            text: "Flipkart Electronics Order",
            amount: 2299,
            DATE: subDays(6),
            CATEGORY: "Shopping",
            type: "expense",
            paymentMethod: "Credit Card",
            upiRef: "TXN_FK_99182",
            createdAt: Date.now() - 518400000
        },
        {
            id: "tx_demo_6",
            text: "Freelance UI Consultation",
            amount: 12000,
            DATE: subDays(8),
            CATEGORY: "Salary / Wages",
            type: "income",
            paymentMethod: "UPI",
            upiRef: "client@okaxis | Ref 7729102",
            createdAt: Date.now() - 691200000
        },
        {
            id: "tx_demo_7",
            text: "Mutual Fund Monthly SIP",
            amount: 5000,
            DATE: subDays(10),
            CATEGORY: "Savings & Investments",
            type: "expense",
            paymentMethod: "UPI",
            upiRef: "zerodha@hdfcbank",
            createdAt: Date.now() - 864000000
        }
    ];
}

function loadDemoData() {
    state.transactions = getInitialDemoTransactions();
    saveTransactions();
    refreshAllViews();
    closeModal("dataModal");
    showToast("Loaded realistic demo UPI transactions!", "success");
}
