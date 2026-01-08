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

let html5QrCode;
let currentScannedItem = null;

// --- NAVIGATION & TABS ---
window.showView = (viewId) => {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    document.getElementById(viewId).style.display = 'block';
    if (html5QrCode && viewId !== 'scanner-screen') {
        html5QrCode.stop().catch(() => {});
    }
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
    createUserWithEmailAndPassword(auth, email, pass).catch(e => alert(e.message));
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

// --- SEARCH LOGIC ---
document.getElementById('btn-execute-search').onclick = () => {
    const query = document.getElementById('search-input').value;
    if (!query) return;
    const list = document.getElementById('search-results-list');
    list.innerHTML = "Searching...";

    fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${query}&json=true&page_size=24`)
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

// --- CUSTOM ENTRY ---
document.getElementById('btn-submit-custom').onclick = () => {
    const name = document.getElementById('c-name').value;
    if (!name) return alert("Name is required");
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
    const user = auth.currentUser;
    const today = new Date().toISOString().split('T')[0];
    const type = document.getElementById('meal-type').value;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const item = { ...currentScannedItem, scanTime: time, timestamp: Date.now() };
    push(ref(db, `users/${user.uid}/diary/${today}/${type}`), item).then(() => {
        alert("Added!");
        document.getElementById('scanned-result').style.display = 'none';
        window.showView('dashboard-screen');
    });
};

// --- DATA LISTENER (DASHBOARD & WIDGETS) ---
function startDataListener(uid) {
    const today = new Date().toISOString().split('T')[0];
    onValue(ref(db, `users/${uid}`), (snap) => {
        const data = snap.val();
        if (!data) return;
        const goals = data.goals || { calories: 2000, protein: 150, carbs: 250, fat: 70 };
        const weight = data.latest_weight || 0;
        let c = 0, p = 0, cr = 0, f = 0;
        
        const list = document.getElementById('today-meal-list');
        list.innerHTML = "";
        if (data.diary && data.diary[today]) {
            Object.keys(data.diary[today]).forEach(type => {
                Object.values(data.diary[today][type]).forEach(i => {
                    c += i.calories; p += i.protein; cr += i.carbs; f += i.fat;
                    const el = document.createElement('div');
                    el.style.borderBottom = "1px solid var(--border-color)";
                    el.innerHTML = `<strong>${i.name}</strong> (${i.scanTime})<br><small>${i.calories} kcal | ${type}</small>`;
                    list.appendChild(el);
                });
            });
        }
        document.getElementById('dash-cals').innerText = `${c} / ${goals.calories}`;
        document.getElementById('dash-prot').innerText = `${p} / ${goals.protein}g`;
        document.getElementById('dash-weight').innerText = `${weight} lbs`;
        
        // Widget Updates
        const percent = Math.min(Math.round((c / goals.calories) * 100), 100);
        document.getElementById('summary-goal-status').innerText = percent + "%";
        document.getElementById('bar-prot').style.width = Math.min((p/goals.protein)*100, 100) + "%";
        document.getElementById('bar-carb').style.width = Math.min((cr/goals.carbs)*100, 100) + "%";
        document.getElementById('bar-fat').style.width = Math.min((f/goals.fat)*100, 100) + "%";
        
        if (goals.height && weight) {
            const bmi = ( (weight * 0.453) / ((goals.height/100)**2) ).toFixed(1);
            document.getElementById('summary-bmi').innerText = bmi;
        }
    });
}

// --- SETTINGS & WEIGHT LOGGING (Same as before) ---
document.getElementById('save-weight-btn').onclick = () => {
    const w = parseFloat(document.getElementById('weight-input').value);
    if(w) {
        update(ref(db, `users/${auth.currentUser.uid}`), { latest_weight: w });
        set(ref(db, `users/${auth.currentUser.uid}/weight_history/${new Date().toISOString().split('T')[0]}`), w);
        alert("Weight Saved!");
    }
};

const settingsModal = document.getElementById('settings-modal');
document.getElementById('open-settings-btn').onclick = () => settingsModal.style.display = 'flex';
document.getElementById('close-settings-btn').onclick = () => settingsModal.style.display = 'none';

document.getElementById('save-profile-btn').onclick = () => {
    const h = document.getElementById('p-height').value;
    const a = document.getElementById('p-age').value;
    const g = document.getElementById('p-gender').value;
    const act = document.getElementById('p-activity').value;
    update(ref(db, `users/${auth.currentUser.uid}/goals`), { height: h, age: a, gender: g, activity: act });
    alert("Profile Saved!");
};
