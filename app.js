import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, set, push, onValue, update, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
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

        window.toggleFav = (name) => {
            const sanitizedName = name.replace(/[.#$[\]]/g, "");
            const isFav = window._lastUserData?.favorites?.[sanitizedName];
            if (isFav) {
                set(ref(db, `users/${auth.currentUser.uid}/favorites/${sanitizedName}`), null);
            } else {
                set(ref(db, `users/${auth.currentUser.uid}/favorites/${sanitizedName}`), { name: name, added: Date.now() });
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
            updateWeightFilter(currentRange);
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

        // USE IMAGE
        item.innerHTML = `${pinIcon}<img src="${a.image}" style="width:40px; height:40px;"><br><small>${a.name}</small>`;

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

// Helper to filter and update graph
function updateWeightFilter(days) {
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

    updateWeightGraph(filtered);
}

// Add Filter Listener
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.onclick = (e) => {
        const range = Number(e.target.dataset.range);
        updateWeightFilter(range);
    }
});

function updateWeightGraph(history) {
    const ctx = document.getElementById('weightHistoryChart').getContext('2d');
    const sorted = Object.keys(history).sort();

    if (weightChart) weightChart.destroy();

    // Only show if we have data, else empty
    if (sorted.length === 0 && weightChart) { weightChart.destroy(); return; }

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
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: false } // Better visual for weight fluctuations
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
        fetch(`https://world.openfoodfacts.org/api/v0/product/${text}.json`)
            .then(r => r.json()).then(d => {
                if (d.status === 1) {
                    const n = d.product.nutriments;

                    currentScannedItem = {
                        name: d.product.product_name,
                        calories: Math.round(n['energy-kcal_100g'] || 0),
                        protein: Math.round(n.proteins_100g || 0),
                        carbs: Math.round(n.carbohydrates_100g || 0),
                        fat: Math.round(n.fat_100g || 0),
                        // Extended Nutrients
                        sugar: Math.round(n.sugars_100g || 0),
                        satFat: Math.round(n['saturated-fat_100g'] || 0),
                        fiber: Math.round(n.fiber_100g || 0),
                        sodium: Math.round(n.sodium_100g || 0), // Note: OFF often returns sodium in g or mg, nutriments has sodium_100g in grams usually
                        cholesterol: Math.round((n.cholesterol_100g || 0) * 1000), // usually in grams, convert to mg? Let's assume standard mg
                        potassium: Math.round((n.potassium_100g || 0) * 1000),
                        vitA: Math.round((n['vitamin-a_100g'] || 0) * 1000000), // in mcg?
                        vitC: Math.round((n['vitamin-c_100g'] || 0) * 1000), // mg
                        calcium: Math.round((n.calcium_100g || 0) * 1000), // mg
                        iron: Math.round((n.iron_100g || 0) * 1000), // mg
                        image: d.product.image_url || ""
                    };
                    // Basic sanity checks / unit conversions might be needed depending on strict API return, but this is a Start.
                    // For sodium/salt, OFF returns sodium_100g in Unit.

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

window.promptDeleteFoodItem = (date, type, key, name) => {
    window.pendingDelete = { date, type, key };
    document.getElementById('delete-confirm-msg').innerText = `Remove ${name}?`;
    document.getElementById('delete-confirm-modal').style.display = 'flex';
}

window.confirmDelete = () => {
    if (window.pendingDelete) {
        const { date, type, key } = window.pendingDelete;
        set(ref(db, `users/${auth.currentUser.uid}/diary/${date}/${type}/${key}`), null);
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

