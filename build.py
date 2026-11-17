#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Обновление фотографий в index.html из папки assets/.

ПОЧЕМУ ТАК: сайт — один файл index.html. Все фото вшиты в него прямо
в HTML как data:image/webp;base64,... . Браузер НЕ читает папку assets/ —
она нужна только как «исходники» для сборки. Поэтому замена файла
assets/after.jpg сама по себе ничего не меняет на сайте: надо пересобрать
(перепрошить) base64 внутри index.html. Этот скрипт и есть тот самый шаг
сборки, которого не хватало.

ИСПОЛЬЗОВАНИЕ:

    python3 build.py              # обновить ВСЕ фото из assets/
    python3 build.py after        # обновить только фото «ПОСЛЕ»
    python3 build.py before g1    # обновить несколько конкретных фото

Ключи: portrait, g1, g2, g3, before, after, all.

Типовой сценарий:
    1. Кладёте новое фото в assets/ под тем же именем (например after.jpg).
    2. Запускаете: python3 build.py after
    3. Открываете index.html — фото обновилось.

Скрипт меняет ТОЛЬКО атрибут src у соответствующих <img>. Разметка,
CSS (включая встроенные шрифты) и JavaScript остаются побайтово прежними —
поэтому случайно не применяются другие правки, которые пока есть в src/,
но ещё не попали в рабочий index.html.

ВАЖНО ПРО КАДРИРОВАНИЕ: блок сравнения «ДО / ПОСЛЕ» имеет пропорцию 16:10
и object-fit:cover, поэтому квадратное фото показывается центральной
полосой (верх и низ подрезаются). Так устроен сам блок, и старое фото
тоже так кадрировалось. Если новый макет нужно показывать целиком —
скажите, добавим вписывание (object-fit:contain) или поля.

