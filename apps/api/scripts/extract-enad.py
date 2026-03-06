import json
import re
import sys

from pypdf import PdfReader


def is_number_line(s: str) -> bool:
    s = s.strip()
    if not s:
        return False
    return re.match(r"^-?\d+(?:[.,]\d+)?$", s) is not None


def normalize_number(s: str) -> str:
    s = s.strip().replace(" ", "")
    # Keep only digits, dot, comma and minus.
    s = re.sub(r"[^0-9,.\-]", "", s)
    if not s:
        return s

    # Decide decimal separator by last occurrence.
    last_dot = s.rfind(".")
    last_comma = s.rfind(",")

    if last_dot != -1 and last_comma != -1:
        if last_dot > last_comma:
            decimal = "."
            thousands = ","
        else:
            decimal = ","
            thousands = "."
        s = s.replace(thousands, "")
        s = s.replace(decimal, ".")
        return s

    if last_comma != -1 and last_dot == -1:
        # If only comma, assume decimal if it's the last separator with up to 2 decimals.
        parts = s.split(",")
        if len(parts) == 2 and len(parts[1]) in (1, 2):
            return parts[0].replace(".", "") + "." + parts[1]
        return s.replace(",", "")

    # Only dots or none; remove stray commas.
    return s.replace(",", "")


def extract_pages(pdf_path: str):
    reader = PdfReader(pdf_path)
    pages = []
    for idx, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        pages.append({"page": idx + 1, "text": text})
    return pages


def parse_items(pages):
    lines = []
    for p in pages:
        for raw in (p["text"] or "").splitlines():
            s = (raw or "").replace("\u00A0", " ").strip()
            if s:
                lines.append(s)

    expected_values = {
        14: 2,  # Windows, Linux
        16: 2,  # Windows, Linux
        31: 2,  # Suscripción, Licencia
        20: 4,  # En uso, antigüedad, sin uso, no operativo
    }

    items = []

    current_q = None
    i = 0
    while i < len(lines):
        line = lines[i]

        m_q = re.match(r"^(\d{1,2})\.\s", line)
        if m_q:
            current_q = int(m_q.group(1))
            # Generate options for "Respuesta Sí/No" blocks without explicit option codes.
            lookahead = lines[i : min(i + 12, len(lines))]
            joined = " | ".join(lookahead).upper()
            if "RESPUESTA" in joined and "SÍ" in joined and "NO" in joined:
                items.append(
                    {
                        "code": f"{current_q}.yes",
                        "questionCode": current_q,
                        "label": "Sí",
                        "value1": None,
                        "value2": None,
                        "valueText": None,
                    }
                )
                items.append(
                    {
                        "code": f"{current_q}.no",
                        "questionCode": current_q,
                        "label": "No",
                        "value1": None,
                        "value2": None,
                        "valueText": None,
                    }
                )

        # Item code line: "20.1." or "14.6. Intel ..."
        m_item = re.match(r"^(\d{1,2})\.(\d{1,2})\.\s*(.*)$", line)
        if not m_item:
            i += 1
            continue

        q = int(m_item.group(1))
        n = int(m_item.group(2))
        code = f"{q}.{n}"
        rest = (m_item.group(3) or "").strip()

        label_parts = []
        if rest:
            label_parts.append(rest)

        j = i + 1
        while j < len(lines):
            nxt = lines[j].strip()
            if not nxt:
                j += 1
                continue
            if re.match(r"^\d{1,2}\.\d{1,2}\.", nxt) or re.match(r"^\d{1,2}\.\s", nxt):
                break
            if is_number_line(nxt):
                break
            # Skip table headers like "Cantidad", "Tipo de procesador", etc.
            if nxt.upper() in (
                "OPCIÓN",
                "SELECCIÓN",
                "CANTIDAD",
                "VALOR",
                "RESPUESTA",
                "TIPO DE PROCESADOR",
                "SISTEMA OPERATIVO",
                "EQUIPOS",
                "WINDOWS",
                "LINUX",
                "SUSCRIPCIÓN",
                "LICENCIA",
            ):
                j += 1
                continue
            label_parts.append(nxt)
            j += 1

        label = " ".join(label_parts).strip()

        values = []
        expected = expected_values.get(q, 1)
        k = j
        while k < len(lines) and len(values) < expected:
            nxt = lines[k].strip()
            if not nxt:
                k += 1
                continue
            if re.match(r"^\d{1,2}\.\d{1,2}\.", nxt) or re.match(r"^\d{1,2}\.\s", nxt):
                break
            if is_number_line(nxt):
                values.append(normalize_number(nxt))
            k += 1

        if q == 20 and len(values) == 4:
            # Materialize each column as a separate item (code remains short & stable).
            col_codes = ["in_use", "avg_age_years", "no_use", "not_operational"]
            col_labels = [
                "Operativos en uso",
                "Antigüedad promedio (años)",
                "Operativos sin uso",
                "No operativo",
            ]
            for col, col_label, val in zip(col_codes, col_labels, values):
                items.append(
                    {
                        "code": f"{code}.{col}",
                        "questionCode": q,
                        "label": f"{label} | {col_label}",
                        "value1": val,
                        "value2": None,
                        "valueText": None,
                    }
                )
        else:
            items.append(
                {
                    "code": code,
                    "questionCode": q,
                    "label": label,
                    "value1": values[0] if len(values) >= 1 else None,
                    "value2": values[1] if len(values) >= 2 else None,
                    "valueText": None,
                }
            )

        i = max(i + 1, k)

    return items


def main():
    if len(sys.argv) < 2:
        print("Usage: extract-enad.py <pdf_path>", file=sys.stderr)
        sys.exit(2)

    pdf_path = sys.argv[1]
    pages = extract_pages(pdf_path)
    items = parse_items(pages)
    print(json.dumps({"pages": pages, "items": items}, ensure_ascii=False))


if __name__ == "__main__":
    main()

