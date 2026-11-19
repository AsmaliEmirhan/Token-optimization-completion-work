export function getSessionId(): string {
  const KEY = 'tokenai_session_id';
  try {
    let id = localStorage.getItem(KEY);
    if (!id || !/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
      id = 'usr_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch (e) {
    return 'default_session';
  }
}

export function getUserClassifierConsent(): boolean {
  const KEY = 'tokenai_classifier_consent';
  try {
    const val = localStorage.getItem(KEY);
    if (val === null) return true; // Default to true (with notice in UI / settings)
    return val === 'true';
  } catch (e) {
    return true;
  }
}

export function setUserClassifierConsent(consent: boolean): void {
  const KEY = 'tokenai_classifier_consent';
  try {
    localStorage.setItem(KEY, consent ? 'true' : 'false');
  } catch (e) {
    // ignore
  }
}
