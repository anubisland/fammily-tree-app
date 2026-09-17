/* Arabic → Latin transliteration for auto-filling the English name field.
   Pure and DOM-free so it unit-tests in node (like kinship.js). A curated
   common-names dictionary covers most family names; unknown words fall back to
   a character map. The result is a SUGGESTION the user can always edit. */
(function(global){
  'use strict';
  var DICT = {
    'محمد':'Mohammed','احمد':'Ahmed','أحمد':'Ahmed','محمود':'Mahmoud','مصطفى':'Mostafa',
    'علي':'Ali','عمر':'Omar','عثمان':'Othman','ابراهيم':'Ibrahim','إبراهيم':'Ibrahim',
    'يوسف':'Youssef','خالد':'Khaled','حسن':'Hassan','حسين':'Hussein','عبدالله':'Abdullah',
    'عبدالرحمن':'Abdelrahman','عبدالعزيز':'Abdelaziz','سعيد':'Said','طارق':'Tarek',
    'زياد':'Ziad','ياسر':'Yasser','سامي':'Sami','كريم':'Karim','رامي':'Rami','هاني':'Hani',
    'وليد':'Walid','ماجد':'Majed','ناصر':'Nasser','فهد':'Fahd','سلمان':'Salman','امين':'Amin',
    'أمين':'Amin','الوزير':'Alwazir','فاطمة':'Fatima','عائشة':'Aisha','خديجة':'Khadija',
    'زينب':'Zainab','مريم':'Mariam','سارة':'Sara','هاجر':'Hajar','نور':'Nour','هدى':'Huda',
    'ليلى':'Layla','سلمى':'Salma','رانيا':'Rania','دعاء':'Doaa','اسماء':'Asmaa','أسماء':'Asmaa',
    'شروق':'Shorouk','سها':'Soha','هبة':'Heba','نادية':'Nadia','سمير':'Samir','عادل':'Adel',
    'رحاب':'Rehab','مجدي':'Magdy','يس':'Yassin','ال':'Al','آل':'Al','عبد':'Abd'
  };
  // Character fallback for words not in the dictionary.
  var CH = {
    'ا':'a','أ':'a','إ':'i','آ':'aa','ب':'b','ت':'t','ث':'th','ج':'j','ح':'h','خ':'kh',
    'د':'d','ذ':'dh','ر':'r','ز':'z','س':'s','ش':'sh','ص':'s','ض':'d','ط':'t','ظ':'z',
    'ع':'a','غ':'gh','ف':'f','ق':'q','ك':'k','ل':'l','م':'m','ن':'n','ه':'h','و':'w',
    'ي':'y','ى':'a','ة':'a','ء':'','ئ':'e','ؤ':'o','ّ':'','َ':'a','ُ':'u','ِ':'i','ْ':'','ـ':''
  };
  function word(w){
    if(!w) return '';
    if(DICT[w]) return DICT[w];
    var out = '';
    for(var i=0;i<w.length;i++){ out += (CH[w[i]] !== undefined ? CH[w[i]] : w[i]); }
    return out ? out.charAt(0).toUpperCase() + out.slice(1) : '';
  }
  function ftTranslit(s){
    if(!s) return '';
    return String(s).trim().split(/\s+/).map(word).filter(Boolean).join(' ');
  }
  if(typeof module !== 'undefined' && module.exports) module.exports = ftTranslit;
  global.ftTranslit = ftTranslit;
})(typeof window !== 'undefined' ? window : globalThis);
