# Lightweight effects: additive particles, hit sparks, shock rings, dust, lightning bolts,
# flash lights, and timed meshes driven by a callback (used by specials and ultimates).
class_name Fx
extends Node3D

var parts := []      # {node, v, life, age, size, grow, drag, gravity}
var timed_list := [] # {node, life, age, fn}
var _sphere: SphereMesh
var _mats := {}

func _ready():
	_sphere = SphereMesh.new(); _sphere.radius = 0.5; _sphere.height = 1.0; _sphere.radial_segments = 8; _sphere.rings = 4

func glow_mat(c: Color) -> StandardMaterial3D:
	var key = c.to_html()
	if _mats.has(key): return _mats[key]
	var m = StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	m.albedo_color = c
	m.no_depth_test = false
	m.disable_receive_shadows = true
	_mats[key] = m
	return m

func emit(p: Vector3, o := {}):
	var n = o.get("count", 6)
	var c1: Color = o.get("color", Color.WHITE)
	var c2: Color = o.get("color2", c1)
	for i in n:
		var mi = MeshInstance3D.new()
		mi.mesh = _sphere
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var col = c1.lerp(c2, randf())
		var mat = glow_mat(col).duplicate()
		mi.material_override = mat
		add_child(mi)
		var dir: Vector3 = o.get("dir", Vector3.ZERO)
		var spread = o.get("spread", 1.0)
		var v = Vector3(randf() - 0.5, randf() - 0.5, (randf() - 0.5) * 0.6).normalized() * spread + dir
		v = v.normalized() * o.get("speed", 3.0) * (0.4 + randf() * 0.8) + Vector3(0, o.get("up", 0.0), 0)
		var j = o.get("jitter", 0.0)
		mi.position = p + Vector3((randf() - 0.5) * j, (randf() - 0.5) * j, (randf() - 0.5) * j)
		var sz = o.get("size", 0.2) * (0.6 + randf() * 0.8)
		mi.scale = Vector3.ONE * sz
		parts.append({"n": mi, "v": v, "life": o.get("life", 0.5) * (0.7 + randf() * 0.6), "age": 0.0, "size": sz,
			"grow": o.get("grow", 0.0), "drag": o.get("drag", 2.0), "g": o.get("gravity", 0.0), "mat": mat, "a": col.a})

func hit_spark(p: Vector3, c: Color, power := 1.0, blocked := false, dir := Vector3.ZERO):
	emit(p, {"count": int(8 * power) + 4, "color": Color.WHITE, "color2": c, "speed": 6 * power, "life": 0.28, "size": 0.12 + 0.05 * power, "dir": dir * 0.8, "drag": 5})
	emit(p, {"count": 1, "color": Color(c.r, c.g, c.b, 0.6), "speed": 0.1, "life": 0.1, "size": 0.25 * power + (0.0 if blocked else 0.1), "grow": 1.5})
	ring(p, Color.WHITE if not blocked else Color("9fd8ff"), 0.9 * power, 0.18, false)

func dust(p: Vector3, n := 8):
	emit(p, {"count": n, "color": Color(0.55, 0.5, 0.45, 0.6), "color2": Color(0.35, 0.32, 0.3, 0.5), "speed": 2.5, "life": 0.6, "size": 0.3, "drag": 3, "gravity": -0.5, "grow": 1.2, "up": 0.8})

# expanding ring; ground=true lies flat on the floor, otherwise faces the camera
func ring(p: Vector3, c: Color, radius := 1.0, life := 0.3, ground := false):
	var mi = MeshInstance3D.new()
	var tm = TorusMesh.new(); tm.inner_radius = 0.42; tm.outer_radius = 0.5; tm.rings = 24; tm.ring_segments = 6
	mi.mesh = tm
	var mat = glow_mat(c).duplicate()
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	mi.position = p
	if not ground: mi.rotation.x = PI / 2
	timed(mi, life, func(n, k, _dt):
		var s = radius * 2.0 * (0.2 + 0.8 * sqrt(k))
		n.scale = Vector3(s, s * (1.0 if ground else 1.0), s)
		mat.albedo_color.a = 1.0 - k)

func flash_light(p: Vector3, c: Color, energy := 8.0, life := 0.25):
	var l = OmniLight3D.new()
	l.light_color = c; l.light_energy = energy; l.omni_range = 6.0
	add_child(l); l.position = p
	timed(l, life, func(n, k, _dt): n.light_energy = energy * (1.0 - k))

# jagged lightning between two points
func bolt(a: Vector3, b: Vector3, c: Color, life := 0.15, width := 0.05, branches := 1):
	var im = ImmediateMesh.new()
	var mi = MeshInstance3D.new(); mi.mesh = im
	var mat = glow_mat(c).duplicate()
	mat.vertex_color_use_as_albedo = false
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	var build = func():
		im.clear_surfaces()
		for br in branches + 1:
			var pts = [a]
			var n = 8
			var end = b if br == 0 else a.lerp(b, 0.4 + randf() * 0.4) + Vector3(randf() - 0.5, randf() - 0.5, 0) * a.distance_to(b) * 0.4
			for i in range(1, n):
				var q = a.lerp(end, float(i) / n)
				pts.append(q + Vector3(randf() - 0.5, randf() - 0.5, (randf() - 0.5) * 0.4) * a.distance_to(end) * 0.12)
			pts.append(end)
			im.surface_begin(Mesh.PRIMITIVE_TRIANGLES, mat)
			var w = width * (1.0 if br == 0 else 0.5)
			for i in pts.size() - 1:
				var p0 = pts[i]; var p1 = pts[i + 1]
				var d = (p1 - p0).normalized()
				var side = d.cross(Vector3(0, 0, 1)).normalized() * w
				if side.length() < 0.001: side = Vector3(w, 0, 0)
				im.surface_add_vertex(p0 - side); im.surface_add_vertex(p0 + side); im.surface_add_vertex(p1 + side)
				im.surface_add_vertex(p0 - side); im.surface_add_vertex(p1 + side); im.surface_add_vertex(p1 - side)
			im.surface_end()
	build.call()
	timed(mi, life, func(n, k, _dt):
		mat.albedo_color.a = 1.0 - k
		if randf() < 0.5: build.call())

# a node that lives `life` seconds; fn(node, k 0..1, dt) runs every frame; freed at the end
func timed(node: Node, life: float, fn: Callable = Callable()):
	if node.get_parent() == null: add_child(node)
	timed_list.append({"n": node, "life": max(0.001, life), "age": 0.0, "fn": fn})

func clear():
	for p in parts: if is_instance_valid(p.n): p.n.queue_free()
	for t in timed_list: if is_instance_valid(t.n): t.n.queue_free()
	parts.clear(); timed_list.clear()

func step(dt: float):
	var keep = []
	for p in parts:
		p.age += dt
		if p.age >= p.life or not is_instance_valid(p.n):
			if is_instance_valid(p.n): p.n.queue_free()
			continue
		p.v *= max(0.0, 1.0 - p.drag * dt)
		p.v.y -= p.g * dt
		p.n.position += p.v * dt
		var k = p.age / p.life
		p.n.scale = Vector3.ONE * p.size * (1.0 + p.grow * k)
		p.mat.albedo_color.a = p.a * (1.0 - k)
		keep.append(p)
	parts = keep
	var keep2 = []
	for t in timed_list:
		t.age += dt
		if not is_instance_valid(t.n): continue
		var k = min(1.0, t.age / t.life)
		if t.fn.is_valid(): t.fn.call(t.n, k, dt)
		if t.age >= t.life: t.n.queue_free(); continue
		keep2.append(t)
	timed_list = keep2
