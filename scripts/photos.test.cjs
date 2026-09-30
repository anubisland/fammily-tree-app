require('../photo-paths.js');       // exposes ftPhotoPaths on the global
const P = global.ftPhotoPaths;
let pass=0, fail=0; function ok(c,l){ if(c) pass++; else { fail++; console.error('✗', l); } }

ok(!!P, 'ftPhotoPaths exposed');
ok(P.person('t1','p1') === 'trees/t1/photos/p_p1', 'person photo doc path');
ok(P.moment('t1','m1') === 'trees/t1/photos/m_m1', 'moment photo doc path');

// ftPhotoSource is defined in app.js; load the node-guard globals it exposes.
require('../app.js');
const src = global.ftPhotoSource;
ok(typeof src === 'function', 'ftPhotoSource exposed');
ok(src({ photoPath:'trees/t/people/p.jpg' }).kind === 'path', 'path wins');
ok(src({ photoPath:'trees/t/people/p.jpg' }).value === 'trees/t/people/p.jpg', 'path value');
ok(src({ photo:'data:image/jpeg;base64,AAA' }).kind === 'base64', 'legacy base64');
ok(src({ photo:'data:image/jpeg;base64,AAA' }).value === 'data:image/jpeg;base64,AAA', 'base64 value');
ok(src({ photoPath:'x', photo:'data:...' }).kind === 'path', 'path beats base64');
ok(src({}).kind === 'none', 'none when empty');
ok(src(null).kind === 'none', 'none when null');
ok(src({ photo:'' }).kind === 'none', 'blank base64 -> none');

console.log(pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
