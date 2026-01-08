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

// --- NAVIGATION ---
window.showView = (viewId) => {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    const target = document.getElementById(viewId);
    if (target) {
        target.style.display = 'block';
    }
};

// --- CORE AUTH LOGIC ---
const loginBtn = document.getElementById('login-click');
const registerBtn = document.getElementById('register-click');

if (loginBtn) {
    loginBtn.onclick = () => {
        const email = document.getElementById('email').value;
        const pass = document.getElementById('password').value;
        if (!email || !pass) return alert("Please enter email and password.");
        signInWithEmailAndPassword(auth, email, pass).catch(e => alert("Login Error: " + e.message));
    };
}

if (registerBtn) {
    registerBtn.onclick = () => {
        const email = document.getElementById('email').value;
        const pass = document.getElementById('password').value;
        if (!email || !pass) return alert("Please enter email and password.");
        createUserWithEmailAndPassword(auth, email, pass).then(() => alert("Account Created!")).catch(e => alert("Register Error: " + e.message));
    };
}

document.getElementById('logout-btn').onclick = () => signOut(auth);

// --- AUTH STATE OBSERVER ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        window.showView('dashboard-screen');
        document.getElementById('logout-btn').style.display = 'block';
        startDataListener(user.uid); // Start watching the database
    } else {
        window.showView('auth-screen');
        document.getElementById('logout-btn').style.display = 'none';
    }
});

// --- THE DATA WATCHER (Updates Dashboard & Profile Widgets) ---
function startDataListener(uid) {
    const today = new Date().toISOString().split('T')[0];
    const mealListDiv = document.getElementById('today-meal-list');

    // This single function listens for ANY changes to the user's data
    onValue(ref(db, `users/${uid}`), (snap) => {
        const data = snap.val();
        if (!data) return;

        const goals = data.goals || { calories: 2000, protein: 150, carbs: 250, fat: 70 };
        const weight = data.latest_weight || 0;
        
        let totalCals = 0;
        let totalProt = 0;
        let totalCarb = 0;
        let totalFat = 0;
        
        // 1. Update Meal List on Dashboard
        if (mealListDiv) mealListDiv.innerHTML = "";
        if (data.diary && data.diary[today]) {
            Object.keys(data.diary[today]).forEach(mealType => {
                Object.values(data.diary[today][mealType]).forEach(item => {
                    totalCals += (item.calories || 0);
                    totalProt += (item.protein || 0);
                    totalCarb += (item.carbs || 0);
                    totalFat += (item.fat || 0);

                    const itemEl = document.createElement('div');
                    itemEl.className = "meal-item"; // Add styling to your CSS
                    itemEl.innerHTML = `
                        <div style="display:flex; justify-content:space-between;">
                            <strong>${item.name}</strong>
                            <span style="font-size:0.8rem; color:#888;">${item.scanTime || ''}</span>
                        </div>
                        <div style="font-size:0.8rem;">
                            ${item.calories} kcal | ${item.protein}g P | <em>${mealType}</em>
                        </div>
                    `;
                    mealListDiv.appendChild(itemEl);
                });
            });
        }

        // 2. Update Dashboard Top Stats
        document.getElementById('dash-cals').innerText = `${totalCals} / ${goals.calories}`;
        document.getElementById('dash-prot').innerText = `${totalProt} / ${goals.protein}g`;
        document.getElementById('dash-weight').innerText = `${weight || '--'} lbs`;

        // 3. Update Profile Summary Widgets
        // BMI
        if (parseFloat(goals.height) > 0 && weight > 0) {
            const weightKg = weight * 0.453592;
            const heightM = goals.height / 100;
            const bmi = (weightKg / (heightM * heightM)).toFixed(1);
            document.getElementById('summary-bmi').innerText = bmi;
            let status = "Normal";
            if(bmi < 18.5) status = "Underweight";
            else if(bmi > 25 && bmi < 29.9) status = "Overweight";
            else if(bmi >= 30) status = "Obese";
            document.getElementById('summary-bmi-text').innerText = status;
        }

        // Weight Progress
        if (data.weight_history) {
            const history = Object.values(data.weight_history);
            const diff = (weight - history[0]).toFixed(1);
            document.getElementById('summary-weight-diff').innerText = (diff > 0 ? "+" : "") + diff + " lbs";
        }

        // Daily Percentage
        const percent = Math.min(Math.round((totalCals / (goals.calories || 2000)) * 100), 100);
        document.getElementById('summary-goal-status').innerText = percent + "%";

        // Macro Bars
        document.getElementById('bar-prot').style.width = Math.min((totalProt / (goals.protein || 150)) * 100, 100) + "%";
        document.getElementById('bar-carb').style.width = Math.min((totalCarb / (goals.carbs || 250)) * 100, 100) + "%";
        document.getElementById('bar-fat').style.width = Math.min((totalFat / (goals.fat || 70)) * 100, 100) + "%";
    });
}

