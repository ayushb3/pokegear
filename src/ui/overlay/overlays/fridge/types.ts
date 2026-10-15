export type FridgeSection = 'cooking' | 'hallOfFame' | 'wantToTry';

export interface FridgeEntry {
  date: string | null;   // YYYY-MM-DD, or null when unknown (listed last under UNDATED)
  section: FridgeSection;
  title: string;
  note?: string;         // optional; a short line about the dish or the place's food
  /** true while `note` is an AI-generated placeholder; Ayush rewrites the note and deletes the flag (never shown on the site) */
  noteDraft?: boolean;
  place?: string;        // restaurant / occasion / city
  photo?: string;        // asset slot key, e.g. "fridge.photo.1"
  /** true on placeholder entries only; their title/note/place must start with "Sample:" */
  sample?: boolean;
}

export interface FridgeData {
  entries: FridgeEntry[];
}
