import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, set, push, onValue, update, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// 1. Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyArqfZP8MyrSmIIgABmDGmusoPaAU0rBnE",
    authDomain: "fitnit-db781.firebaseapp.com",
    projectId: "fitnit-db781",
    storageBucket: "fitnit-db781.firebasestorage.app",
    messagingSenderId: "375638255257",
    appId: "1:375638255257:web:c2d92fd129e7e01dbd7a08"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let html5QrCode;
let currentScannedItem = null;
let weightChart = null;

// --- INITIAL THEME CHECK (Prevents white flash on load) ---
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
}

// --- NAVIGATION ---
window.showView = (viewId) => {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    const target = document.getElementById(viewId);
    if (target) target.style.display = 'block';
    if (html5QrCode && viewId !== 'scanner-screen') html5QrCode.stop().catch(() => {});
};

window.toggleAddMode = (mode) => {
    document.getElementById('mode-scan').style.display = mode === 'scan' ? 'block' : 'none';
    document.getElementById('mode-search').style.display = mode === 'search' ? 'block' : 'none';
    document.getElementById('mode-custom').style.display = mode === 'custom' ? 'block' : 'none';
    document.getElementById('scanned-result').style.display = 'none';
    if (mode !== 'scan' && html5QrCode) html5QrCode.stop().catch(() => {});
};

// --- AUTH LOGIC ---
document.getElementById('login-click').onclick = () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    signInWithEmailAndPassword(auth, email, pass).catch(e => alert(e.message));
};

document.getElementById('register-click').onclick = () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    createUserWithEmailAndPassword(auth, email, pass).then(() => alert("Account Created!")).catch(e => alert(e.message));
};

document.getElementById('logout-btn').onclick = () => signOut(auth);

onAuthStateChanged(auth, (user) => {
    if (user) {
        window.showView('dashboard-screen');
        document.getElementById('logout-btn').style.display = 'block';
        startDataListener(user.uid);
    } else {
        window.showView('auth-screen');
        document.getElementById('logout-btn').style.display = 'none';
    }
});

// --- THE DATA WATCHER (Syncs everything including Dark Mode) ---
function startDataListener(uid) {
    const today = new Date().toISOString().split('T')[0];
    const mealListDiv = document.getElementById('today-meal-list');

    onValue(ref(db, `users/${uid}`), (snap) => {
        const data = snap.val();
        if (!data) return;

        // 1. SYNC SETTINGS (Dark Mode)
        const isDark = data.settings?.darkMode || false;
        if (isDark) document.body.classList.add('dark-mode');
        else document.body.classList.remove('dark-mode');
        if (document.getElementById('dark-mode-toggle')) document.getElementById('dark-mode-toggle').checked = isDark;

        // 2. NUTRITION & DASHBOARD
        const goals = data.goals || { calories: 2000, protein: 150, carbs: 250, fat: 70 };
        const weight = data.latest_weight || 0;
        let c = 0, p = 0, cr = 0, f = 0;
        
        if (mealListDiv) mealListDiv.innerHTML = "";
        if (data.diary && data.diary[today]) {
            Object.keys(data.diary[today]).forEach(type => {
                Object.values(data.diary[today][type]).forEach(i => {
                    c += (i.calories || 0); p += (i.protein || 0); cr += (i.carbs || 0); f += (i.fat || 0);
                    const el = document.createElement('div');
                    el.style.borderBottom = "1px solid var(--border-color)";
                    el.style.padding = "10px 0";
                    el.innerHTML = `<strong>${i.name}</strong> (${i.scanTime || ''})<br><small>${i.calories} kcal | ${type}</small>`;
                    mealListDiv.appendChild(el);
                });
            });
        }

        document.getElementById('dash-cals').innerText = `${c} / ${goals.calories}`;
        document.getElementById('dash-prot').innerText = `${p} / ${goals.protein}g`;
        document.getElementById('dash-weight').innerText = `${weight || '--'} lbs`;
        
        // 3. WIDGETS
        const percent = Math.min(Math.round((c / goals.calories) * 100), 100);
        document.getElementById('summary-goal-status').innerText = percent + "%";
        document.getElementById('bar-prot').style.width = Math.min((p/goals.protein)*100, 100) + "%";
        document.getElementById('bar-carb').style.width = Math.min((cr/goals.carbs)*100, 100) + "%";
        document.getElementById('bar-fat').style.width = Math.min((f/goals.fat)*100, 100) + "%";
        
        if (goals.height && weight) {
            const weightKg = weight * 0.453592;
            const heightM = goals.height / 100;
            const bmi = (weightKg / (heightM * heightM)).toFixed(1);
            document.getElementById('summary-bmi').innerText = bmi;
        }

        if (data.weight_history) {
            updateWeightGraph(data.weight_history);
            const historyValues = Object.values(data.weight_history);
            const diff = (weight - historyValues[0]).toFixed(1);
            document.getElementById('summary-weight-diff').innerText = (diff > 0 ? "+" : "") + diff + " lbs";
        }
    });
}

