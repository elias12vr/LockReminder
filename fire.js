const { initializeApp } = require("firebase/app");
const { getFirestore } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

module.exports = db;
