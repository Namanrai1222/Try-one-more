"""Shared helpers for the Blender art scripts: palette tokens, materials, primitives, the runner.

Colours come only from packages/ui/src/tokens.ts (CLAUDE.md), read at run time, so a token
change re-colours every render. Shades are derived by scaling a token, never by new hex values.

Run a script with:  /Applications/Blender.app/Contents/MacOS/Blender -b --python <script>.py
"""

import math
import re
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
TOKENS = (ROOT / "packages/ui/src/tokens.ts").read_text()
_HEX = dict(re.findall(r"'?([a-z-]+)'?:\s*'#([0-9A-Fa-f]{6})'", TOKENS))


def srgb(token: str) -> tuple[float, float, float]:
    """A token as 0–1 sRGB channels (what a browser shows)."""
    h = _HEX[token]
    return tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))


def _linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(token: str, k: float = 1.0, mix: tuple[str, float] | None = None):
    """A token as linear RGBA for Blender materials; `k` scales it, `mix` lerps towards another."""
    r, g, b = (_linear(c) for c in srgb(token))
    if mix:
        other, t = mix
        o = [_linear(c) for c in srgb(other)]
        r, g, b = (r + (o[0] - r) * t, g + (o[1] - g) * t, b + (o[2] - b) * t)
    return (r * k, g * k, b * k, 1.0)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    try:
        scene.display_settings.display_device = "sRGB"
        scene.view_settings.view_transform = "Standard"
    except TypeError:
        pass  # older builds: keep the default transform
    return scene


