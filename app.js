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
document.getElementById('login-click').onclick = () => signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value).catch(e => alert(e.message));
document.getElementById('register-click').onclick = () => createUserWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value).catch(e => alert(e.message));
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

// --- DATA LISTENER ---
function startDataListener(uid) {
    onValue(ref(db, `users/${uid}`), (snap) => {
        const data = snap.val(); if (!data) return;

        // Settings
        const isDark = data.settings?.darkMode || false;
        document.body.classList.toggle('dark-mode', isDark);
        document.getElementById('dark-mode-toggle').checked = isDark;

        const goals = data.goals || { calories: 2000, protein: 150 };
        const weight = data.latest_weight || 0;
        let c=0, p=0, cr=0, f=0;
        
        const list = document.getElementById('today-meal-list');
        list.innerHTML = "";
        
        if (data.diary) {
            // Sort dates descending
            const sortedDates = Object.keys(data.diary).sort().reverse();
            sortedDates.forEach(date => {
                const dateHeader = document.createElement('div');
                dateHeader.className = "date-accordion";
                dateHeader.innerHTML = `<span>${date}</span><i class="material-icons">expand_more</i>`;
                
                const mealContainer = document.createElement('div');
                mealContainer.className = "meal-container-collapsible";
                
                Object.keys(data.diary[date]).forEach(type => {
                    Object.values(data.diary[date][type]).forEach(i => {
                        // Only count calories for "Today" in the main dash widgets
                        if (date === new Date().toISOString().split('T')[0]) {
                            c+=i.calories; p+=i.protein; cr+=i.carbs; f+=i.fat;
                        }
                        
                        const el = document.createElement('div');
                        el.className = "meal-item";
                        const isFav = data.favorites?.[i.name.replace(/[.#$[\]]/g, "")];
                        el.innerHTML = `
                            <div class="meal-info">
                                <i class="material-icons fav-icon" onclick="event.stopPropagation(); window.toggleFavExternal('${i.name}')">
                                    ${isFav ? 'star' : 'star_outline'}
                                </i>
                                <div><strong>${i.name}</strong><br><small>${i.calories} kcal | ${type}</small></div>
                            </div>
                        `;
                        setupLongPress(el, i);
                        mealContainer.appendChild(el);
                    });
                });

                dateHeader.onclick = () => mealContainer.classList.toggle('active');
                list.appendChild(dateHeader);
                list.appendChild(mealContainer);
                
                // Keep today open by default
                if (date === new Date().toISOString().split('T')[0]) mealContainer.classList.add('active');
            });
        }

        document.getElementById('dash-cals').innerText = `${c} / ${goals.calories}`;
        document.getElementById('dash-prot').innerText = `${p} / ${goals.protein}g`;
        document.getElementById('dash-weight').innerText = `${weight} lbs`;

        // Widgets
        const perc = Math.min(Math.round((c / goals.calories) * 100), 100);
        document.getElementById('summary-goal-status').innerText = perc + "%";
        document.getElementById('bar-prot').style.width = Math.min((p/goals.protein)*100, 100) + "%";
        document.getElementById('bar-carb').style.width = Math.min((cr/(goals.carbs||250))*100, 100) + "%";
        document.getElementById('bar-fat').style.width = Math.min((f/(goals.fat||70))*100, 100) + "%";

        if (goals.height && weight) {
            const bmi = ((weight * 0.453) / ((goals.height/100)**2)).toFixed(1);
            document.getElementById('summary-bmi').innerText = bmi;
            document.getElementById('summary-bmi-text').innerText = bmi < 25 ? "Normal" : "Overweight";
        }
        if (data.weight_history) updateWeightGraph(data.weight_history);
    });
}

// --- GOAL MATH FIX ---
document.getElementById('save-profile-btn').onclick = async () => {
    const h = parseFloat(document.getElementById('p-height').value);
    const a = parseInt(document.getElementById('p-age').value);
    const g = document.getElementById('p-gender').value;
    const act = parseFloat(document.getElementById('p-activity').value);
    const wLbs = (await get(ref(db, `users/${auth.currentUser.uid}/latest_weight`))).val();

    if (!h || !wLbs || !a) return alert("Enter weight, height, age");
    
    const wKg = wLbs * 0.453592;
    // Standard Mifflin-St Jeor
    let bmr = (10 * wKg) + (6.25 * h) - (5 * a);
    bmr = (g === 'male') ? bmr + 5 : bmr - 161;
    
    // maintenance calories
    let maintenance = bmr * act;
    // set target to -500 for weight loss
    let target = Math.round(maintenance - 500);

    update(ref(db, `users/${auth.currentUser.uid}/goals`), {
        calories: target, protein: Math.round((target*0.3)/4), carbs: Math.round((target*0.4)/4), fat: Math.round((target*0.3)/9),
        height: h, age: a, gender: g, activity: act
    }).then(() => alert("Goals Calculated for Weight Loss!"));
};

// --- FAVORITES & LONG PRESS ---
window.toggleFavExternal = async (name) => {
    const cleanName = name.replace(/[.#$[\]]/g, "");
    const favRef = ref(db, `users/${auth.currentUser.uid}/favorites/${cleanName}`);
    const snap = await get(favRef);
    if (snap.exists()) set(favRef, null);
    else {
        // Need to find the item data to save it as favorite
        const userSnap = await get(ref(db, `users/${auth.currentUser.uid}`));
        // Simple search in recent_items as a fallback for data
        const itemData = userSnap.val().recent_items?.[cleanName] || {name: name, calories: 0};
        set(favRef, itemData);
    }
};

let pressTimer;
function setupLongPress(el, item) {
    const start = () => pressTimer = setTimeout(() => window.toggleFavExternal(item.name), 800);
    const stop = () => clearTimeout(pressTimer);
    ['mousedown','touchstart'].forEach(e => el.addEventListener(e, start));
    ['mouseup','mouseleave','touchend'].forEach(e => el.addEventListener(e, stop));
}

// --- REST OF LOGIC (Search, Weight, Scanner) SAME AS PREVIOUS ---
// [Keep your previous Search, Weight Log, Scanner functions here]
