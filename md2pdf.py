"""Convert Vital File Format.md to PDF using markdown + fpdf2 with Unicode support."""
import re
import sys
import os
from fpdf import FPDF


class VitalPDF(FPDF):
    def __init__(self):
        super().__init__()
        # Use DejaVu fonts for full Unicode support
        font_dir = os.path.join(os.path.dirname(__file__), 'fonts')
        if os.path.isdir(font_dir):
            self.add_font('DejaVu', '', os.path.join(font_dir, 'DejaVuSansCondensed.ttf'), uni=True)
            self.add_font('DejaVu', 'B', os.path.join(font_dir, 'DejaVuSansCondensed-Bold.ttf'), uni=True)
            self.add_font('DejaVu', 'I', os.path.join(font_dir, 'DejaVuSansCondensed-Oblique.ttf'), uni=True)
            self.add_font('DejaVuMono', '', os.path.join(font_dir, 'DejaVuSansMono.ttf'), uni=True)
            self._sans = 'DejaVu'
            self._mono = 'DejaVuMono'
        else:
            # Fallback: use built-in Helvetica (ASCII only, use simple bullets)
            self._sans = 'Helvetica'
            self._mono = 'Courier'
        self._use_unicode = self._sans == 'DejaVu'

    def footer(self):
        self.set_y(-15)
        self.set_font(self._sans, 'I', 8)
        self.set_text_color(128)
        self.cell(0, 10, f'{self.page_no()}', new_x="RIGHT", new_y="TOP", align='C')

    def chapter_title(self, level, title):
        sizes = {1: 18, 2: 14, 3: 12, 4: 11}
        size = sizes.get(level, 10)
        self.set_font(self._sans, 'B', size)
        self.set_text_color(0)
        if level <= 2:
            self.ln(6)
        else:
            self.ln(3)
        self.multi_cell(0, size * 0.55, title)
        if level <= 2:
            self.set_draw_color(160)
            self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
            self.ln(2)
        else:
            self.ln(1)

    def render_table(self, headers, rows):
        """Render a markdown table with proper borders."""
        table_width = self.w - self.l_margin - self.r_margin
        n_cols = len(headers)

        # Calculate column widths based on content length
        col_max_len = []
        for i in range(n_cols):
            max_len = len(headers[i])
            for row in rows:
                if i < len(row):
                    max_len = max(max_len, len(self._clean_inline(row[i])))
            col_max_len.append(max(max_len, 5))

        total_len = sum(col_max_len) or 1
        col_widths = [(l / total_len) * table_width for l in col_max_len]

        # Ensure minimum column width of 15mm
        for i in range(n_cols):
            col_widths[i] = max(col_widths[i], 15)
        # Re-normalize to fit table_width
        total_w = sum(col_widths)
        if total_w > table_width:
            col_widths = [(w / total_w) * table_width for w in col_widths]

        def render_row(cells, is_header=False):
            self.set_font(self._sans, 'B' if is_header else '', 7.5)
            x_start = self.get_x()
            y_start = self.get_y()

            # Calculate row height by measuring each cell
            cell_texts = []
            max_h = 5
            for i in range(n_cols):
                text = self._clean_inline(cells[i].strip()) if i < len(cells) else ''
                cell_texts.append(text)
                # Measure height
                self.set_xy(x_start, y_start)
                self.set_font(self._sans, 'B' if is_header else '', 7.5)
                nb_lines = self.multi_cell(col_widths[i] - 2, 3.5, text, dry_run=True, output="LINES")
                h = len(nb_lines) * 3.5 + 2
                max_h = max(max_h, h)

            # Page break check
            if y_start + max_h > self.h - self.b_margin:
                self.add_page()
                y_start = self.get_y()
                x_start = self.get_x()

            # Draw cells
            for i, text in enumerate(cell_texts):
                x = x_start + sum(col_widths[:i])
                self.set_draw_color(150)
                if is_header:
                    self.set_fill_color(230, 230, 230)
                    self.rect(x, y_start, col_widths[i], max_h, 'DF')
                else:
                    self.rect(x, y_start, col_widths[i], max_h, 'D')
                self.set_xy(x + 1, y_start + 1)
                self.set_font(self._sans, 'B' if is_header else '', 7.5)
                self.multi_cell(col_widths[i] - 2, 3.5, text)

            self.set_xy(x_start, y_start + max_h)

        render_row(headers, is_header=True)
        for row in rows:
            render_row(row, is_header=False)
        self.ln(3)

    def _clean_inline(self, text):
        """Remove markdown inline formatting."""
        text = re.sub(r'`([^`]*)`', r'\1', text)
        text = re.sub(r'\*\*([^*]*)\*\*', r'\1', text)
        text = re.sub(r'\*([^*]*)\*', r'\1', text)
        text = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', text)
        return text

    def render_text(self, text):
        self.set_font(self._sans, '', 9)
        self.set_text_color(0)
        text = self._clean_inline(text)
        self.multi_cell(0, 4.5, text)
        self.ln(1)

    def render_list_item(self, text, level=0):
        self.set_font(self._sans, '', 9)
        self.set_text_color(0)
        indent = 6 * level
        bullet = '-'

        text = self._clean_inline(text)
        x = self.l_margin + indent + 2
        self.set_x(x)
        self.cell(4, 4.5, bullet, new_x="RIGHT", new_y="TOP")
        w = self.w - self.r_margin - x - 4
        self.multi_cell(w, 4.5, text)
        self.ln(0.5)

    def render_footnote(self, text):
        self.set_font(self._mono, '', 7)
        self.set_text_color(80)
        text = self._clean_inline(text)
        self.multi_cell(0, 3.5, text)
        self.ln(1)


