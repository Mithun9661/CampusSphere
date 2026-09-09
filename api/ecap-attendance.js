import attendanceHandler from '../lib/ecapAttendanceV8.js';

const STUDENT_MASTER_URL = 'https://info.aec.edu.in/acet/StudentMaster.aspx';
const STUDENT_MASTER_LOGIN_URL = 'https://info.aec.edu.in/acet/Default.aspx?ReturnUrl=%2fACET%2fStudentMaster.aspx';

// The v8 resolver previously entered E-CAP through /hamlog. Route only that
// legacy login entry through the actual StudentMaster page supplied by ACET.
// All other E-CAP requests are left untouched.
if (!globalThis.__student360StudentMasterEntryPatched) {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init = {}) => {
    let url;
    try {
      url = new URL(input instanceof URL ? input.toString() : (typeof input === 'string' ? input : input?.url));
    } catch {
      return nativeFetch(input, init);
    }

    const returnUrl = url.searchParams.get('ReturnUrl') || '';
    const isOldHamlogEntry = /\/acet\/default\.aspx$/i.test(url.pathname)
      && /\/acet\/hamlog$/i.test(returnUrl);

    if (!isOldHamlogEntry) return nativeFetch(input, init);

    const method = String(init?.method || input?.method || 'GET').toUpperCase();
    const target = method === 'POST' ? STUDENT_MASTER_LOGIN_URL : STUDENT_MASTER_URL;
    return nativeFetch(target, init);
  };
  globalThis.__student360StudentMasterEntryPatched = true;
}

export default attendanceHandler;
