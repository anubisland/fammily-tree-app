/* Photo store (ES module) — backed by a Firestore subcollection, NOT Cloud
   Storage (which needs the paid Blaze plan). Each photo is its own document at
   trees/{treeId}/photos/{key} holding a base64 data URL, so photos no longer
   bloat the single tree document. Created via makePhotoApi(db) in cloud.js.
   Path strings come from photo-paths.js (window.ftPhotoPaths). */
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
const _cache = {};   // pathKey -> base64 data URL (in-memory, per session)
export function makePhotoApi(db){
  return {
    // Store the base64 data URL as its own doc; overwriting replaces cleanly.
    async uploadPhoto(pathKey, dataUrl){
      await setDoc(doc(db, pathKey), { data: dataUrl, at: serverTimestamp() });
      _cache[pathKey] = dataUrl;
      return pathKey;
    },
    // Returns the stored base64 data URL. Firestore offline persistence serves it
    // from cache when offline; the in-memory cache avoids repeat reads in-session.
    async resolveURL(pathKey){
      if(_cache[pathKey]) return _cache[pathKey];
      const snap = await getDoc(doc(db, pathKey));
      if(!snap.exists() || !snap.data() || !snap.data().data){ throw { code: 'not-found' }; }
      _cache[pathKey] = snap.data().data;
      return _cache[pathKey];
    },
    async deletePhoto(pathKey){
      try{ await deleteDoc(doc(db, pathKey)); }
      finally{ delete _cache[pathKey]; }
    }
  };
}
