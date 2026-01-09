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

        if (data.settings?.privacy) {
            document.getElementById('privacy-weight').checked = data.settings.privacy.weight || false;
            document.getElementById('privacy-diary').checked = data.settings.privacy.diary || false;
            document.getElementById('privacy-workouts').checked = data.settings.privacy.workouts || false;
        }

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

        if (data.weight_history) updateWeightGraph(data.weight_history);

        // Render Profile (My Profile)
        renderProfileScreen(data, true, uid);
    });
}

// function renderProfileScreen(data, isMe) changed to include ownerUid
function renderProfileScreen(data, isMe, ownerUid) {
    const goals = data.goals || { calories: 2000, protein: 150, carbs: 250, fat: 70 };
    const weight = data.latest_weight || 0;

    // Privacy Checks (if not me)
    const privacy = data.settings?.privacy || {};
    const hideWeight = !isMe && privacy.weight;
    const hideDiary = !isMe && privacy.diary;

    // 1. BMI & Stats
    if (goals.height && weight && !hideWeight) {
        const bmi = ((weight * 0.453) / ((goals.height / 100) ** 2)).toFixed(1);
        document.getElementById('summary-bmi').innerText = bmi;
        document.getElementById('summary-bmi-text').innerText = bmi < 25 ? "Normal" : "Overweight";
        document.getElementById('summary-weight-diff').innerText = weight;
    } else {
        document.getElementById('summary-bmi').innerText = "--";
        document.getElementById('summary-bmi-text').innerText = "Private";
        document.getElementById('summary-weight-diff').innerText = "--";
    }

    // 2. Goal Status 
    if (!isMe) {
        document.getElementById('summary-goal-status').innerText = "--";
        ['prot', 'carb', 'fat'].forEach(k => document.getElementById(`bar-${k}`).style.width = "0%");
    } else {
        // ... (Already handled by data listener updates for 'me')
    }

    // 3. Header & buttons
    const header = document.querySelector('#profile-screen h2');
    if (header) header.innerText = isMe ? "Health Summary" : (data.public_users?.name || "User Profile");

    // Show Friend Button: Only if isMe (finding friends) OR if viewing someone else (to follow them?)
    // Actually friends-btn is "Find Friends". Only show for Me.
    document.getElementById('friends-btn').style.display = isMe ? 'block' : 'none';

    // Show Settings: If isMe OR if I am viewing my own public profile (ownerUid == current)
    const isOwner = isMe || (ownerUid === auth.currentUser.uid);
    document.getElementById('open-settings-btn').style.display = isOwner ? 'block' : 'none';

    // 4. Achievements
    // 4. Achievements
    checkAchievements(data, isMe ? auth.currentUser.uid : 'temp');
    renderAchievements(data.achievements, data.settings?.pinned_achievements);

    // 5. Goals
    if (isMe) {
        document.getElementById('add-goal-btn').style.display = 'block';
        renderGoals(data.active_goals);
    } else {
        document.getElementById('add-goal-btn').style.display = 'none';
        renderGoals(data.active_goals);
    }
}

function renderAchievements(earned, pinned) {
    const container = document.getElementById('profile-achievements-preview');
    if (!earned) return;

    let displayIds = [];
    if (pinned && Array.isArray(pinned)) {
        displayIds = pinned.filter(id => earned[id]); // Only show if unlocked
    }

    // Fill rest with recent if needed
    if (displayIds.length < 3) {
        const recent = Object.keys(earned).sort((a, b) => earned[b].unlockedAt - earned[a].unlockedAt);
        recent.forEach(id => {
            if (displayIds.length < 3 && !displayIds.includes(id)) displayIds.push(id);
        });
    }

    if (displayIds.length > 0) {
        container.innerHTML = "";
        displayIds.forEach(id => {
            const def = achievementsList.find(a => a.id === id);
            if (def) {
                const badge = document.createElement('div');
                badge.className = 'achievement-badge';
                badge.innerHTML = `<i class="material-icons" style="color:#f1c40f; font-size:24px;">emoji_events</i><br><small style="font-size:8px;">${def.name}</small>`;
                badge.title = def.desc;
                container.appendChild(badge);
            }
        });

        // "See All" button
        const more = document.createElement('div');
        more.innerHTML = `<small>View All ></small>`;
        more.style.cursor = "pointer";
        more.onclick = () => {
            document.getElementById('achievements-modal').style.display = 'flex';
            renderAllAchievements(earned, pinned);
        };
        container.appendChild(more);
    }
}

