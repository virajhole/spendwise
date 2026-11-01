import { useSyncExternalStore } from "react";
import { useDataStore } from "../store/data";
import { contactKey } from "../utils/contacts";

const changed = "spendwise-contact-number";
function subscribe(refresh: () => void) {
  window.addEventListener(changed, refresh);
  window.addEventListener("storage", refresh);
  return () => {
    window.removeEventListener(changed, refresh);
    window.removeEventListener("storage", refresh);
  };
}

export function useContactNumber(name: string) {
  const userId = useDataStore(s => s.userId);
  const key = JSON.stringify(["spendwise.contact-number", userId, contactKey(name)]);
  const number = useSyncExternalStore(subscribe, () => {
    try { return userId ? localStorage.getItem(key) ?? "" : ""; }
    catch { return ""; }
  });
  function save(value: string) {
    if (!userId) throw new Error("Please wait for contacts to load.");
    const digits = value.trim().replace(/^\+/, "").replace(/[\s()-]/g, "");
    if (value.trim() && !/^[1-9]\d{6,14}$/.test(digits)) throw new Error("Enter a phone number with its country code, such as +91 98765 43210.");
    if (digits) localStorage.setItem(key, digits);
    else localStorage.removeItem(key);
    window.dispatchEvent(new Event(changed));
  }
  return { number, save };
}