// --- TOGGLE ADD FOOD MODES ---
window.toggleAddMode = (mode) => {
    document.getElementById('mode-scan').style.display = mode === 'scan' ? 'block' : 'none';
    document.getElementById('mode-search').style.display = mode === 'search' ? 'block' : 'none';
    document.getElementById('mode-custom').style.display = mode === 'custom' ? 'block' : 'none';
    document.getElementById('scanned-result').style.display = 'none';

    // Stop scanner if moving away from scan mode
    if (mode !== 'scan' && html5QrCode) {
        html5QrCode.stop().catch(() => {});
    }
};

// --- SEARCH LOGIC ---
document.getElementById('btn-execute-search').onclick = () => {
    const query = document.getElementById('search-input').value;
    if (!query) return;

    const list = document.getElementById('search-results-list');
    list.innerHTML = "Searching...";

    // Open Food Facts Text Search API
    fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${query}&json=true&page_size=20`)
    .then(res => res.json())
    .then(data => {
        list.innerHTML = "";
        if (data.products && data.products.length > 0) {
            data.products.forEach(prod => {
                const item = document.createElement('div');
                item.className = "card";
                item.style.padding = "10px";
                item.style.cursor = "pointer";
                item.innerHTML = `<strong>${prod.product_name || 'Unknown'}</strong><br><small>${prod.brands || ''}</small>`;
                
                item.onclick = () => {
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
                list.appendChild(item);
            });
        } else {
            list.innerHTML = "No products found.";
        }
    });
};

// --- CUSTOM ENTRY LOGIC ---
document.getElementById('btn-submit-custom').onclick = () => {
    const name = document.getElementById('c-name').value;
    if (!name) return alert("Food Name is required!");

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
    document.getElementById('food-info').innerText = `${currentScannedItem.calories} kcal | P: ${currentScannedItem.protein}g`;
    
    // Smooth scroll to the confirmation box
    document.getElementById('scanned-result').scrollIntoView({ behavior: 'smooth' });
}

// --- GOAL CALCULATION ---
async function recalculateGoals() {
    const user = auth.currentUser;
    if (!user) return;

    const h = document.getElementById('p-height').value;
    const a = document.getElementById('p-age').value;
    const g = document.getElementById('p-gender').value;
    const act = document.getElementById('p-activity').value;

    const weightSnap = await get(ref(db, `users/${user.uid}/latest_weight`));
    const w = weightSnap.val();

    if (!h || !w || !a) {
        alert("Please enter Height/Age here AND log your weight in the Weight tab.");
        return;
    }

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

    await update(ref(db, `users/${user.uid}/goals`), goals);
    alert("Goals recalculated!");
}
document.getElementById('save-profile-btn').onclick = recalculateGoals;

// --- WEIGHT LOGGING ---
document.getElementById('save-weight-btn').onclick = () => {
    const w = document.getElementById('weight-input').value;
    const today = new Date().toISOString().split('T')[0];
    const user = auth.currentUser;

    if (w && user) {
        update(ref(db, `users/${user.uid}`), { latest_weight: parseFloat(w) });
        set(ref(db, `users/${user.uid}/weight_history/${today}`), parseFloat(w));
        alert("Weight Saved!");
        recalculateGoals(); 
    }
};

// --- SCANNER LOGIC ---
const scanNavBtn = document.getElementById('scan-nav-btn');
if (scanNavBtn) {
    scanNavBtn.onclick = () => {
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
                        carbs: Math.round(n.carbohydrates_100g || 0),
                        fat: Math.round(n.fat_100g || 0)
                    };
                    document.getElementById('scanned-result').style.display = 'block';
                    document.getElementById('food-name').innerText = currentScannedItem.name;
                    document.getElementById('food-info').innerText = `${currentScannedItem.calories} kcal | P: ${currentScannedItem.protein}g`;
                }
            });
        }).catch(e => alert("Camera Error: " + e));
    };
}

document.getElementById('add-food-btn').onclick = () => {
    const today = new Date().toISOString().split('T')[0];
    const type = document.getElementById('meal-type').value;
    const user = auth.currentUser;
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const itemToSave = { ...currentScannedItem, scanTime: timeString, timestamp: Date.now() };

    push(ref(db, `users/${user.uid}/diary/${today}/${type}`), itemToSave)
    .then(() => { 
        alert("Food Added!"); 
        document.getElementById('scanned-result').style.display = 'none';
        window.showView('dashboard-screen'); 
    });
};

// --- DARK MODE & MODALS ---
const darkModeToggle = document.getElementById('dark-mode-toggle');
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
    if(darkModeToggle) darkModeToggle.checked = true;
}
if (darkModeToggle) {
    darkModeToggle.onchange = () => {
        if (darkModeToggle.checked) {
            document.body.classList.add('dark-mode');
            localStorage.setItem('theme', 'dark');
        } else {
            document.body.classList.remove('dark-mode');
            localStorage.setItem('theme', 'light');
        }
    };
}

const settingsModal = document.getElementById('settings-modal');
document.getElementById('open-settings-btn').onclick = () => settingsModal.style.display = 'flex';
document.getElementById('close-settings-btn').onclick = () => settingsModal.style.display = 'none';

