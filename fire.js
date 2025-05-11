const { initializeApp } = require("firebase/app");
const { getFirestore } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyCGBtsXfAmLwsNmhsLLTGMm_YYDGb3TSg4",
  authDomain: "lockreminder-19626.firebaseapp.com",
  databaseURL: "https://lockreminder-19626-default-rtdb.firebaseio.com",
  projectId: "lockreminder-19626",
  storageBucket: "lockreminder-19626.appspot.com",
  messagingSenderId: "1077855779450",
  appId: "1:1077855779450:web:d7a89e1dd33113a69259c3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

module.exports = db;
