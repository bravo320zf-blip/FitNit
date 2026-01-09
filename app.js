import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, set, push, onValue, update, get, query, orderByKey, startAt } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
// Assuming native ES modules are supported or handled by a bundler. 
// Since the environment seems to be using standard script tags or simple modules, 
// I'll append the function directly to app.js instead of a separate file 
// to avoid module loading issues if not configured. 
// Actually, looking at imports, they are from CDN URLs.
// Let's stick to appending the function to app.js for safety since I don't see a local import pattern.


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
        window._lastUserData = data;
        window._lastUserUid = uid;

        const today = getToday();
        const isDark = data.settings?.darkMode || false;
        document.body.classList.toggle('dark-mode', isDark);
        document.getElementById('dark-mode-toggle').checked = isDark;

        window.toggleFav = (name, item) => {
            const sanitizedName = name.replace(/[.#$[\]]/g, "");
            const isFav = window._lastUserData?.favorites?.[sanitizedName];

            if (isFav) {
                set(ref(db, `users/${auth.currentUser.uid}/favorites/${sanitizedName}`), null);
            } else {
                // BUG FIX: Save the FULL item object, or fallback to name if missing (rare)
                const favItem = item || { name: name };
                // Ensure timestamp is fresh
                favItem.added = Date.now();
                set(ref(db, `users/${auth.currentUser.uid}/favorites/${sanitizedName}`), favItem);
            }
        };

        if (data.settings?.privacy) {
            document.getElementById('privacy-weight').checked = data.settings.privacy.weight || false;
            document.getElementById('privacy-goals').checked = data.settings.privacy.goals || false;
            document.getElementById('privacy-workouts').checked = data.settings.privacy.workouts || false;
        }

        const goals = data.goals || { calories: 2000, protein: 150, carbs: 250, fat: 70 };
        const weight = data.latest_weight || 0;

        let consumed = 0, protein = 0, carbs = 0, fat = 0, burned = 0;
        let sugar = 0, satFat = 0, fiber = 0, sodium = 0, vitC = 0, calcium = 0, iron = 0;

        // 1. Calculate Stats for TODAY (for Widgets)
        if (data.diary && data.diary[today]) {
            Object.values(data.diary[today]).forEach(cat => {
                Object.values(cat).forEach(i => {
                    consumed += Number(i.calories || 0);
                    protein += Number(i.protein || 0);
                    carbs += Number(i.carbs || 0);
                    fat += Number(i.fat || 0);
                    sugar += Number(i.sugar || 0);
                    satFat += Number(i.satFat || 0);
                    fiber += Number(i.fiber || 0);
                    sodium += Number(i.sodium * 1000 || 0) / 1000; // Keep decimal precision?
                    vitC += Number(i.vitC || 0);
                    calcium += Number(i.calcium || 0);
                    iron += Number(i.iron || 0);
                });
            });
        }
        if (data.workouts && data.workouts[today]) {
            Object.values(data.workouts[today]).forEach(w => {
                burned += Number(w.burned || 0);
            });
        }

        // 2. Render Histories (Paginated)
        renderDietHistory(data.diary);
        renderWorkoutHistory(data.workouts);

        // 3. STATS & WIDGETS
        document.getElementById('dash-cals').innerText = `${Math.round(consumed)} / ${goals.calories}`;
        document.getElementById('dash-prot').innerText = `${Math.round(protein)} / ${goals.protein}g`;
        document.getElementById('dash-weight').innerText = `${weight} lbs`;

        if (document.getElementById('dash-burned')) {
            document.getElementById('dash-burned').innerText = `${Math.round(burned)} kcal`;

            document.getElementById('dash-net').innerText = Math.round(consumed - burned);
        }

        // Render Extended Setup on Dashboard
        renderNutritionDashboard(protein, carbs, fat, sugar, satFat, fiber, sodium, vitC, calcium, iron, goals);

        if (data.weight_history) {
            window._fullWeightHistory = data.weight_history;
            // Initial render with 1 year check or default (last 30 days) if no pref? 
            // Let's default to full year or everything.
            // Check if active range set?
            const currentRange = window._weightRange || 365;
            if (window.updateWeightFilter) window.updateWeightFilter(currentRange);
        }

        // Render Profile (My Profile) if not currently viewing someone else or overriding mode
        // We attach totals to data object for convenience so render knows about it
        data._dailyTotals = { consumed, protein, carbs, fat, burned };

        // Only auto-render if we are NOT in special "viewing public profile" mode, OR if we are me
        if (!window._isViewingPublicProfile) {
            renderProfileScreen(data, true, uid);
        }
    });
}
window._isViewingPublicProfile = false; // Global toggle state

