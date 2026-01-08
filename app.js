import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, set, push, onValue, update, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

let html5QrCode, currentScannedItem, weightChart;

// --- NAVIGATION ---
window.showView = (v) => {
    document.querySelectorAll('.view').forEach(s => s.style.display = 'none');
    document.getElementById(v).style.display = 'block';
    if (html5QrCode && v !== 'scanner-screen') html5QrCode.stop().catch(() => {});
};

window.toggleAddMode = (m) => {
    ['mode-scan', 'mode-search', 'mode-recent', 'mode-favs', 'mode-custom'].forEach(id => {
        document.getElementById(id).style.display = (id === 'mode-'+m) ? 'block' : 'none';
    });
    document.getElementById('scanned-result').style.display = 'none';
    if (m === 'recent') loadFoodList('recent_items', 'recent-list');
    if (m === 'favs') loadFoodList('favorites', 'favs-list');
    if (m !== 'scan' && html5QrCode) html5QrCode.stop().catch(() => {});
};

// --- AUTH ---
const login = () => {
    signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value).catch(e => alert(e.message));
};
const register = () => {
    createUserWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value).catch(e => alert(e.message));
};
document.getElementById('login-click').onclick = login;
document.getElementById('register-click').onclick = register;
document.getElementById('logout-btn').onclick = () => signOut(auth);

onAuthStateChanged(auth, (u) => {
    if (u) {
        window.showView('dashboard-screen');
        document.getElementById('logout-btn').style.display = 'block';
        startDataListener(u.uid);
    } else {
        window.showView('auth-screen');
        document.getElementById('logout-btn').style.display = 'none';
    }
});

// --- DATA LISTENER (HEART) ---
function startDataListener(uid) {
    const today = new Date().toISOString().split('T')[0];
    onValue(ref(db, `users/${uid}`), (snap) => {
        const data = snap.val(); if (!data) return;

        // Settings Sync
        const isDark = data.settings?.darkMode || false;
        document.body.classList.toggle('dark-mode', isDark);
        document.getElementById('dark-mode-toggle').checked = isDark;

        // Dashboard & Macros
        const goals = data.goals || { calories: 2000, protein: 150, carbs: 250, fat: 70 };
        const weight = data.latest_weight || 0;
        let c=0, p=0, cr=0, f=0;
        
        const list = document.getElementById('today-meal-list');
        list.innerHTML = "";
        if (data.diary && data.diary[today]) {
            Object.keys(data.diary[today]).forEach(type => {
                Object.values(data.diary[today][type]).forEach(i => {
                    c+=i.calories; p+=i.protein; cr+=i.carbs; f+=i.fat;
                    const el = document.createElement('div');
                    el.className = "meal-item";
                    el.innerHTML = `<strong>${data.favorites?.[i.name.replace(/[.#$[\]]/g, "")] ? '★ ' : ''}${i.name}</strong><br><small>${i.calories} kcal | ${type} | ${i.scanTime}</small>`;
                    setupLongPress(el, i);
                    list.appendChild(el);
                });
            });
        }
        document.getElementById('dash-cals').innerText = `${c} / ${goals.calories}`;
        document.getElementById('dash-prot').innerText = `${p} / ${goals.protein}g`;
        document.getElementById('dash-weight').innerText = `${weight} lbs`;

        // Profile Widgets
        const perc = Math.min(Math.round((c / goals.calories) * 100), 100);
        document.getElementById('summary-goal-status').innerText = perc + "%";
        document.getElementById('bar-prot').style.width = Math.min((p/goals.protein)*100, 100) + "%";
        document.getElementById('bar-carb').style.width = Math.min((cr/goals.carbs)*100, 100) + "%";
        document.getElementById('bar-fat').style.width = Math.min((f/goals.fat)*100, 100) + "%";

        if (goals.height && weight) {
            const bmi = ( (weight * 0.453) / ((goals.height/100)**2) ).toFixed(1);
            document.getElementById('summary-bmi').innerText = bmi;
            document.getElementById('summary-bmi-text').innerText = bmi < 25 ? "Normal" : "Overweight";
        }

        if (data.weight_history) {
            const hist = Object.values(data.weight_history);
            document.getElementById('summary-weight-diff').innerText = (weight - hist[0]).toFixed(1) + " lbs";
            updateWeightGraph(data.weight_history);
        }
    });
}

// --- LONG PRESS FAVORITES ---
let pressTimer;
function setupLongPress(el, item) {
    const start = () => pressTimer = setTimeout(() => toggleFav(item), 800);
    const stop = () => clearTimeout(pressTimer);
    ['mousedown','touchstart'].forEach(e => el.addEventListener(e, start));
    ['mouseup','mouseleave','touchend'].forEach(e => el.addEventListener(e, stop));
}

