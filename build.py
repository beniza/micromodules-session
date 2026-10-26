"""Assemble the session's GitHub Pages site (repo beniza/micromodules-session) from the build outputs.

Usage (from the micro-modules folder, after building the take-home module and the deck):
    python session/site/build.py                    # asks for the deck passphrase (hidden input)
    python session/site/build.py --new-passphrase   # makes a new 4-word passphrase and prints it once
    then commit and push session/site/ (git add -A && git commit && git push)

If the environment variable STATICRYPT_PASSWORD is set, that passphrase is used and nothing is asked.
The passphrase is never written to any file; it reaches StatiCrypt only through STATICRYPT_PASSWORD.

Layout written into this folder (everything except .git/ and this script is replaced on each run):
    /           = the take-home module, public by link (session/take-home/dist/web/), noindex
    /deck/      = the presenter deck (session/deck/dist/), index.html encrypted with StatiCrypt.
                  The deck's content (cards and speaker notes, content.js) is inlined into index.html
                  before encrypting, so no session text is readable without the passphrase. Engine
                  code, CSS, the font and images stay as separate files.
                  Left out: listen/ (podcast player + audio) and media/ (APR video). They are internal
                  training media. The deck's demo links to them point to the presenter's local deck
                  server instead (--media-base, default http://localhost:8843/, i.e.
                  python -m http.server 8843 --directory session/deck/dist).
    robots.txt, .nojekyll

The local deck build (session/deck/dist/) is only read, never changed.
"""
import argparse
import getpass
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
TAKE_HOME = ROOT / "session" / "take-home" / "dist" / "web"
DECK = ROOT / "session" / "deck" / "dist"
KEEP = {".git", "build.py"}
EXCLUDED = ("listen", "media")             # internal media folders in the deck build, never published
STATICRYPT = "staticrypt@3.5.4"
REMEMBER_DAYS = "1"                        # "Remember me" lasts one day (lets the P presenter window open)
ROBOTS_META = '<meta name="robots" content="noindex, nofollow">'

WORDS = """
acorn amber anchor apple apron arrow aspen atlas autumn badge bagel bamboo banjo barley basket beacon
beaver berry bicycle biscuit blanket blossom bonnet border bottle bramble bread breeze brick bridge
brook bubble bucket buffalo bundle butter button cabin cactus camel candle canoe canvas canyon carpet
carrot castle cedar cello cherry chess chimney cinema circle clay cliff clock cloud clover coconut
comet compass copper coral cotton cradle crayon cricket crystal cupboard curtain cushion daisy dancer
desert diamond dolphin donkey dragon drum eagle easel echo elbow ember engine falcon feather fence
fern fiddle field finch flag flute forest fossil fountain fox garden garlic giraffe ginger glacier
globe goose granite grape gravel guitar hammer harbor harvest hazel helmet heron hickory hill honey
horizon hornet island ivory jacket jasmine jelly jigsaw journey kayak kettle kitten koala ladder
lagoon lantern lemon lily lizard locket lotus magnet mango maple marble meadow melon mirror mitten
monkey moose mosaic mountain muffin mustard napkin needle nectar nest noodle nutmeg oasis ocean olive
onion orange orchard otter owl paddle panda paper parrot pasta peach peanut pebble pelican pencil
pepper piano pickle pigeon pillow pine planet plum pocket pony poppy potato pottery prairie pumpkin
puzzle quarry quill rabbit radish rainbow raven ribbon river robin rocket saddle saffron salmon sand
satchel scarf shadow shell silver sketch sled snail sparrow spider spoon spruce squash squirrel
stable statue stone storm straw stream sugar summit sunset swallow sweater table tablet teapot
thimble thistle thunder tiger timber toast tomato topaz tortoise towel tower trumpet tulip tunnel
turnip turtle umbrella valley velvet violet violin wagon walnut walrus water whale wheat whistle
willow window winter wizard wombat wool yacht yarn zebra zipper bright calm clever cosy eager gentle
golden happy humble jolly kind lively lucky merry mighty misty noble polite proud quiet rapid rosy
royal rustic shiny silent simple smooth snowy sunny swift tidy tiny vivid warm wild windy wise young
""".split()


def fail(msg):
    sys.exit("site build: " + msg)


def passphrase(new):
    env = os.environ.get("STATICRYPT_PASSWORD", "")
    if new:
        if env:
            fail("--new-passphrase given but STATICRYPT_PASSWORD is also set; use one or the other")
        words = sorted(set(WORDS))
        phrase = "-".join(secrets.choice(words) for _ in range(4))
        print("New deck passphrase (shown once, not saved anywhere): " + phrase, file=sys.stderr)
        return phrase
    if env:
        return env
    phrase = getpass.getpass("Deck passphrase: ")
    if not phrase:
        fail("no passphrase given")
    return phrase


def clean_site():
    for p in HERE.iterdir():
        if p.name in KEEP:
            continue
        if p.is_dir():
            shutil.rmtree(p)
        else:
            p.unlink()


def add_robots_meta(html, where):
    if ROBOTS_META in html:
        return html
    new, n = re.subn(r"<head[^>]*>", lambda m: m.group(0) + "\n" + ROBOTS_META, html, count=1, flags=re.I)
    if not n:
        fail("no <head> in " + where)
    return new


