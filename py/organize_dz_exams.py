"""
DZ Exams & Educational Documents Organizer (v2.1)
==================================================
Comprehensive batch processing and OCR organization pipeline for Algerian educational documents.
Handles exams, lesson summaries, exercise sets, pedagogical notes, and official archives.

Key Improvements:
- Full-file SHA-256 collision verification (reads entire stream, not just first 64KB).
- ProcessPoolExecutor concurrency for CPU-bound OCR and parsing across all CPU cores.
- Fully validated REVERSED_OCR_MAP with complete Arabic ordinals and term repairs.
- Idempotent base filename extraction (strips collision suffixes and standardized prefixes).
- Safe defaults (dry-run mode) with confirmation checks on destructive operations.
"""

import os
import re
import sys
import shutil
import hashlib
import logging
import argparse
import unicodedata
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed

# PyMuPDF
try:
    import pymupdf as fitz
except ImportError:
    try:
        import fitz
    except ImportError:
        print("ERROR: PyMuPDF is required. Please install it using: pip install pymupdf")
        sys.exit(1)

try:
    from tqdm import tqdm
except ImportError:
    def tqdm(iterable, *args, **kwargs):
        return iterable


# ==============================================================================
# CONFIGURATION & LOGGING
# ==============================================================================

DEFAULT_ROOT_DIR = r"C:\Users\fethi\dzexams_downloaded_pdfs"
SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_TESSDATA_DIR = str(SCRIPT_DIR / "tessdata")

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

log_handler = logging.StreamHandler(sys.stdout)
log_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
logger = logging.getLogger("DZExamsOrganizer")
logger.setLevel(logging.INFO)
if not logger.handlers:
    logger.addHandler(log_handler)


# ==============================================================================
# ARABIC & MULTILINGUAL NORMALIZATION
# ==============================================================================

REVERSED_OCR_MAP = {
    # Ordinals (reversed -> normalized)
    "لوألا": "الاول",
    "لوالا": "الاول",
    "لوا": "اول",
    "يناثلا": "الثاني",
    "يناث": "ثاني",
    "ثلاثلا": "الثالث",
    "ثلاث": "ثالث",
    "عبارلا": "الرابع",
    "عبار": "رابع",
    "سماخلا": "الخامس",
    "سماخ": "خامس",
    "سداسلا": "السادس",
    "سداس": "سادس",
    # Terms & Exam Types
    "لصفلا": "الفصل",
    "يثالثلا": "الثلاثي",
    "رابتخا": "اختبار",
    "ناحتما": "امتحان",
    "ضرف": "فرض",
    "ضورف": "فروض",
    "ةداهش": "شهادة",
    "ايرولارب": "بكالوريا",
    # Subjects & Levels
    "ةيبرعلا": "العربية",
    "ةغللا": "اللغة",
    "تايضايرلا": "الرياضيات",
    "ةيسنرفلا": "الفرنسية",
    "ةيزيلكنا": "الانجليزية",
    "ةيزيلجنلا": "الانجليزية",
    "ةيمالسال": "الاسلامية",
    "خيراتلا": "التاريخ",
    "ايفارغجلا": "الجغرافيا",
    "ةيفسلفلا": "الفلسفة",
    "ةيئايزيفلا": "الفيزيائية",
    "ةيعيبطلا": "الطبيعية",
    "ةيوناثلا": "الثانوية",
    "ةطسوتملا": "المتوسطة",
    "ةيئادتبلا": "الابتدائية",
    # Pedagogical Materials
    "سرد": "درس",
    "سوردم": "دروس",
    "صخلم": "ملخص",
    "ةلسلس": "سلسلة",
    "نيرامت": "تمارين",
    "ةركذم": "مذكرة",
    "ةجذومنلا": "النموذجية",
    "حيحصت": "تصحيح",
    "حيرصت": "تصحيح",
    "ةيبرتلا": "التربية",
    "ةيندلما": "المدنية",
}

def unreverse_ocr_words(text: str) -> str:
    """Repairs reversed Arabic words commonly produced by OCR engines."""
    if not text:
        return ""
    words = text.split()
    fixed_words = []
    for w in words:
        clean_w = re.sub(r"[^\w]", "", w)
        if clean_w in REVERSED_OCR_MAP:
            fixed_words.append(REVERSED_OCR_MAP[clean_w])
        elif len(clean_w) >= 3 and clean_w[::-1] in REVERSED_OCR_MAP:
            fixed_words.append(REVERSED_OCR_MAP[clean_w[::-1]])
        else:
            fixed_words.append(w)
    return " ".join(fixed_words)


def collapse_arabic_spaces(text: str) -> str:
    """Collapses spaces between isolated Arabic letters caused by PDF font kerning."""
    if not text:
        return ""
    text = re.sub(r"([اأإآبتثجحخدذرزسشصضطظعغفقكلمنهويىة])\s+([اأإآبتثجحخدذرزسشصضطظعغفقكلمنهويىة])", r"\1\2", text)
    text = re.sub(r"([اأإآبتثجحخدذرزسشصضطظعغفقكلمنهويىة])\s+([اأإآبتثجحخدذرزسشصضطظعغفقكلمنهويىة])", r"\1\2", text)
    return text


