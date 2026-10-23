"""Gera e2e/exemplos/contrato-digitalizado.pdf: contrato fictício só com imagem (sem camada de texto), como sai de
um scanner, para testar o OCR (ADR 0021 do back-end). Uso: python3 scripts/gerar-contrato-digitalizado.py"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

LINHAS = [
    "CONTRATO DE CONCESSÃO Nº 900/2026 (DOCUMENTO FICTÍCIO)",
    "",
    "CLÁUSULA SÉTIMA - DAS METAS DE ADESÃO",
    "7.1 A concessionária manterá o cadastro de ligações atualizado.",
    "7.2 A adesão mínima ao sistema de esgoto na Cidade A será de",
    "88% até 31/12/2030, com limite de alerta em 82%.",
]

FONTES = ["/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
          "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf"]


def main() -> None:
    fonte = next(ImageFont.truetype(f, 34) for f in FONTES if Path(f).exists())
    pagina = Image.new("L", (1654, 2339), 255)  # A4 a 200 DPI
    desenho = ImageDraw.Draw(pagina)
    y = 220
    for linha in LINHAS:
        desenho.text((160, y), linha, font=fonte, fill=20)
        y += 58
    # Leve desfoque e inclinação, como uma digitalização comum.
    pagina = pagina.filter(ImageFilter.GaussianBlur(0.6)).rotate(0.4, fillcolor=255)
    destino = Path(__file__).resolve().parent.parent / "e2e" / "exemplos" / "contrato-digitalizado.pdf"
    pagina.save(destino, "PDF", resolution=200)
    print(destino)


if __name__ == "__main__":
    main()