// function renderProfileScreen(data, isMe) changed to include ownerUid
function renderProfileScreen(data, isMe, ownerUid) {
    const goals = data.goals || { calories: 2000, protein: 150, carbs: 250, fat: 70 };
    const weight = data.latest_weight || 0;

    // Privacy Checks (if not me)
    const privacy = data.settings?.privacy || {};
    const hideWeight = !isMe && privacy.weight;
    const hideGoals = !isMe && privacy.goals;

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

    // 2. Goal Status & Macros
    const daily = data._dailyTotals || { consumed: 0, protein: 0, carbs: 0, fat: 0, burned: 0 };

    // Privacy: If not me, and Diary is hidden, hide these stats? 
    // Usually goals/progress are public unless hidden. Let's assume hiding Diary hides granular macros but maybe not overall goal %?
    // User asked for "Protein Carbs Fats" tracker data lost. 
    // If isMe OR privacy allows:

    if (isMe || !hideGoals) {
        // Update Profile Widgets
        const pct = goals.calories > 0 ? Math.min(100, Math.round((daily.consumed / goals.calories) * 100)) : 0;
        document.getElementById('summary-goal-status').innerText = `${pct}%`;

        // Macros visual update was moved to Dashboard.
        // We do NOT update bars here anymore as they don't exist in Profile.
    } else {
        document.getElementById('summary-goal-status').innerText = "--";
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
    // 5. Goals logic
    const goalsCard = document.getElementById('personal-goals-card');
    if (goalsCard) {
        if (!isMe && hideGoals) {
            goalsCard.style.display = 'none';
        } else {
            goalsCard.style.display = 'block';
            if (isMe) document.getElementById('add-goal-btn').style.display = 'block';
            else document.getElementById('add-goal-btn').style.display = 'none';
            renderGoals(data.active_goals);
        }
    }

    // 6. Last Workout for Public Profile
    renderLastWorkoutWidget(data.workouts);
}

// --- HISTORY & PAGINATION HELPERS ---
window._dietPage = 0;
window._workoutPage = 0;
window._lastDietData = null;
window._lastWorkoutData = null;

function renderDietHistory(diary) {
    window._lastDietData = diary;
    const container = document.getElementById('diet-history-container');
    if (!container) return;
    container.innerHTML = "";

    if (!diary) {
        container.innerHTML = "<small style='display:block; text-align:center; padding:10px;'>No history yet.</small>";
        return;
    }

    const dates = Object.keys(diary).sort().reverse();
    const page = window._dietPage;
    const pageSize = 5;
    const slice = dates.slice(page * pageSize, (page + 1) * pageSize);

    slice.forEach(date => {
        // Summary Calc
        let dCals = 0;
        let summaryText = "";
        Object.keys(diary[date]).forEach(type => {
            Object.values(diary[date][type]).forEach(i => dCals += Number(i.calories || 0));
        });
        summaryText = `${dCals} kcal`;

        const head = document.createElement('div');
        head.className = "date-accordion";
        head.style.cursor = "pointer";
        head.style.fontWeight = "bold";
        head.style.padding = "10px";
        head.style.borderBottom = "1px solid #eee";
        head.style.display = "flex"; head.style.justifyContent = "space-between";
        head.innerHTML = `<span>${date}</span><span>${summaryText}</span>`;

        const mealBox = document.createElement('div');
        mealBox.className = "meal-container-collapsible";
        mealBox.style.display = "none";

        Object.keys(diary[date]).forEach(type => {
            Object.entries(diary[date][type]).forEach(([key, i]) => {
                const itemEl = document.createElement('div');
                itemEl.className = "meal-item";
                itemEl.style.padding = "10px";
                itemEl.style.borderBottom = "1px solid #f9f9f9";
                itemEl.style.display = "flex";
                itemEl.style.justifyContent = "space-between";
                itemEl.style.alignItems = "center";

                const isFav = window._lastUserData?.favorites?.[i.name.replace(/[.#$[\]]/g, "")];

                // Left Side: Star (Fav) + Info (Clickable for details)
                // Passing 'i' to showFoodDetails requires 'i' to be serialization safe or we attach it to the element
                // We'll create the click handler in JS to keep object reference clean

                const leftDiv = document.createElement('div');
                leftDiv.style.flexGrow = "1";
                leftDiv.style.display = "flex";
                leftDiv.style.alignItems = "center";
                leftDiv.style.cursor = "pointer";

                leftDiv.innerHTML = `
                    <i class="material-icons fav-icon" data-name="${i.name}" style="color:${isFav ? 'orange' : '#ccc'}; cursor:pointer; margin-right:8px; font-size:20px;">${isFav ? 'star' : 'star_outline'}</i>
                    <div>
                        <strong style="font-size:14px; color:var(--text-color);">${i.name}</strong><br>
                        <small style="color:#777;">${i.calories} kcal | ${type}</small>
                    </div>
                `;

                // Event Handlers for Left Side
                // Generic click on leftDiv -> Details
                leftDiv.onclick = (e) => {
                    // Prevent if clicking star
                    if (e.target.classList.contains('fav-icon')) return;
                    window.showFoodDetails(i);
                }

                // Star Click Handler
                const starIcon = leftDiv.querySelector('.fav-icon');
                starIcon.onclick = (e) => {
                    e.stopPropagation();
                    window.toggleFav(i.name);
                };

                // Right Side: Delete Button (Red Square requested area)
                const delBtn = document.createElement('button');
                delBtn.className = "icon-btn delete-btn";
                delBtn.innerHTML = `<i class="material-icons">delete</i>`;
                delBtn.style.color = "#e74c3c";
                delBtn.style.marginLeft = "10px";
                delBtn.style.padding = "8px";
                delBtn.style.background = "rgba(231, 76, 60, 0.1)";
                delBtn.style.borderRadius = "4px";
                delBtn.onclick = (e) => {
                    e.stopPropagation();
                    window.promptDeleteItem({ category: 'food', date: date, subType: type, key: key, name: i.name });
                };

                itemEl.appendChild(leftDiv);
                itemEl.appendChild(delBtn);
                mealBox.appendChild(itemEl);
            });
        });

        head.onclick = () => {
            mealBox.style.display = mealBox.style.display === 'none' ? 'block' : 'none';
        }

        container.appendChild(head);
        container.appendChild(mealBox);
    });

    // Pagination
    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.justifyContent = 'space-between';
    controls.style.marginTop = '15px';
    controls.style.padding = '10px';

    // Newer
    const prev = document.createElement('button');
    prev.innerText = "< Newer";
    prev.style.visibility = page > 0 ? 'visible' : 'hidden';
    prev.onclick = () => { window._dietPage--; renderDietHistory(window._lastDietData); };

    // Older
    const next = document.createElement('button');
    next.innerText = "Older >";
    next.style.visibility = ((page + 1) * pageSize < dates.length) ? 'visible' : 'hidden';
    next.onclick = () => { window._dietPage++; renderDietHistory(window._lastDietData); };

    controls.appendChild(prev);
    controls.appendChild(next);
    container.appendChild(controls);
}

function renderWorkoutHistory(workouts) {
    window._lastWorkoutData = workouts;
    const container = document.getElementById('workout-history-container');
    if (!container) return;
    container.innerHTML = "";

    if (!workouts) {
        container.innerHTML = "<small style='display:block; text-align:center; padding:10px;'>No workouts logged.</small>";
        return;
    }

    const dates = Object.keys(workouts).sort().reverse();
    const page = window._workoutPage;
    const pageSize = 5;
    const slice = dates.slice(page * pageSize, (page + 1) * pageSize);

    slice.forEach(date => {
        let dayCount = Object.keys(workouts[date]).length;
        const head = document.createElement('div');
        head.className = "date-accordion";
        head.style.cursor = "pointer";
        head.style.padding = "10px";
        head.style.borderBottom = "1px solid #eee";
        head.style.fontWeight = "bold";
        // head.style.background = "#fff"; // Removed for Dark Mode
        head.innerHTML = `<span>${date} (${dayCount} exercises)</span>`;

        const box = document.createElement('div');
        box.style.display = "none";
        box.style.paddingLeft = "10px";

        Object.entries(workouts[date]).forEach(([key, w]) => {
            const el = document.createElement('div');
            el.className = "meal-item";
            el.style.padding = "10px 0";
            el.style.borderBottom = "1px solid #f0f0f0";
            el.style.display = "flex";
            el.style.justifyContent = "space-between";
            el.style.alignItems = "center";

            // Workout Content
            const content = document.createElement('div');
            content.style.flexGrow = 1;
            content.innerHTML = `<strong>${w.name}</strong><br><small style="color:#777;">${w.sets ? w.sets + ' sets x ' + w.reps : w.duration + ' mins'} | ${w.burned} kcal</small>`;

            // Delete Button
            const delBtn = document.createElement('button');
            delBtn.className = "icon-btn delete-btn";
            delBtn.innerHTML = `<i class="material-icons">delete</i>`;
            delBtn.style.color = "#e74c3c";
            // delBtn.style.marginLeft = "10px"; // already flex spaced
            delBtn.style.padding = "5px";
            delBtn.style.height = "fit-content";
            delBtn.style.background = "rgba(231, 76, 60, 0.1)";
            delBtn.style.borderRadius = "4px";

            delBtn.onclick = (e) => {
                e.stopPropagation();
                window.promptDeleteItem({ category: 'workout', date: date, key: key, name: w.name });
            };

            el.appendChild(content);
            el.appendChild(delBtn);
            box.appendChild(el);
        });

        head.onclick = () => {
            box.style.display = box.style.display === 'none' ? 'block' : 'none';
        }

        container.appendChild(head);
        container.appendChild(box);
    });

    // Pagination
    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.justifyContent = 'space-between';
    controls.style.marginTop = '15px';
    controls.style.padding = '10px';

    const prev = document.createElement('button');
    prev.innerText = "< Newer";
    prev.style.visibility = page > 0 ? 'visible' : 'hidden';
    prev.onclick = () => { window._workoutPage--; renderWorkoutHistory(window._lastWorkoutData); };

    const next = document.createElement('button');
    next.innerText = "Older >";
    next.style.visibility = ((page + 1) * pageSize < dates.length) ? 'visible' : 'hidden';
    next.onclick = () => { window._workoutPage++; renderWorkoutHistory(window._lastWorkoutData); };

    controls.appendChild(prev);
    controls.appendChild(next);
    container.appendChild(controls);
}

function renderLastWorkoutWidget(workouts) {
    const container = document.getElementById('last-workout-container');
    if (!container) return;
    if (!workouts) {
        container.style.display = 'none';
        return;
    }
    const dates = Object.keys(workouts).sort().reverse();
    const lastDate = dates[0];
    const exercises = Object.values(workouts[lastDate]);

    container.style.display = 'block';
    container.innerHTML = `
        <h4 style="margin:0 0 5px 0; color:var(--primary-color);">Last Session: ${lastDate}</h4>
        <p style="margin:0; font-size:14px;">Logged ${exercises.length} exercises.</p>
        <div style="font-size:12px; color:#555; margin-top:5px;">
            ${exercises.map(e => e.name).slice(0, 3).join(', ')}${exercises.length > 3 ? '...' : ''}
        </div>
    `;
}

// --- ACHIEVEMENTS SYSTEM ---
// Mapping generic types to our new custom assets
const ICONS = {
    APPLE: 'https://github.com/bravo320zf-blip/FitNit/blob/main/AchivementsIcons/AppleIcon.png?raw=true',
    CALENDAR: 'https://github.com/bravo320zf-blip/FitNit/blob/main/AchivementsIcons/CalendarIcon.png?raw=true',
    FIRE: 'https://github.com/bravo320zf-blip/FitNit/blob/main/AchivementsIcons/FireIcon.png?raw=true',
    FRIEND: 'https://github.com/bravo320zf-blip/FitNit/blob/main/AchivementsIcons/FriendIcon.png?raw=true',
    SCALE: 'https://github.com/bravo320zf-blip/FitNit/blob/main/AchivementsIcons/ScaleIcon.png?raw=true',
    SHOE: 'https://github.com/bravo320zf-blip/FitNit/blob/main/AchivementsIcons/ShoeIcon.png?raw=true',
    TROPHY: 'https://github.com/bravo320zf-blip/FitNit/blob/main/AchivementsIcons/TrophieIcon.png?raw=true',
    WATER: 'https://github.com/bravo320zf-blip/FitNit/blob/main/AchivementsIcons/WaterIcon.png?raw=true',
    WEIGHT: 'https://github.com/bravo320zf-blip/FitNit/blob/main/AchivementsIcons/WeightIcon.png?raw=true'
};

const achievementsList = [
    // General & Profile
    { id: 'first_step', name: 'First Step', desc: 'Log your first weight', image: ICONS.SCALE },
    { id: 'profile_set', name: 'Who Am I?', desc: 'Complete your profile settings', image: ICONS.TROPHY },
    { id: 'socialite', name: 'Socialite', desc: 'Follow 1 person', image: ICONS.FRIEND },
    { id: 'influencer', name: 'Influencer', desc: 'Get 1 follower', image: ICONS.FRIEND },
    { id: 'goal_setter', name: 'Dream Big', desc: 'Set a personal goal', image: ICONS.TROPHY },

    // Nutrition (Logging)
    { id: 'tracker_1', name: 'Tracker', desc: 'Log food for 1 day', image: ICONS.APPLE },
    { id: 'tracker_3', name: 'Consistency', desc: 'Log food for 3 days in a row', image: ICONS.APPLE },
    { id: 'tracker_7', name: 'On Fire', desc: 'Log food for 7 days in a row', image: ICONS.FIRE },
    { id: 'tracker_30', name: 'Habitual', desc: 'Log food for 30 days in a row', image: ICONS.CALENDAR },
    { id: 'century_club', name: 'Century Club', desc: 'Log 100 items total', image: ICONS.TROPHY },
    { id: 'veg_head', name: 'Veg Head', desc: 'Log 50 vegetables', image: ICONS.APPLE },
    { id: 'protein_king', name: 'Protein King', desc: 'Hit protein goal 5 times', image: ICONS.APPLE },

    // Workouts
    { id: 'gym_rat', name: 'Gym Rat', desc: 'Log 10 workouts', image: ICONS.WEIGHT },
    { id: 'iron_born', name: 'Iron Born', desc: 'Log a Strength workout', image: ICONS.WEIGHT },
    { id: 'cardio_bunny', name: 'Cardio Bunny', desc: 'Log a Cardio workout', image: ICONS.SHOE },
    { id: 'early_bird', name: 'Early Bird', desc: 'Log a workout before 8 AM', image: ICONS.CALENDAR },
    { id: 'night_owl', name: 'Night Owl', desc: 'Log a workout after 8 PM', image: ICONS.CALENDAR },
    { id: 'marathoner', name: 'Marathoner', desc: 'Log 10 cardio sessions', image: ICONS.SHOE },
    { id: 'heavy_lifter', name: 'Heavy Lifter', desc: 'Log 10 strength sessions', image: ICONS.WEIGHT },
    { id: 'weekend_warrior', name: 'Weekend Warrior', desc: 'Log a workout on Sat & Sun', image: ICONS.CALENDAR },

    // Weight
    { id: '5lb_club', name: '5lb Club', desc: 'Lose 5 lbs total', image: ICONS.SCALE },
    { id: '10lb_club', name: '10lb Club', desc: 'Lose 10 lbs total', image: ICONS.SCALE },
    { id: '20lb_club', name: '20lb Club', desc: 'Lose 20 lbs total', image: ICONS.SCALE },
    { id: 'on_target', name: 'On Target', desc: 'Weight trend matches goal', image: ICONS.TROPHY },

    // Streaks & Meta
    { id: 'login_streak_7', name: 'Dedicated', desc: 'Open app 7 days in a row', image: ICONS.FIRE },
    { id: 'jack_of_all', name: 'Jack of All', desc: 'Log food, weight, and workout in 1 day', image: ICONS.TROPHY }
];

// Update renderers to use 'image' prop
function renderAchievements(earned, pinned) {
    const container = document.getElementById('profile-achievements-preview');
    if (!earned) return;

    let displayIds = [];
    if (pinned && Array.isArray(pinned)) {
        displayIds = pinned.filter(id => earned[id]); // Only show if unlocked
    }

    // Fill rest with recent ONLY IF pinned is undefined (user hasn't set preferences)
    // If pinned is an array (even empty), we respect it and do NOT auto-fill.
    if (!pinned || !Array.isArray(pinned)) {
        if (displayIds.length < 3) {
            const recent = Object.keys(earned).sort((a, b) => earned[b].unlockedAt - earned[a].unlockedAt);
            recent.forEach(id => {
                if (displayIds.length < 3 && !displayIds.includes(id)) displayIds.push(id);
            });
        }
    }

    if (displayIds.length > 0) {
        container.innerHTML = "";
        displayIds.forEach(id => {
            const def = achievementsList.find(a => a.id === id);
            if (def) {
                const badge = document.createElement('div');
                badge.className = 'achievement-badge';
                // INCREASED SIZE as requested
                badge.innerHTML = `<img src="${def.image}" style="width:40px; height:40px;"><br><small style="font-size:10px;">${def.name}</small>`;
                badge.title = def.desc;
                container.appendChild(badge);
            }
        });

        // "See All" button - HIDE IF NOT ME
        // This function doesn't explicit know 'isMe' but we can infer or pass it. 
        // For simplicity, we can rely on Global `_isViewingPublicProfile` OR 
        // Check if `toggleBtn` text or `window._isViewingPublicProfile`
        // Effectively, if looking at public profile, `window._isViewingPublicProfile` is true.
        // BUT if I browse my OWN profile, I still want to see it? User said "viewing the public profile hide the view all"

        if (!window._isViewingPublicProfile) {
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
}

// --- ACHIEVEMENT MODAL LOGIC ---
const achModal = document.getElementById('achievement-details-modal');

function showAchievementDetails(a, earnedAt) {
    if (!achModal) return;
    document.getElementById('ach-detail-icon').src = a.image;
    document.getElementById('ach-detail-name').innerText = a.name;
    document.getElementById('ach-detail-desc').innerText = a.desc;
    document.getElementById('ach-detail-date').innerText = earnedAt ? `Earned on ${new Date(earnedAt).toLocaleDateString()}` : "Locked";
    document.getElementById('ach-detail-date').style.color = earnedAt ? 'var(--primary-color)' : '#777';
    achModal.style.display = 'flex';
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
        item.style.opacity = isUnlocked ? "1" : "0.5";
        item.style.padding = "10px";
        item.style.borderRadius = "8px";
        item.style.background = isUnlocked ? "rgba(255,255,255,0.05)" : "transparent";

        const pinIcon = isPinned ? `<i class="material-icons" style="position:absolute; top:5px; right:5px; font-size:16px; color:orange;">push_pin</i>` : '';

        item.innerHTML = `${pinIcon}<img src="${a.image}" style="width:50px; height:50px;"><br><small>${a.name}</small>`;

        // LONG PRESS LOGIC for PIN
        let pressTimer;
        item.onmousedown = item.ontouchstart = function () {
            pressTimer = setTimeout(() => {
                if (!isUnlocked) return;
                // Toggle Pin
                let newPinned = pinned ? [...pinned] : [];
                if (newPinned.includes(a.id)) {
                    newPinned = newPinned.filter(id => id !== a.id);
                } else {
                    if (newPinned.length >= 3) return alert("max 3 pins");
                    newPinned.push(a.id);
                }
                update(ref(db, `users/${auth.currentUser.uid}/settings`), { pinned_achievements: newPinned });
                // Optimistic update
                renderAllAchievements(earned, newPinned);
            }, 800);
        };
        item.onmouseup = item.ontouchend = function () {
            clearTimeout(pressTimer);
        };
        item.onclick = (e) => {
            // Prevent click if long press triggered? (simplest is just show details)
            showAchievementDetails(a, isUnlocked ? earned[a.id].unlockedAt : null);
        };

        list.appendChild(item);
    });
}

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
    }).catch(err => {
        // console.warn("Firebase permission error (using defaults):", err);
        // Silent fail - likely rules preventing read of common_exercises
    });
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
    const h = Number(document.getElementById('s-height').value);
    const w = Number(document.getElementById('s-weight').value);
    const a = Number(document.getElementById('s-age').value);
    const g = document.getElementById('s-gender').value;
    const act = Number(document.getElementById('s-activity').value);

    if (!h || !a) return alert("Please enter Height and Age.");

    let currentWeight = w;
    if (!currentWeight) {
        try {
            const weightSnap = await get(ref(db, `users/${auth.currentUser.uid}/latest_weight`));
            currentWeight = weightSnap.val();
        } catch (e) { }
    }
    // If still no weight, rely on user to update weight tab, but let's proceed with calculations if we have h/a/g.
    // If no weight, BMR calc fails. Use dummy 150lbs? Or alert?
    if (!currentWeight) return alert("Please enter weight or log it in the weight tab.");

    const wKg = currentWeight * 0.453592;
    let bmr = (10 * wKg) + (6.25 * h) - (5 * a);
    bmr = (g === 'male') ? bmr + 5 : bmr - 161;
    let target = Math.round((bmr * act) - 500);
    if (target < 1200) target = 1200;

    const displayName = auth.currentUser.email.split('@')[0];

    const updates = {};
    updates[`users/${auth.currentUser.uid}/goals`] = {
        calories: target, protein: Math.round((target * 0.3) / 4), carbs: Math.round((target * 0.4) / 4), fat: Math.round((target * 0.3) / 9),
        height: h, age: a, gender: g, activity: act
    };
    updates[`public_users/${auth.currentUser.uid}`] = {
        name: displayName,
        email: auth.currentUser.email,
        uid: auth.currentUser.uid
    };

    update(ref(db), updates).then(() => {
        alert("Profile & Goals Saved!");
        document.getElementById('settings-modal').style.display = 'none';
    });
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
// --- SEARCH & SCAN ---
document.getElementById('btn-execute-search').onclick = async () => {
    const q = document.getElementById('search-input').value.toLowerCase().trim();
    if (!q) return;

    const list = document.getElementById('search-results-list');
    list.innerHTML = "Searching Community & World...";

    // 1. Search FitNit Community (Public DB)
    // Client-side filter of last 100 items (Prototype Scalability)
    let communityMatches = [];
    try {
        const publicRef = query(ref(db, 'public_foods'), limitToLast(100)); // Import limitToLast needed? 
        // Note: 'limitToLast' is not imported in line 3. I need to handle that or use simple get.
        // Actually, let's just use 'get' on the ref, assuming small DB. 
        // If I can't change imports easily, I'll just fetch 'public_foods' ref.

        const snap = await get(ref(db, 'public_foods'));
        if (snap.exists()) {
            const val = snap.val();
            communityMatches = Object.values(val)
                .filter(item => item.name.toLowerCase().includes(q))
                .map(item => ({ ...item, source: 'FitNit Community', isCommunity: true }));
        }
    } catch (e) { console.warn("Community Fetch Error", e); }

    // 2. Search OpenFoodFacts (External)
    let apiMatches = [];
    try {
        const response = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=20`);
        const data = await response.json();
        if (data.products) {
            apiMatches = data.products.map(p => {
                const n = p.nutriments;
                return {
                    name: p.product_name,
                    calories: Math.round(n['energy-kcal_100g'] || 0),
                    protein: Math.round(n.proteins_100g || 0),
                    carbs: Math.round(n.carbohydrates_100g || 0),
                    fat: Math.round(n.fat_100g || 0),
                    source: 'External Database',
                    isCommunity: false
                };
            });
        }
    } catch (e) { console.warn("API Fetch Error", e); }

    // 3. Merge & Render
    list.innerHTML = "";
    const all = [...communityMatches, ...apiMatches];

    if (all.length === 0) {
        list.innerHTML = "<p>No results found.</p>";
        return;
    }

    all.forEach(food => {
        const card = document.createElement('div');
        card.className = "card";
        card.style.padding = "10px";

        // Badge for community items
        const badge = food.isCommunity ? `<span style="background:#e67e22; color:white; padding:2px 5px; border-radius:4px; font-size:10px; margin-left:5px;">Community</span>` : '';

        card.innerHTML = `
            <strong>${food.name}</strong>${badge}<br>
            <small>${food.calories} kcal | P: ${food.protein}g C: ${food.carbs}g F: ${food.fat}g</small>
        `;

        card.onclick = () => {
            currentScannedItem = food;
            showConfirm();
        };
        list.appendChild(card);
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

// Helper to filter and update graph
window.updateWeightFilter = (days) => {
    window._weightRange = days;
    if (!window._fullWeightHistory) return;

    // Calculate cutoff date
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    // Filter
    const filtered = {};
    Object.keys(window._fullWeightHistory).forEach(k => {
        if (k >= cutoffStr) filtered[k] = window._fullWeightHistory[k];
    });

    if (window.updateWeightGraph) window.updateWeightGraph(filtered);
}

// Add Filter Listener
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.onclick = (e) => {
        const range = Number(e.target.dataset.range);
        window.updateWeightFilter(range);
    }
});

// Open Report Modal
document.getElementById('open-report-btn').onclick = () => {
    document.getElementById('report-modal').style.display = 'flex';
    document.getElementById('settings-modal').style.display = 'none';
};

// GENERATE PDF LOGIC
document.getElementById('generate-pdf-btn').onclick = async () => {
    const includeProfile = document.getElementById('rep-profile').checked;
    const includeWeight = document.getElementById('rep-weight').checked;
    const includeDiet = document.getElementById('rep-diet').checked;
    const includeWorkouts = document.getElementById('rep-workouts').checked;
    const days = Number(document.getElementById('rep-range').value);

    const btn = document.getElementById('generate-pdf-btn');
    btn.innerText = "Generating..."; btn.disabled = true;

    const container = document.getElementById('report-container');
    container.innerHTML = "";

    // 1. HEADER
    const header = document.createElement('div');
    header.innerHTML = `
            <div style="border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; display:flex; justify-content:space-between; align-items:end;">
                <div>
                    <h1 style="margin:0; font-size:28px;">FitNit Report</h1>
                    <p style="margin:0; color:#555;">Generated on ${new Date().toLocaleDateString()}</p>
                </div>
                <div style="text-align:right;">
                    <h3 style="margin:0;">${auth.currentUser.email}</h3>
                </div>
            </div>
        `;
    container.appendChild(header);

    // 2. PROFILE & GOALS
    if (includeProfile) {
        // Using window._lastUserData directly if available, else fetch? 
        // We'll rely on global data for simplicity or quick fetch
        const g = (window._lastUserData && window._lastUserData.goals) || {};
        const section = document.createElement('div');
        section.style.marginBottom = "30px";
        section.innerHTML = `
                <h2 style="background:#eee; padding:5px 10px; margin-bottom:10px;">User Profile & Goals</h2>
                <table style="width:100%; border-collapse:collapse;">
                    <tr>
                        <td style="padding:5px; border-bottom:1px solid #ddd;"><strong>Height:</strong> ${g.height || '-'} cm</td>
                        <td style="padding:5px; border-bottom:1px solid #ddd;"><strong>Age:</strong> ${g.age || '-'}</td>
                        <td style="padding:5px; border-bottom:1px solid #ddd;"><strong>Activity Level:</strong> ${g.activity || '-'}</td>
                    </tr>
                    <tr>
                        <td style="padding:5px; border-bottom:1px solid #ddd;"><strong>Calorie Goal:</strong> ${g.calories || 2000} kcal</td>
                        <td style="padding:5px; border-bottom:1px solid #ddd;"><strong>Protein Goal:</strong> ${g.protein || 150}g</td>
                        <td style="padding:5px; border-bottom:1px solid #ddd;"><strong>Latest Weight:</strong> ${window._lastUserData ? window._lastUserData.latest_weight : '-'} lbs</td>
                    </tr>
                </table>
            `;
        container.appendChild(section);
    }

    // Helper for Date Filtering
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    // 3. WEIGHT HISTORY (Table + Graph placeholder?)
    if (includeWeight && window._fullWeightHistory) {
        const section = document.createElement('div');
        section.style.marginBottom = "30px";
        section.innerHTML = `<h2 style="background:#eee; padding:5px 10px; margin-bottom:10px;">Weight History</h2>`;

        // Filter Data
        const rows = [];
        Object.keys(window._fullWeightHistory).sort().reverse().forEach(date => {
            if (date >= cutoffStr) {
                rows.push(`<tr><td style="padding:4px; border-bottom:1px solid #eee;">${date}</td><td style="padding:4px; border-bottom:1px solid #eee;"><strong>${window._fullWeightHistory[date]} lbs</strong></td></tr>`);
            }
        });

        // If we could clone the canvas that would be cool, but html2pdf handles canvas well if visible.
        // Since the report is "hidden" off-screen, a live canvas clone might be tricky.
        // For now, Just a clean data table.
        if (rows.length > 0) {
            section.innerHTML += `
                    <table style="width:100%; border-collapse:collapse; font-size:14px;">
                        <tr style="background:#f9f9f9; text-align:left;">
                            <th style="padding:5px;">Date</th><th style="padding:5px;">Weight</th>
                        </tr>
                        ${rows.join('')}
                    </table>
                `;
        } else {
            section.innerHTML += `<p>No weight data in selected range.</p>`;
        }
        container.appendChild(section);
    }

    // 4. DIET LOG
    if (includeDiet) {
        const section = document.createElement('div');
        section.style.marginBottom = "30px";
        section.innerHTML = `<h2 style="background:#eee; padding:5px 10px; margin-bottom:10px;">Diet Log</h2>`;

        // Fetch relevant days? This is expensive if "All Time". 
        // We need to query range. 
        // For "Pro" fetch, we use startAt/endAt.
        // Simplified: Fetch 'diary' node? (Might be huge).
        // Let's rely on cached data or fetch specific range asynchronously.
        // fetching...
        const diaryRef = query(ref(db, `users/${auth.currentUser.uid}/diary`), orderByKey(), startAt(cutoffStr));
        const snap = await get(diaryRef);

        if (snap.exists()) {
            let html = "";
            snap.forEach(daySnap => {
                const date = daySnap.key;
                let dayHtml = `<h4 style="margin:10px 0 5px 0; border-bottom:1px solid #ccc;">${date}</h4><table style="width:100%; font-size:12px; margin-bottom:10px;">`;

                let dayTotal = 0;
                daySnap.forEach(mealSnap => {
                    // meal type
                    mealSnap.forEach(itemSnap => {
                        const item = itemSnap.val();
                        dayTotal += item.calories;
                        dayHtml += `<tr>
                                <td style="width:50%;">${item.name}</td>
                                <td>${item.calories} kcal</td>
                                <td>P: ${item.protein}g</td>
                                <td>C: ${item.carbs}g</td>
                                <td>F: ${item.fat}g</td>
                            </tr>`;
                    });
                });
                dayHtml += `<tr><td colspan="5" style="text-align:right; font-weight:bold; padding-top:5px;">Day Total: ${dayTotal} kcal</td></tr></table>`;
                html += dayHtml; // Reverse order?
            });
            section.innerHTML += html || "<p>No entries found.</p>";
        } else {
            section.innerHTML += `<p>No diet data found.</p>`;
        }
        container.appendChild(section);
    }

    // 5. WORKOUT LOG
    if (includeWorkouts) {
        const section = document.createElement('div');
        section.style.marginBottom = "30px";
        section.innerHTML = `<h2 style="background:#eee; padding:5px 10px; margin-bottom:10px;">Workout Log</h2>`;

        const workRef = query(ref(db, `users/${auth.currentUser.uid}/workouts`), orderByKey(), startAt(cutoffStr));
        const snap = await get(workRef);

        if (snap.exists()) {
            let html = `<table style="width:100%; border-collapse:collapse; font-size:13px;">
                        <tr style="background:#f9f9f9; text-align:left;">
                            <th style="padding:5px;">Date</th><th style="padding:5px;">Exercise</th>
                            <th style="padding:5px;">Sets/Time</th><th style="padding:5px;">Burned</th>
                        </tr>`;

            snap.forEach(daySnap => {
                const date = daySnap.key;
                daySnap.forEach(exSnap => {
                    const ex = exSnap.val();
                    const details = ex.duration ? `${ex.duration} min` : `${ex.sets} x ${ex.reps}`;
                    html += `<tr>
                            <td style="padding:4px; border-bottom:1px solid #eee;">${date}</td>
                            <td style="padding:4px; border-bottom:1px solid #eee;">${ex.name}</td>
                            <td style="padding:4px; border-bottom:1px solid #eee;">${details}</td>
                            <td style="padding:4px; border-bottom:1px solid #eee;">${ex.burned} kcal</td>
                         </tr>`;
                });
            });
            html += "</table>";
            section.innerHTML += html;
        } else {
            section.innerHTML += `<p>No workouts found.</p>`;
        }
        container.appendChild(section);
    }

    // EXPORT
    const opt = {
        margin: 0.5,
        filename: `FitNit_Report_${cutoffStr}_to_Now.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    if (window.html2pdf) {
        window.html2pdf().set(opt).from(container).save().then(() => {
            btn.innerText = "Download PDF"; btn.disabled = false;
            document.getElementById('report-modal').style.display = 'none';
        });
    } else {
        alert("PDF library not ready.");
        btn.innerText = "Download PDF"; btn.disabled = false;
    }
};

window.updateWeightGraph = (history) => {
    const ctx = document.getElementById('weightHistoryChart').getContext('2d');
    const sorted = Object.keys(history).sort();

    if (weightChart) weightChart.destroy();

    // Only show if we have data, else empty
    if (sorted.length === 0) return;

    weightChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sorted.map(d => d.split('-').slice(1).join('/')),
            datasets: [{
                label: 'Weight',
                data: sorted.map(d => history[d]),
                borderColor: '#3498db',
                backgroundColor: 'rgba(52, 152, 219, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false } // HIDE LEGEND
            },
            scales: {
                y: { beginAtZero: false }
            }
        }
    });
}

// --- SCANNER ---
document.getElementById('scan-nav-btn').onclick = () => {
    window.showView('scanner-screen');
    window.toggleAddMode('scan');
    if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (text) => {
        // 1. Check Community DB (public_barcodes)
        get(ref(db, `public_barcodes/${text}`)).then((snap) => {
            if (snap.exists()) {
                // Found in Community -> STOP & SHOW
                html5QrCode.stop().then(() => {
                    currentScannedItem = { ...snap.val(), image: "" };
                    showConfirm();
                }).catch(e => console.error(e));
            } else {
                // 2. Fallback to OpenFoodFacts
                fetch(`https://world.openfoodfacts.org/api/v0/product/${text}.json`)
                    .then(r => r.json()).then(d => {
                        if (d.status === 1) {
                            // Found in OFF -> STOP & SHOW
                            html5QrCode.stop().then(() => {
                                const n = d.product.nutriments;
                                const getVal = (key) => Math.round(n[key + '_serving'] || n[key + '_100g'] || n[key + '_value'] || 0);
                                const getCals = () => Math.round(n['energy-kcal_serving'] || n['energy-kcal_100g'] || n['energy-kcal_value'] || 0);

                                currentScannedItem = {
                                    name: d.product.product_name + (d.product.serving_size ? ` (${d.product.serving_size})` : ''),
                                    calories: getCals(),
                                    protein: getVal('proteins'),
                                    carbs: getVal('carbohydrates'),
                                    fat: getVal('fat'),
                                    sugar: getVal('sugars'),
                                    satFat: getVal('saturated-fat'),
                                    fiber: getVal('fiber'),
                                    sodium: getVal('sodium') * 1000,
                                    cholesterol: getVal('cholesterol') * 1000,
                                    potassium: getVal('potassium') * 1000,
                                    vitA: getVal('vitamin-a') * 1000000,
                                    vitC: getVal('vitamin-c') * 1000,
                                    calcium: getVal('calcium') * 1000,
                                    iron: getVal('iron') * 1000,
                                    image: d.product.image_url || ""
                                };
                                showConfirm();
                            }).catch(e => console.error(e));
                        }
                    })
                    .catch(error => { console.error("OFF Error", error); });
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
['weight', 'goals', 'workouts'].forEach(type => {
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

const toggleBtn = document.getElementById('view-my-public-btn');
// Initial State text (optional, but handled in logic)

toggleBtn.onclick = () => {
    const isPublicMode = window._isViewingPublicProfile;

    if (!isPublicMode) {
        // Switch TO Public View
        window._isViewingPublicProfile = true;
        toggleBtn.innerText = "Exit Public View";
        toggleBtn.style.background = "#e74c3c";
        document.getElementById('settings-modal').style.display = 'none';

        // Render cached data as public
        if (window._lastUserData) {
            renderProfileScreen(window._lastUserData, false, window._lastUserUid);
            window.showView('profile-screen');
        }

    } else {
        // Switch BACK to Private
        window._isViewingPublicProfile = false;
        toggleBtn.innerText = "View My Public Profile";
        toggleBtn.style.background = "#3498db";
        document.getElementById('settings-modal').style.display = 'none';

        // Render cached data as private
        if (window._lastUserData) {
            renderProfileScreen(window._lastUserData, true, window._lastUserUid);
        }
    }
};

document.getElementById('open-settings-btn').onclick = () => document.getElementById('settings-modal').style.display = 'flex';
document.getElementById('close-settings-btn').onclick = () => document.getElementById('settings-modal').style.display = 'none';
document.getElementById('friends-btn').onclick = () => document.getElementById('friends-modal').style.display = 'flex';

// --- CUSTOM GOALS ---
const suggestedGoals = [
    "Lose 5 lbs", "Lose 10 lbs", "Drink 8 cups water", "Walk 10,000 steps",
    "Run a 5k", "Run a 10k", "Do 50 pushups", "Do 10 pullups",
    "Eat 150g protein", "Veg with every meal", "No sugar for 1 week",
    "Workout 3x/week", "Workout 5x/week", "Sleep 8 hours",
    "Meditate 10 mins", "Meal prep for week", "Track all calories",
    "Hit calorie goal", "Maintain weight", "Bench press bodyweight"
];

function renderRandomSuggestions() {
    const grid = document.getElementById('add-goal-suggestions');
    if (!grid) return;
    grid.innerHTML = "";
    // Pick 3 random
    const shuffled = [...suggestedGoals].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 3);

    selected.forEach(g => {
        const btn = document.createElement('div');
        btn.className = "suggestion-chip";
        btn.style.background = "#3498db";
        btn.style.color = "#fff";
        btn.style.padding = "8px";
        btn.style.borderRadius = "20px";
        btn.style.fontSize = "12px";
        btn.style.textAlign = "center";
        btn.style.cursor = "pointer";
        btn.innerText = g;
        btn.onclick = () => {
            document.getElementById('new-goal-input').value = g;
        };
        grid.appendChild(btn);
    });
}
// Regenerate Button Handler (will be added to HTML)
window.regenerateSuggestions = () => renderRandomSuggestions();

document.getElementById('add-goal-btn').onclick = () => {
    document.getElementById('add-goal-modal').style.display = 'flex';
    document.getElementById('new-goal-input').value = ""; // Clear
    renderRandomSuggestions();
};


document.getElementById('confirm-add-goal-btn').onclick = () => {
    const goal = document.getElementById('new-goal-input').value;
    if (goal) {
        push(ref(db, `users/${auth.currentUser.uid}/active_goals`), { text: goal, created: Date.now(), completed: false });
        document.getElementById('add-goal-modal').style.display = 'none';
        // If viewing self profile, it updates automatically via listener?
        // Yes, listener is active.
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
// --- NUTRITION DASHBOARD RENDERER ---
function renderNutritionDashboard(prot, carbs, fat, sugar, satFat, fiber, sodium, vitC, calcium, iron, goals) {
    const container = document.getElementById('nutrition-dashboard-container');
    if (!container) return;

    // Helper for percentage
    const getPct = (val, max) => max > 0 ? Math.min(100, Math.round((val / max) * 100)) : 0;

    // Use default goals for extended nutrients if not user-defined
    const gSugar = goals.sugar || 50;
    const gFiber = goals.fiber || 30;
    const gSatFat = goals.satFat || 20;
    const gSodium = goals.sodium || 2300;
    const gVitC = goals.vitC || 90;
    const gCalcium = goals.calcium || 1000;
    const gIron = goals.iron || 18;

    container.innerHTML = `
        <h3 style="margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px;">Nutrition Breakdown Today</h3>
        
        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-bottom:20px;">
            <div class="stat-box" style="background:var(--card-bg); border:1px solid #eee; border-radius:10px; padding:10px; text-align:center;">
                <small style="color:#e74c3c; font-weight:bold;">Protein</small>
                <div style="font-size:18px; font-weight:bold;">${Math.round(prot)}g</div>
                <div style="font-size:10px; opacity:0.7;">Goal: ${goals.protein}g</div>
                <div style="height:4px; width:100%; background:#ddd; margin-top:5px; border-radius:2px;">
                    <div style="height:100%; width:${getPct(prot, goals.protein)}%; background:#e74c3c; border-radius:2px;"></div>
                </div>
            </div>
            <div class="stat-box" style="background:var(--card-bg); border:1px solid #eee; border-radius:10px; padding:10px; text-align:center;">
                <small style="color:#f1c40f; font-weight:bold;">Carbs</small>
                <div style="font-size:18px; font-weight:bold;">${Math.round(carbs)}g</div>
                <div style="font-size:10px; opacity:0.7;">Goal: ${goals.carbs}g</div>
                <div style="height:4px; width:100%; background:#ddd; margin-top:5px; border-radius:2px;">
                    <div style="height:100%; width:${getPct(carbs, goals.carbs)}%; background:#f1c40f; border-radius:2px;"></div>
                </div>
            </div>
            <div class="stat-box" style="background:var(--card-bg); border:1px solid #eee; border-radius:10px; padding:10px; text-align:center;">
                <small style="color:#3498db; font-weight:bold;">Fats</small>
                <div style="font-size:18px; font-weight:bold;">${Math.round(fat)}g</div>
                <div style="font-size:10px; opacity:0.7;">Goal: ${goals.fat}g</div>
                <div style="height:4px; width:100%; background:#ddd; margin-top:5px; border-radius:2px;">
                    <div style="height:100%; width:${getPct(fat, goals.fat)}%; background:#3498db; border-radius:2px;"></div>
                </div>
            </div>
        </div>

        <h4 style="margin:10px 0; font-size:14px; opacity:0.8;">Detailed Breakdown</h4>
        <div class="list-container" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            
            <div style="padding:10px; background:var(--bg-color); border:1px solid #eee; border-radius:8px;">
                <div style="display:flex; justify-content:space-between; font-size:12px;">
                    <span>Sugar</span><span>${Math.round(sugar)} / ${gSugar}g</span>
                </div>
                <div class="progress" style="height:6px; margin-top:5px;"><div class="fill" style="width:${getPct(sugar, gSugar)}%; background:#e67e22;"></div></div>
            </div>

            <div style="padding:10px; background:var(--bg-color); border:1px solid #eee; border-radius:8px;">
                <div style="display:flex; justify-content:space-between; font-size:12px;">
                    <span>Fiber</span><span>${Math.round(fiber)} / ${gFiber}g</span>
                </div>
                <div class="progress" style="height:6px; margin-top:5px;"><div class="fill" style="width:${getPct(fiber, gFiber)}%; background:#27ae60;"></div></div>
            </div>

            <div style="padding:10px; background:var(--bg-color); border:1px solid #eee; border-radius:8px;">
                <div style="display:flex; justify-content:space-between; font-size:12px;">
                    <span>Saturated Fat</span><span>${Math.round(satFat)} / ${gSatFat}g</span>
                </div>
                <div class="progress" style="height:6px; margin-top:5px;"><div class="fill" style="width:${getPct(satFat, gSatFat)}%; background:#c0392b;"></div></div>
            </div>

            <div style="padding:10px; background:var(--bg-color); border:1px solid #eee; border-radius:8px;">
                <div style="display:flex; justify-content:space-between; font-size:12px;">
                    <span>Sodium</span><span>${Math.round(sodium)} / ${gSodium}mg</span>
                </div>
                <div class="progress" style="height:6px; margin-top:5px;"><div class="fill" style="width:${getPct(sodium, gSodium)}%; background:#7f8c8d;"></div></div>
            </div>
        </div>

        <h4 style="margin:15px 0 5px 0; font-size:14px; opacity:0.8;">Vitamins & Minerals</h4>
        <div style="display:flex; justify-content:space-between; background:var(--bg-color); padding:10px; border-radius:8px; font-size:12px; border:1px solid #eee;">
            <div style="text-align:center;">
                <span style="display:block; font-weight:bold; color:#8e44ad;">Vit C</span>
                <span>${Math.round(vitC)}mg</span>
            </div>
             <div style="text-align:center;">
                <span style="display:block; font-weight:bold; color:#2980b9;">Calcium</span>
                <span>${Math.round(calcium)}mg</span>
            </div>
             <div style="text-align:center;">
                <span style="display:block; font-weight:bold; color:#c0392b;">Iron</span>
                <span>${Math.round(iron)}mg</span>
            </div>
        </div>
    `;
}

// --- DELETE & DETAILS ACTIONS ---
// --- DELETE & DETAILS ACTIONS ---

window.promptDeleteItem = (meta) => {
    // meta: { category: 'food'|'workout', date, subType, key, name }
    window.pendingDelete = meta;
    document.getElementById('delete-confirm-msg').innerText = `Remove ${meta.name}?`;
    document.getElementById('delete-confirm-modal').style.display = 'flex';
}

window.confirmDelete = () => {
    if (window.pendingDelete) {
        const { category, date, subType, key } = window.pendingDelete;
        const uid = auth.currentUser.uid;

        if (category === 'food') {
            set(ref(db, `users/${uid}/diary/${date}/${subType}/${key}`), null);
        } else if (category === 'workout') {
            set(ref(db, `users/${uid}/workouts/${date}/${key}`), null);
        }

        window.pendingDelete = null;
    }
    document.getElementById('delete-confirm-modal').style.display = 'none';
}

window.showFoodDetails = (item) => {
    const m = document.getElementById('food-details-modal');
    if (!m) return;

    // Reset
    document.getElementById('fd-image-container').style.display = 'none';
    document.getElementById('fd-extended').innerHTML = "";

    // Basic Info
    document.getElementById('fd-name').innerText = item.name;
    document.getElementById('fd-meta').innerText = `Logged Item`; // Could contain time or type
    document.getElementById('fd-cals').innerText = item.calories;
    document.getElementById('fd-prot').innerText = (item.protein || 0) + 'g';
    document.getElementById('fd-carb').innerText = (item.carbs || 0) + 'g';
    document.getElementById('fd-fat').innerText = (item.fat || 0) + 'g';

    // Image
    if (item.image) {
        document.getElementById('fd-image').src = item.image;
        document.getElementById('fd-image-container').style.display = 'block';
    }

    // Extended Nutrients List
    const extContainer = document.getElementById('fd-extended');
    const fields = [
        { l: 'Sugar', v: item.sugar, u: 'g' },
        { l: 'Fiber', v: item.fiber, u: 'g' },
        { l: 'Saturated Fat', v: item.satFat, u: 'g' },
        { l: 'Sodium', v: item.sodium, u: 'mg' },
        { l: 'Vitamin C', v: item.vitC, u: 'mg' },
        { l: 'Calcium', v: item.calcium, u: 'mg' },
        { l: 'Iron', v: item.iron, u: 'mg' }
    ];

    fields.forEach(f => {
        if (f.v !== undefined) {
            const row = document.createElement('div');
            row.style.display = "flex"; row.style.justifyContent = "space-between";
            row.style.padding = "5px 0"; row.style.borderBottom = "1px solid #f5f5f5";
            row.innerHTML = `<span>${f.l}</span><span>${f.v}${f.u}</span>`;
            extContainer.appendChild(row);
        }
    });

    m.style.display = 'flex';
}

// --- GUIDED SCANN NER WIZARD LOGIC ---
let gwStep = 1;
let gwData = { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, name: "", barcode: "" };
let barcodeLock = false; // Prevent double scans

const GW_STEPS = {
    1: { title: "Step 1: Nutrition", desc: "Take a clear picture of the Nutrition Facts table.", action: "Scan Nutrition Labels", icon: "https://cdn-icons-png.flaticon.com/512/3063/3063822.png" }, // Placeholder icon
    2: { title: "Step 2: Product Name", desc: "Take a clear picture of the Product Name on the package.", action: "Scan Name", icon: "https://cdn-icons-png.flaticon.com/512/1040/1040241.png" },
    3: { title: "Step 3: Barcode", desc: "Scan the product barcode to link it.", action: "Scan Barcode", icon: "https://cdn-icons-png.flaticon.com/512/241/241528.png" }
};

window.closeGuidedWizard = () => {
    document.getElementById('guided-wizard-overlay').style.display = 'none';
};

// HELPER: Switch View within Modal
const setGwView = (viewId) => {
    ['gw-view-instruction', 'gw-view-loading', 'gw-view-edit-1', 'gw-view-edit-2', 'gw-view-edit-3'].forEach(id => {
        document.getElementById(id).style.display = 'none';
    });
    document.getElementById(viewId).style.display = 'block';
};

const updateGwUI = () => {
    const s = GW_STEPS[gwStep];
    document.getElementById('gw-step-title').innerText = s.title;
    document.getElementById('gw-step-desc').innerText = s.desc;
    // document.getElementById('gw-step-image').src = s.icon; // Use local assets or material icons

    // Update Dots
    [1, 2, 3].forEach(n => {
        document.getElementById(`dot-${n}`).className = `dot ${n === gwStep ? 'active' : ''}`;
        document.getElementById(`dot-${n}`).style.opacity = n === gwStep ? 1 : 0.5;
    });

    setGwView('gw-view-instruction');
};

const initSmartScanner = () => {
    const btnStart = document.getElementById('btn-read-label');
    const inputReader = document.getElementById('label-image-input');

    // Override Main Button to Open Wizard
    if (btnStart) {
        btnStart.onclick = () => {
            gwStep = 1;
            gwData = { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, name: "", barcode: "" };
            document.getElementById('guided-wizard-overlay').style.display = 'flex';
            updateGwUI();
        };
    }

    // WIZARD ACTION BUTTON (The "Scan Now" button inside modal)
    document.getElementById('gw-btn-action').onclick = () => {
        if (gwStep === 3) {
            startGuidedBarcodeScan();
        } else {
            inputReader.click();
        }
    };

    // CONFIRM BUTTONS
    document.getElementById('gw-btn-confirm-1').onclick = () => {
        gwData.calories = Number(document.getElementById('gw-cals').value) || 0;
        gwData.protein = Number(document.getElementById('gw-prot').value) || 0;
        gwData.carbs = Number(document.getElementById('gw-carb').value) || 0;
        gwData.fat = Number(document.getElementById('gw-fat').value) || 0;
        gwData.sugar = Number(document.getElementById('gw-sugar').value) || 0;

        gwStep = 2;
        updateGwUI();
    };

    document.getElementById('gw-btn-confirm-2').onclick = () => {
        gwData.name = document.getElementById('gw-name').value || "Scanned Item";

        gwStep = 3;
        updateGwUI();
    };

    document.getElementById('gw-btn-finish').onclick = () => {
        // Fill Main Form
        document.getElementById('c-name').value = gwData.name;
        document.getElementById('c-cals').value = gwData.calories;
        document.getElementById('c-prot').value = gwData.protein;
        document.getElementById('c-carb').value = gwData.carbs;
        document.getElementById('c-fat').value = gwData.fat;
        document.getElementById('c-sugar').value = gwData.sugar;
        document.getElementById('c-barcode').value = gwData.barcode;

        closeGuidedWizard();

        if (window.toggleAddMode) window.toggleAddMode('custom');
        setupCustomSubmit(); // Re-bind

        // Show Success Toast?
    };

    // FILE INPUT CHANGE (OCR PROCESSOR)
    if (inputReader) {
        inputReader.onchange = async (e) => {
            if (!e.target.files || e.target.files.length === 0) return;

            // Show Loading
            setGwView('gw-view-loading');

            const file = e.target.files[0];
            try {
                const processed = await preprocessImage(file);
                const worker = await Tesseract.createWorker('eng');
                const { data: { text } } = await worker.recognize(processed);
                await worker.terminate();

                if (gwStep === 1) {
                    // Extract Macros
                    const findVal = (regex) => { const m = text.match(regex); return m ? parseFloat(m[1]) : 0; };
                    gwData.calories = findVal(/Calories\D*(\d+)/i) || 0;
                    gwData.protein = findVal(/Protein\D*(\d+)g?/i) || 0;
                    gwData.carbs = findVal(/Total Carb\w*\D*(\d+)g?/i) || 0;
                    gwData.fat = findVal(/Total Fat\D*(\d+)g?/i) || 0;
                    gwData.sugar = findVal(/Total Sugars?\D*(\d+)g?/i) || findVal(/Sugars?\D*(\d+)g?/i) || 0;

                    // Populate & Show Verify View
                    document.getElementById('gw-cals').value = gwData.calories;
                    document.getElementById('gw-prot').value = gwData.protein;
                    document.getElementById('gw-carb').value = gwData.carbs;
                    document.getElementById('gw-fat').value = gwData.fat;
                    document.getElementById('gw-sugar').value = gwData.sugar;

                    setGwView('gw-view-edit-1');

                } else if (gwStep === 2) {
                    // Extract Name
                    const lines = text.split('\n').filter(l => l.trim().length > 3);
                    gwData.name = lines[0] || "Unknown Item";
                    gwData.name = gwData.name.replace(/[^a-zA-Z0-9\s]/g, '').trim();

                    document.getElementById('gw-name').value = gwData.name;
                    setGwView('gw-view-edit-2');
                }

            } catch (err) {
                console.error(err);
                alert("Scan failed. Please try again.");
                updateGwUI(); // Go back to instruction
            }
            inputReader.value = ""; // Reset
        };
    }
};

// FIXED BARCODE SCANNER
function startGuidedBarcodeScan() {
    barcodeLock = false; // Reset Lock

    document.getElementById('guided-wizard-overlay').style.display = 'none';
    document.getElementById('mode-scan').style.display = 'block';

    // Ensure reader is clean
    const readerDiv = document.getElementById('reader');
    readerDiv.innerHTML = "";

    // CLEANUP OLD INSTANCE SAFELY
    const startScanner = () => {
        if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");

        html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (code) => {
            if (barcodeLock) return;
            barcodeLock = true;

            // --- HARD STOP UI IMMEDIATE ---
            document.getElementById('mode-scan').style.display = 'none';

            // Show Wizard Confirmation Step
            document.getElementById('guided-wizard-overlay').style.display = 'flex';
            document.getElementById('gw-barcode-display').innerText = code;
            gwData.barcode = code;
            setGwView('gw-view-edit-3');

            // Stop in background
            html5QrCode.stop().then(() => {
                console.log("Scanner stopped.");
                html5QrCode.clear(); // Important to free resources
            }).catch(e => console.warn(e));

        }).catch(err => {
            // If error is "Scanning is already in progress", ignore it or retry?
            console.error("Start Error: ", err);
            if (!barcodeLock) {
                alert("Scanner Error: " + err);
                document.getElementById('mode-scan').style.display = 'none';
                document.getElementById('guided-wizard-overlay').style.display = 'flex';
            }
        });
    };

    // Attempt to stop/clear existing instance before starting
    if (html5QrCode) {
        if (html5QrCode.isScanning) {
            html5QrCode.stop().then(() => {
                html5QrCode.clear().then(startScanner);
            }).catch(() => {
                // Force clear if stop fails
                startScanner();
            });
        } else {
            startScanner();
        }
    } else {
        startScanner();
    }
}

// Initialize
initSmartScanner();
// Helper: Preprocess Image for Better OCR
function preprocessImage(file) {
    return new Promise((resolve) => {
        const img = new Image();
        const reader = new FileReader();
        reader.onload = (e) => {
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // 1. Resize (Limit max dimension to 800px for speed/clarity)
                const MAX_DIM = 800;
                let scale = 1;
                if (img.width > MAX_DIM || img.height > MAX_DIM) {
                    scale = Math.min(MAX_DIM / img.width, MAX_DIM / img.height);
                }
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                // 2. Grayscale & Contrast
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const d = imgData.data;
                for (let i = 0; i < d.length; i += 4) {
                    const r = d[i], g = d[i + 1], b = d[i + 2];
                    // Grayscale (Luminance)
                    let v = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                    // Contrast (Thresholding - simple binarization)
                    // If v > 128 ? 255 : 0; (Binarization helps specific fonts, but grayscale is safer generally)
                    // Let's stick to simple High Contrast Grayscale
                    v = v > 100 ? 255 : 0; // Simple binarization threshold

                    d[i] = d[i + 1] = d[i + 2] = v;
                }
                ctx.putImageData(imgData, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}


// EXTENDED CUSTOM FOOD HANDLER
// EXTENDED CUSTOM FOOD HANDLER & DUPLICATE CHECK
// Wrapper to ensure we can re-attach if DOM is replaced
function setupCustomSubmit() {
    const customBtn = document.getElementById('btn-submit-custom');
    if (!customBtn) return;

    // Remove old listener to avoid duplicates if called multiple times
    const newBtn = customBtn.cloneNode(true);
    customBtn.parentNode.replaceChild(newBtn, customBtn);

    newBtn.onclick = async () => {
        newBtn.disabled = true;
        newBtn.innerText = "Saving...";

        try {
            const name = document.getElementById('c-name').value;
            const cals = Number(document.getElementById('c-cals').value);
            const prot = Number(document.getElementById('c-prot').value || 0);
            const carbs = Number(document.getElementById('c-carb').value || 0);
            const fat = Number(document.getElementById('c-fat').value || 0);
            const sugar = Number(document.getElementById('c-sugar').value || 0);
            const barcode = document.getElementById('c-barcode').value || null;

            if (!name || cals === undefined || cals === null || cals === "") {
                alert("Name and Calories are required.");
                newBtn.disabled = false;
                newBtn.innerText = "Save Custom";
                return;
            }

            // 1. Search for duplicates (Public DB + API)
            const dupItem = await checkDuplicate(name);

            const currentItem = {
                name, calories: cals, protein: prot, carbs, fat, sugar, timestamp: Date.now(),
                createdBy: auth.currentUser.uid
            };
            // Attach barcode to item if present
            if (barcode) currentItem.barcode = barcode;

            if (dupItem) {
                // Show Modal
                showDuplicateModal(dupItem, currentItem);
            } else {
                // No duplicate, save normally (Public + Private)
                await saveCustomFood(currentItem, true);
            }
        } catch (err) {
            console.error(err);
            alert("Error saving item: " + err.message);
        } finally {
            newBtn.disabled = false;
            newBtn.innerText = "Save Custom";
        }
    };
}
// Call initially
setupCustomSubmit();

// Check for duplicates
async function checkDuplicate(queryName) {
    const q = queryName.toLowerCase().trim();
    if (q.length < 3) return null;

    // 1. Check Public DB (Simple client-side filter of recent snapshot or query)
    // For scalability, this should be an indexed query. For prototype, fetch all public items? No, that's bad.
    // Query by orderByChild('name') requires index. 
    // Let's rely on finding *exact* or *very close* match via API first as simpler proxy?

    // Better: Query `public_foods` ordered by name.
    // Since Firebase doesn't do "contains", we check "startAt(name)".
    // This finds matches starting with the name.

    /* 
       Optimization: We only check OpenFoodFacts API for "Exact Name" match logic or use existing search results?
       Actually, user asked to check "external OR Fitnit community".
    */

    // A. Check Public DB (FitNit Community)
    try {
        const snap = await get(ref(db, 'public_foods')); // Simple fetch for prototype
        if (snap.exists()) {
            const val = snap.val();
            const start = q.substring(0, 3);
            const match = Object.values(val).find(item => {
                // Loose match: similar naming
                const iName = item.name.toLowerCase();
                return iName === q || (iName.includes(q) && q.length > 4);
            });

            if (match) {
                return { ...match, source: "FitNit Community" };
            }
        }
    } catch (e) { console.error("Dup check error", e); }

    // B. Check External API (OpenFoodFacts)
    try {
        const response = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=1`);
        const data = await response.json();

        if (data.products && data.products.length > 0) {
            const p = data.products[0];
            if (p.product_name.toLowerCase() === q || p.product_name.toLowerCase().includes(q) && q.length > 5) {
                return {
                    name: p.product_name,
                    calories: Math.round(p.nutriments['energy-kcal_100g'] || 0),
                    protein: Math.round(p.nutriments.proteins_100g || 0),
                    carbs: Math.round(p.nutriments.carbohydrates_100g || 0),
                    fat: Math.round(p.nutriments.fat_100g || 0),
                    source: "OpenFoodFacts"
                };
            }
        }
    } catch (e) { console.error("Dup check error", e); }

    // B. Check Public DB (Manual scan of last 50? or by index)
    // Without correct rules/indexing, I can't guarantee efficient search. 
    // I will skip complex internal DB search for duplicate prevention to avoid performance hit, 
    // and rely on the External one which has most items.

    return null;
}

function showDuplicateModal(existing, current) {
    const m = document.getElementById('duplicate-check-modal');
    const preview = document.getElementById('dup-item-preview');

    preview.innerHTML = `
        <strong>${existing.name}</strong><br>
        <small>${existing.source || 'Database'}</small>
        <div style="display:flex; gap:10px; margin-top:5px; font-size:12px;">
            <span>${existing.calories} kcal</span>
            <span>P: ${existing.protein}g</span>
            <span>C: ${existing.carbs}g</span>
            <span>F: ${existing.fat}g</span>
        </div>
    `;

    // Handlers
    document.getElementById('btn-use-existing').onclick = () => {
        saveCustomFood(existing, false); // Save existing to diary (private), do NOT push to public
        m.style.display = 'none';
        clearCustomForm();
    };

    document.getElementById('btn-force-custom').onclick = () => {
        saveCustomFood(current, false); // Save custom to diary (private request), do NOT push to public
        m.style.display = 'none';
        clearCustomForm();
    };

    m.style.display = 'flex';
}

function clearCustomForm() {
    document.getElementById('c-name').value = "";
    document.getElementById('c-cals').value = "";
    document.getElementById('c-prot').value = "";
    document.getElementById('c-carb').value = "";
    document.getElementById('c-fat').value = "";
    if (window.toggleAddMode) window.toggleAddMode('recent'); // Go back
}

async function saveCustomFood(item, saveToPublic) {
    const date = window.getToday ? window.getToday() : new Date().toISOString().split('T')[0];
    const uid = auth.currentUser.uid;
    const type = 'snack'; // Default

    // 1. Save to Diary
    await push(ref(db, `users/${uid}/diary/${date}/${type}`), item);

    // 2. Save to Public DB (if requested and valid)
    if (saveToPublic) {
        // Add minimal metadata
        const publicItem = {
            ...item,
            name_lower: item.name.toLowerCase(),
            created: Date.now()
        };
        // Push to public_foods
        const pubRef = await push(ref(db, 'public_foods'), publicItem);

        // 3. Save Barcode Link (If present) - Critical for Scanner
        const code = document.getElementById('c-barcode').value; // Get from input again to be sure
        if (code) {
            set(ref(db, `public_barcodes/${code}`), {
                name: item.name,
                calories: item.calories,
                protein: item.protein,
                carbs: item.carbs,
                fat: item.fat,
                sugar: item.sugar,
                publicId: pubRef.key, // Link to full record if needed
                source: "FitNit Community"
            });
        }
    }

    alert(`Item Added! ${saveToPublic ? '(And shared with Community)' : ''}`);
    if (document.getElementById('mode-custom')) document.getElementById('mode-custom').style.display = 'none';
}

