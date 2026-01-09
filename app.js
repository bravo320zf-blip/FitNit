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

// --- EXPOSED FUNCTIONS ---
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

// --- DATA WATCHER ---
function startDataListener(uid) {
    const today = new Date().toISOString().split('T')[0];
    onValue(ref(db, `users/${uid}`), (snap) => {
        const data = snap.val(); if (!data) return;

        // Dark Mode Sync
        const isDark = data.settings?.darkMode || false;
        document.body.classList.toggle('dark-mode', isDark);
        document.getElementById('dark-mode-toggle').checked = isDark;

        const goals = data.goals || { calories: 2000, protein: 150 };
        const weight = data.latest_weight || 0;
        let c=0, p=0, cr=0, f=0;
        
        const list = document.getElementById('today-meal-list');
        list.innerHTML = "";
        
        if (data.diary) {
            Object.keys(data.diary).sort().reverse().forEach(date => {
                const dateHeader = document.createElement('div');
                dateHeader.className = "date-accordion";
                dateHeader.innerHTML = `<span>${date}</span><i class="material-icons">expand_more</i>`;
                
                const mealBox = document.createElement('div');
                mealBox.className = "meal-container-collapsible";
                if (date === today) mealBox.classList.add('active');

                Object.keys(data.diary[date]).forEach(type => {
                    Object.values(data.diary[date][type]).forEach(i => {
                        if (date === today) { c+=i.calories; p+=i.protein; cr+=i.carbs; f+=i.fat; }
                        const itemEl = document.createElement('div');
                        itemEl.className = "meal-item";
                        const isFav = data.favorites?.[i.name.replace(/[.#$[\]]/g, "")];
                        itemEl.innerHTML = `
                            <div style="display:flex; align-items:center;">
                                <i class="material-icons fav-icon" onclick="event.stopPropagation(); window.toggleFav('${i.name}')">
                                    ${isFav ? 'star' : 'star_outline'}
                                </i>
                                <div><strong>${i.name}</strong><br><small>${i.calories} kcal | ${type}</small></div>
                            </div>
                        `;
                        setupLongPress(itemEl, i);
                        mealBox.appendChild(itemEl);
                    });
                });
                dateHeader.onclick = () => mealBox.classList.toggle('active');
                list.appendChild(dateHeader);
                list.appendChild(mealBox);
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

// --- GOALS (Mifflin-St Jeor) ---
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
        calories: target, protein: Math.round((target*0.3)/4), carbs: Math.round((target*0.4)/4), fat: Math.round((target*0.3)/9),
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
        const itemData = userSnap.val().recent_items?.[clean] || {name: name, calories: 0, protein: 0, carbs: 0, fat: 0};
        set(favRef, itemData);
    }
};

let pressTimer;
function setupLongPress(el, item) {
    el.onmousedown = el.ontouchstart = () => pressTimer = setTimeout(() => window.toggleFav(item.name), 800);
    el.onmouseup = el.onmouseleave = el.ontouchend = () => clearTimeout(pressTimer);
}

// --- SEARCH & ADD ---
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
    document.getElementById('food-info').innerText = `${currentScannedItem.calories} kcal | ${currentScannedItem.protein}g P`;
}

document.getElementById('add-food-btn').onclick = () => {
    const today = new Date().toISOString().split('T')[0];
    const item = { ...currentScannedItem, scanTime: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}), timestamp: Date.now() };
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
    const today = new Date().toISOString().split('T')[0];
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
document.getElementById('open-settings-btn').onclick = () => document.getElementById('settings-modal').style.display='flex';
document.getElementById('close-settings-btn').onclick = () => document.getElementById('settings-modal').style.display='none';