function renderAllAchievements(earned, pinned) {
    const list = document.getElementById('all-achievements-list');
    list.innerHTML = "";
    achievementsList.forEach(a => {
        const isUnlocked = earned && earned[a.id];
        const isPinned = pinned && pinned.includes(a.id);

        const item = document.createElement('div');
        item.style.textAlign = "center";
        item.style.position = "relative";
        item.style.opacity = isUnlocked ? "1" : "0.3";
        // Pin icon
        const pinIcon = isPinned ? `<i class="material-icons" style="position:absolute; top:0; right:0; font-size:14px; color:orange;">push_pin</i>` : '';

        item.innerHTML = `${pinIcon}<i class="material-icons" style="font-size:30px; color:${isUnlocked ? '#f1c40f' : '#ccc'};">emoji_events</i><br><small>${a.name}</small>`;

        item.onclick = () => {
            if (!isUnlocked) return alert("Locked!");
            // Toggle pin (optimistic + save)
            let newPinned = pinned ? [...pinned] : [];
            if (newPinned.includes(a.id)) {
                newPinned = newPinned.filter(id => id !== a.id);
            } else {
                if (newPinned.length >= 3) return alert("You can only pin 3 achievements!");
                newPinned.push(a.id);
            }
            // Save
            update(ref(db, `users/${auth.currentUser.uid}/settings`), { pinned_achievements: newPinned });
            // Re-render
            renderAllAchievements(earned, newPinned);
        };
        list.appendChild(item);
    });
}

// --- ACHIEVEMENTS SYSTEM ---
const achievementsList = [
    // General & Profile
    { id: 'first_step', name: 'First Step', desc: 'Log your first weight', icon: 'scale' },
    { id: 'profile_set', name: 'Who Am I?', desc: 'Complete your profile settings', icon: 'user' },
    { id: 'socialite', name: 'Socialite', desc: 'Follow 1 person', icon: 'social' },
    { id: 'influencer', name: 'Influencer', desc: 'Get 1 follower', icon: 'social' },
    { id: 'goal_setter', name: 'Dream Big', desc: 'Set a personal goal', icon: 'target' },

    // Nutrition (Logging)
    { id: 'tracker_1', name: 'Tracker', desc: 'Log food for 1 day', icon: 'apple' },
    { id: 'tracker_3', name: 'Consistency', desc: 'Log food for 3 days in a row', icon: 'flame' },
    { id: 'tracker_7', name: 'On Fire', desc: 'Log food for 7 days in a row', icon: 'flame' },
    { id: 'tracker_30', name: 'Habitual', desc: 'Log food for 30 days in a row', icon: 'flame' },
    { id: 'century_club', name: 'Century Club', desc: 'Log 100 items total', icon: 'apple' },
    { id: 'veg_head', name: 'Veg Head', desc: 'Log 50 vegetables', icon: 'apple' }, // Placeholder logic
    { id: 'protein_king', name: 'Protein King', desc: 'Hit protein goal 5 times', icon: 'muscle' },

    // Workouts
    { id: 'gym_rat', name: 'Gym Rat', desc: 'Log 10 workouts', icon: 'dumbbell' },
    { id: 'iron_born', name: 'Iron Born', desc: 'Log a Strength workout', icon: 'dumbbell' },
    { id: 'cardio_bunny', name: 'Cardio Bunny', desc: 'Log a Cardio workout', icon: 'shoe' },
    { id: 'early_bird', name: 'Early Bird', desc: 'Log a workout before 8 AM', icon: 'sun' },
    { id: 'night_owl', name: 'Night Owl', desc: 'Log a workout after 8 PM', icon: 'moon' },
    { id: 'marathoner', name: 'Marathoner', desc: 'Log 10 cardio sessions', icon: 'shoe' },
    { id: 'heavy_lifter', name: 'Heavy Lifter', desc: 'Log 10 strength sessions', icon: 'dumbbell' },
    { id: 'weekend_warrior', name: 'Weekend Warrior', desc: 'Log a workout on Sat & Sun', icon: 'calendar' },

    // Weight
    { id: '5lb_club', name: '5lb Club', desc: 'Lose 5 lbs total', icon: 'scale' },
    { id: '10lb_club', name: '10lb Club', desc: 'Lose 10 lbs total', icon: 'scale' },
    { id: '20lb_club', name: '20lb Club', desc: 'Lose 20 lbs total', icon: 'scale' },
    { id: 'on_target', name: 'On Target', desc: 'Weight trend matches goal', icon: 'target' },

    // Streaks & Meta
    { id: 'login_streak_7', name: 'Dedicated', desc: 'Open app 7 days in a row', icon: 'flame' },
    { id: 'jack_of_all', name: 'Jack of All', desc: 'Log food, weight, and workout in 1 day', icon: 'trophy' }
    // ... (Can expand to 50 easily with variations of numbers)
];

