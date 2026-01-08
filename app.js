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

// --- NAVIGATION ---
window.showView = (viewId) => {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    document.getElementById(viewId).style.display = 'block';
    if (html5QrCode && viewId !== 'scanner-screen') {
        html5QrCode.stop().catch(() => {}); 
    }
};

// --- AUTH ---
document.getElementById('register-click').onclick = () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    createUserWithEmailAndPassword(auth, email, pass).catch(e => alert(e.message));
};

document.getElementById('login-click').onclick = () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    signInWithEmailAndPassword(auth, email, pass).catch(e => alert(e.message));
};

document.getElementById('logout-btn').onclick = () => signOut(auth);

onAuthStateChanged(auth, (user) => {
    if (user) {
        window.showView('dashboard-screen');
        document.getElementById('logout-btn').style.display = 'block';
        updateDashboard();
    } else {
        window.showView('auth-screen');
        document.getElementById('logout-btn').style.display = 'none';
    }
});

// --- SCANNER ---
document.getElementById('scan-nav-btn').onclick = () => {
    window.showView('scanner-screen');
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
                    fat: Math.round(n.fat_100g || 0),
                    carbs: Math.round(n.carbohydrates_100g || 0)
                };
                document.getElementById('scanned-result').style.display = 'block';
                document.getElementById('food-name').innerText = currentScannedItem.name;
                document.getElementById('food-info').innerText = `${currentScannedItem.calories} kcal | P: ${currentScannedItem.protein}g`;
            }
        });
    }).catch(e => alert("Camera Error: " + e));
};

document.getElementById('add-food-btn').onclick = () => {
    const today = new Date().toISOString().split('T')[0];
    const type = document.getElementById('meal-type').value;
    push(ref(db, `users/${auth.currentUser.uid}/diary/${today}/${type}`), currentScannedItem)
    .then(() => { alert("Added!"); window.showView('dashboard-screen'); });
};

// --- GOAL CALCULATION ---
async function recalculateGoals() {
    const uid = auth.currentUser.uid;
    const h = document.getElementById('p-height').value;
    const a = document.getElementById('p-age').value;
    const g = document.getElementById('p-gender').value;
    const act = document.getElementById('p-activity').value;

    // Get latest weight from database
    const weightSnap = await get(ref(db, `users/${uid}/latest_weight`));
    const w = weightSnap.val() || 0;

    if (!h || !w || !a) {
        alert("Please ensure Height, Age, and Weight (in Weight Tab) are set.");
        return;
    }

    // Mifflin-St Jeor Formula
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

    await update(ref(db, `users/${uid}/goals`), goals);
    alert("Goals Updated!");
    updateDashboard();
}

document.getElementById('save-profile-btn').onclick = recalculateGoals;

// --- WEIGHT LOGGING ---
document.getElementById('save-weight-btn').onclick = () => {
    const w = document.getElementById('weight-input').value;
    const today = new Date().toISOString().split('T')[0];
    const uid = auth.currentUser.uid;

    if (w) {
        update(ref(db, `users/${uid}`), { latest_weight: w });
        set(ref(db, `users/${uid}/weight_history/${today}`), w);
        alert("Weight Saved!");
        recalculateGoals(); // Auto-trigger goal update
    }
};

// --- DASHBOARD & HISTORY ---
function updateDashboard() {
    const uid = auth.currentUser.uid;
    const today = new Date().toISOString().split('T')[0];

    onValue(ref(db, `users/${uid}`), (snap) => {
        const data = snap.val();
        if (!data) return;

        const goals = data.goals || { calories: 0, protein: 0 };
        let consumedCals = 0;
        let consumedProt = 0;

        if (data.diary && data.diary[today]) {
            Object.values(data.diary[today]).forEach(meal => {
                Object.values(meal).forEach(item => {
                    consumedCals += item.calories;
                    consumedProt += item.protein;
                });
            });
        }

        document.getElementById('dash-cals').innerText = `${consumedCals} / ${goals.calories}`;
        document.getElementById('dash-prot').innerText = `${consumedProt} / ${goals.protein}g`;
        document.getElementById('dash-weight').innerText = `${data.latest_weight || '--'} lbs`;
    });
}

window.loadHistory = (range) => {
    const uid = auth.currentUser.uid;
    onValue(ref(db, `users/${uid}/diary`), (snap) => {
        const diary = snap.val();
        const list = document.getElementById('history-list');
        list.innerHTML = "";
        for (let date in diary) {
            let dayCals = 0;
            Object.values(diary[date]).forEach(m => Object.values(m).forEach(i => dayCals += i.calories));
            const card = document.createElement('div');
            card.className = `history-card ${dayCals > 2000 ? 'status-red' : 'status-green'}`;
            card.innerText = `${date}: ${dayCals} kcal`;
            list.appendChild(card);
        }
    });
};

// --- DARK MODE LOGIC ---
const darkModeToggle = document.getElementById('dark-mode-toggle');

// Check for saved preference on load
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
    darkModeToggle.checked = true;
}

darkModeToggle.onchange = () => {
    if (darkModeToggle.checked) {
        document.body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
    } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('theme', 'light');
    }
    
    // Optional: Update Chart colors if you are using Chart.js
    updateChartTheme(); 
};

// Function to update Chart.js colors for Dark Mode
function updateChartTheme() {
    const isDark = document.body.classList.contains('dark-mode');
    const color = isDark ? '#e0e0e0' : '#333333';
    
    // If your chart objects are global, you can update them here:
    // weightChart.options.scales.x.ticks.color = color;
    // weightChart.update();
}

