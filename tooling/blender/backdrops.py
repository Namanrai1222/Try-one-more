"""Chapter backdrops: the rooms behind each course, rendered as seamless horizontal tiles.

Each chapter is one 16-unit bay of a school building (1 unit = 1 game world unit = 32 level px),
built three times side by side and rendered with an orthographic camera and sun light only, so
the middle bay tiles without a seam. The game maps it onto a plane behind the course
(render.ts) and fades its top into the sky.

    /Applications/Blender.app/Contents/MacOS/Blender -b --python tooling/blender/backdrops.py [chapter]

Writes packages/game-rage/assets/backdrop-ch{1..4}.webp (1024², covering x −8…8, z −4…12).
Backdrops sit behind the hazards: keep them dim, cool and free of red (red marks failure only).
"""

import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).parent))
import jom  # noqa: E402

OUT = jom.ROOT / "packages/game-rage/assets"
P = 16.0  # bay width
M = jom.material


def pool(dx, x, z, power, token="chalk", size=5.0):
    """A soft light washing the wall, built once per bay so the lighting repeats with the tile."""
    jom.area((dx + x, -4.0, z), (math.radians(90), 0, 0), power, size, token)


def wall(dx, mat, trim, low=None):
    jom.box("wall", (dx, 0.6, 4), (P + 0.01, 1, 16), mat)
    jom.box("floor_edge", (dx, -2.5, -2.05), (P + 0.01, 6, 3.9), low or trim)
    jom.box("skirting", (dx, 0.05, 0.25), (P + 0.01, 0.2, 0.5), trim)


def window(x, z0, w, h, frame, glass, sill):
    jom.box("glass", (x, 0.08, z0 + h / 2), (w, 0.05, h), glass)
    for fx in (-w / 2, 0, w / 2):
        jom.box("mullion", (x + fx, -0.02, z0 + h / 2), (0.16, 0.2, h + 0.1), frame)
    for fz in (0, h * 0.62, h):
        jom.box("transom", (x, -0.02, z0 + fz), (w + 0.16, 0.2, 0.16), frame)
    jom.box("sill", (x, -0.2, z0 - 0.12), (w + 0.6, 0.6, 0.18), sill)


def fan(x, z, metal, blade):
    jom.cylinder("fan_rod", (x, -3.0, z + 0.9), 0.05, 1.8, metal)
    jom.cylinder("fan_hub", (x, -3.0, z), 0.32, 0.22, metal)
    for a in (0, 120, 240):
        r = math.radians(a)
        jom.box("fan_blade", (x + math.cos(r) * 0.95, -3.0 + math.sin(r) * 0.95 * 0.25, z),
                (1.6, 0.42, 0.05), blade, rot=(0, 0, r * 0.25))


def clock(x, z, face, rim, hands):
    jom.cylinder("clock_rim", (x, -0.05, z), 0.62, 0.16, rim, rot=(math.radians(90), 0, 0))
    jom.cylinder("clock_face", (x, -0.14, z), 0.52, 0.04, face, rot=(math.radians(90), 0, 0))
    jom.box("hand_h", (x + 0.12, -0.18, z + 0.08), (0.3, 0.02, 0.06), hands, rot=(0, math.radians(-30), 0))
    jom.box("hand_m", (x, -0.18, z + 0.2), (0.05, 0.02, 0.42), hands)


def desk_row(dx, y, desk, steel, n=4, chairs=False, stacked=False):
    for i in range(n):
        x = dx - P / 2 + (i + 0.5) * P / n
        jom.box("desk_top", (x, y, 0.78), (1.5, 0.75, 0.08), desk)
        for lx in (-0.66, 0.66):
            jom.box("desk_leg", (x + lx, y, 0.38), (0.06, 0.6, 0.76), steel)
        if chairs:
            jom.box("chair_seat", (x, y - 0.7, 0.46), (0.5, 0.45, 0.05), desk)
            jom.box("chair_back", (x, y - 0.95, 0.75), (0.5, 0.05, 0.55), desk)
        if stacked:
            # Chairs upside down on the desk, legs in the air: the hall after the exam.
            jom.box("chair_seat", (x, y, 1.3), (0.5, 0.45, 0.05), desk)
            jom.box("chair_back", (x, y + 0.22, 1.05), (0.5, 0.05, 0.5), desk)
            for lx in (-0.22, 0.22):
                jom.box("chair_leg", (x + lx, y - 0.1, 1.62), (0.04, 0.04, 0.6), steel)


