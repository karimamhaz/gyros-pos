import re
import unicodedata

_FOLD = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ة": "ه", "ى": "ي", "ـ": ""})


def normalise(name: str) -> str:
    """Spelling-insensitive form, so لحمة and لحمه count as the same name."""
    text = unicodedata.normalize("NFKC", name).casefold()
    text = "".join(c for c in unicodedata.normalize("NFD", text) if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", text.translate(_FOLD)).strip()