function checkAchievements(data, uid) {
    const earned = data.achievements || {};
    const newUnlocks = [];

    const unlock = (id) => {
        if (!earned[id]) {
            earned[id] = { unlockedAt: Date.now() };
            newUnlocks.push(achievementsList.find(a => a.id === id));
            update(ref(db, `users/${uid}/achievements/${id}`), { unlockedAt: Date.now() });
        }
    };

    // 1. Weight 
    if (data.weight_history) {
        unlock('first_step');
        const weights = Object.values(data.weight_history);
        if (weights.length >= 2) {
            const loss = weights[0] - weights[weights.length - 1]; // specific logic depends on order
            if (loss >= 5) unlock('5lb_club');
            if (loss >= 10) unlock('10lb_club');
        }
    }

    // 2. Profile
    if (data.goals && data.goals.height) unlock('profile_set');

    // 3. Social
    if (data.social) {
        if (data.social.following) unlock('socialite');
        if (data.social.followers) unlock('influencer');
        renderSocialListsUI(data.social);
    }

    // 4. Diary / Logs
    if (data.diary) {
        unlock('tracker_1');
        const dates = Object.keys(data.diary).sort();
        // Simple streak check could go here
    }

    // 5. Workouts
    if (data.workouts) {
        let gymCount = 0;
        Object.values(data.workouts).forEach(day => {
            gymCount += Object.keys(day).length;
            Object.values(day).forEach(w => {
                if (w.sets) unlock('iron_born');
                else unlock('cardio_bunny');
            });
        });
        if (gymCount >= 10) unlock('gym_rat');
    }

    // Notify (Achievement toasts handled in checkAchievements)

    // 5. Notifications (Social)
    if (data.notifications && isMe) {
        let unread = 0;
        const list = document.getElementById('notif-list');
        // Only render/count if we are Me
        const sorted = Object.keys(data.notifications).sort().reverse();
        // Just checking unread count for Badge
        unread = Object.values(data.notifications).filter(n => !n.read).length;

        const icon = document.getElementById('notif-icon');
        if (icon) {
            icon.innerText = unread > 0 ? 'notifications_active' : 'notifications';
            icon.style.color = unread > 0 ? '#e74c3c' : 'inherit';
        }

        // Render list function (lazy or immediate)
        // For prototype, render immediately if modal open, or just store data
        // We'll lazy render on click
        window._currentNotifs = data.notifications;
    }
}

// 6. View Notifications
document.getElementById('notif-btn').onclick = () => {
    document.getElementById('notif-modal').style.display = 'flex';
    const list = document.getElementById('notif-list');
    list.innerHTML = "";
    const ns = window._currentNotifs || {};
    const ids = Object.keys(ns).sort().reverse();

    if (ids.length === 0) list.innerHTML = "<p>No notifications.</p>";

    ids.forEach(key => {
        const n = ns[key];
        const item = document.createElement('div');
        item.className = "meal-item"; // Reuse style
        item.style.background = n.read ? 'transparent' : 'rgba(52, 152, 219, 0.1)';
        item.innerHTML = `<small>${new Date(n.timestamp).toLocaleDateString()}</small><br>${n.message}`;
        item.onclick = () => {
            // Mark read
            update(ref(db, `users/${auth.currentUser.uid}/notifications/${key}`), { read: true });
            item.style.background = 'transparent';
        };
        list.appendChild(item);
    });
};

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

