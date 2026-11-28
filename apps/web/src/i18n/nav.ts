import { translator, type Translations } from '@orbit/core/i18n';

// Menu labels of the portals people use on the shop floor (Timesheet, Production, HR) and the
// shared ones. Keyed by the English label in each portal's manifest; anything not listed here
// stays in English. Admin settings pages stay in English.

const en = {
  Language: 'Language',
  Dashboard: 'Dashboard',
  'My timesheets': 'My timesheets',
  'My week': 'My week',
  'My history': 'My history',
  Overtime: 'Overtime',
  Team: 'Team',
  Approvals: 'Approvals',
  'Team overview': 'Team overview',
  Roster: 'Roster',
  Reports: 'Reports',
  'My tasks': 'My tasks',
  'Work orders': 'Work orders',
  'All work orders': 'All work orders',
  'New work order': 'New work order',
  'Shop-floor board': 'Shop-floor board',
  'Shop floor': 'Shop floor',
  'Daily production report': 'Daily production report',
  'Output log': 'Output log',
  'Production store': 'Production store',
  'Material requests': 'Material requests',
  'Material received': 'Material received',
  'Production stock': 'Production stock',
  'Issue and dispatch': 'Issue and dispatch',
  'Trade forms': 'Trade forms',
  'My HR': 'My HR',
  'Leave approvals': 'Leave approvals',
  Attendance: 'Attendance',
  Employees: 'Employees',
  Messages: 'Messages',
  'Management view': 'Management view',
  'Project documents': 'Project documents',
};
type M = typeof en;

