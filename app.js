<script type="module">
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } 
from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "APIKEY",
  authDomain: "PROJECT.firebaseapp.com",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

function signup(email,password){
 createUserWithEmailAndPassword(auth,email,password)
}

function login(email,password){
 signInWithEmailAndPassword(auth,email,password)
}
</script>

import { getFirestore, collection, addDoc } 
from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const db = getFirestore(app);

async function createPage(title,content){
 await addDoc(collection(db,"pages"),{
   title:title,
   content:content
 });
}
