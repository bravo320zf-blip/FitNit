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

// HELPER: Get Today's Date in Local YYYY-MM-DD (Prevents 0 calorie bug)
const getToday = () => new Date().toLocaleDateString('en-CA');

// --- NAVIGATION ---
window.showView = (v) => {
    document.querySelectorAll('.view').forEach(s => s.style.display = 'none');
    const target = document.getElementById(v);
    if (target) target.style.display = 'block';

    // Cleanup scanner
    if (html5QrCode && v !== 'scanner-screen') {
        try { html5QrCode.stop().catch(() => { }); } catch (e) { }
    }

    // Default workout mode
    if (v === 'workout-screen') window.setWorkoutMode('strength');
};

window.toggleAddMode = (m) => {
    ['mode-scan', 'mode-search', 'mode-recent', 'mode-favs', 'mode-custom'].forEach(id => {
        document.getElementById(id).style.display = (id === 'mode-' + m) ? 'block' : 'none';
    });
    document.getElementById('scanned-result').style.display = 'none';
    if (m === 'recent') loadFoodList('recent_items', 'recent-list');
    if (m === 'favs') loadFoodList('favorites', 'favs-list');
    if (m !== 'scan' && html5QrCode) {
        try { html5QrCode.stop().catch(() => { }); } catch (e) { }
    }
};