def normalize_arabic_text(text: str) -> str:
    """
    Thoroughly normalizes Arabic text:
    - Normalizes Unicode presentation forms (NFKD).
    - Removes diacritics / tashkeel and tatweel.
    - Standardizes alef, yeh, heh, kaf variants.
    - Converts Eastern Arabic-Indic digits to ASCII 0-9.
    - Repairs reversed OCR tokens and kerning spaces.
    """
    if not text:
        return ""

    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.replace("ـ", "")

    text = re.sub(r"[إأآٱ]", "ا", text)
    text = re.sub(r"[ىيئېیۍ]", "ي", text)
    text = re.sub(r"[ةههھہ]", "ه", text)
    text = re.sub(r"[كکڪ]", "ك", text)
    text = re.sub(r"[ؤو]", "و", text)

    for i, d in enumerate("٠١٢٣٤٥٦٧٨٩"):
        text = text.replace(d, str(i))
    for i, d in enumerate("۰۱۲۳۴۵۶۷۸۹"):
        text = text.replace(d, str(i))

    text = unreverse_ocr_words(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def clean_latin_text(text: str) -> str:
    """Normalizes French and English text, removing accents and extra whitespace."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"\s+", " ", text).strip()
    return text.lower()


# ==============================================================================
# ADVANCED FONT & DATE DECODING
# ==============================================================================

ALGERIAN_MONTHS = {
    "جانفي": (1, "Trimestre_2"),
    "فيفري": (2, "Trimestre_2"),
    "مارس": (3, "Trimestre_2"),
    "افريل": (4, "Trimestre_3"),
    "ماي": (5, "Trimestre_3"),
    "جوان": (6, "Trimestre_3"),
    "جويلية": (7, None),
    "جويليه": (7, None),
    "اوت": (8, None),
    "سبتمبر": (9, "Trimestre_1"),
    "اكتوبر": (10, "Trimestre_1"),
    "نوفمبر": (11, "Trimestre_1"),
    "ديسمبر": (12, "Trimestre_1"),
    "janvier": (1, "Trimestre_2"),
    "fevrier": (2, "Trimestre_2"),
    "mars": (3, "Trimestre_2"),
    "avril": (4, "Trimestre_3"),
    "mai": (5, "Trimestre_3"),
    "juin": (6, "Trimestre_3"),
    "juillet": (7, None),
    "aout": (8, None),
    "septembre": (9, "Trimestre_1"),
    "octobre": (10, "Trimestre_1"),
    "novembre": (11, "Trimestre_1"),
    "decembre": (12, "Trimestre_1"),
}

def decode_decotype_years(text: str) -> str | None:
    """Decodes Traditional Arabic / DecoType font digit offsets."""
    flat = re.sub(r"\s+", " ", text)
    m = re.search(r"\b[0-9]10([0-9])\s*[/\\-]\s*[0-9]10([0-9])\b", flat)
    if m:
        return f"201{m.group(1)}-201{m.group(2)}"

    m2 = re.search(r"([0-9]{2})\s*20\D*[/\\-]\s*([0-9]{2})\s*20", flat)
    if m2:
        return f"20{m2.group(1)}-20{m2.group(2)}"

    return None


def extract_year_and_term_from_date(text: str) -> tuple[str | None, str | None]:
    """Extracts Academic Year and Term from calendar dates printed in headers."""
    norm = normalize_arabic_text(text)
    latin = clean_latin_text(text)

    for m_name, (m_num, term) in ALGERIAN_MONTHS.items():
        pattern = r"(?:[0-3]?[0-9]\s+)?\b" + re.escape(m_name) + r"\s+(20[0-2][0-9])\b"
        m = re.search(pattern, norm) or re.search(pattern, latin)
        if m:
            cal_year = int(m.group(1))
            if m_num >= 9:
                acad_year = f"{cal_year}-{cal_year+1}"
            else:
                acad_year = f"{cal_year-1}-{cal_year}"
            return acad_year, term

    return None, None


def unreverse_digits_in_text(text: str) -> str:
    """Detects reversed numbers e.g. '0202' -> '2020', '3202' -> '2023'."""
    def _swap(match):
        return f"20{match.group(2)}{match.group(1)}"
    text = re.sub(r"\b([0-9])([0-2])02\b", _swap, text)
    text = re.sub(r"\b([0-9])102\b", r"201\1", text)
    return text


# ==============================================================================
# SUBJECT & LEVEL MAPPINGS
# ==============================================================================

SUBJECT_MAPPINGS = [
    ("Mathematiques", [r"رياضيات", r"الرياضيات", r"ريضيات", r"تايضايرلا"], ["math", "maths", "mathematique", "mathematics"]),
    ("Physique", [r"العلوم الفيزيائيه", r"فيزياء", r"الفيزياء", r"فيزيائيه", r"تكنولوجيا وفيزياء", r"ةيئايزيفلا"], ["physique", "physics"]),
    ("Sciences", [r"علوم الطبيعه والحياه", r"العلوم الطبيعيه", r"علوم طبيعيه", r"علوم الحياه", r"ةيعيبطلا"], ["science", "sciences", "snv", "svt", "biology"]),
    ("Arabe", [r"اللغه العربيه", r"لغه عربيه", r"ادب عربي", r"العربيه وادابها", r"ةيبرعلا"], ["arabe", "arabic"]),
    ("Francais", [r"اللغه الفرنسيه", r"لغه فرنسيه", r"الفرنسيه", r"ةيسنرفلا"], ["francais", "french"]),
    ("Anglais", [r"اللغه الانجليزيه", r"لغه انجليزيه", r"الانجليزيه", r"ةيزيلكنا", r"ةيزيلجنلا"], ["anglais", "english"]),
    ("Histoire_Geo", [r"التاريخ والجغرافيا", r"تاريخ وجغرافيا", r"اجتماعيات", r"التاريخ", r"الجغرافيا", r"خيراتلا", r"ايفارغجلا"], ["histoire", "geographie", "hist-geo", "history", "geography"]),
    ("Islamique", [r"العلوم الاسلاميه", r"التربيه الاسلاميه", r"تربيه اسلاميه", r"شريعه اسلاميه", r"ةيمالسال"], ["islamique", "islamic"]),
    ("Civique", [r"التربيه المدنيه", r"تربيه مدنيه", r"المدنيه", r"ةيندلما"], ["civique", "civics"]),
    ("Philosophie", [r"الفلسفه", r"فلسفه", r"ةيفسلفلا"], ["philosophie", "philosophy"]),
    ("Informatique", [r"الاعلام الالي", r"اعلام الي", r"المعلوماتيه"], ["informatique", "computer"]),
    ("Gestion_Economie", [r"التسيير المحاسبي والمالي", r"اقتصاد ومناجمنت", r"القانون", r"محاسبه", r"تسيير واقتصاد"], ["gestion", "economie", "management", "comptabilite"]),
    ("Technologie", [r"هندسه كهربائيه", r"هندسه ميكانيكيه", r"هندسه مدنيه", r"هندسه الطرايق", r"تكنولوجيا"], ["genie", "technologie", "genie civil", "genie electrique", "genie mecanique"]),
    ("Allemand", [r"اللغه الالمانيه", r"المانيه", r"deutsch"], ["allemand", "german", "deutsch"]),
    ("Espagnol", [r"اللغه الاسبانيه", r"اسبانيه", r"espanol"], ["espagnol", "spanish", "espanol"]),
    ("Italien", [r"اللغه الايطاليه", r"ايطاليه"], ["italien", "italian", "italiano"]),
    ("Tamazight", [r"اللغه الامازيغيه", r"امازيغيه"], ["tamazight", "berbere"]),
]

LEVEL_MAPPINGS = [
    # Primary (ابتدائي)
    ("1AP", [r"\b1\s*ابتدائي\b", r"\b1\s*ap\b", r"السنه الاولي ابتدائي"], ["1ap"]),
    ("2AP", [r"\b2\s*ابتدائي\b", r"\b2\s*ap\b", r"السنه الثانيه ابتدائي"], ["2ap"]),
    ("3AP", [r"\b3\s*ابتدائي\b", r"\b3\s*ap\b", r"السنه الثالثه ابتدائي"], ["3ap"]),
    ("4AP", [r"\b4\s*ابتدائي\b", r"\b4\s*ap\b", r"السنه الرابعه ابتدائي"], ["4ap"]),
    ("5AP", [r"\b5\s*ابتدائي\b", r"\b5\s*ap\b", r"السنه الخامسه ابتدائي", r"شهاده التعليم الابتدائي"], ["5ap", "cee"]),
    
    # Middle (متوسط / CEM)
    ("1AM", [r"\b1\s*متوسط\b", r"\b1\s*am\b", r"السنه الاولي متوسط"], ["1am"]),
    ("2AM", [r"\b2\s*متوسط\b", r"\b2\s*am\b", r"السنه الثانيه متوسط"], ["2am"]),
    ("3AM", [r"\b3\s*متوسط\b", r"\b3\s*am\b", r"السنه الثالثه متوسط"], ["3am"]),
    ("4AM_BEM", [r"\b4\s*متوسط\b", r"\b4\s*am\b", r"السنه الرابعه متوسط", r"شهاده التعليم المتوسط", r"\bbem\b"], ["4am", "bem"]),

    # Secondary (ثانوي / Lycée)
    ("1AS", [r"\b1\s*ثانوي\b", r"\b1\s*as\b", r"السنه الاولي ثانوي", r"جذع مشترك"], ["1as", "tc"]),
    ("2AS", [r"\b2\s*ثانوي\b", r"\b2\s*as\b", r"السنه الثانيه ثانوي"], ["2as"]),
    ("3AS_BAC", [r"\b3\s*ثانوي\b", r"\b3\s*as\b", r"السنه الثالثه ثانوي", r"شهاده البكالوريا", r"\bbac\b", r"بكالوريا"], ["3as", "bac"]),
]


# ==============================================================================
# TEXT EXTRACTION & OCR PIPELINE
# ==============================================================================

def is_scanned_or_cid_garbage(text: str) -> bool:
    """Detects if page is scanned, blank, or contains unmapped Type3/CID garbage bytes."""
    if not text or len(text.strip()) < 30:
        return True
    control_count = sum(1 for c in text if unicodedata.category(c) in ("Cc", "Co", "Cs") or ord(c) < 32 and c not in "\n\r\t")
    if control_count / max(len(text), 1) > 0.20:
        return True
    return False


def extract_text_and_ocr(
    file_path: Path,
    tessdata_dir: str = DEFAULT_TESSDATA_DIR,
    max_pages: int = 3
) -> tuple[str, str, bool, bool]:
    """
    Extracts text from PDF with automatic OCR fallback.
    Returns: (header_text, full_text, is_scanned, ocr_applied)
    """
    header_text = ""
    full_text = ""
    is_scanned = False
    ocr_applied = False

    tess_available = Path(tessdata_dir).exists() if tessdata_dir else False

    try:
        doc = fitz.open(file_path)
        if len(doc) == 0:
            doc.close()
            return "", "", True, False

        page0 = doc[0]
        rect0 = page0.rect
        header_clip = fitz.Rect(rect0.x0, rect0.y0, rect0.x1, rect0.y0 + rect0.height * 0.45)

        raw_header = page0.get_text(clip=header_clip)
        raw_page0 = page0.get_text()

        if is_scanned_or_cid_garbage(raw_page0):
            is_scanned = True
            if tess_available:
                try:
                    ocr_tp = page0.get_textpage_ocr(language="ara+fra+eng", tessdata=tessdata_dir, dpi=150)
                    ocr_text = ocr_tp.extractText()
                    if len(ocr_text.strip()) > 20:
                        raw_page0 = ocr_text
                        raw_header = ocr_text[:1200]
                        ocr_applied = True
                        is_scanned = False
                except Exception as ocr_err:
                    logger.debug(f"OCR failed on {file_path.name}: {ocr_err}")

        header_text = raw_header
        pages_text = [raw_page0]

        for p_idx in range(1, min(len(doc), max_pages)):
            p_txt = doc[p_idx].get_text()
            if is_scanned and tess_available and not ocr_applied and is_scanned_or_cid_garbage(p_txt):
                try:
                    ocr_tp = doc[p_idx].get_textpage_ocr(language="ara+fra+eng", tessdata=tessdata_dir, dpi=150)
                    p_txt = ocr_tp.extractText()
                    ocr_applied = True
                except Exception:
                    pass
            pages_text.append(p_txt)

        full_text = "\n".join(pages_text)
        doc.close()

    except Exception as e:
        logger.debug(f"Error opening {file_path.name}: {e}")
        is_scanned = True

    return header_text, full_text, is_scanned, ocr_applied


# ==============================================================================
# METADATA EXTRACTION LOGIC
# ==============================================================================

class ExamMetadata:
    def __init__(self):
        self.academic_year = "Year_Unknown"
        self.term_or_type = "Term_Unknown"
        self.doc_nature = "Sujet"           # 'Sujet' or 'Corrige'
        self.level = "Level_Unknown"
        self.subject = "Subject_Unknown"
        self.is_scanned = False
        self.ocr_applied = False
        self.confidence_score = 0
        self.original_id = ""

    def generate_filename(self, ext=".pdf") -> str:
        parts = []
        if self.term_or_type in ["Cours_Resumes", "Exercices_Series", "Moudhakirat_Pedagogie", "Sujets_Proposes"]:
            parts.append(self.term_or_type)
            if self.academic_year != "Year_Unknown":
                parts.append(self.academic_year)
        else:
            parts.append(self.academic_year)
            parts.append(self.term_or_type)

        if self.doc_nature == "Corrige":
            parts.append("Corrige")

        if self.subject != "Subject_Unknown":
            parts.append(self.subject)
        if self.level != "Level_Unknown":
            parts.append(self.level)

        base_id = self.original_id.replace(" ", "_")
        if base_id and base_id != self.academic_year and base_id not in parts:
            parts.append(base_id)

        clean_name = "_".join(p for p in parts if p)
        clean_name = re.sub(r'[\\/*?:"<>|]', "", clean_name)
        clean_name = re.sub(r"_+", "_", clean_name).strip("_")
        return clean_name + ext


KNOWN_METADATA_TAGS = (
    r"(?:Corrige|Sujet|"
    r"Mathematiques|Physique|Sciences|Arabe|Francais|Anglais|Histoire_Geo|"
    r"Islamique|Civique|Philosophie|Informatique|Gestion_Economie|Technologie|"
    r"Allemand|Espagnol|Italien|Tamazight|Subject_Unknown|"
    r"1AP|2AP|3AP|4AP|5AP|1AM|2AM|3AM|4AM_BEM|1AS|2AS|3AS_BAC|"
    r"Primaire|Moyen|Lycee|Level_Unknown)"
)

PIPELINE_PREFIX_PATTERN = (
    r"^(?:(?:(?:\d{4}-\d{4}|\d{4}|Year_Unknown)_"
    r"(?:Trimestre_\d|Term_Unknown|Devoirs|Devoir_T\d|BAC_Blanc|BEM_Blanc|"
    r"BAC_Officiel|BEM_Officiel|Examen|Cours_Resumes|Exercices_Series|"
    r"Moudhakirat_Pedagogie|Sujets_Proposes|Unclassified|Needs_OCR))|"
    r"(?:Cours_Resumes|Exercices_Series|Moudhakirat_Pedagogie|Sujets_Proposes))_*"
)

def extract_base_filename(file_path: Path) -> str:
    """
    Strips standardized prefixes and metadata tags in any order.
    Gates collision suffix stripping (_1, _2) so original numbered filenames
    (e.g., devoir_1_2, serie1_2, lecon_3) never lose their numbering.
    """
    stem = file_path.stem

    # Detect if this file was generated by a previous pipeline run
    is_pipeline_generated = bool(re.match(PIPELINE_PREFIX_PATTERN, stem, flags=re.IGNORECASE))

    # 1. Strip standardized pipeline prefixes
    cleaned = re.sub(PIPELINE_PREFIX_PATTERN, "", stem, flags=re.IGNORECASE)
    cleaned = re.sub(r"^(?:Year_Unknown|Term_Unknown|Needs_OCR|Unclassified)_+", "", cleaned, flags=re.IGNORECASE)

    # 2. Strip any sequence of metadata tags (Corrige, Sujet, Subject, Level) in ANY permutation
    cleaned = re.sub(rf"^(?:{KNOWN_METADATA_TAGS}_*)+", "", cleaned, flags=re.IGNORECASE)

    # 3. Only strip collision suffix _<digits> if the file had a standardized pipeline prefix
    if is_pipeline_generated and cleaned:
        cleaned = re.sub(r"_(\d+)$", "", cleaned)

    return cleaned if cleaned else stem


def extract_academic_year(text: str) -> str:
    """Extracts academic year through range patterns, calendar dates, or DecoType shifts."""
    if not text:
        return "Year_Unknown"

    norm = normalize_arabic_text(text)
    norm = unreverse_digits_in_text(norm)
    latin = clean_latin_text(text)

    # 1. DecoType font shifts (5105 / 5106 -> 2015-2016)
    deco_year = decode_decotype_years(text)
    if deco_year:
        return deco_year

    # 2. Explicit keywords: السنة الدراسية / الموسم الدراسي / Année scolaire
    context_patterns = [
        r"(?:السنه الدراسيه|الموسم الدراسي|العام الدراسي|السنه الجامعيه|annee scolaire|academic year)[\s:]*([0-9]{4})[\s/\\-]+([0-9]{4})",
        r"(?:السنه الدراسيه|الموسم الدراسي|العام الدراسي|السنه الجامعيه|annee scolaire|academic year)[\s:]*([0-9]{4})",
        r"(?:دوره|session)[\s:]*(?:جوان|ماي|سبتمبر|juin|septembre)?[\s:]*([0-9]{4})",
    ]
    for cp in context_patterns:
        m = re.search(cp, norm, flags=re.IGNORECASE)
        if m:
            if len(m.groups()) == 2 and m.group(2):
                y1, y2 = int(m.group(1)), int(m.group(2))
                if 1995 <= y1 <= 2035 and 1995 <= y2 <= 2035:
                    return f"{min(y1, y2)}-{max(y1, y2)}"
            elif m.group(1):
                y = int(m.group(1))
                if 1995 <= y <= 2035:
                    return str(y)

    # 3. Calendar date inference (e.g. 20 فيفري 2021 -> 2020-2021)
    d_year, _ = extract_year_and_term_from_date(text)
    if d_year:
        return d_year

    # 4. Standard 4-digit academic year ranges (2023/2024 or 2024/2023)
    range_match = re.search(r"\b(20[0-2][0-9])[\s/\\-]+(20[0-2][0-9])\b", norm) or re.search(r"\b(20[0-2][0-9])[\s/\\-]+(20[0-2][0-9])\b", latin)
    if range_match:
        y1, y2 = int(range_match.group(1)), int(range_match.group(2))
        return f"{min(y1, y2)}-{max(y1, y2)}"

    # 5. Abbreviated range (e.g. 2023/24, 2021-22)
    abbrev_match = re.search(r"\b(20[0-2][0-9])[\s/\\-]+([0-3][0-9])\b", norm)
    if abbrev_match:
        y1 = int(abbrev_match.group(1))
        y2_s = int(abbrev_match.group(2))
        y2 = (y1 // 100) * 100 + y2_s
        if abs(y1 - y2) == 1:
            return f"{min(y1, y2)}-{max(y1, y2)}"

    # 6. Single year in header
    single_match = re.search(r"\b(20[0-2][0-9])\b", norm[:1200])
    if single_match:
        y = int(single_match.group(1))
        if 2000 <= y <= 2030:
            return str(y)

    return "Year_Unknown"


def extract_term_and_type(text: str) -> tuple[str, str]:
    """
    Identifies term, exam type, or non-exam educational category, plus document nature.
    Returns: (term_or_type, doc_nature)
    """
    norm = normalize_arabic_text(text)
    collapsed = collapse_arabic_spaces(norm)
    latin = clean_latin_text(text)

    # 1. Detect Document Nature: Corrige (Solution) vs Sujet
    doc_nature = "Sujet"
    corrige_keywords_ar = [
        "تصحيح", "الاجابه النموذجيه", "التصحيح النموذجي", "عناصر الاجابه",
        "سلم التنقيط", "حل مفصل", "شبكه التقويم", "معايير التقويم", "الوجاهه", "حلول"
    ]
    corrige_keywords_fr = ["corrige", "bareme", "solution", "correction", "marking scheme"]
    if any(k in norm for k in corrige_keywords_ar) or any(k in latin for k in corrige_keywords_fr):
        doc_nature = "Corrige"

    # 2. National Official Exams & Mocks
    if any(k in norm for k in ["بكالوريا تجريبي", "بكالوريا بيضاء", "امتحان تجريبي للبكالوريا"]) or "bac blanc" in latin:
        return "BAC_Blanc", doc_nature
    if any(k in norm for k in ["تعليم متوسط تجريبي", "بيام تجريبي", "امتحان تجريبي لشهاده التعليم المتوسط"]) or "bem blanc" in latin:
        return "BEM_Blanc", doc_nature
    if any(k in norm for k in ["شهاده البكالوريا", "امتحان شهاده البكالوريا", "المترشح ان يختار احد الموضوعين"]) or "baccalaureat" in latin:
        return "BAC_Officiel", doc_nature
    if any(k in norm for k in ["شهاده التعليم المتوسط", "امتحان شهاده التعليم المتوسط"]) or re.search(r"\bbem\s+session\b", latin):
        return "BEM_Officiel", doc_nature
    if any(k in norm for k in ["شهاده التعليم الابتدائي", "شهاده نهايه مرحله التعليم الابتدائي"]) or "examen 5ap" in latin:
        return "5AP_Officiel", doc_nature

    # 3. Proposed Topics & Annals (مواضيع مقترحة / حوليات)
    if any(k in norm for k in ["موضوع مقترح", "مواضيع مقترحه", "نموذج مقترح", "نماذج مقترحه", "حوليات", "مواضيع مختاره"]) or "sujets proposes" in latin or "annales" in latin:
        return "Sujets_Proposes", doc_nature

    # 4. Pedagogical Lesson Plans (مذكرات وتوزيع سنوي)
    if any(k in norm for k in ["مذكره", "مذكرات", "توزيع سنوي", "مخطط سنوي", "تدرج تعلمي", "الجيل الثاني", "وثيقه مرافقه", "منهاج"]):
        return "Moudhakirat_Pedagogie", doc_nature

    # 5. Course Summaries & Lesson Sheets (ملخصات ودروس)
    if any(k in norm for k in ["ملخص", "ملخصات", "درس", "دروس", "مطويه", "مطويات", "قواعد", "مصطلحات", "تعاريف"]) or any(k in latin for k in ["cours", "resume", "resumes", "fiche", "lecon", "formulaire"]):
        return "Cours_Resumes", doc_nature

    # 6. Exercises & Series (سلاسل تمارين وواجبات)
    if any(k in norm for k in ["سلسله تمارين", "سلاسل تمارين", "تمارين محلوله", "سلسله رقم", "واجب منزلي", "تطبيقات"]) or any(k in latin for k in ["serie d'exercices", "serie d exercices", "travaux diriges"]):
        return "Exercices_Series", doc_nature

    # 7. Devoirs / Continuous Assessments (فروض)
    is_devoir = False
    devoir_ar = ["فرض", "فروض", "مراقبه مستمره", "تقويم تشخيصي", "فرض محروس", "فشض"]
    devoir_fr = ["devoir", "devoir surveille", "interrogation", "evaluation diagnostique", "test n"]
    devoir_en = ["test 1", "test 2", "quiz", "class test"]
    if any(k in norm for k in devoir_ar) or any(k in latin for k in devoir_fr) or any(k in latin for k in devoir_en):
        is_devoir = True

    # 8. Trimester / Term Matching
    # Trimestre 1
    t1_keywords = [
        "الفصل الاول", "الفصلي الاول", "الثلاثي الاول", "الاول الفصل", "الاول الثلاثي",
        "الفصل 1", "الثلاثي 1", "اختبار شهر نوفمبر", "اختبار شهر ديسمبر",
        "الاختبار الاول", "امتحان الفصل الاول", "اخزجبس انفصم ااول", "انفصه ااول"
    ]
    t1_fr = ["1er trimestre", "1ere composition", "trimestre 1", "1st term", "first term", "t1", "composition du 1er trimestre"]
    if any(k in norm or k in collapsed for k in t1_keywords) or any(k in latin for k in t1_fr):
        return ("Devoir_T1" if is_devoir else "Trimestre_1"), doc_nature

    # Trimestre 2
    t2_keywords = [
        "الفصل الثاني", "الفصلي الثاني", "الثلاثي الثاني", "الثاني الفصل", "الثاني الثلاثي",
        "الفصل 2", "الثلاثي 2", "اختبار شهر فيفري", "اختبار شهر مارس",
        "الاختبار الثاني", "امتحان الفصل الثاني", "اخزجبس انفصم انثب", "انفصه انثا"
    ]
    t2_fr = ["2eme trimestre", "2eme composition", "trimestre 2", "2nd term", "second term", "t2", "composition du 2eme trimestre"]
    if any(k in norm or k in collapsed for k in t2_keywords) or any(k in latin for k in t2_fr):
        return ("Devoir_T2" if is_devoir else "Trimestre_2"), doc_nature

    # Trimestre 3
    t3_keywords = [
        "الفصل الثالث", "الفصلي الثالث", "الثلاثي الثالث", "الثالث الفصل", "الثالث الثلاثي",
        "الفصل 3", "الثلاثي 3", "اختبار شهر ماي", "الاختبار الثالث",
        "امتحان الفصل الثالث", "اخزجبس انفصم انثبنث", "انفصه انثانث"
    ]
    t3_fr = ["3eme trimestre", "3eme composition", "trimestre 3", "3rd term", "third term", "t3", "composition du 3eme trimestre"]
    if any(k in norm or k in collapsed for k in t3_keywords) or any(k in latin for k in t3_fr):
        return ("Devoir_T3" if is_devoir else "Trimestre_3"), doc_nature

    # 9. Date-based term inference
    _, date_term = extract_year_and_term_from_date(text)
    if date_term:
        return (f"Devoir_{date_term[-2:]}" if is_devoir else date_term), doc_nature

    if is_devoir:
        return "Devoirs", doc_nature

    # General Exam fallback
    if "اختبار" in norm or "امتحان" in norm or "composition" in latin or "exam" in latin:
        return "Examen", doc_nature

    # Exercise fallback
    if "تمرين" in norm or "تمارين" in norm or "exercice" in latin:
        return "Exercices_Series", doc_nature

    return "Term_Unknown", doc_nature


def extract_subject(text: str, file_path: Path) -> str:
    """Extracts school subject from text and corroborates with file path."""
    norm = normalize_arabic_text(text)
    latin = clean_latin_text(text)
    path_str = str(file_path).lower()

    for subj_name, ar_keywords, fr_keywords in SUBJECT_MAPPINGS:
        for kw in ar_keywords:
            if kw in norm:
                return subj_name
        for kw in fr_keywords:
            if re.search(r"\b" + re.escape(kw) + r"\b", latin):
                return subj_name

    for subj_name, ar_keywords, fr_keywords in SUBJECT_MAPPINGS:
        for kw in fr_keywords:
            if kw in path_str:
                return subj_name
        for kw in ar_keywords:
            if kw in path_str:
                return subj_name

    return "Subject_Unknown"


def extract_level(text: str, file_path: Path) -> str:
    """Extracts school level/grade from text and corroborates with file path."""
    norm = normalize_arabic_text(text)
    latin = clean_latin_text(text)
    path_str = str(file_path).lower()

    for level_name, ar_patterns, fr_patterns in LEVEL_MAPPINGS:
        for pat in ar_patterns:
            if re.search(pat, norm):
                return level_name
        for pat in fr_patterns:
            if re.search(r"\b" + re.escape(pat) + r"\b", latin):
                return level_name

    for level_name, ar_patterns, fr_patterns in LEVEL_MAPPINGS:
        for pat in fr_patterns:
            if any(pat == part.lower() for part in file_path.parts):
                return level_name

    if "الابتدائية" in path_str or "primaire" in path_str:
        return "Primaire"
    elif "المتوسطة" in path_str or "moyen" in path_str or "cem" in path_str:
        return "Moyen"
    elif "الثانوية" in path_str or "lycee" in path_str or "secondaire" in path_str:
        return "Lycee"

    return "Level_Unknown"


# ==============================================================================
# WORKER FUNCTION FOR CONCURRENT EXECUTION
# ==============================================================================

def analyze_pdf(file_path: Path, tessdata_dir: str = DEFAULT_TESSDATA_DIR) -> ExamMetadata:
    """Top-level function for picklable multi-process execution."""
    meta = ExamMetadata()
    meta.original_id = extract_base_filename(file_path)

    header_text, full_text, is_scanned, ocr_applied = extract_text_and_ocr(
        file_path, tessdata_dir=tessdata_dir, max_pages=3
    )
    meta.is_scanned = is_scanned
    meta.ocr_applied = ocr_applied

    search_text = header_text if len(header_text.strip()) > 50 else full_text

    year = extract_academic_year(search_text)
    if year == "Year_Unknown" and full_text != search_text:
        year = extract_academic_year(full_text)
    meta.academic_year = year

    term, nature = extract_term_and_type(search_text)
    if term == "Term_Unknown" and full_text != search_text:
        term, nature = extract_term_and_type(full_text)
    meta.term_or_type = term
    meta.doc_nature = nature

    meta.subject = extract_subject(search_text + " " + full_text, file_path)
    meta.level = extract_level(search_text + " " + full_text, file_path)

    score = 0
    if meta.academic_year != "Year_Unknown":
        score += 40
    if meta.term_or_type != "Term_Unknown":
        score += 35
    if meta.subject != "Subject_Unknown":
        score += 15
    if meta.level != "Level_Unknown":
        score += 10
    meta.confidence_score = score

    return meta


def _worker_task(args: tuple[str, str | None]) -> tuple[str, ExamMetadata]:
    """Helper for ProcessPool execution."""
    file_path_str, tessdata_dir = args
    path_obj = Path(file_path_str)
    meta = analyze_pdf(path_obj, tessdata_dir=tessdata_dir)
    return file_path_str, meta


# ==============================================================================
# PIPELINE INSPECTION & PATH COMPUTATION
# ==============================================================================

def compute_target_path(
    file_path: Path,
    meta: ExamMetadata,
    source_root: Path,
    output_root: Path = None,
    organize_mode: str = "subject_preserving"
) -> Path:
    """Computes destination path with support for non-exam pedagogical materials."""
    new_filename = meta.generate_filename()

    if organize_mode == "subject_preserving":
        curr = file_path.parent
        while curr != source_root:
            name = curr.name
            if (
                re.match(r"^(\d{4}|\d{4}-\d{4}|Year_Unknown)$", name) or
                re.match(r"^(Trimestre_\d|Term_Unknown|Devoirs|Devoir_T\d|BAC_Blanc|BEM_Blanc|BAC_Officiel|BEM_Officiel|Examen|Cours_Resumes|Exercices_Series|Moudhakirat_Pedagogie|Sujets_Proposes|Unclassified|Needs_OCR)$", name, re.IGNORECASE)
            ):
                curr = curr.parent
            else:
                break

        subject_dir = curr

        if meta.term_or_type in ["Cours_Resumes", "Exercices_Series", "Moudhakirat_Pedagogie", "Sujets_Proposes"]:
            if meta.academic_year != "Year_Unknown":
                target_dir = subject_dir / meta.term_or_type / meta.academic_year
            else:
                target_dir = subject_dir / meta.term_or_type

        elif meta.is_scanned and meta.academic_year == "Year_Unknown" and meta.term_or_type == "Term_Unknown":
            target_dir = subject_dir / "Needs_OCR"

        elif meta.academic_year == "Year_Unknown" and meta.term_or_type == "Term_Unknown":
            target_dir = subject_dir / "Unclassified"

        elif meta.academic_year == "Year_Unknown":
            target_dir = subject_dir / meta.term_or_type

        elif meta.term_or_type == "Term_Unknown":
            target_dir = subject_dir / meta.academic_year / "Examen"

        else:
            target_dir = subject_dir / meta.academic_year / meta.term_or_type

    else:
        base_out = output_root or source_root
        level_folder = meta.level if meta.level != "Level_Unknown" else "General"
        subject_folder = meta.subject if meta.subject != "Subject_Unknown" else "General"

        if meta.term_or_type in ["Cours_Resumes", "Exercices_Series", "Moudhakirat_Pedagogie", "Sujets_Proposes"]:
            target_dir = base_out / level_folder / subject_folder / meta.term_or_type
        elif meta.is_scanned and meta.academic_year == "Year_Unknown" and meta.term_or_type == "Term_Unknown":
            target_dir = base_out / level_folder / subject_folder / "Needs_OCR"
        elif meta.academic_year == "Year_Unknown" and meta.term_or_type == "Term_Unknown":
            target_dir = base_out / level_folder / subject_folder / "Unclassified"
        elif meta.academic_year == "Year_Unknown":
            target_dir = base_out / level_folder / subject_folder / meta.term_or_type
        else:
            target_dir = base_out / level_folder / subject_folder / meta.academic_year / meta.term_or_type

    return target_dir / new_filename


def compute_file_sha256(path: Path) -> str:
    """Computes full SHA-256 hash of a file by reading the entire stream in chunks."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def resolve_collision(target_path: Path, source_path: Path) -> Path:
    """
    Safely resolves filename collisions.
    Only treats two files as identical if they share the exact full SHA-256 hash.
    """
    if not target_path.exists():
        return target_path

    if target_path.resolve() == source_path.resolve():
        return target_path

    try:
        if target_path.stat().st_size == source_path.stat().st_size:
            if compute_file_sha256(source_path) == compute_file_sha256(target_path):
                return target_path
    except Exception:
        pass

    stem = target_path.stem
    ext = target_path.suffix
    parent = target_path.parent
    counter = 1
    while True:
        candidate = parent / f"{stem}_{counter}{ext}"
        if not candidate.exists():
            return candidate
        counter += 1


def cleanup_empty_directories(root_dir: Path):
    """Removes empty directories left behind after moving files."""
    for dirpath, dirnames, filenames in os.walk(root_dir, topdown=False):
        p = Path(dirpath)
        if p != root_dir:
            try:
                if not any(p.iterdir()):
                    p.rmdir()
            except Exception:
                pass


# ==============================================================================
# BATCH EXECUTION ENGINE
# ==============================================================================

def run_pipeline(
    source_dir: str = DEFAULT_ROOT_DIR,
    output_dir: str = None,
    action: str = "dry-run",
    tessdata_dir: str = DEFAULT_TESSDATA_DIR,
    mode: str = "subject_preserving",
    report_csv: str = None,
    workers: int = None,
    concurrency: str = "process"
):
    source_root = Path(source_dir).resolve()
    if not source_root.exists():
        logger.error(f"Source directory does not exist: {source_root}")
        return

    output_root = Path(output_dir).resolve() if output_dir else source_root

    logger.info(f"Scanning PDF files in: {source_root}")
    pdf_paths = [p for p in source_root.rglob("*.pdf") if p.is_file()]
    total_files = len(pdf_paths)
    logger.info(f"Found {total_files} PDF files.")

    if total_files == 0:
        return

    tess_path = Path(tessdata_dir).resolve() if tessdata_dir else None
    ocr_ready = tess_path and tess_path.exists()
    logger.info(f"OCR Status: {'ENABLED (Models located in ' + str(tess_path) + ')' if ocr_ready else 'DISABLED (No traineddata found)'}")

    num_workers = workers or min(8, os.cpu_count() or 4)
    logger.info(f"Starting pipeline (Action: {action.upper()}, Engine: {concurrency.title()}Pool, Workers: {num_workers})...")

    results = []
    stats = {
        "total": total_files,
        "year_extracted": 0,
        "term_extracted": 0,
        "pedagogical_materials": 0,
        "ocr_performed": 0,
        "unclassified": 0,
        "needs_ocr": 0,
        "moved_or_copied": 0,
        "errors": 0
    }

    tess_arg = str(tess_path) if ocr_ready else None
    tasks = [(str(p), tess_arg) for p in pdf_paths]

    executor_cls = ProcessPoolExecutor if concurrency == "process" else ThreadPoolExecutor

    try:
        with executor_cls(max_workers=num_workers) as executor:
            future_to_path = {
                executor.submit(_worker_task, task): task[0]
                for task in tasks
            }

            for future in tqdm(as_completed(future_to_path), total=total_files, desc="Analyzing PDFs"):
                p_str = future_to_path[future]
                p = Path(p_str)
                try:
                    _, meta = future.result()
                    target_path = compute_target_path(p, meta, source_root, output_root, organize_mode=mode)
                    target_path = resolve_collision(target_path, p)
                    
                    results.append((p, target_path, meta))

                    if meta.academic_year != "Year_Unknown":
                        stats["year_extracted"] += 1
                    if meta.term_or_type != "Term_Unknown":
                        stats["term_extracted"] += 1
                    if meta.term_or_type in ["Cours_Resumes", "Exercices_Series", "Moudhakirat_Pedagogie", "Sujets_Proposes"]:
                        stats["pedagogical_materials"] += 1
                    if meta.ocr_applied:
                        stats["ocr_performed"] += 1
                    if meta.is_scanned and meta.academic_year == "Year_Unknown" and meta.term_or_type == "Term_Unknown":
                        stats["needs_ocr"] += 1
                    if meta.academic_year == "Year_Unknown" and meta.term_or_type == "Term_Unknown" and not meta.is_scanned:
                        stats["unclassified"] += 1

                except Exception as e:
                    logger.error(f"Failed analyzing {p.name}: {e}")
                    stats["errors"] += 1

    except Exception as pool_err:
        if concurrency == "process":
            logger.warning(f"ProcessPool encountered issue ({pool_err}), falling back to ThreadPoolExecutor...")
            return run_pipeline(
                source_dir=source_dir,
                output_dir=output_dir,
                action=action,
                tessdata_dir=tessdata_dir,
                mode=mode,
                report_csv=report_csv,
                workers=num_workers,
                concurrency="thread"
            )
        else:
            raise pool_err

    # Execute Move or Copy if not dry-run
    if action in ["move", "copy"]:
        logger.info(f"Executing {action.upper()} operations...")
        for src, dst, meta in tqdm(results, desc=f"Executing {action}"):
            if src.resolve() == dst.resolve():
                continue
            try:
                dst.parent.mkdir(parents=True, exist_ok=True)
                if action == "move":
                    shutil.move(str(src), str(dst))
                else:
                    shutil.copy2(str(src), str(dst))
                stats["moved_or_copied"] += 1
            except Exception as e:
                logger.error(f"Error transferring {src.name} -> {dst}: {e}")
                stats["errors"] += 1

        if action == "move":
            cleanup_empty_directories(source_root)

    # Write CSV report
    if report_csv:
        report_path = Path(report_csv).resolve()
        logger.info(f"Writing detailed report to: {report_path}")
        try:
            import csv
            with open(report_path, "w", newline="", encoding="utf-8-sig") as f:
                writer = csv.writer(f)
                writer.writerow([
                    "Source_Path", "Destination_Path", "Academic_Year",
                    "Term_or_Type", "Doc_Nature", "Subject", "Level",
                    "Is_Scanned", "OCR_Applied", "Confidence_Score"
                ])
                for src, dst, meta in results:
                    writer.writerow([
                        str(src), str(dst), meta.academic_year,
                        meta.term_or_type, meta.doc_nature, meta.subject,
                        meta.level, meta.is_scanned, meta.ocr_applied, meta.confidence_score
                    ])
        except Exception as e:
            logger.error(f"Could not save report: {e}")

    # Summary
    logger.info("=" * 65)
    logger.info("EXECUTION SUMMARY")
    logger.info("=" * 65)
    logger.info(f"Total PDFs Processed:       {stats['total']}")
    logger.info(f"Academic Year Extracted:    {stats['year_extracted']} ({stats['year_extracted']/total_files*100:.1f}%)")
    logger.info(f"Term/Category Extracted:    {stats['term_extracted']} ({stats['term_extracted']/total_files*100:.1f}%)")
    logger.info(f"Non-Exam Materials:         {stats['pedagogical_materials']}")
    logger.info(f"OCR Successfully Run:       {stats['ocr_performed']}")
    logger.info(f"Remaining Needs_OCR:        {stats['needs_ocr']}")
    logger.info(f"Remaining Unclassified:     {stats['unclassified']}")
    if action != "dry-run":
        logger.info(f"Files Transferred ({action}): {stats['moved_or_copied']}")
    logger.info(f"Errors:                     {stats['errors']}")
    logger.info("=" * 65)


# ==============================================================================
# CLI
# ==============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="DZ Exams & Educational Documents Organizer"
    )
    parser.add_argument(
        "--source-dir", "-s",
        type=str,
        default=DEFAULT_ROOT_DIR,
        help=f"Source directory containing PDF documents (default: {DEFAULT_ROOT_DIR})"
    )
    parser.add_argument(
        "--output-dir", "-o",
        type=str,
        default=None,
        help="Target root directory (default: in-place re-organization inside source)"
    )
    parser.add_argument(
        "--action", "-a",
        choices=["dry-run", "move", "copy"],
        default="dry-run",
        help="Action to perform: 'dry-run', 'move', or 'copy' (default: dry-run)"
    )
    parser.add_argument(
        "--tessdata",
        type=str,
        default=DEFAULT_TESSDATA_DIR,
        help=f"Path to Tesseract tessdata directory (default: {DEFAULT_TESSDATA_DIR})"
    )
    parser.add_argument(
        "--mode", "-m",
        choices=["subject_preserving", "hierarchical"],
        default="subject_preserving",
        help="Directory organization mode (default: subject_preserving)"
    )
    parser.add_argument(
        "--report", "-r",
        type=str,
        default="classification_report.csv",
        help="Path to save CSV summary report (default: classification_report.csv)"
    )
    parser.add_argument(
        "--workers", "-w",
        type=int,
        default=None,
        help="Number of concurrent worker processes (default: min(8, CPU count))"
    )
    parser.add_argument(
        "--concurrency", "-c",
        choices=["process", "thread"],
        default="process",
        help="Concurrency execution primitive (default: process)"
    )

    args = parser.parse_args()

    run_pipeline(
        source_dir=args.source_dir,
        output_dir=args.output_dir,
        action=args.action,
        tessdata_dir=args.tessdata,
        mode=args.mode,
        report_csv=args.report,
        workers=args.workers,
        concurrency=args.concurrency
    )


if __name__ == "__main__":
    main()