def parse_md_to_pdf(md_path, pdf_path):
    with open(md_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    pdf = VitalPDF()
    pdf.set_auto_page_break(True, margin=20)
    pdf.add_page()

    i = 0
    footnotes = []
    while i < len(lines):
        line = lines[i].rstrip('\n')

        if not line.strip():
            i += 1
            continue

        if line.strip() == '---':
            i += 1
            continue

        # Footnotes
        if re.match(r'^\[\^(\d+)\]:', line):
            footnotes.append(line)
            i += 1
            continue

        # Headers
        m = re.match(r'^(#{1,4})\s+(.*)', line)
        if m:
            level = len(m.group(1))
            title = m.group(2)
            pdf.chapter_title(level, title)
            i += 1
            continue

        # Table
        if '|' in line and i + 1 < len(lines) and re.match(r'^\|[\s\-:|]+\|', lines[i + 1].strip()):
            headers = [c.strip() for c in line.strip().strip('|').split('|')]
            i += 2  # skip header + separator

            rows = []
            while i < len(lines) and '|' in lines[i] and lines[i].strip().startswith('|'):
                row = [c.strip() for c in lines[i].strip().strip('|').split('|')]
                rows.append(row)
                i += 1

            pdf.render_table(headers, rows)
            continue

        # List items
        m = re.match(r'^(\s*)[-*]\s+(.*)', line)
        if m:
            indent_len = len(m.group(1))
            level = indent_len // 2
            text = m.group(2)
            pdf.render_list_item(text, level)
            i += 1
            continue

        # Regular text
        pdf.render_text(line.strip())
        i += 1

    # Footnotes
    if footnotes:
        pdf.ln(5)
        pdf.set_draw_color(180)
        pdf.line(pdf.l_margin, pdf.get_y(), pdf.w / 3, pdf.get_y())
        pdf.ln(3)
        for fn in footnotes:
            pdf.render_footnote(fn)

    pdf.output(pdf_path)
    print(f"PDF generated: {pdf_path} ({os.path.getsize(pdf_path)} bytes)")


if __name__ == '__main__':
    base = os.path.dirname(os.path.abspath(__file__))
    md_path = os.path.join(base, 'Vital File Format.md')
    pdf_path = os.path.join(base, 'Vital File Format.pdf')
    if len(sys.argv) > 1:
        md_path = sys.argv[1]
    if len(sys.argv) > 2:
        pdf_path = sys.argv[2]
    parse_md_to_pdf(md_path, pdf_path)
