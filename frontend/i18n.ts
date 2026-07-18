/**
 * Bilingual UI strings (English / Arabic). Keys are referenced via `data-i18n`
 * in index.html and via `t(key)` for dynamic (JS-set) text. The active language
 * is read from storage (see storage.ts) and applied by app.ts's applyLang().
 */
import { loadLang, type Lang } from './storage';

type Entry = string | ((...args: any[]) => string);
type Dict = Record<string, Entry>;

const EN: Dict = {
  'app.name': 'Bahrain Address Finder',
  'hero.subtitle': 'Find any address, share a map link, or locate yourself — instantly.',
  'search.placeholder': 'Search building, road, block or area…',
  'search.placeholderShort': 'Search…',
  'section.recent': 'Recent',
  'section.saved': 'Saved',
  'locate': 'Locate me',
  'clear': 'Clear',
  'theme.toggle': 'Toggle theme',
  'lang.toggle': 'Switch language',
  'result.share': 'Share',
  'result.copyCoords': 'Copy coords',
  'result.googleMaps': 'Google Maps',
  'result.directions': 'Directions',
  'result.save': 'Save address',
  'result.remove': 'Remove from saved',
  'empty.noMatch': 'No addresses matched your search.',
  'empty.noResult': 'No registered building within 5 km of your coordinates.',
  'status.searching': 'Searching…',
  'status.noMatches': 'No matches.',
  'status.results': (n: number) => `${n} result${n === 1 ? '' : 's'}.`,
  'status.searchFailed': 'Search failed.',
  'status.geoUnsupported': 'Geolocation is not supported by this browser.',
  'status.finding': 'Finding your location…',
  'status.notFound': 'No address found within 5 km.',
  'status.nearest': 'Nearest building to your location.',
  'status.reverseFailed': 'Reverse geocode failed.',
  'status.denied': 'Location permission denied.',
  'status.unavailable': 'Position unavailable.',
  'status.timeout': 'Finding your location timed out.',
  'status.geoError': (msg: string) => `Could not get your location (${msg}).`,
  'toast.coordsCopied': 'Coordinates copied.',
  'toast.linkCopied': 'Link copied to clipboard.',
  'toast.noCoords': 'No coordinates for this address.',
  'toast.noAddress': 'No address found within 5 km.',
};

const AR: Dict = {
  'app.name': 'البحث عن عنوان البحرين',
  'hero.subtitle': 'اعثر على أي عنوان، شارك رابط الخريطة، أو حدد موقعك الحالي — فوراً.',
  'search.placeholder': 'ابحث عن مبنى أو طريق أو مجمع أو منطقة…',
  'search.placeholderShort': 'بحث…',
  'section.recent': 'الأخيرة',
  'section.saved': 'المحفوظة',
  'locate': 'حَدِّد موقعي',
  'clear': 'مسح',
  'theme.toggle': 'تبديل السمة',
  'lang.toggle': 'تبديل اللغة',
  'result.share': 'مشاركة',
  'result.copyCoords': 'نسخ الإحداثيات',
  'result.googleMaps': 'خرائط Google',
  'result.directions': 'الاتجاهات',
  'result.save': 'حفظ العنوان',
  'result.remove': 'إزالة من المحفوظة',
  'empty.noMatch': 'لا توجد عناوين تطابق بحثك.',
  'empty.noResult': 'لا يوجد مبنى مسجّل ضمن 5 كم من إحداثياتك.',
  'status.searching': 'جارٍ البحث…',
  'status.noMatches': 'لا توجد نتائج.',
  'status.results': (n: number) => `${n} نتيجة${n === 1 ? '' : 'ت'}.`,
  'status.searchFailed': 'فشل البحث.',
  'status.geoUnsupported': 'المتصفح لا يدعم تحديد الموقع الجغرافي.',
  'status.finding': 'جارٍ تحديد موقعك…',
  'status.notFound': 'لا يوجد عنوان ضمن 5 كم.',
  'status.nearest': 'أقرب مبنى إلى موقعك.',
  'status.reverseFailed': 'فشل تحديد العنوان من الإحداثيات.',
  'status.denied': 'تم رفض إذن الموقع.',
  'status.unavailable': 'الموقع غير متوفر.',
  'status.timeout': 'انتهت مهلة تحديد الموقع.',
  'status.geoError': (msg: string) => `تعذّر تحديد موقعك (${msg}).`,
  'toast.coordsCopied': 'تم نسخ الإحداثيات.',
  'toast.linkCopied': 'تم نسخ الرابط إلى الحافظة.',
  'toast.noCoords': 'لا إحداثيات لهذا العنوان.',
  'toast.noAddress': 'لا يوجد عنوان ضمن 5 كم.',
};

const TABLE: Record<Lang, Dict> = { en: EN, ar: AR };

/** Translate a key for the active language. Functions receive args (e.g. count). */
export function t(key: string, ...args: unknown[]): string {
  const entry = TABLE[loadLang()][key];
  if (entry === undefined) return key;
  return typeof entry === 'function' ? (entry as (...a: unknown[]) => string)(...args) : entry;
}
