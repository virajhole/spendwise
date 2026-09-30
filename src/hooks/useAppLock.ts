const KEY = "spendwise.pin";

export function getStoredPin(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setStoredPin(pin: string | null) {
  try {
    if (pin) localStorage.setItem(KEY, pin);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function useAppLock() {
  const pin = getStoredPin();
  return { locked: Boolean(pin), pin };
}
