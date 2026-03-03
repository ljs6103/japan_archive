// ===========================
// Firebase Configuration (compat)
// ===========================
const firebaseConfig = {
    apiKey: "AIzaSyABY1KWFZyUr3ZNCOp6ed6iS1G2TfMsL9I",
    authDomain: "japan-archive.firebaseapp.com",
    projectId: "japan-archive",
    storageBucket: "japan-archive.firebasestorage.app",
    messagingSenderId: "760054582618",
    appId: "1:760054582618:web:45e84c349143992dd7f763",
    measurementId: "G-TNSY5CED0P"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Global references (Firestore only — images are on Cloudinary)
const db = firebase.firestore();