def material(name, color, roughness=0.8, metallic=0.0, emission=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = strength
    mat.diffuse_color = color
    return mat


def _finish(obj, name, mat, bevel=0.0, smooth=False):
    obj.name = name
    if mat is not None:
        obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("edge", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    if smooth:
        bpy.ops.object.shade_smooth()
    return obj


def box(name, loc, size, mat, bevel=0.0, rot=(0, 0, 0)):
    """`size` is the full width/depth/height, not Blender's half-extent scale."""
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = bpy.context.object
    obj.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(obj, name, mat, bevel)


def cylinder(name, loc, radius, depth, mat, rot=(0, 0, 0), verts=32, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    return _finish(bpy.context.object, name, mat, bevel, smooth=True)


def cone(name, loc, radius, depth, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=radius, depth=depth, location=loc, rotation=rot)
    return _finish(bpy.context.object, name, mat, smooth=True)


def sphere(name, loc, radius, mat, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=14, radius=radius, location=loc)
    obj = bpy.context.object
    obj.scale = scale
    return _finish(obj, name, mat, smooth=True)


def capsule(name, a, b, radius, mat):
    """A limb from point a to point b: a cylinder with rounded ends."""
    ax, ay, az = a
    bx, by, bz = b
    dx, dy, dz = bx - ax, by - ay, bz - az
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    mid = ((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2)
    # Cylinders point along +z: tilt to the a→b direction.
    rot = (math.acos(max(-1, min(1, dz / length))), 0, math.atan2(dx, -dy) if (dx or dy) else 0)
    parts = [cylinder(name, mid, radius, length, mat, rot=rot, verts=16)]
    parts.append(sphere(name + "_a", a, radius, mat))
    parts.append(sphere(name + "_b", b, radius, mat))
    return parts


def runner(origin, looks, scale=1.0, pose="jump", turn=0.0):
    """The game's player (render.ts makeHuman), 1 unit tall at scale 1, feet at `origin`.

    Faces −y (towards a camera in front), then turns `turn` radians about z (render.ts turns
    1.15 towards the direction of travel). `pose`: "jump" (knee tucked, arms up) or "run".
    """
    before = set(bpy.data.objects)
    _build_runner((0, 0, 0), looks, scale, pose)
    bpy.ops.object.empty_add(location=origin, rotation=(0, 0, turn))
    root = bpy.context.object
    root.name = "runner"
    for obj in set(bpy.data.objects) - before - {root}:
        obj.parent = root
    return root


def _build_runner(origin, looks, scale, pose):
    ox, oy, oz = origin
    s = scale

    def p(x, y, z):
        return (ox + x * s, oy + y * s, oz + z * s)

    top, legs, skin, hair, shoes = (looks[k] for k in ("top", "legs", "skin", "hair", "shoes"))
    sphere("torso", p(0, 0, 0.62), 0.17 * s, top, scale=(1, 0.72, 1.18))
    cylinder("neck", p(0, 0, 0.8), 0.042 * s, 0.07 * s, skin)
    sphere("head", p(0, 0, 0.9), 0.1 * s, skin)
    hair_cap = sphere("hair", p(0, 0.012, 0.93), 0.106 * s, hair, scale=(1, 1, 0.78))
    hair_cap.location.z += 0.0
    for x in (-0.035, 0.035):
        sphere("eye", p(x, -0.094, 0.912), 0.013 * s, looks["eyes"])
    if pose == "jump":
        arms = [((-0.185, 0, 0.75), (-0.27, -0.02, 0.95), (-0.3, -0.05, 1.12)),
                ((0.185, 0, 0.75), (0.28, 0.0, 0.93), (0.33, -0.03, 1.1))]
        lgs = [((-0.075, 0, 0.47), (-0.1, -0.2, 0.36), (-0.09, -0.06, 0.2)),
               ((0.075, 0, 0.47), (0.09, 0.05, 0.27), (0.1, 0.16, 0.08))]
    else:
        arms = [((-0.185, 0, 0.75), (-0.2, 0.12, 0.6), (-0.2, 0.02, 0.48)),
                ((0.185, 0, 0.75), (0.2, -0.12, 0.6), (0.2, -0.2, 0.7))]
        lgs = [((-0.075, 0, 0.47), (-0.08, -0.14, 0.27), (-0.08, -0.12, 0.04)),
               ((0.075, 0, 0.47), (0.08, 0.12, 0.28), (0.08, 0.26, 0.14))]
    for sh, el, hand in arms:
        capsule("upper_arm", p(*sh), p(*el), 0.045 * s, top)
        capsule("forearm", p(*el), p(*hand), 0.04 * s, top)
        sphere("hand", p(*hand), 0.045 * s, skin)
    for hip, knee, foot in lgs:
        capsule("thigh", p(*hip), p(*knee), 0.065 * s, legs)
        capsule("shin", p(*knee), p(*foot), 0.055 * s, legs)
        box("shoe", p(foot[0], foot[1] - 0.03, foot[2] - 0.02), (0.09 * s, 0.16 * s, 0.05 * s), shoes, 0.01 * s)


def runner_looks():
    """Hoodie, jeans, sneakers, skin and hair as render.ts colours them."""
    return {
        "top": material("hoodie", lin("marigold"), 0.45),
        "legs": material("jeans", lin("cobalt", 0.45), 0.85),
        "skin": material("skin", lin("paper-shadow", 0.92 * 0.95, mix=("vermilion", 0.22)), 0.6),
        "hair": material("hair", lin("carbon"), 0.8),
        "shoes": material("shoes", lin("chalk", 0.9), 0.5),
        "eyes": material("eyes", lin("carbon"), 0.3),
    }


def sun(rotation, strength, color_token="chalk", angle=0.08, k=1.0):
    bpy.ops.object.light_add(type="SUN", rotation=rotation)
    light = bpy.context.object
    light.data.energy = strength
    light.data.color = lin(color_token, k)[:3]
    light.data.angle = angle
    return light


def area(loc, rotation, power, size, color_token="chalk", k=1.0, size_y=None):
    bpy.ops.object.light_add(type="AREA", location=loc, rotation=rotation)
    light = bpy.context.object
    light.data.energy = power
    light.data.size = size
    if size_y:
        light.data.shape = "RECTANGLE"
        light.data.size_y = size_y
    light.data.color = lin(color_token, k)[:3]
    return light


def world(token, k=1.0, strength=1.0):
    w = bpy.data.worlds.new("world")
    w.use_nodes = True
    bg = w.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = lin(token, k)
    bg.inputs["Strength"].default_value = strength
    bpy.context.scene.world = w
    return w


def output(path, width, height, fmt="WEBP", quality=82):
    scene = bpy.context.scene
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = fmt
    scene.render.image_settings.quality = quality
    scene.render.image_settings.color_mode = "RGB"
    scene.render.film_transparent = False
    scene.render.filepath = str(path)
