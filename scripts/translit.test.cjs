require('../translit.js');
const ftTranslit = global.ftTranslit;
let pass = 0, fail = 0;
function eq(got, want, label){ if(got === want){ pass++; } else { fail++; console.error('✗', label, '=>', JSON.stringify(got), 'want', JSON.stringify(want)); } }
eq(ftTranslit('محمد'), 'Mohammed', 'common: محمد');
eq(ftTranslit('أحمد'), 'Ahmed', 'common: أحمد');
eq(ftTranslit('فاطمة'), 'Fatima', 'common: فاطمة');
eq(ftTranslit('محمد أحمد'), 'Mohammed Ahmed', 'multi-word');
eq(typeof ftTranslit('برقوق'), 'string', 'fallback returns a string');
eq(ftTranslit('برقوق').length > 0, true, 'fallback non-empty');
eq(ftTranslit(''), '', 'empty in => empty out');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