// --- WEIGHT GRAPH ---
function updateWeightGraph(historyData) {
    const canvas = document.getElementById('weightHistoryChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const sortedDates = Object.keys(historyData).sort();
    const weightValues = sortedDates.map(date => historyData[date]);
    const isDark = document.body.classList.contains('dark-mode');

    if (weightChart) weightChart.destroy();
    weightChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedDates.map(d => d.split('-').slice(1).join('/')),
            datasets: [{
                label: 'Weight',
                data: weightValues,
                borderColor: '#3498db',
                backgroundColor: 'rgba(52, 152, 219, 0.2)',
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { ticks: { color: isDark ? '#fff' : '#333' } },
                x: { ticks: { color: isDark ? '#fff' : '#333' } }
            }
        }
    });
}

// --- GOAL CALCULATION ---
document.getElementById('save-profile-btn').onclick = async () => {
    const user = auth.currentUser;
    const h = document.getElementById('p-height').value;
    const a = document.getElementById('p-age').value;
    const g = document.getElementById('p-gender').value;
    const act = document.getElementById('p-activity').value;

    const weightSnap = await get(ref(db, `users/${user.uid}/latest_weight`));
    const w = weightSnap.val();

    if (!h || !w || !a) return alert("Please set height/age AND log a weight first.");

    let bmr = (10 * w) + (6.25 * h) - (5 * a);
    bmr = (g === 'male') ? bmr + 5 : bmr - 161;
    const tdee = Math.round(bmr * parseFloat(act));

    const goals = {
        calories: tdee,
        protein: Math.round((tdee * 0.3) / 4),
        carbs: Math.round((tdee * 0.4) / 4),
        fat: Math.round((tdee * 0.3) / 9),
        height: h, age: a, gender: g, activity: act
    };

    update(ref(db, `users/${user.uid}/goals`), goals).then(() => alert("Goals Updated!"));
};

// --- WEIGHT LOGGING ---
document.getElementById('save-weight-btn').onclick = () => {
    const w = parseFloat(document.getElementById('weight-input').value);
    const today = new Date().toISOString().split('T')[0];
    if (w) {
        update(ref(db, `users/${auth.currentUser.uid}`), { latest_weight: w });
        set(ref(db, `users/${auth.currentUser.uid}/weight_history/${today}`), w);
        alert("Weight Saved!");
    }
};