window.setWorkoutMode = (m) => {
    document.getElementById('add-strength').style.display = m === 'strength' ? 'block' : 'none';
    document.getElementById('add-cardio').style.display = m === 'cardio' ? 'block' : 'none';
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

// --- DATA WATCHER (DASHBOARD & WORKOUTS) ---
function startDataListener(uid) {
    onValue(ref(db, `users/${uid}`), (snap) => {
        const data = snap.val(); if (!data) return;

        const today = getToday();
        const isDark = data.settings?.darkMode || false;
        document.body.classList.toggle('dark-mode', isDark);
        document.getElementById('dark-mode-toggle').checked = isDark;

        const goals = data.goals || { calories: 2000, protein: 150, carbs: 250, fat: 70 };
        const weight = data.latest_weight || 0;

        let consumed = 0, protein = 0, carbs = 0, fat = 0, burned = 0;

        // 1. MEAL ACCORDIONS
        const mealList = document.getElementById('today-meal-list');
        if (mealList) mealList.innerHTML = "";
        if (data.diary) {
            Object.keys(data.diary).sort().reverse().forEach(date => {
                const dateHeader = document.createElement('div');
                dateHeader.className = "date-accordion";
                dateHeader.innerHTML = `<span>${date} ${date === today ? '(Today)' : ''}</span><i class="material-icons">expand_more</i>`;

                const mealBox = document.createElement('div');
                mealBox.className = "meal-container-collapsible";
                if (date === today) mealBox.classList.add('active');

                Object.keys(data.diary[date]).forEach(type => {
                    Object.values(data.diary[date][type]).forEach(i => {
                        if (date === today) {
                            consumed += Number(i.calories || 0);
                            protein += Number(i.protein || 0);
                            carbs += Number(i.carbs || 0);
                            fat += Number(i.fat || 0);
                        }
                        const itemEl = document.createElement('div');
                        itemEl.className = "meal-item";
                        const isFav = data.favorites?.[i.name.replace(/[.#$[\]]/g, "")];
                        itemEl.innerHTML = `<div style="display:flex; align-items:center;"><i class="material-icons fav-icon" onclick="event.stopPropagation(); window.toggleFav('${i.name}')">${isFav ? 'star' : 'star_outline'}</i><div><strong>${i.name}</strong><br><small>${i.calories} kcal | ${type}</small></div></div>`;
                        setupLongPress(itemEl, i);
                        mealBox.appendChild(itemEl);
                    });
                });
                dateHeader.onclick = () => mealBox.classList.toggle('active');
                mealList.appendChild(dateHeader);
                mealList.appendChild(mealBox);
            });
        }

        // 2. WORKOUT LIST
        const workList = document.getElementById('workout-list-daily');
        if (workList) workList.innerHTML = "";
        if (data.workouts) {
            Object.keys(data.workouts).sort().reverse().forEach(date => {
                const head = document.createElement('div');
                head.className = "date-accordion";
                head.innerHTML = `<span>Exercises: ${date}</span>`;
                workList.appendChild(head);

                Object.values(data.workouts[date]).forEach(w => {
                    if (date === today) burned += Number(w.burned || 0);
                    const el = document.createElement('div');
                    el.className = "meal-item";
                    el.innerHTML = `<strong>${w.name}</strong><br><small>${w.sets ? w.sets + ' sets x ' + w.reps : w.duration + ' mins'} | ${w.burned} kcal burned</small>`;
                    workList.appendChild(el);
                });
            });
        }

        // 3. STATS & WIDGETS
        document.getElementById('dash-cals').innerText = `${Math.round(consumed)} / ${goals.calories}`;
        document.getElementById('dash-prot').innerText = `${Math.round(protein)} / ${goals.protein}g`;
        document.getElementById('dash-weight').innerText = `${weight} lbs`;

        if (document.getElementById('dash-burned')) {
            document.getElementById('dash-burned').innerText = `${Math.round(burned)} kcal`;
            document.getElementById('dash-net').innerText = Math.round(consumed - burned);
        }

        const perc = Math.min(Math.round((consumed / goals.calories) * 100), 100);
        document.getElementById('summary-goal-status').innerText = perc + "%";
        document.getElementById('bar-prot').style.width = Math.min((protein / goals.protein) * 100, 100) + "%";
        document.getElementById('bar-carb').style.width = Math.min((carbs / goals.carbs) * 100, 100) + "%";
        document.getElementById('bar-fat').style.width = Math.min((fat / goals.fat) * 100, 100) + "%";

        if (goals.height && weight) {
            const bmi = ((weight * 0.453) / ((goals.height / 100) ** 2)).toFixed(1);
            document.getElementById('summary-bmi').innerText = bmi;
            document.getElementById('summary-bmi-text').innerText = bmi < 25 ? "Normal" : "Overweight";
        }
        if (data.weight_history) updateWeightGraph(data.weight_history);
    });
}

// --- EXERCISE AUTOCOMPLETE ---
let allExercises = [
    "Bench Press", "Squat", "Deadlift", "Overhead Press", "Barbell Row",
    "Dumbbell Press", "Lunges", "Pull Ups", "Push Ups", "Plank",
    "Bicep Curls", "Tricep Extensions", "Leg Press", "Lat Pulldown",
    "Shoulder Press", "Chest Fly", "Leg Curls", "Leg Extensions",
    "Calf Raises", "Russian Twists", "Mountain Climbers", "Burpees",
    "Dips", "Face Pulls", "Lateral Raises", "Front Squat", "Romanian Deadlift",
    "Incline Bench Press", "Decline Bench Press", "Skullcrushers", "Hammer Curls",
    "Cable Crossovers", "T-Bar Row", "Seated Row", "Pull Down", "Leg Raises"
];

function initExercises() {
    // 1. Fetch free online database
    fetch('https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json')
        .then(r => r.json())
        .then(data => {
            const externalNames = data.map(d => d.name);
            const combined = new Set([...allExercises, ...externalNames]);
            allExercises = Array.from(combined);
        })
        .catch(err => console.warn("Could not fetch external exercises:", err));

    // 2. Fetch custom/common from Firebase
    const exRef = ref(db, 'common_exercises');
    get(exRef).then(snap => {
        if (snap.exists()) {
            const dbNames = snap.val();
            const combined = new Set([...allExercises, ...dbNames]);
            allExercises = Array.from(combined);
        } else {
            // Attempt seed silently
            set(exRef, defaultExercises).catch(() => { });
        }
    }).catch(err => console.warn("Firebase permission error (using defaults):", err));
}
// Call init on load
initExercises();

// Input Listener
const exInput = document.getElementById('ex-name');
const exList = document.getElementById('ex-suggestions');

exInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    exList.innerHTML = '';
    if (!val) { exList.style.display = 'none'; return; }

    const matches = allExercises.filter(ex => ex.toLowerCase().includes(val));
    if (matches.length > 0) {
        exList.style.display = 'block';
        matches.forEach(ex => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerText = ex;
            div.onclick = () => {
                exInput.value = ex;
                exList.style.display = 'none';
            };
            exList.appendChild(div);
        });
    } else {
        exList.style.display = 'none';
    }
});

// Hide on click outside
document.addEventListener('click', (e) => {
    if (!exInput.contains(e.target) && !exList.contains(e.target)) {
        exList.style.display = 'none';
    }
});

// --- WORKOUT LOGGING ---
document.getElementById('btn-save-strength').onclick = async () => {
    const name = document.getElementById('ex-name').value;
    const sets = document.getElementById('ex-sets').value;
    const reps = document.getElementById('ex-reps').value;
    if (!name || !sets) return alert("Enter exercise and sets");

    // Estimate: 10 cals per set
    const burned = Number(sets) * 10;
    const entry = { name, sets, reps, burned, timestamp: Date.now() };

    push(ref(db, `users/${auth.currentUser.uid}/workouts/${getToday()}`), entry);
    alert("Strength Logged!");
    document.getElementById('ex-name').value = "";
};

document.getElementById('btn-save-cardio').onclick = async () => {
    const met = document.getElementById('cardio-type').value;
    const time = document.getElementById('car-time').value;
    const typeName = document.getElementById('cardio-type').options[document.getElementById('cardio-type').selectedIndex].text;

    const weightSnap = await get(ref(db, `users/${auth.currentUser.uid}/latest_weight`));
    const userW_kg = (weightSnap.val() || 200) * 0.453;

    if (!time) return alert("Enter duration");

    // Calories = MET * weight_kg * (mins/60)
    const burned = Math.round(met * userW_kg * (time / 60));
    const entry = { name: typeName, duration: time, burned, timestamp: Date.now() };

    push(ref(db, `users/${auth.currentUser.uid}/workouts/${getToday()}`), entry);
    alert("Cardio Logged!");
};

// --- GOAL CALCULATION ---
document.getElementById('save-profile-btn').onclick = async () => {
    const h = parseFloat(document.getElementById('p-height').value);
    const a = parseInt(document.getElementById('p-age').value);
    const g = document.getElementById('p-gender').value;
    const act = parseFloat(document.getElementById('p-activity').value);
    const weightSnap = await get(ref(db, `users/${auth.currentUser.uid}/latest_weight`));
    const wLbs = weightSnap.val();

    if (!h || !wLbs || !a) return alert("Log weight in Weight Tab first!");

    const wKg = wLbs * 0.453592;
    let bmr = (10 * wKg) + (6.25 * h) - (5 * a);
    bmr = (g === 'male') ? bmr + 5 : bmr - 161;
    let target = Math.round((bmr * act) - 500);

    update(ref(db, `users/${auth.currentUser.uid}/goals`), {
        calories: target, protein: Math.round((target * 0.3) / 4), carbs: Math.round((target * 0.4) / 4), fat: Math.round((target * 0.3) / 9),
        height: h, age: a, gender: g, activity: act
    }).then(() => alert("Goals Saved!"));
};

// --- FAVORITES ---
window.toggleFav = async (name) => {
    const clean = name.replace(/[.#$[\]]/g, "");
    const favRef = ref(db, `users/${auth.currentUser.uid}/favorites/${clean}`);
    const snap = await get(favRef);
    if (snap.exists()) set(favRef, null);
    else {
        const userSnap = await get(ref(db, `users/${auth.currentUser.uid}`));
        const itemData = userSnap.val().recent_items?.[clean] || { name: name, calories: 0, protein: 0, carbs: 0, fat: 0 };
        set(favRef, itemData);
    }
};

let pressTimer;
function setupLongPress(el, item) {
    el.onmousedown = el.ontouchstart = () => pressTimer = setTimeout(() => window.toggleFav(item.name), 800);
    el.onmouseup = el.onmouseleave = el.ontouchend = () => clearTimeout(pressTimer);
}

// --- SEARCH & SCAN ---
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
            const card = document.createElement('div'); card.className = "card"; card.style.padding = "10px";
            card.innerHTML = `<strong>${f.name}</strong><br><small>${f.calories} kcal</small>`;
            card.onclick = () => { currentScannedItem = f; showConfirm(); };
            list.appendChild(card);
        });
    });
}

