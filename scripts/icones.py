#!/usr/bin/env python3
"""Génère les icônes de la PWA Alter (PNG + SVG), sans dépendance réseau.

Monogramme « A » blanc sur bleu MentorLab (#00297F), trait cyan (#6CEDFF) en pied.
Utilisation : python3 scripts/icones.py   (nécessite Pillow)
"""
from pathlib import Path
from PIL import Image, ImageDraw

BLEU, CYAN, BLANC = (0, 41, 127), (108, 237, 255), (255, 255, 255)
SORTIE = Path(__file__).resolve().parent.parent / "pwa" / "icons"


def dessiner(taille: int, marge: float, arrondi: float) -> Image.Image:
    """marge : zone de sécurité (part de la taille) ; arrondi : rayon des coins (part de la taille)."""
    f = 4  # suréchantillonnage pour des bords nets
    t = taille * f
    img = Image.new("RGBA", (t, t), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, t - 1, t - 1], radius=int(t * arrondi), fill=BLEU)

    zone = t * (1 - 2 * marge)
    x0, y0 = t * marge, t * marge
    # « A » géométrique : deux jambages et une barre
    haut = (x0 + zone * 0.5, y0 + zone * 0.16)
    bas_g = (x0 + zone * 0.17, y0 + zone * 0.80)
    bas_d = (x0 + zone * 0.83, y0 + zone * 0.80)
    ep = zone * 0.13
    d.line([bas_g, haut, bas_d], fill=BLANC, width=int(ep), joint="curve")
    d.line([(x0 + zone * 0.33, y0 + zone * 0.57), (x0 + zone * 0.67, y0 + zone * 0.57)], fill=BLANC, width=int(ep * 0.8))
    # trait cyan
    d.rounded_rectangle(
        [x0 + zone * 0.17, y0 + zone * 0.88, x0 + zone * 0.83, y0 + zone * 0.88 + ep * 0.55],
        radius=int(ep * 0.27), fill=CYAN,
    )
    return img.resize((taille, taille), Image.LANCZOS)


def main() -> None:
    SORTIE.mkdir(parents=True, exist_ok=True)
    dessiner(192, 0.14, 0.22).save(SORTIE / "icon-192.png")
    dessiner(512, 0.14, 0.22).save(SORTIE / "icon-512.png")
    # Android « maskable » : fond plein jusqu'aux bords, motif dans les 80 % centraux
    dessiner(512, 0.22, 0.0).save(SORTIE / "icon-maskable-512.png")
    # iOS arrondit lui-même : carré plein, sans transparence
    dessiner(180, 0.16, 0.0).convert("RGB").save(SORTIE / "apple-touch-icon.png")
    (SORTIE / "favicon.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        '<rect width="64" height="64" rx="14" fill="#00297F"/>'
        '<path d="M17 50 32 15 47 50" fill="none" stroke="#fff" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>'
        '<path d="M24 38h16" stroke="#fff" stroke-width="5.5" stroke-linecap="round"/>'
        '<rect x="17" y="53" width="30" height="4" rx="2" fill="#6CEDFF"/>'
        "</svg>\n",
        encoding="utf-8",
    )
    print("Icônes écrites dans", SORTIE)


if __name__ == "__main__":
    main()