// --- GOAL CALCULATION & PUBLIC PROFILE ---
document.getElementById('save-profile-btn').onclick = async () => {
    const h = parseFloat(document.getElementById('p-height').value);
    const a = parseInt(document.getElementById('p-age').value);
    const g = document.getElementById('p-gender').value;
    const act = parseFloat(document.getElementById('p-activity').value);
    // Assuming user might enter a name in a new field eventually, but for now using email prefix or just "User"
    const displayName = auth.currentUser.email.split('@')[0];

    const weightSnap = await get(ref(db, `users/${auth.currentUser.uid}/latest_weight`));
    const wLbs = weightSnap.val();

    if (!h || !wLbs || !a) return alert("Log weight in Weight Tab first!");

    const wKg = wLbs * 0.453592;
    let bmr = (10 * wKg) + (6.25 * h) - (5 * a);
    bmr = (g === 'male') ? bmr + 5 : bmr - 161;
    let target = Math.round((bmr * act) - 500);

    const updates = {};
    updates[`users/${auth.currentUser.uid}/goals`] = {
        calories: target, protein: Math.round((target * 0.3) / 4), carbs: Math.round((target * 0.4) / 4), fat: Math.round((target * 0.3) / 9),
        height: h, age: a, gender: g, activity: act
    };
    // Update central directory for search
    updates[`public_users/${auth.currentUser.uid}`] = {
        name: displayName,
        email: auth.currentUser.email, // Be careful with privacy, maybe just public display
        uid: auth.currentUser.uid
    };

    update(ref(db), updates).then(() => alert("Profile & Goals Saved!"));
};

// --- SOCIAL FEATURES ---

// 1. Search Users
document.getElementById('friend-search-btn').onclick = () => {
    const q = document.getElementById('friend-search-input').value.toLowerCase();
    const resultList = document.getElementById('friends-list-container');
    resultList.innerHTML = "Searching...";

    // In a real app, use a query. For prototype, fetching all public users (assuming small scale)
    get(ref(db, 'public_users')).then(snap => {
        resultList.innerHTML = "";
        if (!snap.exists()) { resultList.innerHTML = "No users found."; return; }

        let found = false;
        snap.forEach(child => {
            const u = child.val();
            if (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) {
                if (u.uid === auth.currentUser.uid) return; // Don't show self
                found = true;
                const row = document.createElement('div');
                row.className = "meal-item";
                row.style.display = 'flex'; row.style.justifyContent = 'space-between';
                row.innerHTML = `<span><strong>${u.name}</strong></span>`;

                const btn = document.createElement('button');
                btn.innerText = "Follow";
                btn.onclick = () => followUser(u.uid, u.name);
                row.appendChild(btn);
                resultList.appendChild(row);
            }
        });
        if (!found) resultList.innerHTML = "No matches.";
    });
};

// 2. Follow User
function followUser(targetUid, targetName) {
    const myUid = auth.currentUser.uid;
    const updates = {};
    updates[`users/${myUid}/social/following/${targetUid}`] = true;
    updates[`users/${targetUid}/social/followers/${myUid}`] = true;

    // Notification for them
    const notifRef = push(ref(db, `users/${targetUid}/notifications`));
    updates[`users/${targetUid}/notifications/${notifRef.key}`] = {
        type: 'follow', message: `${auth.currentUser.email.split('@')[0]} started following you!`, timestamp: Date.now(), read: false
    };

    update(ref(db), updates).then(() => alert(`You are now following ${targetName}!`));
}

