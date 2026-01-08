// 1. ALL IMPORTS AT THE TOP
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getDatabase, 
    ref, 
    set, 
    push, 
    onValue, 
    update 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// 2. FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyArqfZP8MyrSmIIgABmDGmusoPaAU0rBnE",
  authDomain: "fitnit-db781.firebaseapp.com",
  projectId: "fitnit-db781",
  storageBucket: "fitnit-db781.firebasestorage.app",
  messagingSenderId: "375638255257",
  appId: "1:375638255257:web:c2d92fd129e7e01dbd7a08",
  measurementId: "G-DF024HK2LG"
};

// 3. INITIALIZE ONCE
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// --- View Switching Logic ---
window.showView = (viewId) => {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    const target = document.getElementById(viewId);
    if (target) target.style.display = 'block';
};

// --- Authentication Logic ---

// REGISTER
const registerBtn = document.getElementById('register-click');
if (registerBtn) {
    registerBtn.onclick = () => {
        const email = document.getElementById('email').value;
        const pass = document.getElementById('password').value;
        createUserWithEmailAndPassword(auth, email, pass)
            .then(() => alert("Account Created!"))
            .catch((error) => alert("Registration Error: " + error.message));
    };
}

// LOGIN
const loginBtn = document.getElementById('login-click');
if (loginBtn) {
    loginBtn.onclick = () => {
        const email = document.getElementById('email').value;
        const pass = document.getElementById('password').value;
        signInWithEmailAndPassword(auth, email, pass)
            .catch((error) => alert("Login Error: " + error.message));
    };
}

// LOGOUT
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.onclick = () => {
        signOut(auth).then(() => {
            window.location.reload(); // Refresh to clear data
        });
    };
}

// AUTH STATE OBSERVER
onAuthStateChanged(auth, (user) => {
    if (user) {
        window.showView('dashboard-screen');
        document.getElementById('logout-btn').style.display = 'block';
        calculateDailyTotals(); // Load data for the logged in user
    } else {
        window.showView('auth-screen');
        document.getElementById('logout-btn').style.display = 'none';
    }
});

// --- Barcode Scanning Logic ---
const html5QrCode = new Html5Qrcode("reader");

function onScanSuccess(decodedText, decodedResult) {
    html5QrCode.stop();
    fetch(`https://world.openfoodfacts.org/api/v0/product/${decodedText}.json`)
        .then(res => res.json())
        .then(data => {
            if(data.status === 1) {
                document.getElementById('scanned-result').style.display = 'block';
                document.getElementById('food-name').innerText = data.product.product_name || "Unknown Product";
                const cals = data.product.nutriments['energy-kcal_100g'] || 0;
                document.getElementById('food-cals').innerText = cals + " kcal per 100g";
                document.getElementById('food-img').src = data.product.image_front_small_url || "";
            } else {
                alert("Product not found");
            }
        });
}

// Start Scanner
const scanTrigger = document.querySelector('[onclick="showView(\'scanner-screen\')"]');
if (scanTrigger) {
    scanTrigger.addEventListener('click', () => {
        html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, onScanSuccess)
        .catch(err => console.error("Camera start error:", err));
    });
}

// --- Weight Tracker Chart ---
const weightCtx = document.getElementById('weightChart');
if (weightCtx) {
    let weightChart = new Chart(weightCtx.getContext('2d'), {
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
}

// --- Diary Logic ---
function saveMealToDiary(foodData) {
    const user = auth.currentUser;
    if (!user) return;

    const today = new Date().toISOString().split('T')[0];
    const mealType = document.getElementById('meal-type').value;
    const diaryRef = ref(db, `users/${user.uid}/diary/${today}/${mealType}`);
    
    push(diaryRef, {
        name: foodData.name,
        calories: foodData.calories,
        timestamp: Date.now()
    }).then(() => {
        alert("Added!");
        window.showView('dashboard-screen');
    });
}

document.getElementById('add-food-btn').onclick = () => {
    const foodData = {
        name: document.getElementById('food-name').innerText,
        calories: parseInt(document.getElementById('food-cals').innerText) || 0 
    };
    saveMealToDiary(foodData);
};

function calculateDailyTotals() {
    const user = auth.currentUser;
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];
    const summaryRef = ref(db, `users/${user.uid}/diary/${today}`);

    onValue(summaryRef, (snapshot) => {
        let totalCals = 0;
        const data = snapshot.val();
        if (data) {
            Object.values(data).forEach(mealGroup => {
                Object.values(mealGroup).forEach(item => {
                    totalCals += (item.calories || 0);
                });
            });
        }
        const display = document.getElementById('daily-cal-total');
        if (display) display.innerText = `${totalCals} / 2000 kcal`;
    });
}

// --- Weight & Profile Logging ---
document.getElementById('save-weight-btn').onclick = () => {
    const weight = document.getElementById('weight-input').value;
    const user = auth.currentUser;
    const today = new Date().toISOString().split('T')[0];
    if(weight && user) {
        set(ref(db, `users/${user.uid}/weight_logs/${today}`), weight);
        alert("Weight saved!");
    }
};

document.getElementById('save-profile').onclick = () => {
    const user = auth.currentUser;
    const privacy = document.getElementById('privacy-status').value;
    if (user) {
        const userRef = ref(db, 'users/' + user.uid);
        update(userRef, {
            displayName: user.email.split('@')[0],
            privacy: privacy,
            lastActive: Date.now()
        }).then(() => alert("Profile Updated!"));
    }
};

// PDF EXPORT
document.getElementById('export-pdf-btn').onclick = () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const user = auth.currentUser;
    if(!user) return;

    onValue(ref(db, `users/${user.uid}/weight_logs`), (snapshot) => {
        const data = snapshot.val();
        doc.text("Fitness Progress Report", 20, 20);
        let y = 40;
        for (let date in data) {
            doc.text(`${date}: ${data[date]} lbs`, 20, y);
            y += 10;
        }
        doc.save("WeightReport.pdf");
    }, { onlyOnce: true });
};

