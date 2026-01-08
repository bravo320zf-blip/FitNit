import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, set, push, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyArqfZP8MyrSmIIgABmDGmusoPaAU0rBnE",
  authDomain: "fitnit-db781.firebaseapp.com",
  projectId: "fitnit-db781",
  storageBucket: "fitnit-db781.firebasestorage.app",
  messagingSenderId: "375638255257",
  appId: "1:375638255257:web:c2d92fd129e7e01dbd7a08",
  measurementId: "G-DF024HK2LG"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// --- View Switching Logic ---
window.showView = (viewId) => {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    document.getElementById(viewId).style.display = 'block';
};

// --- Barcode Scanning Logic ---
const html5QrCode = new Html5Qrcode("reader");

function onScanSuccess(decodedText, decodedResult) {
    // Stop scanning after success
    html5QrCode.stop();
    
    // Call Open Food Facts API
    fetch(`https://world.openfoodfacts.org/api/v0/product/${decodedText}.json`)
        .then(res => res.json())
        .then(data => {
            if(data.status === 1) {
                document.getElementById('scanned-result').style.display = 'block';
                document.getElementById('food-name').innerText = data.product.product_name;
                document.getElementById('food-cals').innerText = data.product.nutriments['energy-kcal_100g'] + " kcal per 100g";
                document.getElementById('food-img').src = data.product.image_front_small_url;
            } else {
                alert("Product not found");
            }
        });
}

// Start Scanner (Call this when entering scanner view)
document.querySelector('[onclick="showView(\'scanner-screen\')"]').addEventListener('click', () => {
    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, onScanSuccess);
});

// --- Weight Tracker Chart ---
const ctx = document.getElementById('weightChart').getContext('2d');
let weightChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        datasets: [{
            label: 'Weight (lbs)',
            data: [185, 184, 184.5, 183, 182],
            borderColor: '#3498db'
        }]
    }
});

// --- Auth Handling ---
document.getElementById('login-click').onclick = () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    signInWithEmailAndPassword(auth, email, pass).then(() => showView('dashboard-screen'));
};

onAuthStateChanged(auth, (user) => {
    if (user) {
        showView('dashboard-screen');
        document.getElementById('logout-btn').style.display = 'block';
    } else {
        showView('auth-screen');
        document.getElementById('logout-btn').style.display = 'none';
    }
});

import { getDatabase, ref, set, update, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const db = getDatabase();

// --- Function to Save Profile Settings ---
async function saveProfileSettings(uid, displayName, privacyLevel) {
    const userRef = ref(db, 'users/' + uid);
    await update(userRef, {
        displayName: displayName,
        privacy: privacyLevel, // 'public', 'private', or 'friends'
        lastActive: Date.now()
    });
    alert("Profile Updated!");
}

// --- Function to View a Profile (Checking Privacy) ---
function loadProfile(targetUid, viewerUid) {
    const targetRef = ref(db, 'users/' + targetUid);
    onValue(targetRef, (snapshot) => {
        const data = snapshot.val();
        
        if (data.privacy === 'public') {
            displayProfile(data);
        } else if (data.privacy === 'friends') {
            checkIfFriends(viewerUid, targetUid).then(isFriend => {
                if (isFriend) displayProfile(data);
                else alert("This profile is for friends only.");
            });
        } else {
            alert("This profile is private.");
        }
    });
}

// Logic for the Profile Save button
document.getElementById('save-profile').onclick = () => {
    const user = auth.currentUser;
    const privacy = document.getElementById('privacy-status').value;
    const name = user.email.split('@')[0]; // Simple display name for now
    if (user) {
        saveProfileSettings(user.uid, name, privacy);
    }
};

import { getDatabase, ref, push, onValue, set } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const db = getDatabase();

// --- SAVE MEAL TO DATABASE ---
function saveMealToDiary(foodData) {
    const user = auth.currentUser;
    if (!user) return alert("Please login first!");

    const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
    const mealType = document.getElementById('meal-type').value;

    const diaryRef = ref(db, `users/${user.uid}/diary/${today}/${mealType}`);
    
    push(diaryRef, {
        name: foodData.name,
        calories: foodData.calories,
        protein: foodData.protein || 0,
        carbs: foodData.carbs || 0,
        fat: foodData.fat || 0,
        timestamp: Date.now()
    }).then(() => {
        alert("Meal added to " + mealType);
        showView('dashboard-screen');
        calculateDailyTotals(); // Refresh the dashboard
    });
}

// Logic for the "Add to Diary" button
document.getElementById('add-food-btn').onclick = () => {
    const foodData = {
        name: document.getElementById('food-name').innerText,
        // Extracting numbers from the text string
        calories: parseInt(document.getElementById('food-cals').innerText) || 0 
    };
    saveMealToDiary(foodData);
};

function calculateDailyTotals() {
    const user = auth.currentUser;
    const today = new Date().toISOString().split('T')[0];
    const summaryRef = ref(db, `users/${user.uid}/diary/${today}`);

    onValue(summaryRef, (snapshot) => {
        let totalCals = 0;
        const data = snapshot.val();
        
        if (data) {
            // Loop through Breakfast, Lunch, Dinner, etc.
            Object.values(data).forEach(mealGroup => {
                Object.values(mealGroup).forEach(item => {
                    totalCals += item.calories;
                });
            });
        }
        document.getElementById('daily-cal-total').innerText = `${totalCals} / 2000 kcal`;
    });
}

// --- WEIGHT LOGGING ---
document.getElementById('save-weight-btn').onclick = () => {
    const weight = document.getElementById('weight-input').value;
    const user = auth.currentUser;
    const today = new Date().toISOString().split('T')[0];

    if(weight && user) {
        set(ref(db, `users/${user.uid}/weight_logs/${today}`), weight);
        alert("Weight saved!");
    }
};

// --- PDF EXPORT ---
document.getElementById('export-pdf-btn').onclick = () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const user = auth.currentUser;

    const weightRef = ref(db, `users/${user.uid}/weight_logs`);
    onValue(weightRef, (snapshot) => {
        const data = snapshot.val();
        doc.text("Fitness Progress Report", 20, 20);
        doc.text(`User ID: ${user.uid}`, 20, 30);
        
        let y = 40;
        for (let date in data) {
            doc.text(`${date}: ${data[date]} lbs`, 20, y);
            y += 10;
        }
        doc.save("WeightReport.pdf");
    }, { onlyOnce: true });
};