// 3. Render Friend Lists (Called in startDataListener mainly, or updated here)
function renderSocialLists(socialData) {
    // This requires fetching details for each ID, which is async. 
    // For simplicity, we just List IDs or fetch names if we cache them.
    // Ideally we listen to 'public_users' to map IDs to Names.

    // TODO: Implement robust list rendering with names.
    // For now, simpler implementation in UI or lazy load.
}

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
['weight', 'diary', 'workouts'].forEach(type => {
    document.getElementById(`privacy-${type}`).onchange = (e) => {
        update(ref(db, `users/${auth.currentUser.uid}/settings/privacy`), { [type]: e.target.checked });
    };
});
document.getElementById('share-app-btn').onclick = () => {
    if (navigator.share) navigator.share({ title: 'FitNit', url: window.location.href });
    else { navigator.clipboard.writeText(window.location.href); alert("Copied!"); }
};
// 3. UI for Social Lists
function renderSocialListsUI(social) {
    const followingContainer = document.getElementById('friends-list-container');
    const followersContainer = document.getElementById('followers-list-container');

    // Only fetch if we are actually viewing the friends modal (optimization)
    // But for now, just load it.

    const loadList = async (ids, container, type) => {
        container.innerHTML = "";
        if (!ids) { container.innerHTML = "<small>None</small>"; return; }

        const idArray = Object.keys(ids);
        for (const uid of idArray) {
            // Unoptimized N+1 fetch, but fine for prototype with few friends
            try {
                const snap = await get(ref(db, `public_users/${uid}`));
                if (snap.exists()) {
                    const u = snap.val();
                    const div = document.createElement('div');
                    div.className = 'meal-item';
                    div.style.padding = "5px";
                    div.innerHTML = `<strong>${u.name}</strong>`;

                    const btn = document.createElement('button');
                    btn.innerText = "View";
                    btn.style.fontSize = "10px";
                    btn.style.marginLeft = "10px";
                    btn.onclick = () => window.viewPublicProfile(uid);
                    div.appendChild(btn);

                    container.appendChild(div);
                }
            } catch (e) { console.log("error loading user", uid); }
        }
    };

    if (social.following) loadList(social.following, followingContainer, 'following');
    else followingContainer.innerHTML = "<small>You are not following anyone.</small>";

    if (social.followers) loadList(social.followers, followersContainer, 'followers');
    else followersContainer.innerHTML = "<small>No followers yet.</small>";
}

// 4. View Public Profile
window.viewPublicProfile = async (uid) => {
    document.getElementById('friends-modal').style.display = 'none';
    window.showView('profile-screen');

    const snap = await get(ref(db, `users/${uid}`));
    if (snap.exists()) {
        const data = snap.val();
        // Mock public name attach
        const publicSnap = await get(ref(db, `public_users/${uid}`));
        if (publicSnap.exists()) data.public_users = publicSnap.val();

        renderProfileScreen(data, false, uid);
    }
};

document.getElementById('view-my-public-btn').onclick = () => {
    document.getElementById('settings-modal').style.display = 'none';
    window.viewPublicProfile(auth.currentUser.uid);
};

document.getElementById('open-settings-btn').onclick = () => document.getElementById('settings-modal').style.display = 'flex';
document.getElementById('close-settings-btn').onclick = () => document.getElementById('settings-modal').style.display = 'none';
document.getElementById('friends-btn').onclick = () => document.getElementById('friends-modal').style.display = 'flex';

// --- CUSTOM GOALS ---
document.getElementById('add-goal-btn').onclick = () => {
    const goal = prompt("Enter a new goal (e.g. 'Reach 150lbs'):");
    if (goal) {
        push(ref(db, `users/${auth.currentUser.uid}/active_goals`), { text: goal, created: Date.now(), completed: false });
    }
};

function renderGoals(goalsData) {
    const list = document.getElementById('goals-list-container');
    if (!list) return;
    list.innerHTML = "";
    if (!goalsData) { list.innerHTML = "<small>No active goals.</small>"; return; }

    Object.keys(goalsData).forEach(key => {
        const g = goalsData[key];
        const row = document.createElement('div');
        row.style.padding = "10px";
        row.style.borderBottom = "1px solid #eee";
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";

        row.innerHTML = `<span>${g.completed ? '<s>' + g.text + '</s>' : g.text}</span>`;

        const check = document.createElement('input');
        check.type = "checkbox";
        check.checked = g.completed;
        check.onchange = (e) => {
            update(ref(db, `users/${auth.currentUser.uid}/active_goals/${key}`), { completed: e.target.checked });
        };
        row.appendChild(check);
        list.appendChild(row);
    });
}