function showConfirm() {
    document.getElementById('scanned-result').style.display = 'block';
    document.getElementById('food-name').innerText = currentScannedItem.name;
    document.getElementById('food-info').innerText = `${currentScannedItem.calories} kcal | ${currentScannedItem.protein}g P`;
}

document.getElementById('add-food-btn').onclick = () => {
    const today = getToday();
    const item = { ...currentScannedItem, scanTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), timestamp: Date.now() };
    const clean = item.name.replace(/[.#$[\]]/g, "");
    push(ref(db, `users/${auth.currentUser.uid}/diary/${today}/${document.getElementById('meal-type').value}`), item);
    update(ref(db, `users/${auth.currentUser.uid}/recent_items/${clean}`), item);
    alert("Added!");
    window.showView('dashboard-screen');
};

// --- WEIGHT & GRAPH ---
document.getElementById('save-weight-btn').onclick = () => {
    const w = parseFloat(document.getElementById('weight-input').value);
    if (!w) return;
    const today = getToday();
    update(ref(db, `users/${auth.currentUser.uid}`), { latest_weight: w });
    set(ref(db, `users/${auth.currentUser.uid}/weight_history/${today}`), w);
    alert("Logged!");
};

function updateWeightGraph(history) {
    const ctx = document.getElementById('weightHistoryChart').getContext('2d');
    const sorted = Object.keys(history).sort();
    if (weightChart) weightChart.destroy();
    weightChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sorted.map(d => d.split('-').slice(1).join('/')),
            datasets: [{ label: 'Weight', data: sorted.map(d => history[d]), borderColor: '#3498db', tension: 0.3 }]
        }
    });
}

// --- SCANNER ---
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

// --- SETTINGS ---
document.getElementById('dark-mode-toggle').onchange = (e) => {
    const isDark = e.target.checked;
    document.body.classList.toggle('dark-mode', isDark);
    update(ref(db, `users/${auth.currentUser.uid}/settings`), { darkMode: isDark });
};
document.getElementById('share-app-btn').onclick = () => {
    if (navigator.share) navigator.share({ title: 'FitNit', url: window.location.href });
    else { navigator.clipboard.writeText(window.location.href); alert("Copied!"); }
};
document.getElementById('open-settings-btn').onclick = () => document.getElementById('settings-modal').style.display = 'flex';
document.getElementById('close-settings-btn').onclick = () => document.getElementById('settings-modal').style.display = 'none';