# ---------------------------------------------------------------- chapters
def ch1(dx):
    """Welcome: the exam hall. Tall windows, a blackboard, the clock, ceiling fans, desks."""
    wall(dx, M("w1", jom.lin("ink", 1.55), 0.95), M("t1", jom.lin("ink", 1.15), 0.9))
    jom.box("wainscot", (dx, 0.05, 1.2), (P + 0.01, 0.1, 2.4), M("wa1", jom.lin("ink", 1.3), 0.9))
    frame = M("f1", jom.lin("ink", 0.9), 0.7)
    glass = M("g1", jom.lin("saw", 0.32), 0.3, emission=jom.lin("saw"), strength=0.22)
    sill = M("s1", jom.lin("ink", 1.8), 0.8)
    for x in (-4.6, 4.6):
        window(dx + x, 3.4, 2.6, 5.6, frame, glass, sill)
    jom.box("board", (dx, 0.0, 4.6), (4.2, 0.12, 2.3), M("b1", jom.lin("jade", 0.16, mix=("ink", 0.5)), 0.95))
    jom.box("board_frame", (dx, 0.04, 4.6), (4.45, 0.08, 2.55), M("bf1", jom.lin("ink", 1.0), 0.6))
    jom.box("chalk_line", (dx - 0.6, -0.08, 4.9), (2.2, 0.02, 0.05), M("cl1", jom.lin("chalk", 0.45), 0.9))
    jom.box("chalk_line", (dx - 0.9, -0.08, 4.5), (1.5, 0.02, 0.05), M("cl1b", jom.lin("chalk", 0.4), 0.9))
    clock(dx, 7.5, M("cf1", jom.lin("chalk", 0.55), 0.6), frame, M("ch1", jom.lin("ink"), 0.5))
    jom.box("pillar", (dx + P / 2, -0.3, 4), (1.1, 0.8, 16), M("p1", jom.lin("ink", 1.35), 0.9))
    metal = M("m1", jom.lin("saw", 0.45), 0.4, 0.6)
    fan(dx - 4.6, 10.2, metal, metal)
    fan(dx + 4.6, 10.2, metal, metal)
    desk_row(dx, -1.6, M("d1", jom.lin("ink", 1.05), 0.7), metal, chairs=True)
    pool(dx, -4.6, 6.5, 260)
    pool(dx, 4.6, 6.5, 260)


def ch2(dx):
    """Now It Gets Fun: the corridor. Lockers, notice boards, tube lights, a classroom door."""
    wall(dx, M("w2", jom.lin("saw", 0.32), 0.95), M("t2", jom.lin("ink", 1.1), 0.9))
    locker = M("l2", jom.lin("cobalt", 0.22), 0.55, 0.3)
    vent = M("v2", jom.lin("ink", 0.9), 0.6)
    for i in range(8):
        x = dx - 6.4 + i * 1.12
        if abs(x - dx - 1.5) < 0.1:
            continue
        jom.box("locker", (x, -0.1, 1.75), (1.06, 0.4, 3.3), locker)
        for vz in (3.0, 3.15, 3.3):
            jom.box("vent", (x, -0.32, vz), (0.6, 0.02, 0.05), vent)
    door = M("dr2", jom.lin("ink", 1.3), 0.7)
    jom.box("door", (dx + 5.6, -0.05, 2.1), (1.9, 0.2, 4.2), door)
    jom.box("door_window", (dx + 5.6, -0.17, 3.1), (0.8, 0.02, 1.0),
            M("dw2", jom.lin("saw", 0.5), 0.3, emission=jom.lin("saw"), strength=0.2))
    board = M("nb2", jom.lin("paper-shadow", 0.42), 0.95)
    sheet = M("sh2", jom.lin("paper", 0.36), 0.9)
    pin = M("pn2", jom.lin("marigold", 0.8), 0.4)
    for bx in (-4.4, 0.6):
        jom.box("notice_board", (dx + bx, 0.0, 5.4), (3.6, 0.12, 2.2), board)
        for k, (sx, sz, r) in enumerate(((-1.1, 0.25, 4), (-0.2, -0.1, -6), (0.85, 0.3, 3), (0.5, -0.55, -2))):
            jom.box("sheet", (dx + bx + sx, -0.08, 5.4 + sz), (0.7, 0.02, 0.95), sheet, rot=(0, math.radians(r), 0))
            jom.sphere("pin", (dx + bx + sx, -0.12, 5.4 + sz + 0.4), 0.05, pin)
    tube = M("tb2", jom.lin("chalk", 0.8), 0.3, emission=jom.lin("chalk"), strength=0.55)
    for tx in (-4.0, 4.0):
        jom.box("tube", (dx + tx, -0.12, 8.6), (2.6, 0.12, 0.12), tube)
        jom.box("tube_mount", (dx + tx, -0.02, 8.6), (2.8, 0.06, 0.24), vent)
    jom.box("trim", (dx, -0.02, 7.6), (P + 0.01, 0.08, 0.14), vent)
    pool(dx, -4.0, 8.0, 320)
    pool(dx, 4.0, 8.0, 320)


