import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where,
  deleteDoc,
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDxzG5FqLqjHvE5q_qR8n0p2s3t4u5v6w7x",
  authDomain: "wurinuri-wiki.firebaseapp.com",
  projectId: "wurinuri-wiki",
  storageBucket: "wurinuri-wiki.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};

let app, auth, db;

export function initializeFirebase() {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    console.log('Firebase initialized');
  } catch (error) {
    console.error('Firebase initialization error:', error);
    // If real Firebase fails, use local storage fallback
    setupLocalAuth();
  }
}

export async function signup(email, password) {
  try {
    if (!auth) setupLocalAuth();
    if (auth.currentUser) {
      throw new Error('Already logged in');
    }
    const result = await createUserWithEmailAndPassword(auth, email, password);
    return { success: true, user: result.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function login(email, password) {
  try {
    if (!auth) setupLocalAuth();
    const result = await signInWithEmailAndPassword(auth, email, password);
    return { success: true, user: result.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function logout() {
  try {
    if (!auth) setupLocalAuth();
    await signOut(auth);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function savePage(title, content) {
  try {
    if (!auth || !auth.currentUser) {
      throw new Error('Not authenticated');
    }
    if (!db) {
      throw new Error('Firestore not initialized');
    }
    
    const docRef = await addDoc(collection(db, "pages"), {
      title: title,
      content: content,
      uid: auth.currentUser.uid,
      email: auth.currentUser.email,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    return { success: true, docId: docRef.id };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getUserPages() {
  try {
    if (!auth || !auth.currentUser) {
      throw new Error('Not authenticated');
    }
    if (!db) {
      throw new Error('Firestore not initialized');
    }

    const q = query(collection(db, "pages"), where("uid", "==", auth.currentUser.uid));
    const querySnapshot = await getDocs(q);
    
    const pages = [];
    querySnapshot.forEach((doc) => {
      pages.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return { success: true, pages };
  } catch (error) {
    return { success: false, error: error.message, pages: [] };
  }
}

export async function deletePage(docId) {
  try {
    if (!auth || !auth.currentUser) {
      throw new Error('Not authenticated');
    }
    if (!db) {
      throw new Error('Firestore not initialized');
    }

    await deleteDoc(doc(db, "pages", docId));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export function onAuthChange(callback) {
  if (!auth) {
    setupLocalAuth();
    const stored = localStorage.getItem('currentUser');
    callback(stored ? JSON.parse(stored) : null);
  } else {
    onAuthStateChanged(auth, callback);
  }
}

export function getCurrentUser() {
  if (!auth) return null;
  return auth.currentUser;
}

// Local auth fallback for testing without real Firebase
function setupLocalAuth() {
  auth = {
    currentUser: null,
    users: JSON.parse(localStorage.getItem('firebaseUsers') || '{}')
  };
  
  createUserWithEmailAndPassword = async (auth, email, password) => {
    if (auth.users[email]) {
      throw new Error('User already exists');
    }
    auth.users[email] = { email, password };
    localStorage.setItem('firebaseUsers', JSON.stringify(auth.users));
    auth.currentUser = { uid: email, email };
    localStorage.setItem('currentUser', JSON.stringify(auth.currentUser));
    return { user: auth.currentUser };
  };
  
  signInWithEmailAndPassword = async (auth, email, password) => {
    if (!auth.users[email] || auth.users[email].password !== password) {
      throw new Error('Invalid email or password');
    }
    auth.currentUser = { uid: email, email };
    localStorage.setItem('currentUser', JSON.stringify(auth.currentUser));
    return { user: auth.currentUser };
  };
  
  signOut = async (auth) => {
    auth.currentUser = null;
    localStorage.removeItem('currentUser');
  };
}
