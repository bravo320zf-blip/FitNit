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

// --- NAVIGATION (Exposed to window for HTML access) ---
window.showView = (viewId) => {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    const target = document.getElementById(viewId);
    if (target) {
        target.style.display = 'block';
    } else {
        console.error("View not found: " + viewId);
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

        signInWithEmailAndPassword(auth, email, pass)
            .then(() => console.log("Logged in!"))
            .catch(e => alert("Login Error: " + e.message));
    };
}

if (registerBtn) {
    registerBtn.onclick = () => {
        const email = document.getElementById('email').value;
        const pass = document.getElementById('password').value;
        if (!email || !pass) return alert("Please enter email and password.");

        createUserWithEmailAndPassword(auth, email, pass)
            .then(() => alert("Account Created!"))
            .catch(e => alert("Register Error: " + e.message));
    };
}

document.getElementById('logout-btn').onclick = () => signOut(auth);

// --- AUTH STATE OBSERVER ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        window.showView('dashboard-screen');
        document.getElementById('logout-btn').style.display = 'block';
        updateDashboard(user.uid);
    } else {
        window.showView('auth-screen');
        document.getElementById('logout-btn').style.display = 'none';
    }
});

// --- GOAL CALCULATION (Based on Weight & Profile) ---
async function recalculateGoals() {
    const user = auth.currentUser;
    if (!user) return;

    const h = document.getElementById('p-height').value;
    const a = document.getElementById('p-age').value;
    const g = document.getElementById('p-gender').value;
    const act = document.getElementById('p-activity').value;

    // Get the latest weight we logged
    const weightSnap = await get(ref(db, `users/${user.uid}/latest_weight`));
    const w = weightSnap.val();

    if (!h || !w || !a) {
        alert("Please log your Weight (Weight Tab) and Height/Age (Profile) first.");
        return;
    }

    // Mifflin-St Jeor Equation
    let bmr = (10 * w) + (6.25 * h) - (5 * a);
    bmr = (g === 'male') ? bmr + 5 : bmr - 161;
    const tdee = Math.round(bmr * parseFloat(act));

    const goals = {
        calories: tdee,
        protein: Math.round((tdee * 0.3) / 4), // 30% Protein
        carbs: Math.round((tdee * 0.4) / 4),   // 40% Carbs
        fat: Math.round((tdee * 0.3) / 9),     // 30% Fat
        height: h, age: a, gender: g, activity: act
    };

    await update(ref(db, `users/${user.uid}/goals`), goals);
    alert("Goals updated based on weight: " + w + "lbs");
    updateDashboard(user.uid);
}

document.getElementById('save-profile-btn').onclick = recalculateGoals;

// --- WEIGHT LOGGING ---
document.getElementById('save-weight-btn').onclick = () => {
    const w = document.getElementById('weight-input').value;
    const today = new Date().toISOString().split('T')[0];
    const user = auth.currentUser;

    if (w && user) {
        // Save weight in two places: history and as the "latest" for calculations
        update(ref(db, `users/${user.uid}`), { latest_weight: parseFloat(w) });
        set(ref(db, `users/${user.uid}/weight_history/${today}`), parseFloat(w));
        alert("Weight Saved!");
        recalculateGoals(); // Automatically update goals when weight changes
    }
};

// --- SCANNER LOGIC ---
const scanNavBtn = document.getElementById('nav-scan') || document.getElementById('scan-nav-btn');
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
    push(ref(db, `users/${user.uid}/diary/${today}/${type}`), currentScannedItem)
    .then(() => { 
        alert("Food Added!"); 
        window.showView('dashboard-screen'); 
    });
};

// --- DASHBOARD UPDATER ---
function updateDashboard(uid) {
    const today = new Date().toISOString().split('T')[0];
    onValue(ref(db, `users/${uid}`), (snap) => {
        const data = snap.val();
        if (!data) return;

        const goals = data.goals || { calories: 2000, protein: 150 };
        let consumedCals = 0;
        let consumedProt = 0;

        if (data.diary && data.diary[today]) {
            Object.values(data.diary[today]).forEach(meal => {
                Object.values(meal).forEach(item => {
                    consumedCals += (item.calories || 0);
                    consumedProt += (item.protein || 0);
                });
            });
        }

        document.getElementById('dash-cals').innerText = `${consumedCals} / ${goals.calories}`;
        document.getElementById('dash-prot').innerText = `${consumedProt} / ${goals.protein}g`;
        document.getElementById('dash-weight').innerText = `${data.latest_weight || '--'} lbs`;
    });
}

// --- DARK MODE ---
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