Требуется Pillow:  pip install pillow
(если Pillow нет, используется запасной вариант ImageMagick `convert`).
"""

import argparse
import base64
import io
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
OUT = ROOT / "index.html"

# ключ -> (файл, сторона квадрата, качество WebP, уникальные якоря <img> в index.html)
# Якорь — подстрока тега <img>, встречающаяся в файле ровно один раз.
IMAGES = {
    "portrait": {
        "file": "portrait-probe.jpg",
        "size": 520,
        "quality": 75,
        "anchors": ['alt="Портрет: менеджер Wildberries и AI-креатор CARTADGT"'],
        "label": "портрет в шапке",
    },
    "g1": {
        "file": "gallery-cosmetics.jpg",
        "size": 760,
        "quality": 75,
        # Одна и та же картинка используется в превью карточки, в галерее
        # и как стартовое изображение лайтбокса — обновляем все три тега.
        "anchors": [
            'id="wbImg"',
            'alt="Нейровизуал: флакон сыворотки в неоновом студийном свете"',
            'id="lbImg"',
        ],
        "label": "галерея · Косметика (3 тега)",
    },
    "g2": {
        "file": "gallery-home.jpg",
        "size": 760,
        "quality": 75,
        "anchors": ['alt="Нейровизуал: ароматическая свеча и керамика в цветном свете"'],
        "label": "галерея · Товары для дома",
    },
    "g3": {
        "file": "gallery-fashion.jpg",
        "size": 760,
        "quality": 75,
        "anchors": ['alt="Нейрофотосессия: модель в объёмном свитере в неоновом свете"'],
        "label": "галерея · Fashion",
    },
    "before": {
        "file": "before.jpg",
        "size": 840,
        "quality": 75,
        "anchors": ['alt="Исходное фото товара, снятое на телефон"'],
        "label": "ДО (сравнение)",
    },
    "after": {
        "file": "after.jpg",
        "size": 840,
        "quality": 75,
        "anchors": ['alt="Тот же товар после нейросетевой стилизации под студийную съёмку"'],
        "label": "ПОСЛЕ (сравнение)",
    },
}

SRC_RE = re.compile(r'src="data:image/webp;base64,[A-Za-z0-9+/=]+"')


def to_webp_data_uri(asset_path: Path, size: int, quality: int) -> tuple[str, int]:
    """Конвертирует assets/*.jpg в WebP data URI. Возвращает (uri, байт WebP)."""
    if not asset_path.is_file():
        raise FileNotFoundError(f"Не найден файл: {asset_path}")

    webp = None
    try:
        from PIL import Image

        with Image.open(asset_path) as im:
            if im.width != im.height:
                print(
                    f"  ! Внимание: {asset_path.name} не квадратная ({im.width}x{im.height}) — "
                    "будет сжата до квадрата. Лучше подготовить квадратный исходник.",
                    file=sys.stderr,
                )
            im = im.convert("RGB").resize((size, size), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, "WEBP", quality=quality, method=6)
            webp = buf.getvalue()
    except ImportError:
        webp = None

    if webp is None:  # запасной путь
        try:
            proc = subprocess.run(
                [
                    "convert", str(asset_path),
                    "-resize", f"{size}x{size}",
                    "-quality", str(quality),
                    "webp:-",
                ],
                capture_output=True,
                check=True,
            )
            webp = proc.stdout
        except (FileNotFoundError, subprocess.CalledProcessError) as exc:
            raise RuntimeError(
                "Нужен Pillow или ImageMagick.\n"
                "Установите:  pip install pillow\n"
                "Или:         sudo apt install imagemagick"
            ) from exc

    uri = "data:image/webp;base64," + base64.b64encode(webp).decode("ascii")
    return uri, len(webp)


def replace_one(html: str, anchor: str, new_uri: str) -> str:
    """Меняет src у единственного <img>, содержащего anchor."""
    first = html.find(anchor)
    if first < 0:
        raise RuntimeError(f"Не найден тег с якорем: {anchor}")
    if html.find(anchor, first + 1) != -1:
        raise RuntimeError(f"Якорь не уникален (встречается несколько раз): {anchor}")

    tag_start = html.rfind("<img", 0, first)
    tag_end = html.find(">", first)
    if tag_start < 0 or tag_end < 0:
        raise RuntimeError(f"Не удалось выделить тег <img> для якоря: {anchor}")

    tag = html[tag_start:tag_end]
    new_tag, n = SRC_RE.subn(f'src="{new_uri}"', tag)
    if n != 1:
        raise RuntimeError(
            f"Ожидался ровно один data:image/webp src в теге, найдено {n}. Якорь: {anchor}"
        )
    return html[:tag_start] + new_tag + html[tag_end:]


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Пересобрать фото в index.html из assets/ (по умолчанию — все).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "images",
        nargs="*",
        default=["all"],
        metavar="КЛЮЧ",
        help="portrait | g1 | g2 | g3 | before | after | all (по умолчанию all)",
    )
    args = parser.parse_args()

    keys = [k.lower() for k in args.images]
    if "all" in keys:
        keys = list(IMAGES)
    bad = [k for k in keys if k not in IMAGES]
    if bad:
        parser.error(f"Неизвестные ключи: {', '.join(bad)}. "
                     f"Доступно: {', '.join(IMAGES)}, all")

    html = OUT.read_text(encoding="utf-8")
    original = html

    print(f"Обновляю index.html из assets/ ({', '.join(keys)}):\n")
    for key in keys:
        cfg = IMAGES[key]
        uri, nbytes = to_webp_data_uri(ASSETS / cfg["file"], cfg["size"], cfg["quality"])
        for anchor in cfg["anchors"]:
            html = replace_one(html, anchor, uri)
        print(
            f"  {key:9s} {cfg['label']:32s} "
            f"<- assets/{cfg['file']}  {cfg['size']}x{cfg['size']}  "
            f"WebP {nbytes} б.  base64 {len(uri)} симв.  тегов: {len(cfg['anchors'])}"
        )

    if html == original:
        print("\nИзменений нет (все data URI уже совпадают).")
        return 0

    OUT.write_text(html, encoding="utf-8")
    print(f"\nГотово. {OUT.name}: {len(original.encode('utf-8'))} -> "
          f"{OUT.stat().st_size} байт.")
    print("Откройте index.html в браузере и обновите страницу (Ctrl+F5).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
