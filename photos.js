/* Storage-backed photo API (ES module). Created via makePhotoApi(storage) in
   cloud.js, which owns the single Firebase app. Path strings come from
   photo-paths.js (window.ftPhotoPaths). */
import { ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";
const _urlCache = {};
export function makePhotoApi(storage){
  return {
    async uploadPhoto(path, blob){
      await uploadBytes(ref(storage, path), blob, { contentType: 'image/jpeg' });
      return path;
    },
    async resolveURL(path){
      if(_urlCache[path]) return _urlCache[path];
      const u = await getDownloadURL(ref(storage, path));
      _urlCache[path] = u;
      return u;
    },
    async deletePhoto(path){
      try{ await deleteObject(ref(storage, path)); }
      catch(e){ if(!(e && e.code === 'storage/object-not-found')) throw e; }
    }
  };
}