// --- FOOD SEARCH & CUSTOM ---
document.getElementById('btn-execute-search').onclick = () => {
    const query = document.getElementById('search-input').value;
    const list = document.getElementById('search-results-list');
    list.innerHTML = "Searching...";
    fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${query}&json=true&page_size=20`)
    .then(r => r.json()).then(data => {
        list.innerHTML = "";
        data.products.forEach(prod => {
            const btn = document.createElement('div');
            btn.className = "card";
            btn.style.padding = "10px";
            btn.innerHTML = `<strong>${prod.product_name}</strong><br><small>${prod.brands || ''}</small>`;
            btn.onclick = () => {
                const n = prod.nutriments;
                currentScannedItem = {
                    name: prod.product_name,
                    calories: Math.round(n['energy-kcal_100g'] || 0),
                    protein: Math.round(n.proteins_100g || 0),
                    carbs: Math.round(n.carbohydrates_100g || 0),
                    fat: Math.round(n.fat_100g || 0)
                };
                showConfirmation();
            };
            list.appendChild(btn);
        });
    });
};

document.getElementById('btn-submit-custom').onclick = () => {
    const name = document.getElementById('c-name').value;
    if (!name) return alert("Name required");
    currentScannedItem = {
        name: name,
        calories: parseInt(document.getElementById('c-cals').value) || 0,
        protein: parseInt(document.getElementById('c-prot').value) || 0,
        carbs: parseInt(document.getElementById('c-carb').value) || 0,
        fat: parseInt(document.getElementById('c-fat').value) || 0
    };
    showConfirmation();
};

function showConfirmation() {
    document.getElementById('scanned-result').style.display = 'block';
    document.getElementById('food-name').innerText = currentScannedItem.name;
    document.getElementById('food-info').innerText = `${currentScannedItem.calories} kcal | ${currentScannedItem.protein}g Protein`;
    document.getElementById('scanned-result').scrollIntoView({ behavior: 'smooth' });
}

// --- SCANNER TRIGGER ---
document.getElementById('scan-nav-btn').onclick = () => {
    window.showView('scanner-screen');
    window.toggleAddMode('scan');
    if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (text) => {
        fetch(`https://world.openfoodfacts.org/api/v0/product/${text}.json`)
        .then(r => r.json()).then(data => {
            if(data.status === 1) {
                const n = data.product.nutriments;
                currentScannedItem = {
                    name: data.product.product_name,
                    calories: Math.round(n['energy-kcal_100g'] || 0),
                    protein: Math.round(n.proteins_100g || 0),
                    carbs: Math.round(n.carbohydrates_100g || 0),
                    fat: Math.round(n.fat_100g || 0)
                };
                showConfirmation();
            }
        });
    });
};

// --- DIARY SAVE ---
document.getElementById('add-food-btn').onclick = () => {
    const today = new Date().toISOString().split('T')[0];
    const type = document.getElementById('meal-type').value;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const item = { ...currentScannedItem, scanTime: time, timestamp: Date.now() };
    push(ref(db, `users/${auth.currentUser.uid}/diary/${today}/${type}`), item).then(() => {
        alert("Added!");
        document.getElementById('scanned-result').style.display = 'none';
        window.showView('dashboard-screen');
    });
};

// --- DARK MODE LOGIC ---
const darkModeToggle = document.getElementById('dark-mode-toggle');

function applyTheme(isDark) {
    if (isDark) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
}

// Initial check before login (localStorage)
applyTheme(localStorage.getItem('theme') === 'dark');

if (darkModeToggle) {
    darkModeToggle.onchange = () => {
        const isEnabled = darkModeToggle.checked;
        
        // 1. Instant UI update
        applyTheme(isEnabled);
        
        // 2. Save locally
        localStorage.setItem('theme', isEnabled ? 'dark' : 'light');

        // 3. Save to Firebase
        if (auth.currentUser) {
            update(ref(db, `users/${auth.currentUser.uid}/settings`), { 
                darkMode: isEnabled 
            }).catch(e => console.error("Firebase Theme Error:", e));
        }
        
        // Optional: Remove this alert once you confirm it works
        // alert("Dark mode toggled to: " + isEnabled);
    };
}

// --- SHARE APP LOGIC ---
const shareBtn = document.getElementById('share-app-btn');

if (shareBtn) {
    shareBtn.onclick = async () => {
        const shareData = {
            title: 'Join me on FitNit!',
            text: 'I am using FitNit to track my fitness goals. Join me!',
            url: window.location.href // This automatically grabs your GitHub Pages URL
        };

        try {
            // Check if the browser supports native sharing (Mobile Chrome/Safari)
            if (navigator.share) {
                await navigator.share(shareData);
            } else {
                // Fallback: Copy to clipboard if native share isn't available
                await navigator.clipboard.writeText(window.location.href);
                alert("App link copied to clipboard! Send it to your friends.");
            }
        } catch (err) {
            console.log('Error sharing:', err);
        }
    };
}

const settingsModal = document.getElementById('settings-modal');
document.getElementById('open-settings-btn').onclick = () => settingsModal.style.display = 'flex';
document.getElementById('close-settings-btn').onclick = () => settingsModal.style.display = 'none';