export const NAV_T: Translations<M> = {
  hi: {
    Language: 'भाषा', Dashboard: 'डैशबोर्ड', 'My timesheets': 'मेरी टाइमशीट', 'My week': 'मेरा सप्ताह', 'My history': 'मेरा इतिहास', Overtime: 'ओवरटाइम', Team: 'टीम', Approvals: 'स्वीकृतियाँ', 'Team overview': 'टीम सारांश', Roster: 'रोस्टर', Reports: 'रिपोर्ट',
    'My tasks': 'मेरे काम', 'Work orders': 'वर्क ऑर्डर', 'All work orders': 'सभी वर्क ऑर्डर', 'New work order': 'नया वर्क ऑर्डर', 'Shop-floor board': 'शॉप-फ्लोर बोर्ड', 'Shop floor': 'शॉप फ्लोर', 'Daily production report': 'दैनिक उत्पादन रिपोर्ट', 'Output log': 'उत्पादन लॉग',
    'Production store': 'उत्पादन स्टोर', 'Material requests': 'सामग्री माँग', 'Material received': 'प्राप्त सामग्री', 'Production stock': 'उत्पादन स्टॉक', 'Issue and dispatch': 'जारी और डिस्पैच', 'Trade forms': 'ट्रेड फ़ॉर्म',
    'My HR': 'मेरा HR', 'Leave approvals': 'छुट्टी स्वीकृति', Attendance: 'उपस्थिति', Employees: 'कर्मचारी', Messages: 'संदेश', 'Management view': 'प्रबंधन दृश्य', 'Project documents': 'परियोजना दस्तावेज़',
  },
  mr: {
    Language: 'भाषा', Dashboard: 'डॅशबोर्ड', 'My timesheets': 'माझी टाइमशीट', 'My week': 'माझा आठवडा', 'My history': 'माझा इतिहास', Overtime: 'ओव्हरटाइम', Team: 'टीम', Approvals: 'मंजुरी', 'Team overview': 'टीम आढावा', Roster: 'रोस्टर', Reports: 'अहवाल',
    'My tasks': 'माझी कामे', 'Work orders': 'वर्क ऑर्डर', 'All work orders': 'सर्व वर्क ऑर्डर', 'New work order': 'नवीन वर्क ऑर्डर', 'Shop-floor board': 'शॉप-फ्लोर बोर्ड', 'Shop floor': 'शॉप फ्लोर', 'Daily production report': 'दैनिक उत्पादन अहवाल', 'Output log': 'उत्पादन नोंद',
    'Production store': 'उत्पादन स्टोअर', 'Material requests': 'साहित्य मागणी', 'Material received': 'मिळालेले साहित्य', 'Production stock': 'उत्पादन साठा', 'Issue and dispatch': 'वितरण आणि रवाना', 'Trade forms': 'ट्रेड फॉर्म',
    'My HR': 'माझे HR', 'Leave approvals': 'रजा मंजुरी', Attendance: 'हजेरी', Employees: 'कर्मचारी', Messages: 'संदेश', 'Management view': 'व्यवस्थापन दृश्य', 'Project documents': 'प्रकल्प कागदपत्रे',
  },
  gu: {
    Language: 'ભાષા', Dashboard: 'ડેશબોર્ડ', 'My timesheets': 'મારી ટાઇમશીટ', 'My week': 'મારું અઠવાડિયું', 'My history': 'મારો ઇતિહાસ', Overtime: 'ઓવરટાઇમ', Team: 'ટીમ', Approvals: 'મંજૂરીઓ', 'Team overview': 'ટીમ ઝાંખી', Roster: 'રોસ્ટર', Reports: 'રિપોર્ટ',
    'My tasks': 'મારાં કામ', 'Work orders': 'વર્ક ઓર્ડર', 'All work orders': 'બધા વર્ક ઓર્ડર', 'New work order': 'નવો વર્ક ઓર્ડર', 'Shop-floor board': 'શોપ-ફ્લોર બોર્ડ', 'Shop floor': 'શોપ ફ્લોર', 'Daily production report': 'દૈનિક ઉત્પાદન રિપોર્ટ', 'Output log': 'ઉત્પાદન લોગ',
    'Production store': 'ઉત્પાદન સ્ટોર', 'Material requests': 'માલની માંગ', 'Material received': 'મળેલો માલ', 'Production stock': 'ઉત્પાદન સ્ટોક', 'Issue and dispatch': 'ઇશ્યૂ અને રવાનગી', 'Trade forms': 'ટ્રેડ ફોર્મ',
    'My HR': 'મારું HR', 'Leave approvals': 'રજા મંજૂરી', Attendance: 'હાજરી', Employees: 'કર્મચારીઓ', Messages: 'સંદેશા', 'Management view': 'મેનેજમેન્ટ દૃશ્ય', 'Project documents': 'પ્રોજેક્ટ દસ્તાવેજો',
  },
  pa: {
    Language: 'ਭਾਸ਼ਾ', Dashboard: 'ਡੈਸ਼ਬੋਰਡ', 'My timesheets': 'ਮੇਰੀ ਟਾਈਮਸ਼ੀਟ', 'My week': 'ਮੇਰਾ ਹਫ਼ਤਾ', 'My history': 'ਮੇਰਾ ਇਤਿਹਾਸ', Overtime: 'ਓਵਰਟਾਈਮ', Team: 'ਟੀਮ', Approvals: 'ਮਨਜ਼ੂਰੀਆਂ', 'Team overview': 'ਟੀਮ ਝਲਕ', Roster: 'ਰੋਸਟਰ', Reports: 'ਰਿਪੋਰਟਾਂ',
    'My tasks': 'ਮੇਰੇ ਕੰਮ', 'Work orders': 'ਵਰਕ ਆਰਡਰ', 'All work orders': 'ਸਾਰੇ ਵਰਕ ਆਰਡਰ', 'New work order': 'ਨਵਾਂ ਵਰਕ ਆਰਡਰ', 'Shop-floor board': 'ਸ਼ਾਪ-ਫਲੋਰ ਬੋਰਡ', 'Shop floor': 'ਸ਼ਾਪ ਫਲੋਰ', 'Daily production report': 'ਰੋਜ਼ਾਨਾ ਉਤਪਾਦਨ ਰਿਪੋਰਟ', 'Output log': 'ਉਤਪਾਦਨ ਲੌਗ',
    'Production store': 'ਉਤਪਾਦਨ ਸਟੋਰ', 'Material requests': 'ਸਮੱਗਰੀ ਮੰਗ', 'Material received': 'ਪ੍ਰਾਪਤ ਸਮੱਗਰੀ', 'Production stock': 'ਉਤਪਾਦਨ ਸਟਾਕ', 'Issue and dispatch': 'ਜਾਰੀ ਅਤੇ ਰਵਾਨਗੀ', 'Trade forms': 'ਟ੍ਰੇਡ ਫਾਰਮ',
    'My HR': 'ਮੇਰਾ HR', 'Leave approvals': 'ਛੁੱਟੀ ਮਨਜ਼ੂਰੀ', Attendance: 'ਹਾਜ਼ਰੀ', Employees: 'ਕਰਮਚਾਰੀ', Messages: 'ਸੁਨੇਹੇ', 'Management view': 'ਪ੍ਰਬੰਧਨ ਝਲਕ', 'Project documents': 'ਪ੍ਰੋਜੈਕਟ ਦਸਤਾਵੇਜ਼',
  },
  bn: {
    Language: 'ভাষা', Dashboard: 'ড্যাশবোর্ড', 'My timesheets': 'আমার টাইমশিট', 'My week': 'আমার সপ্তাহ', 'My history': 'আমার ইতিহাস', Overtime: 'ওভারটাইম', Team: 'দল', Approvals: 'অনুমোদন', 'Team overview': 'দলের সারাংশ', Roster: 'রোস্টার', Reports: 'রিপোর্ট',
    'My tasks': 'আমার কাজ', 'Work orders': 'ওয়ার্ক অর্ডার', 'All work orders': 'সব ওয়ার্ক অর্ডার', 'New work order': 'নতুন ওয়ার্ক অর্ডার', 'Shop-floor board': 'শপ-ফ্লোর বোর্ড', 'Shop floor': 'শপ ফ্লোর', 'Daily production report': 'দৈনিক উৎপাদন রিপোর্ট', 'Output log': 'উৎপাদন লগ',
    'Production store': 'উৎপাদন স্টোর', 'Material requests': 'মালপত্রের অনুরোধ', 'Material received': 'প্রাপ্ত মালপত্র', 'Production stock': 'উৎপাদন স্টক', 'Issue and dispatch': 'ইস্যু ও প্রেরণ', 'Trade forms': 'ট্রেড ফর্ম',
    'My HR': 'আমার HR', 'Leave approvals': 'ছুটির অনুমোদন', Attendance: 'উপস্থিতি', Employees: 'কর্মচারী', Messages: 'বার্তা', 'Management view': 'ব্যবস্থাপনা দৃশ্য', 'Project documents': 'প্রকল্পের নথি',
  },
  or: {
    Language: 'ଭାଷା', Dashboard: 'ଡ୍ୟାସବୋର୍ଡ', 'My timesheets': 'ମୋ ଟାଇମସିଟ୍', 'My week': 'ମୋ ସପ୍ତାହ', 'My history': 'ମୋ ଇତିହାସ', Overtime: 'ଓଭରଟାଇମ୍', Team: 'ଦଳ', Approvals: 'ଅନୁମୋଦନ', 'Team overview': 'ଦଳ ସାରାଂଶ', Roster: 'ରୋଷ୍ଟର', Reports: 'ରିପୋର୍ଟ',
    'My tasks': 'ମୋ କାମ', 'Work orders': 'ୱର୍କ ଅର୍ଡର', 'All work orders': 'ସମସ୍ତ ୱର୍କ ଅର୍ଡର', 'New work order': 'ନୂଆ ୱର୍କ ଅର୍ଡର', 'Shop-floor board': 'ସପ୍-ଫ୍ଲୋର ବୋର୍ଡ', 'Shop floor': 'ସପ୍ ଫ୍ଲୋର', 'Daily production report': 'ଦୈନିକ ଉତ୍ପାଦନ ରିପୋର୍ଟ', 'Output log': 'ଉତ୍ପାଦନ ଲଗ୍',
    'Production store': 'ଉତ୍ପାଦନ ଷ୍ଟୋର', 'Material requests': 'ସାମଗ୍ରୀ ଅନୁରୋଧ', 'Material received': 'ପ୍ରାପ୍ତ ସାମଗ୍ରୀ', 'Production stock': 'ଉତ୍ପାଦନ ଷ୍ଟକ୍', 'Issue and dispatch': 'ଜାରି ଓ ପ୍ରେରଣ', 'Trade forms': 'ଟ୍ରେଡ୍ ଫର୍ମ',
    'My HR': 'ମୋ HR', 'Leave approvals': 'ଛୁଟି ଅନୁମୋଦନ', Attendance: 'ଉପସ୍ଥାନ', Employees: 'କର୍ମଚାରୀ', Messages: 'ବାର୍ତ୍ତା', 'Management view': 'ପରିଚାଳନା ଦୃଶ୍ୟ', 'Project documents': 'ପ୍ରକଳ୍ପ ଦଲିଲ',
  },
  ta: {
    Language: 'மொழி', Dashboard: 'டாஷ்போர்டு', 'My timesheets': 'என் நேரத்தாள்கள்', 'My week': 'என் வாரம்', 'My history': 'என் வரலாறு', Overtime: 'கூடுதல் நேரம்', Team: 'குழு', Approvals: 'ஒப்புதல்கள்', 'Team overview': 'குழு கண்ணோட்டம்', Roster: 'பணி அட்டவணை', Reports: 'அறிக்கைகள்',
    'My tasks': 'என் பணிகள்', 'Work orders': 'பணி ஆணைகள்', 'All work orders': 'அனைத்து பணி ஆணைகள்', 'New work order': 'புதிய பணி ஆணை', 'Shop-floor board': 'பணிமனை பலகை', 'Shop floor': 'பணிமனை', 'Daily production report': 'தினசரி உற்பத்தி அறிக்கை', 'Output log': 'உற்பத்தி பதிவு',
    'Production store': 'உற்பத்தி கிடங்கு', 'Material requests': 'பொருள் கோரிக்கைகள்', 'Material received': 'பெறப்பட்ட பொருள்', 'Production stock': 'உற்பத்தி இருப்பு', 'Issue and dispatch': 'வழங்கல் மற்றும் அனுப்புதல்', 'Trade forms': 'தொழில் படிவங்கள்',
    'My HR': 'என் HR', 'Leave approvals': 'விடுப்பு ஒப்புதல்', Attendance: 'வருகை', Employees: 'பணியாளர்கள்', Messages: 'செய்திகள்', 'Management view': 'மேலாண்மை பார்வை', 'Project documents': 'திட்ட ஆவணங்கள்',
  },
  te: {
    Language: 'భాష', Dashboard: 'డాష్‌బోర్డ్', 'My timesheets': 'నా టైమ్‌షీట్లు', 'My week': 'నా వారం', 'My history': 'నా చరిత్ర', Overtime: 'ఓవర్‌టైమ్', Team: 'బృందం', Approvals: 'ఆమోదాలు', 'Team overview': 'బృంద సారాంశం', Roster: 'రోస్టర్', Reports: 'నివేదికలు',
    'My tasks': 'నా పనులు', 'Work orders': 'వర్క్ ఆర్డర్లు', 'All work orders': 'అన్ని వర్క్ ఆర్డర్లు', 'New work order': 'కొత్త వర్క్ ఆర్డర్', 'Shop-floor board': 'షాప్-ఫ్లోర్ బోర్డ్', 'Shop floor': 'షాప్ ఫ్లోర్', 'Daily production report': 'రోజువారీ ఉత్పత్తి నివేదిక', 'Output log': 'ఉత్పత్తి లాగ్',
    'Production store': 'ఉత్పత్తి స్టోర్', 'Material requests': 'మెటీరియల్ అభ్యర్థనలు', 'Material received': 'అందిన మెటీరియల్', 'Production stock': 'ఉత్పత్తి స్టాక్', 'Issue and dispatch': 'జారీ మరియు పంపకం', 'Trade forms': 'ట్రేడ్ ఫారాలు',
    'My HR': 'నా HR', 'Leave approvals': 'సెలవు ఆమోదాలు', Attendance: 'హాజరు', Employees: 'ఉద్యోగులు', Messages: 'సందేశాలు', 'Management view': 'నిర్వహణ వీక్షణ', 'Project documents': 'ప్రాజెక్ట్ పత్రాలు',
  },
  kn: {
    Language: 'ಭಾಷೆ', Dashboard: 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್', 'My timesheets': 'ನನ್ನ ಟೈಮ್‌ಶೀಟ್‌ಗಳು', 'My week': 'ನನ್ನ ವಾರ', 'My history': 'ನನ್ನ ಇತಿಹಾಸ', Overtime: 'ಹೆಚ್ಚುವರಿ ಸಮಯ', Team: 'ತಂಡ', Approvals: 'ಅನುಮೋದನೆಗಳು', 'Team overview': 'ತಂಡದ ಸಾರಾಂಶ', Roster: 'ರೋಸ್ಟರ್', Reports: 'ವರದಿಗಳು',
    'My tasks': 'ನನ್ನ ಕೆಲಸಗಳು', 'Work orders': 'ವರ್ಕ್ ಆರ್ಡರ್‌ಗಳು', 'All work orders': 'ಎಲ್ಲಾ ವರ್ಕ್ ಆರ್ಡರ್‌ಗಳು', 'New work order': 'ಹೊಸ ವರ್ಕ್ ಆರ್ಡರ್', 'Shop-floor board': 'ಶಾಪ್-ಫ್ಲೋರ್ ಬೋರ್ಡ್', 'Shop floor': 'ಶಾಪ್ ಫ್ಲೋರ್', 'Daily production report': 'ದೈನಂದಿನ ಉತ್ಪಾದನಾ ವರದಿ', 'Output log': 'ಉತ್ಪಾದನಾ ದಾಖಲೆ',
    'Production store': 'ಉತ್ಪಾದನಾ ಸ್ಟೋರ್', 'Material requests': 'ಸಾಮಗ್ರಿ ವಿನಂತಿಗಳು', 'Material received': 'ಸ್ವೀಕರಿಸಿದ ಸಾಮಗ್ರಿ', 'Production stock': 'ಉತ್ಪಾದನಾ ದಾಸ್ತಾನು', 'Issue and dispatch': 'ವಿತರಣೆ ಮತ್ತು ರವಾನೆ', 'Trade forms': 'ಟ್ರೇಡ್ ಫಾರ್ಮ್‌ಗಳು',
    'My HR': 'ನನ್ನ HR', 'Leave approvals': 'ರಜೆ ಅನುಮೋದನೆ', Attendance: 'ಹಾಜರಾತಿ', Employees: 'ನೌಕರರು', Messages: 'ಸಂದೇಶಗಳು', 'Management view': 'ನಿರ್ವಹಣಾ ನೋಟ', 'Project documents': 'ಯೋಜನೆ ದಾಖಲೆಗಳು',
  },
  ml: {
    Language: 'ഭാഷ', Dashboard: 'ഡാഷ്‌ബോർഡ്', 'My timesheets': 'എന്റെ ടൈംഷീറ്റുകൾ', 'My week': 'എന്റെ ആഴ്ച', 'My history': 'എന്റെ ചരിത്രം', Overtime: 'ഓവർടൈം', Team: 'ടീം', Approvals: 'അംഗീകാരങ്ങൾ', 'Team overview': 'ടീം അവലോകനം', Roster: 'റോസ്റ്റർ', Reports: 'റിപ്പോർട്ടുകൾ',
    'My tasks': 'എന്റെ ജോലികൾ', 'Work orders': 'വർക്ക് ഓർഡറുകൾ', 'All work orders': 'എല്ലാ വർക്ക് ഓർഡറുകളും', 'New work order': 'പുതിയ വർക്ക് ഓർഡർ', 'Shop-floor board': 'ഷോപ്പ്-ഫ്ലോർ ബോർഡ്', 'Shop floor': 'ഷോപ്പ് ഫ്ലോർ', 'Daily production report': 'ദൈനംദിന ഉത്പാദന റിപ്പോർട്ട്', 'Output log': 'ഉത്പാദന ലോഗ്',
    'Production store': 'ഉത്പാദന സ്റ്റോർ', 'Material requests': 'സാമഗ്രി അപേക്ഷകൾ', 'Material received': 'ലഭിച്ച സാമഗ്രി', 'Production stock': 'ഉത്പാദന സ്റ്റോക്ക്', 'Issue and dispatch': 'വിതരണവും അയയ്ക്കലും', 'Trade forms': 'ട്രേഡ് ഫോമുകൾ',
    'My HR': 'എന്റെ HR', 'Leave approvals': 'അവധി അംഗീകാരം', Attendance: 'ഹാജർ', Employees: 'ജീവനക്കാർ', Messages: 'സന്ദേശങ്ങൾ', 'Management view': 'മാനേജ്‌മെന്റ് കാഴ്ച', 'Project documents': 'പ്രോജക്റ്റ് രേഖകൾ',
  },
  ur: {
    Language: 'زبان', Dashboard: 'ڈیش بورڈ', 'My timesheets': 'میری ٹائم شیٹ', 'My week': 'میرا ہفتہ', 'My history': 'میری تاریخ', Overtime: 'اوور ٹائم', Team: 'ٹیم', Approvals: 'منظوریاں', 'Team overview': 'ٹیم کا خلاصہ', Roster: 'روسٹر', Reports: 'رپورٹیں',
    'My tasks': 'میرے کام', 'Work orders': 'ورک آرڈر', 'All work orders': 'تمام ورک آرڈر', 'New work order': 'نیا ورک آرڈر', 'Shop-floor board': 'شاپ فلور بورڈ', 'Shop floor': 'شاپ فلور', 'Daily production report': 'روزانہ پیداواری رپورٹ', 'Output log': 'پیداوار لاگ',
    'Production store': 'پیداواری اسٹور', 'Material requests': 'سامان کی درخواستیں', 'Material received': 'موصول شدہ سامان', 'Production stock': 'پیداواری اسٹاک', 'Issue and dispatch': 'اجرا اور ترسیل', 'Trade forms': 'ٹریڈ فارم',
    'My HR': 'میرا HR', 'Leave approvals': 'چھٹی کی منظوری', Attendance: 'حاضری', Employees: 'ملازمین', Messages: 'پیغامات', 'Management view': 'انتظامی منظر', 'Project documents': 'پروجیکٹ دستاویزات',
  },
  fr: {
    Language: 'Langue', Dashboard: 'Tableau de bord', 'My timesheets': 'Mes feuilles de temps', 'My week': 'Ma semaine', 'My history': 'Mon historique', Overtime: 'Heures supplémentaires', Team: 'Équipe', Approvals: 'Validations', 'Team overview': "Vue d'équipe", Roster: 'Planning', Reports: 'Rapports',
    'My tasks': 'Mes tâches', 'Work orders': 'Ordres de fabrication', 'All work orders': 'Tous les ordres', 'New work order': 'Nouvel ordre', 'Shop-floor board': "Tableau d'atelier", 'Shop floor': 'Atelier', 'Daily production report': 'Rapport de production du jour', 'Output log': 'Journal de production',
    'Production store': 'Magasin de production', 'Material requests': 'Demandes de matière', 'Material received': 'Matière reçue', 'Production stock': 'Stock de production', 'Issue and dispatch': 'Sorties et expéditions', 'Trade forms': 'Formulaires métier',
    'My HR': 'Mes RH', 'Leave approvals': 'Validation des congés', Attendance: 'Présence', Employees: 'Salariés', Messages: 'Messages', 'Management view': 'Vue direction', 'Project documents': 'Documents projet',
  },
  de: {
    Language: 'Sprache', Dashboard: 'Übersicht', 'My timesheets': 'Meine Stundenzettel', 'My week': 'Meine Woche', 'My history': 'Mein Verlauf', Overtime: 'Überstunden', Team: 'Team', Approvals: 'Freigaben', 'Team overview': 'Teamübersicht', Roster: 'Schichtplan', Reports: 'Berichte',
    'My tasks': 'Meine Aufgaben', 'Work orders': 'Fertigungsaufträge', 'All work orders': 'Alle Aufträge', 'New work order': 'Neuer Auftrag', 'Shop-floor board': 'Werkstatttafel', 'Shop floor': 'Werkstatt', 'Daily production report': 'Tagesproduktionsbericht', 'Output log': 'Produktionsprotokoll',
    'Production store': 'Produktionslager', 'Material requests': 'Materialanforderungen', 'Material received': 'Materialeingang', 'Production stock': 'Produktionsbestand', 'Issue and dispatch': 'Ausgabe und Versand', 'Trade forms': 'Gewerkformulare',
    'My HR': 'Mein Personalbereich', 'Leave approvals': 'Urlaubsfreigaben', Attendance: 'Anwesenheit', Employees: 'Mitarbeitende', Messages: 'Nachrichten', 'Management view': 'Geschäftsleitung', 'Project documents': 'Projektunterlagen',
  },
  es: { Language: "Idioma", Dashboard: "Panel", "My timesheets": "Mis partes de horas", "My week": "Mi semana", "My history": "Mi historial", Overtime: "Horas extra", Team: "Equipo", Approvals: "Aprobaciones", "Team overview": "Resumen del equipo", Roster: "Turnos", Reports: "Informes", "My tasks": "Mis tareas", "Work orders": "Órdenes de trabajo", "All work orders": "Todas las órdenes", "New work order": "Nueva orden", "Shop-floor board": "Tablero del taller", "Shop floor": "Taller", "Daily production report": "Parte diario de producción", "Output log": "Registro de producción", "Production store": "Almacén de producción", "Material requests": "Pedidos de material", "Material received": "Material recibido", "Production stock": "Stock de producción", "Issue and dispatch": "Entregas y envíos", "Trade forms": "Formularios de oficio", "My HR": "Mis RR. HH.", "Leave approvals": "Aprobación de permisos", Attendance: "Asistencia", Employees: "Empleados", Messages: "Mensajes", "Management view": "Vista de dirección", "Project documents": "Documentos del proyecto" },
  pt: { Language: "Idioma", Dashboard: "Painel", "My timesheets": "As minhas folhas de horas", "My week": "A minha semana", "My history": "O meu histórico", Overtime: "Horas extra", Team: "Equipa", Approvals: "Aprovações", "Team overview": "Resumo da equipa", Roster: "Escalas", Reports: "Relatórios", "My tasks": "As minhas tarefas", "Work orders": "Ordens de fabrico", "All work orders": "Todas as ordens", "New work order": "Nova ordem", "Shop-floor board": "Quadro da oficina", "Shop floor": "Oficina", "Daily production report": "Relatório diário de produção", "Output log": "Registo de produção", "Production store": "Armazém de produção", "Material requests": "Pedidos de material", "Material received": "Material recebido", "Production stock": "Stock de produção", "Issue and dispatch": "Saídas e expedição", "Trade forms": "Formulários de ofício", "My HR": "Os meus RH", "Leave approvals": "Aprovação de ausências", Attendance: "Assiduidade", Employees: "Colaboradores", Messages: "Mensagens", "Management view": "Vista da direção", "Project documents": "Documentos do projeto" },
  it: { Language: "Lingua", Dashboard: "Cruscotto", "My timesheets": "I miei fogli ore", "My week": "La mia settimana", "My history": "Il mio storico", Overtime: "Straordinari", Team: "Squadra", Approvals: "Approvazioni", "Team overview": "Panoramica squadra", Roster: "Turni", Reports: "Report", "My tasks": "I miei compiti", "Work orders": "Ordini di lavoro", "All work orders": "Tutti gli ordini", "New work order": "Nuovo ordine", "Shop-floor board": "Tabellone officina", "Shop floor": "Officina", "Daily production report": "Rapporto di produzione giornaliero", "Output log": "Registro produzione", "Production store": "Magazzino produzione", "Material requests": "Richieste materiale", "Material received": "Materiale ricevuto", "Production stock": "Scorte produzione", "Issue and dispatch": "Prelievi e spedizioni", "Trade forms": "Moduli di mestiere", "My HR": "Le mie risorse umane", "Leave approvals": "Approvazione permessi", Attendance: "Presenze", Employees: "Dipendenti", Messages: "Messaggi", "Management view": "Vista direzione", "Project documents": "Documenti di progetto" },
  nl: { Language: "Taal", Dashboard: "Overzicht", "My timesheets": "Mijn urenstaten", "My week": "Mijn week", "My history": "Mijn geschiedenis", Overtime: "Overuren", Team: "Team", Approvals: "Goedkeuringen", "Team overview": "Teamoverzicht", Roster: "Rooster", Reports: "Rapporten", "My tasks": "Mijn taken", "Work orders": "Werkorders", "All work orders": "Alle werkorders", "New work order": "Nieuwe werkorder", "Shop-floor board": "Werkplaatsbord", "Shop floor": "Werkplaats", "Daily production report": "Dagelijks productierapport", "Output log": "Productielog", "Production store": "Productiemagazijn", "Material requests": "Materiaalaanvragen", "Material received": "Ontvangen materiaal", "Production stock": "Productievoorraad", "Issue and dispatch": "Uitgifte en verzending", "Trade forms": "Vakformulieren", "My HR": "Mijn HR", "Leave approvals": "Verlofgoedkeuringen", Attendance: "Aanwezigheid", Employees: "Medewerkers", Messages: "Berichten", "Management view": "Directieoverzicht", "Project documents": "Projectdocumenten" },
  pl: { Language: "Język", Dashboard: "Pulpit", "My timesheets": "Moje karty czasu", "My week": "Mój tydzień", "My history": "Moja historia", Overtime: "Nadgodziny", Team: "Zespół", Approvals: "Akceptacje", "Team overview": "Przegląd zespołu", Roster: "Grafik", Reports: "Raporty", "My tasks": "Moje zadania", "Work orders": "Zlecenia", "All work orders": "Wszystkie zlecenia", "New work order": "Nowe zlecenie", "Shop-floor board": "Tablica hali", "Shop floor": "Hala", "Daily production report": "Dzienny raport produkcji", "Output log": "Rejestr produkcji", "Production store": "Magazyn produkcji", "Material requests": "Zapotrzebowania", "Material received": "Przyjęty materiał", "Production stock": "Zapas produkcji", "Issue and dispatch": "Wydania i wysyłka", "Trade forms": "Formularze branżowe", "My HR": "Moje kadry", "Leave approvals": "Akceptacja urlopów", Attendance: "Obecność", Employees: "Pracownicy", Messages: "Wiadomości", "Management view": "Widok zarządu", "Project documents": "Dokumenty projektu" },
  ro: { Language: "Limbă", Dashboard: "Panou", "My timesheets": "Pontajele mele", "My week": "Săptămâna mea", "My history": "Istoricul meu", Overtime: "Ore suplimentare", Team: "Echipă", Approvals: "Aprobări", "Team overview": "Prezentare echipă", Roster: "Ture", Reports: "Rapoarte", "My tasks": "Sarcinile mele", "Work orders": "Comenzi de lucru", "All work orders": "Toate comenzile", "New work order": "Comandă nouă", "Shop-floor board": "Panou atelier", "Shop floor": "Atelier", "Daily production report": "Raport zilnic de producție", "Output log": "Jurnal producție", "Production store": "Magazie producție", "Material requests": "Cereri de material", "Material received": "Material primit", "Production stock": "Stoc producție", "Issue and dispatch": "Eliberări și expedieri", "Trade forms": "Formulare de meserie", "My HR": "Resursele mele umane", "Leave approvals": "Aprobare concedii", Attendance: "Prezență", Employees: "Angajați", Messages: "Mesaje", "Management view": "Vedere conducere", "Project documents": "Documente proiect" },
  ru: { Language: "Язык", Dashboard: "Сводка", "My timesheets": "Мои табели", "My week": "Моя неделя", "My history": "Моя история", Overtime: "Сверхурочные", Team: "Бригада", Approvals: "Утверждение", "Team overview": "Обзор бригады", Roster: "График смен", Reports: "Отчёты", "My tasks": "Мои задачи", "Work orders": "Заказ-наряды", "All work orders": "Все заказ-наряды", "New work order": "Новый заказ-наряд", "Shop-floor board": "Доска цеха", "Shop floor": "Цех", "Daily production report": "Ежедневный отчёт о производстве", "Output log": "Журнал выпуска", "Production store": "Склад производства", "Material requests": "Заявки на материал", "Material received": "Полученный материал", "Production stock": "Запас производства", "Issue and dispatch": "Выдача и отгрузка", "Trade forms": "Формы по видам работ", "My HR": "Мой отдел кадров", "Leave approvals": "Утверждение отпусков", Attendance: "Посещаемость", Employees: "Сотрудники", Messages: "Сообщения", "Management view": "Вид руководства", "Project documents": "Документы проекта" },
  tr: { Language: "Dil", Dashboard: "Gösterge paneli", "My timesheets": "Puantajlarım", "My week": "Haftam", "My history": "Geçmişim", Overtime: "Fazla mesai", Team: "Ekip", Approvals: "Onaylar", "Team overview": "Ekip özeti", Roster: "Vardiya planı", Reports: "Raporlar", "My tasks": "Görevlerim", "Work orders": "İş emirleri", "All work orders": "Tüm iş emirleri", "New work order": "Yeni iş emri", "Shop-floor board": "Atölye panosu", "Shop floor": "Atölye", "Daily production report": "Günlük üretim raporu", "Output log": "Üretim kaydı", "Production store": "Üretim deposu", "Material requests": "Malzeme talepleri", "Material received": "Gelen malzeme", "Production stock": "Üretim stoğu", "Issue and dispatch": "Çıkış ve sevkiyat", "Trade forms": "İş kolu formları", "My HR": "İK bilgilerim", "Leave approvals": "İzin onayları", Attendance: "Devam", Employees: "Çalışanlar", Messages: "Mesajlar", "Management view": "Yönetim görünümü", "Project documents": "Proje belgeleri" },
  ar: { Language: "اللغة", Dashboard: "لوحة المعلومات", "My timesheets": "سجلات دوامي", "My week": "أسبوعي", "My history": "سجلي", Overtime: "العمل الإضافي", Team: "الفريق", Approvals: "الاعتمادات", "Team overview": "نظرة على الفريق", Roster: "جدول المناوبات", Reports: "التقارير", "My tasks": "مهامي", "Work orders": "أوامر العمل", "All work orders": "كل أوامر العمل", "New work order": "أمر عمل جديد", "Shop-floor board": "لوحة الورشة", "Shop floor": "الورشة", "Daily production report": "تقرير الإنتاج اليومي", "Output log": "سجل الإنتاج", "Production store": "مخزن الإنتاج", "Material requests": "طلبات المواد", "Material received": "المواد المستلمة", "Production stock": "مخزون الإنتاج", "Issue and dispatch": "الصرف والشحن", "Trade forms": "نماذج المهن", "My HR": "شؤوني الوظيفية", "Leave approvals": "اعتماد الإجازات", Attendance: "الحضور", Employees: "الموظفون", Messages: "الرسائل", "Management view": "عرض الإدارة", "Project documents": "مستندات المشروع" },
  ne: { Language: "भाषा", Dashboard: "ड्यासबोर्ड", "My timesheets": "मेरा टाइमसिट", "My week": "मेरो हप्ता", "My history": "मेरो इतिहास", Overtime: "ओभरटाइम", Team: "टोली", Approvals: "स्वीकृति", "Team overview": "टोली सारांश", Roster: "रोस्टर", Reports: "रिपोर्ट", "My tasks": "मेरा काम", "Work orders": "वर्क अर्डर", "All work orders": "सबै वर्क अर्डर", "New work order": "नयाँ वर्क अर्डर", "Shop-floor board": "सप-फ्लोर बोर्ड", "Shop floor": "सप फ्लोर", "Daily production report": "दैनिक उत्पादन रिपोर्ट", "Output log": "उत्पादन लग", "Production store": "उत्पादन स्टोर", "Material requests": "सामग्री माग", "Material received": "प्राप्त सामग्री", "Production stock": "उत्पादन स्टक", "Issue and dispatch": "जारी र पठाउने", "Trade forms": "ट्रेड फारम", "My HR": "मेरो HR", "Leave approvals": "बिदा स्वीकृति", Attendance: "हाजिरी", Employees: "कर्मचारी", Messages: "सन्देश", "Management view": "व्यवस्थापन दृश्य", "Project documents": "परियोजना कागजात" },
  fil: { Language: "Wika", Dashboard: "Dashboard", "My timesheets": "Aking mga timesheet", "My week": "Aking linggo", "My history": "Aking kasaysayan", Overtime: "Overtime", Team: "Team", Approvals: "Mga apruba", "Team overview": "Buod ng team", Roster: "Roster", Reports: "Mga ulat", "My tasks": "Aking mga gawain", "Work orders": "Mga work order", "All work orders": "Lahat ng work order", "New work order": "Bagong work order", "Shop-floor board": "Board ng shop floor", "Shop floor": "Shop floor", "Daily production report": "Pang-araw-araw na ulat ng produksyon", "Output log": "Log ng output", "Production store": "Bodega ng produksyon", "Material requests": "Mga request ng materyal", "Material received": "Natanggap na materyal", "Production stock": "Stock ng produksyon", "Issue and dispatch": "Paglabas at pagpapadala", "Trade forms": "Mga trade form", "My HR": "Aking HR", "Leave approvals": "Apruba ng leave", Attendance: "Pagdalo", Employees: "Mga empleyado", Messages: "Mga mensahe", "Management view": "View ng pamunuan", "Project documents": "Mga dokumento ng proyekto" },
};

export const NAV_EN = en;
export const NAV_TRANSLATIONS = NAV_T;

/** A menu label in the person's language; labels not listed stay as they are. */
export function navLabel(lang: string) {
  const tr = translator(en, NAV_T, lang);
  return (label: string) => (label in en ? tr(label as keyof M) : label);
}