async function toggleFav(item) {
    const cleanName = item.name.replace(/[.#$[\]]/g, "");
    const favRef = ref(db, `users/${auth.currentUser.uid}/favorites/${cleanName}`);
    const snap = await get(favRef);
    if (snap.exists()) { set(favRef, null); alert("Removed Star"); }
    else { set(favRef, item); alert("Starred! ★"); }
}

// --- SEARCH & LISTS ---
document.getElementById('btn-execute-search').onclick = () => {
    const q = document.getElementById('search-input').value;
    const list = document.getElementById('search-results-list');
    list.innerHTML = "Searching...";
    fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${q}&json=true&page_size=20`)
    .then(r => r.json()).then(d => {
        list.innerHTML = "";
        d.products.forEach(p => {
            const n = p.nutriments;
            const food = { name: p.product_name, calories: Math.round(n['energy-kcal_100g'] || 0), protein: Math.round(n.proteins_100g || 0), carbs: Math.round(n.carbohydrates_100g || 0), fat: Math.round(n.fat_100g || 0) };
            const card = document.createElement('div'); card.className = "card"; card.style.padding = "10px";
            card.innerHTML = `<strong>${food.name}</strong><br><small>${food.calories} kcal</small>`;
            card.onclick = () => { currentScannedItem = food; showConfirm(); };
            list.appendChild(card);
        });
    });
};

function loadFoodList(path, elId) {
    get(ref(db, `users/${auth.currentUser.uid}/${path}`)).then(s => {
        const list = document.getElementById(elId); list.innerHTML = "";
        if (!s.exists()) { list.innerHTML = "Empty"; return; }
        Object.values(s.val()).forEach(f => {
            const card = document.createElement('div'); card.className = "card"; card.style.padding="10px";
            card.innerHTML = `<strong>${f.name}</strong><br><small>${f.calories} kcal</small>`;
            card.onclick = () => { currentScannedItem = f; showConfirm(); };
            list.appendChild(card);
        });
    });
}

function showConfirm() {
    document.getElementById('scanned-result').style.display = 'block';
    document.getElementById('food-name').innerText = currentScannedItem.name;
    document.getElementById('food-info').innerText = `${currentScannedItem.calories} kcal | ${currentScannedItem.protein}g Prot`;
}

// --- GOAL MATH (LBS TO KG FIX) ---
document.getElementById('save-profile-btn').onclick = async () => {
    const h = parseFloat(document.getElementById('p-height').value);
    const a = parseInt(document.getElementById('p-age').value);
    const g = document.getElementById('p-gender').value;
    const act = parseFloat(document.getElementById('p-activity').value);
    const wLbs = (await get(ref(db, `users/${auth.currentUser.uid}/latest_weight`))).val();

    if (!h || !wLbs || !a) return alert("Need weight, height, age");
    
    const wKg = wLbs * 0.453592;
    let bmr = (10 * wKg) + (6.25 * h) - (5 * a);
    bmr = (g === 'male') ? bmr + 5 : bmr - 161;
    const tdee = Math.round(bmr * act);

    update(ref(db, `users/${auth.currentUser.uid}/goals`), {
        calories: tdee, protein: Math.round((tdee*0.3)/4), carbs: Math.round((tdee*0.4)/4), fat: Math.round((tdee*0.3)/9),
        height: h, age: a, gender: g, activity: act
    }).then(() => alert("Goals Calculated!"));
};

// --- ADD FOOD ---
document.getElementById('add-food-btn').onclick = () => {
    const user = auth.currentUser;
    const today = new Date().toISOString().split('T')[0];
    const item = { ...currentScannedItem, scanTime: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}), timestamp: Date.now() };
    const cleanName = item.name.replace(/[.#$[\]]/g, "");
    
    push(ref(db, `users/${user.uid}/diary/${today}/${document.getElementById('meal-type').value}`), item);
    update(ref(db, `users/${user.uid}/recent_items/${cleanName}`), item);
    alert("Added!");
    window.showView('dashboard-screen');
};

// --- SETTINGS & WEIGHT ---
document.getElementById('save-weight-btn').onclick = () => {
    const w = parseFloat(document.getElementById('weight-input').value);
    if (!w) return;
    update(ref(db, `users/${auth.currentUser.uid}`), { latest_weight: w });
    set(ref(db, `users/${auth.currentUser.uid}/weight_history/${new Date().toISOString().split('T')[0]}`), w);
    alert("Logged!");
};

document.getElementById('dark-mode-toggle').onchange = (e) => {
    const isDark = e.target.checked;
    document.body.classList.toggle('dark-mode', isDark);
    if (auth.currentUser) update(ref(db, `users/${auth.currentUser.uid}/settings`), { darkMode: isDark });
};

document.getElementById('share-app-btn').onclick = () => {
    if (navigator.share) navigator.share({ title: 'FitNit', url: window.location.href });
    else { navigator.clipboard.writeText(window.location.href); alert("Copied Link!"); }
};

document.getElementById('open-settings-btn').onclick = () => document.getElementById('settings-modal').style.display='flex';
document.getElementById('close-settings-btn').onclick = () => document.getElementById('settings-modal').style.display='none';

// --- GRAPH ---
function updateWeightGraph(history) {
    const ctx = document.getElementById('weightHistoryChart').getContext('2d');
    const sorted = Object.keys(history).sort();
    if (weightChart) weightChart.destroy();
    weightChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sorted.map(d => d.split('-').slice(1).join('/')),
            datasets: [{ label: 'Weight', data: sorted.map(d => history[d]), borderColor: '#3498db', tension: 0.3, fill: false }]
        },
        options: { scales: { y: { beginAtZero: false } } }
    });
}

// --- SCANNER TRIGGER ---
document.getElementById('scan-nav-btn').onclick = () => {
    window.showView('scanner-screen');
    window.toggleAddMode('scan');
    if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (text) => {
        fetch(`https://world.openfoodfacts.org/api/v0/product/${text}.json`)
        .then(r => r.json()).then(d => {
            if (d.status === 1) {
                const n = d.product.nutriments;
                currentScannedItem = { name: d.product.product_name, calories: Math.round(n['energy-kcal_100g'] || 0), protein: Math.round(n.proteins_100g || 0), carbs: Math.round(n.carbohydrates_100g || 0), fat: Math.round(n.fat_100g || 0) };
                showConfirm();
            }
        });
    });
};
