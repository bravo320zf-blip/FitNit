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