def deck_content(media_base):
    """Read the deck's content.js, point demo links into listen/ or media/ at media_base."""
    src = (DECK / "content.js").read_text(encoding="utf-8").strip()
    prefix = "window.MODULE = "
    if not src.startswith(prefix) or not src.endswith(";"):
        fail("session/deck/dist/content.js doesn't have the expected 'window.MODULE = {...};' shape")
    data = json.loads(src[len(prefix):-1])
    swapped = []

    def walk(node):
        if isinstance(node, dict):
            for k, v in node.items():
                if k in ("url", "src") and isinstance(v, str) and v.split("/")[0] in EXCLUDED:
                    node[k] = media_base + v
                    swapped.append(v)
                else:
                    walk(v)
        elif isinstance(node, list):
            for x in node:
                walk(x)

    walk(data)
    for name, path in data.get("images", {}).items():
        if path.split("/")[0] in EXCLUDED:
            fail("deck image %r lives in an excluded folder (%s)" % (name, path))
    return data, swapped


def build_deck(phrase, media_base, workdir):
    data, swapped = deck_content(media_base)
    html = (DECK / "index.html").read_text(encoding="utf-8")
    tag = '<script src="content.js"></script>'
    if tag not in html:
        fail("session/deck/dist/index.html no longer loads content.js with %s; update the site build" % tag)
    inline = "window.MODULE = " + json.dumps(data, ensure_ascii=False).replace("</", "<\\/") + ";"
    html = add_robots_meta(html.replace(tag, "<script>" + inline + "</script>"), "the deck")
    plain = workdir / "plain"
    plain.mkdir()
    (plain / "index.html").write_text(html, encoding="utf-8")

    npx = shutil.which("npx")
    if not npx:
        fail("npx not found (install Node.js)")
    env = dict(os.environ, STATICRYPT_PASSWORD=phrase)
    cmd = [npx, "--yes", STATICRYPT, str(plain / "index.html"), "-d", str(workdir / "enc"), "-c", "false",
           "--remember", REMEMBER_DAYS, "--short",
           "--template-title", "Presenter deck",
           "--template-instructions", "Enter the presenter passphrase.",
           "--template-button", "Open deck",
           "--template-placeholder", "Passphrase",
           "--template-remember", "Remember on this computer for 1 day",
           "--template-error", "Wrong passphrase",
           "--template-color-primary", "#0D3C61",
           "--template-color-secondary", "#F3EFE9"]
    r = subprocess.run(cmd, cwd=workdir, env=env, capture_output=True, text=True)
    out = workdir / "enc" / "index.html"
    if r.returncode or not out.exists():
        fail("StatiCrypt failed:\n" + r.stdout + r.stderr)
    enc = add_robots_meta(out.read_text(encoding="utf-8"), "the encrypted deck")

    # Self-check: no card text may survive in plain text.
    leaks = []
    for c in data["cards"]:
        for key in ("title", "lead"):
            v = c.get(key)
            if isinstance(v, str) and len(v) >= 12 and v in enc:
                leaks.append(v)
    if leaks:
        fail("encrypted deck still contains card text: %r" % leaks[:3])

    dest = HERE / "deck"
    shutil.copytree(DECK, dest, ignore=shutil.ignore_patterns(*EXCLUDED, "content.js", "index.html"))
    (dest / "index.html").write_text(enc, encoding="utf-8")
    return swapped


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--new-passphrase", action="store_true", help="generate a new 4-word passphrase")
    ap.add_argument("--media-base", default="http://localhost:8843/",
                    help="where the deck's podcast and video demo links point (default: %(default)s)")
    args = ap.parse_args()
    if not args.media_base.endswith("/"):
        args.media_base += "/"
    for p in (TAKE_HOME / "index.html", DECK / "index.html", DECK / "content.js"):
        if not p.exists():
            fail("%s is missing; build the take-home module and the deck first" % p.relative_to(ROOT))

    phrase = passphrase(args.new_passphrase)
    clean_site()
    shutil.copytree(TAKE_HOME, HERE, dirs_exist_ok=True)
    home = HERE / "index.html"
    home.write_text(add_robots_meta(home.read_text(encoding="utf-8"), "the take-home page"), encoding="utf-8")
    with tempfile.TemporaryDirectory() as tmp:
        swapped = build_deck(phrase, args.media_base, Path(tmp))
    (HERE / "robots.txt").write_text(
        "User-agent: *\nDisallow: /deck/\nDisallow: /micromodules-session/deck/\n", encoding="utf-8")
    (HERE / ".nojekyll").write_text("", encoding="utf-8")

    for p in HERE.rglob("*"):
        if ".git" in p.parts:
            continue
        if p.suffix.lower() in (".mp4", ".mp3", ".m4a", ".webm") or (p.is_dir() and p.name in EXCLUDED):
            fail("internal media ended up in the site: %s" % p.relative_to(HERE))
    print("Site built in %s" % HERE)
    print("Deck demo links now point to %s: %s" % (args.media_base, ", ".join(sorted(set(swapped))) or "none"))


if __name__ == "__main__":
    main()
