import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, set, push, onValue, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyArqfZP8MyrSmIIgABmDGmusoPaAU0rBnE",
  authDomain: "fitnit-db781.firebaseapp.com",
  projectId: "fitnit-db781",
  storageBucket: "fitnit-db781.firebasestorage.app",
  messagingSenderId: "375638255257",
  appId: "1:375638255257:web:c2d92fd129e7e01dbd7a08",
  measurementId: "G-DF024HK2LG"
};

// Initialize
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// --- Core App Functionality ---

document.addEventListener('DOMContentLoaded', () => {

    // 1. View Switcher (Expose to window for HTML access)
    window.showView = (viewId) => {
        document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
        document.getElementById(viewId).style.display = 'block';
        
        // Update Title
        const titles = {
            'dashboard-screen': 'Dashboard',
            'scanner-screen': 'Food Scanner',
            'profile-screen': 'My Profile',
            'auth-screen': 'Welcome'
        };
        document.getElementById('view-title').innerText = titles[viewId] || 'FitNit';
    };

    // Nav Button Click Handlers
    document.getElementById('nav-dash').onclick = () => window.showView('dashboard-screen');
    document.getElementById('nav-prof').onclick = () => window.showView('profile-screen');
    
    // 2. Auth Logic
    document.getElementById('register-click').onclick = () => {
        const email = document.getElementById('email').value;
        const pass = document.getElementById('password').value;
        if(!email || !pass) return alert("Please fill in all fields.");
        
        createUserWithEmailAndPassword(auth, email, pass)
            .then(() => alert("Account created!"))
            .catch(err => alert("Register Error: " + err.message));
    };

    document.getElementById('login-click').onclick = () => {
        const email = document.getElementById('email').value;
        const pass = document.getElementById('password').value;
        signInWithEmailAndPassword(auth, email, pass)
            .catch(err => alert("Login Error: " + err.message));
    };

    document.getElementById('logout-btn').onclick = () => signOut(auth);

    onAuthStateChanged(auth, (user) => {
        if (user) {
            window.showView('dashboard-screen');
            document.getElementById('logout-btn').style.display = 'block';
            calculateDailyTotals(user.uid);
        } else {
            window.showView('auth-screen');
            document.getElementById('logout-btn').style.display = 'none';
        }
    });

    // 3. Barcode Scanner Logic
    let html5QrCode;
    document.getElementById('nav-scan').onclick = () => {
        window.showView('scanner-screen');
        if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");
        
        html5QrCode.start(
            { facingMode: "environment" }, 
            { fps: 10, qrbox: 250 },
            onScanSuccess
        ).catch(err => alert("Camera Error: " + err));
    };

    function onScanSuccess(decodedText) {
        html5QrCode.stop().then(() => {
            fetch(`https://world.openfoodfacts.org/api/v0/product/${decodedText}.json`)
                .then(res => res.json())
                .then(data => {
                    if(data.status === 1) {
                        document.getElementById('scanned-result').style.display = 'block';
                        document.getElementById('food-name').innerText = data.product.product_name || "Unknown";
                        const cals = data.product.nutriments['energy-kcal_100g'] || 0;
                        document.getElementById('food-cals').innerText = cals + " kcal per 100g";
                        document.getElementById('food-img').src = data.product.image_front_small_url || "";
                    } else {
                        alert("Product not found");
                    }
                });
        });
    }

    // 4. Diary & Weight Logic
    document.getElementById('add-food-btn').onclick = () => {
        const user = auth.currentUser;
        const today = new Date().toISOString().split('T')[0];
        const mealType = document.getElementById('meal-type').value;
        const foodName = document.getElementById('food-name').innerText;
        const cals = parseInt(document.getElementById('food-cals').innerText) || 0;

        push(ref(db, `users/${user.uid}/diary/${today}/${mealType}`), {
            name: foodName,
            calories: cals,
            time: Date.now()
        }).then(() => {
            alert("Added!");
            window.showView('dashboard-screen');
        });
    };

    function calculateDailyTotals(uid) {
        const today = new Date().toISOString().split('T')[0];
        onValue(ref(db, `users/${uid}/diary/${today}`), (snapshot) => {
            let total = 0;
            const data = snapshot.val();
            if (data) {
                Object.values(data).forEach(mealGroup => {
                    Object.values(mealGroup).forEach(item => total += item.calories);
                });
            }
            document.getElementById('daily-cal-total').innerText = `${total} / 2000 kcal`;
        });
    }

    document.getElementById('save-weight-btn').onclick = () => {
        const weight = document.getElementById('weight-input').value;
        const today = new Date().toISOString().split('T')[0];
        if(weight) {
            set(ref(db, `users/${auth.currentUser.uid}/weight_logs/${today}`), weight)
                .then(() => alert("Weight logged!"));
        }
    };

    // 5. PDF Export
    document.getElementById('export-pdf-btn').onclick = () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        onValue(ref(db, `users/${auth.currentUser.uid}/weight_logs`), (snapshot) => {
            const data = snapshot.val();
            doc.text("FitNit Progress Report", 20, 20);
            let y = 40;
            for (let date in data) {
                doc.text(`${date}: ${data[date]} lbs`, 20, y);
                y += 10;
            }
            doc.save("HealthReport.pdf");
        }, { onlyOnce: true });
    };

    // 6. Profile Logic
    document.getElementById('save-profile').onclick = () => {
        const privacy = document.getElementById('privacy-status').value;
        update(ref(db, `users/${auth.currentUser.uid}`), {
            privacy: privacy,
            updated: Date.now()
        }).then(() => alert("Profile Updated"));
    };
});
