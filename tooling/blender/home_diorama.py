"""Home hero: the level as an exam paper on the invigilator's desk (DESIGN.md, North Star).

A concrete course stands on a ruled answer sheet: the runner mid-jump over red spikes, the
marigold door ahead, red-pen corrections where earlier attempts died, and the red pen itself.

    /Applications/Blender.app/Contents/MacOS/Blender -b --python tooling/blender/home_diorama.py

Writes apps/web/app/art/home-diorama.webp (1600²) and home-diorama-800.webp.
"""

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
import jom  # noqa: E402

OUT = jom.ROOT / "apps/web/app/art"
scene = jom.reset()

# ---------------------------------------------------------------- materials
desk = jom.material("desk", jom.lin("desk", 0.9), 0.62)
paper = jom.material("paper", jom.lin("paper"), 0.92)
slip = jom.material("slip", jom.lin("paper", 0.86), 0.92)
rule = jom.material("rule", jom.lin("paper-shadow", 0.62), 0.9)
ink = jom.material("ink", jom.lin("ink"), 0.7)
concrete_top = jom.material("concrete_top", jom.lin("paper-shadow", 0.95), 0.95)
concrete_side = jom.material("concrete_side", jom.lin("paper-shadow", 0.62), 0.95)
red = jom.material("red_pen", jom.lin("red-pen"), 0.35, 0.4)
red_ink = jom.material("red_ink", jom.lin("red-pen"), 0.6)
door = jom.material("door", jom.lin("marigold"), 0.4, emission=jom.lin("marigold"), strength=0.75)
frame = jom.material("frame", jom.lin("chalk", 0.92), 0.5)
chalk = jom.material("chalk", jom.lin("chalk"), 0.4, 0.3)
looks = jom.runner_looks()

# ---------------------------------------------------------------- desk and papers
jom.box("desk", (0, 0, -0.25), (40, 30, 0.5), desk)
# A result slip under the answer sheet, knocked askew.
jom.box("slip", (2.6, 1.2, 0.012), (6.2, 4.6, 0.024), slip, rot=(0, 0, math.radians(9)))
SHEET_ROT = math.radians(-4)
jom.box("sheet", (0, 0, 0.04), (9.2, 6.6, 0.04), paper, 0.01, rot=(0, 0, SHEET_ROT))


def on_sheet(x, y, z=0.0):
    """Sheet-local x/y to world, following the sheet's small rotation."""
    c, s = math.cos(SHEET_ROT), math.sin(SHEET_ROT)
    return (x * c - y * s, x * s + y * c, 0.06 + z)


# Ruled answer lines across the front of the sheet, a header rule, and roll-number boxes.
for i in range(5):
    jom.box(f"rule_{i}", on_sheet(0, -1.35 - i * 0.42, 0.002), (8.2, 0.022, 0.004), rule,
            rot=(0, 0, SHEET_ROT))
jom.box("header_rule", on_sheet(0, 2.75, 0.002), (8.2, 0.03, 0.004), rule, rot=(0, 0, SHEET_ROT))
for i in range(7):
    x = -3.9 + i * 0.36
    for dx, dy, w, h in ((0, 0.15, 0.3, 0.02), (0, -0.15, 0.3, 0.02), (-0.15, 0, 0.02, 0.3), (0.15, 0, 0.02, 0.3)):
        jom.box("roll_box", on_sheet(x + dx, 2.98 + dy, 0.002), (w, h, 0.004), rule, rot=(0, 0, SHEET_ROT))

# ---------------------------------------------------------------- the course
H = 0.85  # slab height
slabs = [(-3.9, -0.55), (0.35, 3.95)]
for i, (x0, x1) in enumerate(slabs):
    cx, w = (x0 + x1) / 2, x1 - x0
    jom.box(f"slab_{i}", on_sheet(cx, 0.15, H / 2), (w, 1.5, H), concrete_side, 0.025, rot=(0, 0, SHEET_ROT))
    jom.box(f"slab_top_{i}", on_sheet(cx, 0.15, H + 0.004), (w - 0.03, 1.47, 0.01), concrete_top,
            rot=(0, 0, SHEET_ROT))
    # Expansion joints, like the game's slabs.
    for jx in range(int(x0) + 1, int(x1)):
        jom.box("joint", on_sheet(jx + 0.2, 0.15, H + 0.01), (0.018, 1.47, 0.01), concrete_side,
                rot=(0, 0, SHEET_ROT))