def ch3(dx):
    """Getting Worse: the results wall. Rows of result sheets under hard lamps."""
    wall(dx, M("w3", jom.lin("ink", 1.2), 0.95), M("t3", jom.lin("ink", 0.85), 0.9))
    board = M("rb3", jom.lin("ink", 0.8), 0.9)
    sheet = M("rs3", jom.lin("paper", 0.3), 0.9)
    faded = M("rf3", jom.lin("paper", 0.2), 0.9)
    line = M("rl3", jom.lin("ink", 1.1), 0.9)
    jom.box("results_board", (dx, 0.0, 5.0), (P + 0.01, 0.15, 5.6), board)
    # Pinned unevenly: a few sheets missing, some faded, each a little crooked.
    missing = {(0, 2), (1, 5), (2, 0), (2, 4)}
    for row in range(3):
        for col in range(7):
            if (row, col) in missing:
                continue
            x = dx - P / 2 + (col + 0.5) * P / 7
            z = 3.1 + row * 1.85
            tilt = math.radians(((row * 7 + col) * 37 % 9) - 4)
            mat = faded if (row + col) % 3 == 0 else sheet
            jom.box("result_sheet", (x, -0.1, z), (1.5, 0.03, 1.45), mat, rot=(0, tilt, 0))
            for ln in range(4):
                jom.box("sheet_line", (x, -0.13, z + 0.42 - ln * 0.27), (1.1, 0.01, 0.045), line,
                        rot=(0, tilt, 0))
    lamp = M("lp3", jom.lin("saw", 0.35), 0.4, 0.7)
    bulb = M("bl3", jom.lin("chalk"), 0.3, emission=jom.lin("chalk"), strength=1.0)
    for lx in (-4.0, 4.0):
        jom.box("lamp_arm", (dx + lx, -0.5, 9.2), (0.08, 1.0, 0.08), lamp)
        jom.cone("lamp_shade", (dx + lx, -1.0, 8.9), 0.55, 0.5, lamp)
        jom.sphere("lamp_bulb", (dx + lx, -1.0, 8.62), 0.14, bulb)
    jom.box("pillar", (dx + P / 2, -0.3, 4), (1.0, 0.8, 16), M("p3", jom.lin("ink", 1.0), 0.9))
    pool(dx, -4.0, 7.5, 380, size=3.5)
    pool(dx, 4.0, 7.5, 380, size=3.5)


def ch4(dx):
    """After The End: the hall at night. Moonlit windows, chairs stacked on desks, one bulb."""
    wall(dx, M("w4", jom.lin("ink", 1.25), 0.95), M("t4", jom.lin("ink", 0.9), 0.9))
    frame = M("f4", jom.lin("ink", 0.6), 0.7)
    glass = M("g4", jom.lin("sky", 0.12, mix=("ink", 0.4)), 0.3, emission=jom.lin("sky", 0.5, mix=("ink", 0.5)), strength=0.3)
    sill = M("s4", jom.lin("ink", 1.2), 0.8)
    for x in (-4.6, 4.6):
        window(dx + x, 3.4, 2.6, 5.6, frame, glass, sill)
    jom.box("pillar", (dx + P / 2, -0.3, 4), (1.1, 0.8, 16), M("p4", jom.lin("ink", 0.9), 0.9))
    steel = M("m4", jom.lin("saw", 0.3), 0.4, 0.6)
    desk_row(dx, -1.6, M("d4", jom.lin("ink", 0.8), 0.7), steel, stacked=True)
    jom.cylinder("bulb_cord", (dx, -2.5, 10.4), 0.02, 3.2, steel)
    jom.sphere("bulb", (dx, -2.5, 8.7), 0.18, M("bb4", jom.lin("marigold"), 0.3, emission=jom.lin("marigold", 0.6), strength=1.2))
    jom.area((dx, -3.5, 8.0), (math.radians(90), 0, 0), 180, 3.0, "marigold", 0.8)
    pool(dx, -4.6, 6.0, 120, "sky")
    pool(dx, 4.6, 6.0, 120, "sky")


CHAPTERS = {1: (ch1, "chalk", 1.1), 2: (ch2, "chalk", 1.0), 3: (ch3, "chalk", 0.7), 4: (ch4, "sky", 0.9)}


def render(chapter):
    build, light, strength = CHAPTERS[chapter]
    jom.reset()
    for dx in (-P, 0, P):
        build(dx)
    jom.world("ink", 0.6, 0.6)
    jom.sun((math.radians(62), 0, math.radians(-24)), strength, light, angle=0.15)
    scene = bpy.context.scene
    if hasattr(scene.eevee, "use_raytracing"):
        scene.eevee.use_raytracing = False  # screen-space effects can't see past the tile edge
    scene.eevee.taa_render_samples = 64
    bpy.ops.object.camera_add(location=(0, -40, 4), rotation=(math.radians(90), 0, 0))
    cam = bpy.context.object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = P
    cam.data.clip_end = 100
    scene.camera = cam
    OUT.mkdir(parents=True, exist_ok=True)
    jom.output(OUT / f"backdrop-ch{chapter}.webp", 1024, 1024, quality=78)
    bpy.ops.render.render(write_still=True)


args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
for ch in [int(a) for a in args] or list(CHAPTERS):
    render(ch)
