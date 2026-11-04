#!/usr/bin/env python3
"""
Builds pdf-render-check.pdf, the sample behind the PDF rendering checks (needs fonttools).

The embedded font's only glyph is a solid box and every CID maps to it, so whether text was drawn
is a pixel count that depends on neither the system's fonts nor the characters used.

  Page 1  embedded font, predefined CMap UniGB-UCS2-H   needs pdfjs-dist/cmaps
  Page 2  embedded font, predefined CMap GBK-EUC-H      needs pdfjs-dist/cmaps
  Page 3  embedded font, Identity-H, Identity ordering  needs no CMap file
  Page 4  embedded font, Identity-H, Adobe-GB1 ordering  needs pdfjs-dist/cmaps (Adobe-GB1-UCS2)
  Page 5  Helvetica, not embedded                        needs pdfjs-dist/standard_fonts

Usage: python3 scripts/fixtures/build-pdf-render-check.py
"""

import io
import zlib
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

UNITS_PER_EM = 1000
# Larger than any CID in the Adobe-GB1 character collection.
CID_COUNT = 32768
BOX_GID = 1
TEXT = "中文"


def build_box_font():
    pen = TTGlyphPen(None)
    pen.moveTo((0, 0))
    pen.lineTo((0, UNITS_PER_EM))
    pen.lineTo((UNITS_PER_EM, UNITS_PER_EM))
    pen.lineTo((UNITS_PER_EM, 0))
    pen.closePath()
    box = pen.glyph()

    builder = FontBuilder(UNITS_PER_EM, isTTF=True)
    builder.setupGlyphOrder([".notdef", "box"])
    builder.setupCharacterMap({0x25A0: "box"})
    builder.setupGlyf({".notdef": TTGlyphPen(None).glyph(), "box": box})
    builder.setupHorizontalMetrics({".notdef": (UNITS_PER_EM, 0), "box": (UNITS_PER_EM, 0)})
    builder.setupHorizontalHeader(ascent=UNITS_PER_EM, descent=0)
    builder.setupNameTable({"familyName": "RenderCheckBox", "styleName": "Regular"})
    builder.setupOS2(sTypoAscender=UNITS_PER_EM, sTypoDescender=0, usWinAscent=UNITS_PER_EM, usWinDescent=0)
    builder.setupPost()
    # Fixed timestamps keep the output reproducible.
    builder.font["head"].created = builder.font["head"].modified = 0
    output = io.BytesIO()
    builder.font.recalcTimestamp = False
    builder.save(output)
    return output.getvalue()


class Pdf:
    def __init__(self):
        self.objects = []

    def add(self, body):
        self.objects.append(body if isinstance(body, bytes) else body.encode())
        return len(self.objects)

    def add_stream(self, data, extra=""):
        compressed = zlib.compress(data, 9)
        header = f"<< /Length {len(compressed)} /Filter /FlateDecode {extra}>>\nstream\n"
        return self.add(header.encode() + compressed + b"\nendstream")

    def serialize(self, root):
        out = bytearray(b"%PDF-1.5\n%\xe2\xe3\xcf\xd3\n")
        offsets = []
        for number, body in enumerate(self.objects, 1):
            offsets.append(len(out))
            out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
        xref = len(out)
        out += f"xref\n0 {len(offsets) + 1}\n0000000000 65535 f \n".encode()
        for offset in offsets:
            out += f"{offset:010d} 00000 n \n".encode()
        out += f"trailer\n<< /Size {len(offsets) + 1} /Root {root} 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
        return bytes(out)


def main():
    pdf = Pdf()
    font_data = build_box_font()
    font_file = pdf.add_stream(font_data, f"/Length1 {len(font_data)} ")
    descriptor = pdf.add(
        "<< /Type /FontDescriptor /FontName /RenderCheckBox /Flags 4 "
        f"/FontBBox [0 0 {UNITS_PER_EM} {UNITS_PER_EM}] /ItalicAngle 0 /Ascent {UNITS_PER_EM} /Descent 0 "
        f"/CapHeight {UNITS_PER_EM} /StemV 80 /FontFile2 {font_file} 0 R >>"
    )
    cid_to_gid = pdf.add_stream(BOX_GID.to_bytes(2, "big") * CID_COUNT)

    def composite_font(encoding, ordering="GB1", widths=""):
        descendant = pdf.add(
            "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /RenderCheckBox "
            f"/CIDSystemInfo << /Registry (Adobe) /Ordering ({ordering}) /Supplement 0 >> "
            f"/FontDescriptor {descriptor} 0 R /DW {UNITS_PER_EM} {widths}/CIDToGIDMap {cid_to_gid} 0 R >>"
        )
        return pdf.add(
            f"<< /Type /Font /Subtype /Type0 /BaseFont /RenderCheckBox /Encoding /{encoding} "
            f"/DescendantFonts [{descendant} 0 R] >>"
        )

    helvetica = pdf.add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    pages = [
        (composite_font("UniGB-UCS2-H"), TEXT.encode("utf-16-be").hex()),
        (composite_font("GBK-EUC-H"), TEXT.encode("gbk").hex()),
        # Identity-H codes are CIDs. 0001 is not .notdef, and maps to the box like the rest.
        (composite_font("Identity-H", ordering="Identity"), "00010002"),
        # pdf.js caches fonts by a hash that ignores the ordering. Without its own /W this page
        # would reuse the font of the previous one and never load Adobe-GB1-UCS2.
        (composite_font("Identity-H", widths=f"/W [1 [{UNITS_PER_EM}]] "), "00010002"),
        (helvetica, "Standard font".encode("ascii").hex()),
    ]

    pages_number = len(pdf.objects) + 2 * len(pages) + 1
    kids = []
    for font, text in pages:
        size = 20 if font == helvetica else 40
        content = pdf.add_stream(f"BT /F1 {size} Tf 20 30 Td <{text}> Tj ET".encode())
        kids.append(
            pdf.add(
                f"<< /Type /Page /Parent {pages_number} 0 R /MediaBox [0 0 200 100] /Contents {content} 0 R "
                f"/Resources << /Font << /F1 {font} 0 R >> >> >>"
            )
        )
    pages_object = pdf.add(
        f"<< /Type /Pages /Kids [{' '.join(f'{kid} 0 R' for kid in kids)}] /Count {len(kids)} >>"
    )
    assert pages_object == pages_number
    root = pdf.add(f"<< /Type /Catalog /Pages {pages_object} 0 R >>")

    target = Path(__file__).with_name("pdf-render-check.pdf")
    target.write_bytes(pdf.serialize(root))
    print(f"Wrote {target} ({target.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
