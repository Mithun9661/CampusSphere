import { createContext, useContext, useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  browserLocalPersistence,
  setPersistence,
  OAuthProvider,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { auth, db } from '../firebase/config';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';

const AuthContext = createContext(null);

const normalizeRollNo = (value = '') => value.trim().toUpperCase();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [studentData, setStudentData] = useState(null);

  const loadStudentProfile = async (uid, userData) => {
    const rollNo = normalizeRollNo(userData?.roll_no);
    const candidateIds = rollNo ? [rollNo, uid] : [uid];

    for (const studentId of candidateIds) {
      try {
        const studentSnap = await getDoc(doc(db, 'students', studentId));
        if (studentSnap.exists()) {
          const data = studentSnap.data();
          setStudentData(data);
          return data;
        }
      } catch (error) {
        console.warn(`Unable to read student profile ${studentId}:`, error.code || error.message);
      }
    }

    const fallback = {
      uid,
      roll_no: rollNo || userData?.email?.split('@')[0]?.toUpperCase() || '',
      first_name: userData?.name || userData?.email?.split('@')[0] || 'Student',
      email: userData?.email || '',
      branch: userData?.branch || ['Engineering'],
      passout_year: userData?.passout_year || '',
    };
    setStudentData(fallback);
    return fallback;
  };

  const fetchUserProfile = async (uid, fbUser) => {
    try {
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const userData = userSnap.data();
        setUser({ uid, email: fbUser.email, ...userData });
        setRole(userData.role || 'student');

        if ((userData.role || 'student') === 'student') {
          await loadStudentProfile(uid, userData);
        } else {
          setStudentData(null);
        }
        return userData.role || 'student';
      }

      // Legacy Firebase Auth users are auto-provisioned as students only.
      const fallbackRollNo = fbUser.email?.split('@')[0]?.toUpperCase() || uid;
      const newUser = {
        email: fbUser.email,
        name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Student',
        role: 'student',
        roll_no: fallbackRollNo,
        branch: ['Engineering'],
        passout_year: '',
        createdAt: serverTimestamp(),
      };

      await setDoc(userRef, newUser);
      setUser({ uid, ...newUser });
      setRole('student');
      await loadStudentProfile(uid, newUser);
      return 'student';
    } catch (error) {
      console.error('Error in fetchUserProfile:', error);
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

  const registerStudent = async ({ name, email, password, rollNo, branch, passoutYear }) => {
    setLoading(true);
    let createdAuthUser = null;

    try {
      await setPersistence(auth, browserLocalPersistence);
      const credential = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      createdAuthUser = credential.user;
      await updateProfile(createdAuthUser, { displayName: name.trim() });

      const normalizedRollNo = normalizeRollNo(rollNo);
      const normalizedBranch = branch.trim();
      const yearNumber = Number(passoutYear) || passoutYear;

      const userProfile = {
        uid: createdAuthUser.uid,
        email: email.trim().toLowerCase(),
        name: name.trim(),
        role: 'student',
        roll_no: normalizedRollNo,
        branch: [normalizedBranch],
        passout_year: yearNumber,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const studentProfile = {
        uid: createdAuthUser.uid,
        email: email.trim().toLowerCase(),
        first_name: name.trim(),
        name: name.trim(),
        roll_no: normalizedRollNo,
        branch: [normalizedBranch],
        passout_year: yearNumber,
        current_courses: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const batch = writeBatch(db);
      batch.set(doc(db, 'users', createdAuthUser.uid), userProfile);
      batch.set(doc(db, 'students', normalizedRollNo), studentProfile);
      await batch.commit();

      setUser({ uid: createdAuthUser.uid, ...userProfile });
      setRole('student');
      setStudentData(studentProfile);
      setLoading(false);
      return { success: true, role: 'student' };
    } catch (error) {
      console.error('Student registration failed:', error);

      if (createdAuthUser) {
        try {
          await deleteUser(createdAuthUser);
        } catch (rollbackError) {
          console.warn('Could not roll back Auth user:', rollbackError);
        }
      }

      setLoading(false);
      let errorMessage = 'Unable to create student account.';
      if (error.code === 'auth/email-already-in-use') errorMessage = 'This email is already registered. Please login.';
      if (error.code === 'auth/invalid-email') errorMessage = 'Please enter a valid email address.';
      if (error.code === 'auth/weak-password') errorMessage = 'Password must be at least 6 characters.';
      if (error.code === 'permission-denied') errorMessage = 'Registration data could not be saved. Check Firestore rules or use a different roll number.';
      return { success: false, error: errorMessage };
    }
  };

  const loginWithMicrosoft = async () => {
    setLoading(true);
    try {
      const provider = new OAuthProvider('microsoft.com');
      provider.setCustomParameters({ tenant: 'common' });
      const result = await signInWithPopup(auth, provider);
      const roleSet = await fetchUserProfile(result.user.uid, result.user);
      setLoading(false);
      return { success: true, role: roleSet || 'student' };
    } catch (error) {
      console.error('Microsoft Login failed:', error);
      setLoading(false);
      return { success: false, error: error.message };
    }
  };

  const login = async (email, password, selectedRole = 'student') => {
    setLoading(true);
    try {
      await setPersistence(auth, browserLocalPersistence);
      const result = await signInWithEmailAndPassword(auth, email.trim(), password);
      const actualRole = await fetchUserProfile(result.user.uid, result.user);

      if (!actualRole) {
        await signOut(auth);
        setLoading(false);
        return { success: false, error: 'Unable to load account profile.' };
      }

      // Selecting a login tab never changes the stored role.
      if (selectedRole && actualRole !== selectedRole) {
        await signOut(auth);
        setUser(null);
        setRole(null);
        setStudentData(null);
        setLoading(false);
        return {
          success: false,
          error: selectedRole === 'admin'
            ? 'This account is not authorized as an admin.'
            : 'Please use the Admin login tab for this account.',
        };
      }

      setLoading(false);
      return { success: true, role: actualRole };
    } catch (error) {
      console.error('Login failed:', error);
      setLoading(false);
      let errorMessage = 'Invalid credentials or connection error.';
      if (['auth/user-not-found', 'auth/wrong-password', 'auth/invalid-credential'].includes(error.code)) {
        errorMessage = 'Invalid email or password.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Please enter a valid email address.';
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
      console.error('Logout failed:', error);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      role,
      loading,
      studentData,
      login,
      registerStudent,
      loginWithMicrosoft,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
