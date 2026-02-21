const firebaseConfig = {
  apiKey: "AIzaSyCn3zA6AuF4K25gAPPopl1rN3zglw6V9mQ",
  authDomain: "mart-b581e.firebaseapp.com",
  projectId: "mart-b581e",
  storageBucket: "mart-b581e.firebasestorage.app",
  messagingSenderId: "227151575294",
  appId: "1:227151575294:web:c4162c3d05dbac5a264daf"
};

// Guard against double-initialization
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Use var so re-declaration never crashes if script somehow runs twice
var db   = firebase.firestore();
var auth = firebase.auth();
