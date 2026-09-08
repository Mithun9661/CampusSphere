import { createContext, useContext, useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  browserLocalPersistence,
  setPersistence,
  OAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { auth, db } from '../firebase/config';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); // 'student' | 'admin'
  const [loading, setLoading] = useState(true);
  const [studentData, setStudentData] = useState(null);

  const fetchUserProfile = async (uid, fbUser, requestedRole = null) => {
    try {
      const userRef = doc(db, 'users', uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        let userData = userDoc.data();
        
        // Self-correction: If requested role differs from DB role (e.g. fixed auto-provisioning error)
        if (requestedRole && requestedRole !== userData.role) {
          await updateDoc(userRef, { role: requestedRole });
          userData.role = requestedRole;
        }

        setUser({ uid, email: fbUser.email, ...userData });
        setRole(userData.role);
        
        if (userData.role === 'student') {
          const studentDoc = await getDoc(doc(db, 'students', uid));
          setStudentData(studentDoc.exists() ? studentDoc.data() : null);
        }
        return userData.role;
      } else {
        // Auto-provision basic profile if it doesn't exist in Firestore
        // Prioritize requestedRole from login page, fallback to email logic
        const finalRole = requestedRole || (fbUser.email?.includes('admin') ? 'admin' : 'student');
        const newUser = {
          email: fbUser.email,
          name: fbUser.displayName || fbUser.email?.split('@')[0],
          role: finalRole,
          createdAt: serverTimestamp()
        };
        await setDoc(doc(db, 'users', uid), newUser);
        setUser({ uid, ...newUser });
        setRole(finalRole);
        return finalRole;
      }
    } catch (error) {
      console.error("Error in fetchUserProfile:", error);
      return null;
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        await fetchUserProfile(fbUser.uid, fbUser);
      } else {
        setUser(null);
        setRole(null);
        setStudentData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithMicrosoft = async () => {
    setLoading(true);
    try {
      const provider = new OAuthProvider('microsoft.com');
      provider.setCustomParameters({ tenant: 'common' });
      
      const result = await signInWithPopup(auth, provider);
      const fbUser = result.user;
      
      const userRef = doc(db, 'users', fbUser.uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        const newUser = {
          email: fbUser.email,
          name: fbUser.displayName,
          role: 'student',
          createdAt: serverTimestamp()
        };
        await setDoc(userRef, newUser);
        setUser({ uid: fbUser.uid, ...newUser });
        setRole('student');
      } else {
        await fetchUserProfile(fbUser.uid, fbUser);
      }
      
      setLoading(false);
      return { success: true };
    } catch (error) {
      console.error("Microsoft Login failed:", error);
      setLoading(false);
      return { success: false, error: error.message };
    }
  };

  const login = async (email, password, selectedRole) => {
    setLoading(true);
    try {
      await setPersistence(auth, browserLocalPersistence);
      const result = await signInWithEmailAndPassword(auth, email, password);
      // Pass the selectedRole from UI to handle auto-provisioning correctly
      const roleSet = await fetchUserProfile(result.user.uid, result.user, selectedRole);
      
      setLoading(false);
      return { success: true, role: roleSet };
    } catch (error) {
      console.error("Login failed:", error);
      setLoading(false);
      let errorMessage = 'Invalid credentials or connection error.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMessage = 'Invalid email or password.';
      }
      return { success: false, error: errorMessage };
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setRole(null);
      setStudentData(null);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, studentData, login, loginWithMicrosoft, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
