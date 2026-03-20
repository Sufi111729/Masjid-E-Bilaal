import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const isFirebaseConfigured = !Object.values(firebaseConfig).some((value) =>
  String(value).includes("YOUR_")
);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const prayerTimingsRef = doc(db, "prayerTimings", "daily");
const announcementsRef = collection(db, "announcements");
const announcementsQuery = query(announcementsRef, orderBy("createdAt", "desc"));
const jobsRef = collection(db, "jobs");
const jobsQuery = query(jobsRef, orderBy("createdAt", "desc"));
const approvedJobsQuery = query(jobsRef, where("status", "==", "approved"), orderBy("createdAt", "desc"));

export {
  addDoc,
  approvedJobsQuery,
  announcementsQuery,
  announcementsRef,
  auth,
  deleteDoc,
  doc,
  getDoc,
  isFirebaseConfigured,
  jobsQuery,
  jobsRef,
  onSnapshot,
  prayerTimingsRef,
  serverTimestamp,
  setDoc,
  updateDoc
};