# Pop-up spikes on the far slab, the runner clearing them.
for row, y in enumerate((0.45, -0.1)):
    for i in range(4):
        jom.cone("spike", on_sheet(1.05 + i * 0.27 + row * 0.12, y, H + 0.2), 0.12, 0.42, red)

# The door: chalk frame, glowing marigold panel.
DX = 3.35
jom.box("door_panel", on_sheet(DX, 0.15, H + 0.75), (0.78, 0.06, 1.42), door, rot=(0, 0, SHEET_ROT))
for dx, w, h, dz in ((-0.43, 0.08, 1.56, 0.78), (0.43, 0.08, 1.56, 0.78), (0, 0.94, 0.08, 1.56)):
    jom.box("door_frame", on_sheet(DX + dx, 0.15, H + dz), (w, 0.12, h), frame, rot=(0, 0, SHEET_ROT))

jom.runner(on_sheet(1.45, 0.2, H + 0.7), looks, scale=1.1, pose="jump", turn=1.0 + SHEET_ROT)

# ---------------------------------------------------------------- corrections and the pen
def mark(x, y, size=0.34, angle=0.0):
    for a in (45, -45):
        jom.box("correction", on_sheet(x, y, 0.004), (size, 0.055, 0.006), red_ink,
                rot=(0, 0, SHEET_ROT + math.radians(a + angle)))


mark(-0.1, -1.0, 0.4, 6)
mark(0.55, -1.32, 0.3, -8)
mark(-0.55, -1.45, 0.26, 14)
mark(1.6, -1.05, 0.3, -4)

PEN = math.radians(28)
pen_at = Vector((2.6, -2.35, 0.17))
direction = Vector((math.cos(PEN), math.sin(PEN), 0))
jom.cylinder("pen_body", pen_at, 0.1, 2.6, red, rot=(0, math.radians(90), PEN), bevel=0.01)
jom.cylinder("pen_cap", pen_at + direction * 1.35, 0.105, 0.5, ink, rot=(0, math.radians(90), PEN))
jom.box("pen_clip", pen_at + direction * 1.3 + Vector((0, 0, 0.11)), (0.55, 0.04, 0.03), chalk,
        rot=(0, 0, PEN))
jom.cone("pen_tip", pen_at - direction * 1.45, 0.1, 0.32, ink, rot=(0, math.radians(-90), PEN))

# ---------------------------------------------------------------- light and camera
jom.world("desk", 0.35, 1.0)
jom.area((-5.5, -5.0, 9.0), (math.radians(35), math.radians(-28), 0), 2600, 6.0, "chalk",
         size_y=4.0)  # the desk lamp
jom.area((6.0, 6.0, 4.0), (math.radians(-60), math.radians(40), 0), 900, 5.0, "sky", 0.9)  # cool rim
jom.area((0, -8.0, 2.5), (math.radians(80), 0, 0), 220, 8.0, "paper")  # soft front fill

bpy.ops.object.camera_add(location=(1.4, -8.6, 4.9))
cam = bpy.context.object
target = Vector((0.75, 0.2, 0.95))
cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
cam.data.lens = 44
cam.data.dof.use_dof = True
cam.data.dof.focus_distance = (target - cam.location).length
cam.data.dof.aperture_fstop = 3.2
scene.camera = cam

eevee = scene.eevee
eevee.taa_render_samples = 96
for flag in ("use_raytracing", "use_shadows"):
    if hasattr(eevee, flag):
        setattr(eevee, flag, True)

OUT.mkdir(parents=True, exist_ok=True)
for size, name in ((1600, "home-diorama.webp"), (800, "home-diorama-800.webp")):
    jom.output(OUT / name, size, size, quality=80)
    bpy.ops.render.render(write_still=True)
