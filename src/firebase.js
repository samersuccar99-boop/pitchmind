import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD3rZ3N9AODuciVEy3_-2eyRGNdFEZJxxA",
  authDomain: "pitchmind-b4127.firebaseapp.com",
  projectId: "pitchmind-b4127",
  storageBucket: "pitchmind-b4127.firebasestorage.app",
  messagingSenderId: "172470128101",
  appId: "1:172470128101:web:0efc560335c3f64d4ef30c",
  measurementId: "G-Y31XLM8TT2"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
