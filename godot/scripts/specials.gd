# Specials and ultimates (port of SPECIALS / ULTIMATES in the web game's moves.js).
# Each script is a method run(f, t, dt) -> bool (false = finished), with its state in f.sv.
# Specials keep the web game's timings, damage, hit properties and projectile behaviour with
# simpler visuals. Ultimates follow the same "opener -> lock -> scripted combo" structure and
# the same overall damage as the originals, but their cinematics are cut down.
extends RefCounted

var g   # Match

const WHITE = Color(1, 1, 1)

func has_script(id: String) -> bool: return has_method("sp_" + id) or has_method("ult_" + id)
func can_start(id: String, f) -> bool:
	if id == "shieldThrow": return not f.shield_out
	return true
func run(id: String, f, t: float, dt: float) -> bool:
	if has_method("sp_" + id): return call("sp_" + id, f, t, dt)
	return call("ult_" + id, f, t, dt)
func cleanup(id: String, f):
	if f.sv.has("tendril") and is_instance_valid(f.sv.tendril): f.sv.tendril.queue_free()
	if f.sv.has("beam") and is_instance_valid(f.sv.beam): f.sv.beam.queue_free()
	f.sv.erase("flip_x")
	if g != null:
		var opp = g.opponent_of(f)
		if opp != null and g.cam_focus != null and g.cam_focus.f == opp: g.cam_focus = null
	f.grow = 1.0

# ------------------------------------------------------------------ helpers
func orb(c: Color, r: float) -> Node3D:
	var n = Node3D.new()
	var outer = MeshInstance3D.new(); var sm = SphereMesh.new(); sm.radius = r; sm.height = r * 2; outer.mesh = sm
	outer.material_override = g.fx.glow_mat(Color(c.r, c.g, c.b, 0.55)); n.add_child(outer)
	var inner = MeshInstance3D.new(); var sm2 = SphereMesh.new(); sm2.radius = r * 0.5; sm2.height = r; inner.mesh = sm2
	inner.material_override = g.fx.glow_mat(WHITE); n.add_child(inner)
	for m in [outer, inner]: m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return n

func solid(mesh: Mesh, c: Color, metal := 0.2, rough := 0.5) -> MeshInstance3D:
	var mi = MeshInstance3D.new(); mi.mesh = mesh
	var m = StandardMaterial3D.new(); m.albedo_color = c; m.metallic = metal; m.roughness = rough
	mi.material_override = m
	return mi

# a thin cylinder stretched between two points each frame (web lines, tendrils, beams)
func strand(c: Color, radius := 0.02, glow := false) -> MeshInstance3D:
	var mi = MeshInstance3D.new()
	var cm = CylinderMesh.new(); cm.top_radius = radius; cm.bottom_radius = radius; cm.height = 1.0; cm.radial_segments = 6
	mi.mesh = cm
	if glow: mi.material_override = g.fx.glow_mat(c)
	else:
		var m = StandardMaterial3D.new(); m.albedo_color = c; m.roughness = 0.5; mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	g.fx.add_child(mi)
	return mi

static func set_ends(mi: Node3D, a: Vector3, b: Vector3):
	var d = b - a
	var l = max(0.01, d.length())
	mi.position = (a + b) * 0.5
	var y = d / l
	var x = y.cross(Vector3.FORWARD if abs(y.z) < 0.9 else Vector3.RIGHT).normalized()
	var z = x.cross(y)
	mi.basis = Basis(x, y * l, z)

func hit(o: Dictionary) -> Dictionary:
	var h = {"id": g.new_hit_id(), "height": "mid", "stun": 0.4, "blockstun": 0.2, "push": 2.0, "kind": "special", "sfx": "heavy"}
	h.merge(o, true)
	return h

func zone(f, x0: float, x1: float, y0: float, y1: float, o: Dictionary):
	var h = hit(o)
	if not h.has("src_x"): h["src_x"] = f.x
	return g.zone_hit(f, {"x0": min(x0, x1), "x1": max(x0, x1), "y0": y0, "y1": y1}, h)

func later(delay: float, fn: Callable):
	var n = Node3D.new()
	var fired = [false]
	g.fx.timed(n, delay, func(_n, k, _dt):
		if k >= 1.0 and not fired[0]: fired[0] = true; fn.call())

# ultimate lock: the foe is held for a scripted sequence of blows
func start_lock(f, opp):
	f.sv["lock_t"] = f.ult_t; f.sv["seq"] = 0; f.sv["locked"] = true
	opp.lock_by(f)

# run timed steps after the lock: {at, pose, dmg, sfx, color, launch, knockdown, final, fx: Callable}
func lock_combo(f, t: float, steps: Array) -> bool:
	var opp = g.opponent_of(f)
	var lt = t - f.sv.lock_t
	while f.sv.seq < steps.size() and lt >= steps[f.sv.seq].at:
		var s = steps[f.sv.seq]; f.sv.seq += 1
		if s.has("pose"): f.sv["combo_pose"] = s.pose
		if s.has("fx"): s.fx.call()
		if s.has("dmg"):
			var final = s.get("final", false)
			g.direct_hit(f, opp, {"id": g.new_hit_id(), "dmg": s.dmg, "stun": 0.6, "push": 0.0, "kind": "ult", "sfx": s.get("sfx", "light"),
				"color": s.get("color", 0xffd27a), "launch": s.get("launch", 0.0), "knockdown": s.get("knockdown", false), "keep_lock": not final, "spark": 2.0 if final else 1.0})
			if final: g.shake(0.8); g.hitstop(0.18)
	if f.sv.has("combo_pose"): f.set_pose(f.sv.combo_pose, 40)
	return f.sv.seq >= steps.size()

func reposition(f, opp, side: int, dist := 1.15):
	g.fx.emit(Vector3(f.x, f.y + 1.1, 0), {"count": 10, "color": Color(f.hero.color), "speed": 3, "life": 0.3, "size": 0.3})
	f.x = clamp(opp.x + side * dist * opp.scale, -g.bounds, g.bounds)
	f.facing = 1 if f.x < opp.x else -1
	f.rig.rotation.y = f.facing * Fighter.FACE_ANGLE

# ================================================================== SPECIALS
func sp_solarFlare(f, t, _dt) -> bool:
	if t < 0.2: f.set_pose("castW"); return true
	f.set_pose("castBoth")
	if not f.sv.has("fired"):
		f.sv["fired"] = true
		var p = f.chest_pos() + Vector3(f.facing * 0.5, 0, 0)
		g.spawn_projectile({"owner": f, "x": p.x, "y": p.y, "vx": f.facing * 15.0, "r": 0.46, "life": 1.2, "mesh": orb(Color("ffc840"), 0.42), "trail": Color("ffd060"),
			"hit": {"dmg": 11, "height": "mid", "stun": 0.5, "blockstun": 0.26, "push": 4.5, "kind": "special", "sfx": "heavy", "color": 0xffd060}})
		g.sfx.play("boom", 0.7, 1.3); g.sfx.play("beam", 0.35)
		g.fx.emit(p, {"count": 24, "color": WHITE, "color2": Color("ffc840"), "speed": 7, "life": 0.3, "size": 0.25})
		g.fx.flash_light(p, Color("ffd060"), 12, 0.25)
	return t < 0.55

func sp_webShot(f, t, _dt) -> bool:
	if t < 0.1: f.set_pose("castW"); return true
	f.set_pose("cast")
	if not f.sv.has("fired"):
		f.sv["fired"] = true
		var p = f.hand_pos()
		var web = strand(Color("f2f2f2"), 0.012)
		g.spawn_projectile({"owner": f, "x": p.x, "y": p.y, "vx": f.facing * 22.0, "r": 0.3, "life": 0.6, "mesh": orb(WHITE, 0.2), "trail": WHITE,
			"hit": {"dmg": 5, "height": "mid", "stun": 0.35, "blockstun": 0.18, "push": 0.6, "root": 0.8, "slow": 1.6, "kind": "special", "sfx": "web", "color": 0xffffff},
			"on_update": func(pr, _d): if is_instance_valid(web): set_ends(web, f.hand_pos(), Vector3(pr.x, pr.y, 0)),
			"on_hit": func(res, target): if res == "hit": web_wrap(target, 0.85),
			"on_end": func(_p, _t): if is_instance_valid(web): web.queue_free()})
		g.sfx.play("whoosh", 0.7, 1.6)
	return t < 0.42

func web_wrap(target, life: float):
	var grp = Node3D.new()
	for i in 5:
		var tm = TorusMesh.new(); tm.inner_radius = 0.28 * target.scale; tm.outer_radius = 0.31 * target.scale
		var r = solid(tm, Color("f4f4f4"), 0.0, 0.6)
		r.position.y = (0.25 + i * 0.32) * target.scale; r.rotation.x = 0.25 if i % 2 else -0.25
		grp.add_child(r)
	g.fx.timed(grp, life, func(n, _k, _d): n.position = Vector3(target.x, target.y, 0))

func sp_groundBreaker(f, t, _dt) -> bool:
	if t < 0.3: f.set_pose("smashW"); f.armor = true; return true
	f.set_pose("smash", 30); f.armor = false
	if not f.sv.has("fired"):
		f.sv["fired"] = true
		var x = clamp(f.x + f.facing * 1.1 * f.scale, -g.bounds, g.bounds)
		var p = Vector3(x, 0.05, 0)
		g.sfx.play("boom", 0.85); g.shake(0.75); g.hitstop(0.06)
		g.fx.ring(p, Color("ffb070"), 3.3, 0.42, true); g.fx.ring(p, WHITE, 1.9, 0.25, true); g.fx.dust(p, 30)
		g.fx.flash_light(Vector3(x, 0.6, 0), Color("ffa060"), 10, 0.25)
		rocks(p)
		zone(f, x - 2.3, x + 2.3, 0, 1.4, {"dmg": 11, "height": "low", "stun": 0.55, "blockstun": 0.26, "push": 3.5, "slow": 1.2, "color": 0xffb070})
	return t < 0.75

func rocks(p: Vector3):
	var grp = Node3D.new(); grp.position = p
	var vel = []
	for i in 9:
		var bm = BoxMesh.new(); var s = 0.12 + randf() * 0.14; bm.size = Vector3(s, s, s)
		var r = solid(bm, Color("6b5a48"), 0.0, 1.0); grp.add_child(r)
		vel.append(Vector3((randf() - 0.5) * 6, 4 + randf() * 4, (randf() - 0.5) * 3))
	g.fx.timed(grp, 0.9, func(n, _k, d):
		for i in n.get_child_count():
			var r = n.get_child(i)
			vel[i].y -= 22 * d; r.position += vel[i] * d
			if r.position.y < 0: r.position.y = 0; vel[i] *= 0.3
			r.rotation.x += d * 9)

func shield_mesh() -> Node3D:
	var holder = Node3D.new()
	var rings = [[0.34, Color("b8141c")], [0.27, Color("e8e8ec")], [0.2, Color("b8141c")], [0.13, Color("1c3c8c")]]
	for i in rings.size():
		var cm = CylinderMesh.new(); cm.top_radius = rings[i][0]; cm.bottom_radius = rings[i][0]; cm.height = 0.04 + i * 0.006; cm.radial_segments = 28
		var d = solid(cm, rings[i][1], 0.5, 0.3); d.rotation.x = PI / 2; holder.add_child(d)
	return holder

func sp_shieldThrow(f, t, _dt) -> bool:
	if t < 0.12: f.set_pose("castW"); return true
	f.set_pose("cast")
	if not f.sv.has("fired"):
		f.sv["fired"] = true
		f.shield_out = true
		var p = f.hand_pos()
		var start_x = p.x
		var holder = shield_mesh()
		var st = {"back": false}
		g.spawn_projectile({"owner": f, "x": p.x, "y": p.y, "vx": f.facing * 17.0, "r": 0.34, "life": 3.5, "mesh": holder, "trail": Color("bfd6ff"), "persistent": true,
			"hit": {"dmg": 7, "height": "mid", "stun": 0.4, "blockstun": 0.2, "push": 3, "kind": "special", "sfx": "shield", "color": 0xbfd6ff},
			"on_update": func(pr, d):
				holder.rotation.z += d * 25
				if not st.back and (abs(pr.x - start_x) > 9 or abs(pr.x) > g.bounds + 1 or pr.hit_count > 0):
					st.back = true; g.reset_projectile_hits(pr); g.sfx.play("hit_sharp", 0.5, 1.6)
				if st.back:
					var h = f.hand_pos(); var dx = h.x - pr.x; var dy = h.y - pr.y; var dd = max(0.001, Vector2(dx, dy).length())
					pr.vx = dx / dd * 19; pr.vy = dy / dd * 19
					if dd < 0.6: g.kill_projectile(pr),
			"on_end": func(_p, _t): f.shield_out = false})
		g.sfx.play("whoosh", 0.8)
	return t < 0.42

func sp_dashSlash(f, t, dt) -> bool:
	if t < 0.1: f.set_pose("slashW"); f.vx = 0
	elif t < 0.3:
		if not f.sv.has("fired"): f.sv["fired"] = true; f.sv["hid"] = g.new_hit_id(); g.sfx.play("whoosh", 0.9, 1.5)
		f.set_pose("slash", 30)
		f.vx = f.facing * 21; f.no_push = true
		g.fx.emit(Vector3(f.x, f.y + 1.1, 0), {"count": 2, "color": Color("6fd0ff"), "speed": 0.5, "life": 0.25, "size": 0.4, "drag": 6})
		var h = hit({"dmg": 11, "stun": 0.55, "blockstun": 0.25, "push": 4.5, "sfx": "slash", "color": 0x8fdcff, "src_x": f.x - f.facing})
		h.id = f.sv.hid
		var x0 = f.x - f.facing * 0.3; var x1 = f.x + f.facing * 1.4
		g.zone_hit(f, {"x0": min(x0, x1), "x1": max(x0, x1), "y0": 0.5, "y1": 1.85}, h)
	else:
		f.no_push = false
		f.vx *= max(0.0, 1 - 14 * dt)
		f.set_pose("slash")
	return t < 0.56

func root_cluster(n: int, spread: float, height: float) -> Node3D:
	var grp = Node3D.new()
	for i in n:
		var h = height * (0.6 + randf() * 0.6)
		var cm = CylinderMesh.new(); cm.top_radius = 0.005; cm.bottom_radius = 0.07 + randf() * 0.06; cm.height = h; cm.radial_segments = 5
		var c = solid(cm, Color("5a3e22"), 0.0, 0.95)
		c.position = Vector3(cos(i * 1.3) * spread * randf(), h / 2, sin(i * 1.3) * spread * 0.6 * randf())
		c.rotation = Vector3((randf() - 0.5) * 0.7, randf() * 6, (randf() - 0.5) * 0.7)
		grp.add_child(c)
	return grp

func root_burst(x: float, life: float, n := 7, spread := 0.5, height := 1.0, follow = null):
	var grp = root_cluster(n, spread, height)
	grp.position = Vector3(x, 0, 0); grp.scale = Vector3(1, 0.01, 1)
	g.fx.timed(grp, life, func(m, k, _d):
		if follow != null: m.position.x = follow.x
		m.scale.y = k / 0.15 if k < 0.15 else (max(0.01, (1 - k) / 0.2) if k > 0.8 else 1.0))
	g.fx.dust(Vector3(x, 0.1, 0), 6)

func sp_rootSnare(f, t, _dt) -> bool:
	if t < 0.24: f.set_pose("smashW"); return true
	f.set_pose("smash", 30)
	if not f.sv.has("fired"):
		f.sv["fired"] = true
		var x0 = f.x + f.facing * 0.9 * f.scale
		g.sfx.play("heavy_bass", 0.6, 1.3); g.fx.dust(Vector3(x0, 0.05, 0), 10)
		var head = root_cluster(5, 0.25, 0.7)
		var trail = [0.0]
		g.spawn_projectile({"owner": f, "x": x0, "y": 0.3, "vx": f.facing * 12.0, "r": 0.5, "life": 0.8, "mesh": head, "ground": true, "clash": false,
			"hit": {"dmg": 7, "height": "low", "stun": 0.45, "blockstun": 0.22, "push": 1, "root": 1.0, "slow": 0.6, "kind": "special", "sfx": "heavy", "color": 0xc8a060},
			"on_update": func(pr, d):
				trail[0] -= d
				if trail[0] <= 0: trail[0] = 0.07; root_burst(pr.x, 0.55, 3, 0.25, 0.45),
			"on_hit": func(res, target): if res == "hit": root_burst(target.x, 1.05, 9, 0.35, 0.9 * target.scale, target)})
	return t < 0.6

func sp_symbioteLash(f, t, _dt) -> bool:
	if t < 0.2: f.set_pose("castW"); return true
	f.set_pose("cast")
	if not f.sv.has("tendril"): f.sv["tendril"] = strand(Color("05050a"), 0.05)
	var reach = 3.4 * f.scale
	var ext = (t - 0.2) / 0.12 if t < 0.32 else max(0.0, 1 - (t - 0.36) / 0.18)
	var base = f.hand_pos()
	var tip = Vector3(base.x + f.facing * reach * clamp(ext, 0.02, 1.0), base.y - 0.1 + sin(t * 30) * 0.05, 0.2)
	set_ends(f.sv.tendril, base, tip)
	if t >= 0.3 and not f.sv.has("fired"):
		f.sv["fired"] = true
		var x1 = f.x + f.facing * (reach + 0.4)
		var r = zone(f, f.x, x1, 0.6, 1.9, {"dmg": 9, "stun": 0.5, "blockstun": 0.24, "push": 4, "sfx": "slash", "color": 0x9aa8ff})
		g.sfx.play("hit_sharp" if r == "hit" else "whoosh", 0.8, 0.7)
	if t >= 0.56: cleanup("symbioteLash", f); f.sv.erase("tendril"); return false
	return true

func hammer_mesh() -> Node3D:
	var n = Node3D.new()
	var head = BoxMesh.new(); head.size = Vector3(0.34, 0.2, 0.2)
	n.add_child(solid(head, Color("9aa0aa"), 0.9, 0.3))
	var hm = CylinderMesh.new(); hm.top_radius = 0.025; hm.bottom_radius = 0.025; hm.height = 0.4
	var handle = solid(hm, Color("6a4a2a"), 0.0, 0.7); handle.position.y = -0.28; n.add_child(handle)
	return n

func sp_kineticSurge(f, t, _dt) -> bool:
	var opp = g.opponent_of(f)
	var BLUE = Color("9fd8ff")
	var S = f.sv
	if t < 0.42:
		f.set_pose("sky", 20)
		var h = f.hand_pos()
		if not S.has("spun"): S["spun"] = true; g.sfx.play("zap", 0.6); g.sfx.play("whoosh", 0.9)
		if randf() < 0.5: g.fx.bolt(h, h + Vector3(cos(t * 38) * 1.1, 0.25 + randf() * 0.5, sin(t * 38) * 0.6), BLUE, 0.06, 0.03, 1)
		return true
	if not S.has("pr"):
		var p = f.hand_pos()
		var mesh = hammer_mesh()
		S["pr"] = g.spawn_projectile({"owner": f, "x": p.x + f.facing * 0.3, "y": p.y, "vx": f.facing * 24.0, "r": 0.38, "life": 1.8, "mesh": mesh, "trail": BLUE, "persistent": true,
			"hit": {"dmg": 6, "height": "mid", "stun": 0.7, "blockstun": 0.25, "push": 1, "kind": "special", "sfx": "zap", "color": 0x9fd8ff, "pull": true},
			"on_hit": func(res, _t): if res == "hit": S["hit"] = true,
			"on_update": func(pr, d):
				mesh.rotation.z -= f.facing * d * 22
				if randf() < 0.5: var a = Vector3(pr.x, pr.y, 0); g.fx.bolt(a, a + Vector3((randf() - 0.5) * 1.3, (randf() - 0.5) * 1.3, 0), BLUE, 0.05, 0.025, 0)
				if not S.has("back") and (pr.hit_count > 0 or abs(pr.x - f.x) > 8.5 or abs(pr.x) > g.bounds + 1): S["back"] = true; g.sfx.play("whoosh", 1.0)
				if S.has("back"):
					var h = f.hand_pos(); var dx = h.x - pr.x; var dy = h.y - pr.y; var dd = max(0.001, Vector2(dx, dy).length())
					pr.vx = dx / dd * 26; pr.vy = dy / dd * 26
					if dd < 0.55: g.kill_projectile(pr),
			"on_end": func(_p, _t): S["caught"] = true})
		g.sfx.play("boom", 0.7, 1.4)
	f.set_pose("cast", 30)
	if S.has("hit") and not S.has("clothes") and opp.state != "ko" and abs(opp.x - f.x) < 1.5 * f.scale:
		S["clothes"] = true; S["clothes_t"] = t
		g.direct_hit(f, opp, {"id": g.new_hit_id(), "dmg": 5, "stun": 0.6, "push": 6, "kind": "special", "sfx": "heavy", "color": 0x9fd8ff, "knockdown": true, "shake": 0.5})
		g.fx.bolt(f.chest_pos(), opp.chest_pos(), BLUE, 0.12, 0.06, 2)
	if S.has("clothes"): f.set_pose("hook", 40)
	var done = S.has("caught") and (not S.has("hit") or S.has("clothes")) and (not S.has("clothes_t") or t - S.clothes_t > 0.25)
	return not (done or t > 2.2)

func sp_mysticBolts(f, t, _dt) -> bool:
	var GREEN = Color("5cff6a")
	var M = f.sv
	if not M.has("shot"): M["shot"] = 0; g.sfx.play("zap", 0.6); g.sfx.play("beam", 0.4)
	f.set_pose("castW" if t < 0.25 else "castBoth", 30)
	if randf() < 0.4: var h = f.hand_pos(randf() < 0.5); g.fx.bolt(h, h + Vector3((randf() - 0.5) * 0.4, randf() * 0.4, 0), GREEN, 0.05, 0.02, 0)
	while M.shot < 3 and t >= 0.3 + M.shot * 0.12:
		var i = M.shot; M.shot += 1
		var base = f.chest_pos()
		var p = Vector3(base.x + f.facing * (0.9 + i * 0.12) * f.scale, base.y + (i - 1) * 0.55 * f.scale, 0.25)
		g.fx.ring(p, Color("ffcc40"), 0.9, 0.3)
		var cm = CylinderMesh.new(); cm.top_radius = 0.0; cm.bottom_radius = 0.07; cm.height = 0.9
		var lance = MeshInstance3D.new(); lance.mesh = cm; lance.material_override = g.fx.glow_mat(GREEN); lance.rotation.z = -PI / 2 * f.facing
		var holder = Node3D.new(); holder.add_child(lance)
		g.spawn_projectile({"owner": f, "x": p.x, "y": p.y, "vx": f.facing * 30.0, "r": 0.3, "life": 0.7, "mesh": holder, "trail": GREEN, "ground": true,
			"hit": {"dmg": 3.5, "height": "mid", "stun": 0.42, "blockstun": 0.2, "push": 1.8, "kind": "special", "sfx": "zap", "sfx_vol": 0.6, "color": 0x5cff6a, "slow": 1.3}})
		g.sfx.play("boom", 0.4, 1.6)
		g.fx.emit(p, {"count": 10, "color": Color("d8ffd0"), "color2": GREEN, "dir": Vector3(f.facing, 0, 0), "spread": 0.4, "speed": 7, "life": 0.2, "size": 0.15})
	return t <= 1.2

func sp_missileBarrage(f, t, _dt) -> bool:
	var opp = g.opponent_of(f)
	var ORANGE = Color("ff9030"); var BLUE = Color("7fd8ff")
	var M = f.sv
	if not M.has("n"): M["n"] = 0
	f.set_pose("charge", 24)
	while M.n < 12 and t >= 0.08 + M.n * 0.035:
		var i = M.n; M.n += 1
		var sd = 1 if i % 2 else -1
		var start = f.chest_pos() + Vector3(-f.facing * 0.1, 0.4, sd * 0.25)
		var target = opp.chest_pos() + Vector3((randf() - 0.5) * 0.5, (randf() - 0.5) * 0.7, 0)
		var ctrl = start.lerp(target, 0.4) + Vector3(0, 1.6 + randf() * 1.2, sd * 1.2)
		var bm = CapsuleMesh.new(); bm.radius = 0.035; bm.height = 0.22
		var mesh = solid(bm, Color("dddddd"), 0.8, 0.3)
		var life = 0.4 + randf() * 0.15
		var hid = g.new_hit_id()
		g.fx.timed(mesh, life, func(m, k, _d):
			var a = start.lerp(ctrl, k); var b = ctrl.lerp(target, k); var p = a.lerp(b, k)
			m.position = p
			g.fx.emit(p, {"count": 1, "color": ORANGE, "color2": Color("ffe0a0"), "speed": 0.4, "life": 0.15, "size": 0.12})
			if k >= 1.0:
				g.fx.hit_spark(p, ORANGE, 0.5)
				var h = hit({"dmg": 0.6, "stun": 0.3, "blockstun": 0.12, "push": 0.35, "sfx": "light", "sfx_vol": 0.4, "color": 0xff9030, "spark": 0.4})
				h.id = hid
				g.zone_hit(f, {"x0": p.x - 0.45, "x1": p.x + 0.45, "y0": p.y - 0.6, "y1": p.y + 0.6}, h))
		if i % 3 == 0: g.sfx.play("whoosh", 0.5, 1.5)
	if t > 0.66 and t < 1.04:
		var c = f.chest_pos()
		var end = Vector3(g.bounds + 4 if f.facing > 0 else -g.bounds - 4, c.y, c.z)
		if not M.has("beam"): M["beam"] = strand(BLUE, 0.2, true); M["tick"] = 0; g.sfx.play("beam", 0.9)
		set_ends(M.beam, c, end)
		if t >= 0.7 + M.tick * 0.11 and M.tick < 3:
			M.tick += 1
			zone(f, c.x, end.x, c.y - 0.4, c.y + 0.4, {"dmg": 1.5, "stun": 0.3, "blockstun": 0.14, "push": 3.0 if M.tick == 3 else 0.8, "sfx": "light", "sfx_vol": 0.5, "color": 0x7fd8ff})
	elif M.has("beam"):
		if is_instance_valid(M.beam): M.beam.queue_free()
		M.erase("beam")
	return t <= 1.12

func sp_teleportSlice(f, t, _dt) -> bool:
	var opp = g.opponent_of(f)
	var T = f.sv
	if not T.has("hits"): T["hits"] = 0
	if t < 0.1: f.set_pose("slashW"); return true
	if not T.has("blink"):
		T["blink"] = true
		g.fx.emit(f.chest_pos(), {"count": 16, "color": Color("ff2020"), "speed": 3, "life": 0.3, "size": 0.2})
		var sd = sign(opp.x - f.x) if opp.x != f.x else f.facing
		var nx = opp.x + sd * 1.0 * opp.scale
		if abs(nx) > g.bounds: nx = opp.x - sd * 1.0 * opp.scale
		f.x = nx; f.facing = 1 if opp.x > f.x else -1; f.rig.rotation.y = f.facing * Fighter.FACE_ANGLE
		g.fx.emit(f.chest_pos(), {"count": 16, "color": Color("ff2020"), "speed": 3, "life": 0.3, "size": 0.2})
		g.sfx.play("whoosh", 1.0)
	f.vx = 0
	var slash = func(n):
		if T.has("s" + str(n)): return
		T["s" + str(n)] = true
		var r = zone(f, f.x, f.x + f.facing * 1.3, 0.5, 1.9, {"dmg": 2.6, "stun": 0.45, "blockstun": 0.2, "push": 0.6, "sfx": "slash", "color": 0xd8dcff})
		if r == "hit": T.hits += 1
		g.fx.ring(Vector3(opp.x, opp.y + 1.2, 0.2), Color("d8dcff"), 1.1, 0.16)
	if t < 0.4:
		f.set_pose("slash" if t < 0.17 else ("slashW" if t < 0.24 else "slash"), 45)
		if t >= 0.15: slash.call(1)
		if t >= 0.3: slash.call(2)
		return true
	if not T.has("flip"):
		T["flip"] = true
		if T.hits > 0:
			var sm = SphereMesh.new(); sm.radius = 0.07; sm.height = 0.14
			var nade = solid(sm, Color("2a3a2a"), 0.3, 0.6)
			g.fx.timed(nade, 0.85, func(m, _k, _d): m.position = Vector3(opp.x - opp.facing * 0.15, opp.y + 1.0 * opp.scale, 0.2))
			g.sfx.play("blip", 0.5)
			later(0.85, func():
				var p = opp.chest_pos()
				g.fx.emit(p, {"count": 40, "color": Color("ffe0a0"), "color2": Color("ff5010"), "speed": 10, "life": 0.45, "size": 0.25})
				g.fx.ring(p, Color("ff8030"), 2.6, 0.35); g.fx.flash_light(p, Color("ff8030"), 22, 0.3)
				g.sfx.play("boom", 1.0); g.shake(0.6)
				if opp.state != "ko": g.direct_hit(f, opp, {"id": g.new_hit_id(), "dmg": 4, "stun": 0.6, "push": 4, "kind": "special", "sfx": "heavy", "color": 0xff8030, "knockdown": true}))
		f.vy = 9; f.vx = -f.facing * 5; f.on_ground = false; T["flip_t"] = t
		g.sfx.play("whoosh", 0.5, 1.3)
	f.set_pose("jump", 30)
	T["flip_x"] = -TAU * min(1.0, (t - T.flip_t) / 0.5)
	if (f.on_ground and t - T.flip_t > 0.1) or t > 1.5: T.erase("flip_x"); return false
	return true

# ================================================================== ULTIMATES
# opener used by most ultimates: a fast dashing strike that locks the foe on hit
func dash_opener(f, t, speed: float, color: int, pose_w := "slashW", pose := "slash") -> bool:
	var opp = g.opponent_of(f)
	if t < 0.1: f.set_pose(pose_w); return true
	if t < 0.4:
		f.set_pose(pose); f.vx = f.facing * speed; f.no_push = true
		if not f.sv.has("hid"): f.sv["hid"] = g.new_hit_id(); g.sfx.play("whoosh", 1.0)
		g.fx.emit(Vector3(f.x, f.y + 1.1, 0), {"count": 2, "color": Color.hex(color * 256 + 255), "speed": 0.5, "life": 0.3, "size": 0.4})
		var h = hit({"dmg": 3, "stun": 0.8, "blockstun": 0.35, "push": 2, "kind": "ult", "color": color})
		h.id = f.sv.hid
		var x0 = f.x - f.facing * 0.3; var x1 = f.x + f.facing * 1.4
		var r = g.zone_hit(f, {"x0": min(x0, x1), "x1": max(x0, x1), "y0": 0.4, "y1": 1.9}, h)
		if r == "hit" and opp.hp > 0: f.vx = 0; f.no_push = false; start_lock(f, opp)
		return true
	f.no_push = false; f.vx *= 0.8; f.set_pose("idle")
	return t < 0.8

# opener for ranged ultimates: a projectile that locks the foe on hit
func shot_opener(f, t, c: Color, speed := 26.0, pose := "castBoth") -> bool:
	if t < 0.1: f.set_pose("castW"); return true
	f.set_pose(pose)
	if not f.sv.has("fired"):
		f.sv["fired"] = true
		var p = f.hand_pos()
		g.spawn_projectile({"owner": f, "x": p.x, "y": p.y, "vx": f.facing * speed, "r": 0.42, "life": 0.6, "mesh": orb(c, 0.28), "trail": c,
			"hit": {"dmg": 3, "height": "mid", "stun": 0.8, "blockstun": 0.3, "push": 1, "kind": "ult", "sfx": "heavy", "color": c.to_rgba32() >> 8},
			"on_hit": func(res, target): if res == "hit" and target.hp > 0: start_lock(f, target)})
		g.sfx.play("beam", 0.8)
	return t < 0.9

func ult_webTakedown(f, t, _dt) -> bool:
	var opp = g.opponent_of(f)
	if not f.sv.get("locked", false): return shot_opener(f, t, WHITE)
	var swing = func(sd, pop := 5.0):
		reposition(f, opp, sd); f.vy = pop; f.on_ground = false
		var line = strand(Color("f2f2f2"), 0.012)
		var anchor = Vector3(opp.x - sd * 0.6, 6.5, -0.4)
		g.fx.timed(line, 0.22, func(m, _k, _d): set_ends(m, f.hand_pos(), anchor))
		g.sfx.play("whoosh", 0.6, 1.6)
	if not f.sv.has("wrapped"): f.sv["wrapped"] = true; web_wrap(opp, 1.6)
	var done = lock_combo(f, t, [
		{"at": 0.05, "fx": swing.bind(-1), "pose": "jab", "dmg": 3.5},
		{"at": 0.22, "fx": swing.bind(1), "pose": "kick", "dmg": 4, "sfx": "heavy"},
		{"at": 0.4, "fx": swing.bind(-1), "pose": "spinKick", "dmg": 4, "sfx": "heavy"},
		{"at": 0.58, "fx": swing.bind(1), "pose": "hook", "dmg": 4, "sfx": "heavy"},
		{"at": 0.76, "fx": swing.bind(-1, 10.0), "pose": "jump"},
		{"at": 1.0, "pose": "diveKick", "dmg": 9, "sfx": "heavy", "knockdown": true, "final": true, "color": 0xffffff,
			"fx": func(): var p = Vector3(opp.x, 0.05, 0); g.fx.ring(p, WHITE, 3, 0.4, true); g.fx.dust(p, 24); g.sfx.play("boom", 0.8); f.vy = -14},
		{"at": 1.6},
	])
	return not done

func ult_bladeFury(f, t, _dt) -> bool:
	var opp = g.opponent_of(f)
	if not f.sv.get("locked", false): return dash_opener(f, t, 24, 0x8fdcff)
	f.vx = 0
	var slash_fx = func(): g.fx.ring(Vector3(opp.x, opp.y + 1.2, 0.2), Color("8fdcff"), 1.2, 0.18)
	var steps = []
	for i in 6:
		var sd = -1 if i % 2 == 0 else 1
		steps.append({"at": 0.04 + i * 0.12, "fx": func(): reposition(f, opp, sd); slash_fx.call(), "pose": "slash", "dmg": 3.2, "sfx": "slash", "color": 0x8fdcff})
	steps.append({"at": 0.82, "pose": "slashW"})
	steps.append({"at": 0.98, "pose": "slash", "dmg": 9, "sfx": "slash", "knockdown": true, "launch": 8, "final": true, "color": 0x8fdcff, "fx": slash_fx})
	steps.append({"at": 1.55})
	return not lock_combo(f, t, steps)

func ult_freedomStrike(f, t, _dt) -> bool:
	var opp = g.opponent_of(f)
	if not f.sv.get("locked", false): return dash_opener(f, t, 26, 0xbfd6ff, "shieldBashW", "shieldBash")
	f.vx = 0
	var ric = func(): g.fx.ring(Vector3(opp.x, opp.y + 1.3, 0.2), Color("bfd6ff"), 1.0, 0.18); g.sfx.play("hit_sharp", 0.6, 1.5)
	return not lock_combo(f, t, [
		{"at": 0.05, "pose": "chop", "dmg": 3.5, "sfx": "shield", "color": 0xbfd6ff, "fx": ric},
		{"at": 0.22, "pose": "kick", "dmg": 3.5, "sfx": "heavy", "fx": func(): reposition(f, opp, 1)},
		{"at": 0.4, "pose": "backKick", "dmg": 4, "sfx": "heavy", "fx": func(): reposition(f, opp, -1)},
		{"at": 0.6, "pose": "cross", "dmg": 3.5, "sfx": "heavy"},
		{"at": 0.8, "pose": "overheadW"},
		{"at": 1.05, "pose": "smash", "dmg": 10, "sfx": "heavy", "knockdown": true, "final": true, "color": 0xbfd6ff,
			"fx": func(): var p = Vector3(opp.x, 0.05, 0); g.fx.ring(p, Color("bfd6ff"), 3.2, 0.45, true); g.fx.dust(p, 30); g.sfx.play("boom", 1.0); rocks(p)},
		{"at": 1.6},
	])

func ult_worldBreaker(f, t, _dt) -> bool:
	var opp = g.opponent_of(f)
	if not f.sv.get("locked", false):
		f.super_armor = true
		if t < 0.35:
			f.set_pose("charge")
			if not f.sv.has("roar"): f.sv["roar"] = true; g.shake(0.5); g.sfx.play("boom", 0.6, 0.6)
			return true
		return dash_opener(f, t - 0.25, 18, 0x7fcf50, "grab", "grab")
	f.vx = 0
	var slam = func():
		var p = Vector3(opp.x, 0.05, 0); g.fx.ring(p, Color("ffb070"), 2.6, 0.35, true); g.fx.dust(p, 22); g.sfx.play("boom", 0.9); g.shake(0.6)
	return not lock_combo(f, t, [
		{"at": 0.05, "pose": "lift"},
		{"at": 0.3, "pose": "smashBack", "dmg": 5, "sfx": "heavy", "fx": slam},
		{"at": 0.55, "pose": "lift"},
		{"at": 0.75, "pose": "smash", "dmg": 5, "sfx": "heavy", "fx": slam},
		{"at": 0.95, "pose": "lift"},
		{"at": 1.15, "pose": "smashBack", "dmg": 5, "sfx": "heavy", "fx": slam},
		{"at": 1.45, "pose": "clapW"},
		{"at": 1.75, "pose": "clap", "dmg": 10, "sfx": "heavy", "knockdown": true, "launch": 9, "final": true, "color": 0xffffff,
			"fx": func(): g.fx.ring(opp.chest_pos(), WHITE, 4.0, 0.45); g.fx.flash_light(opp.chest_pos(), WHITE, 20, 0.3)},
		{"at": 2.3},
	])

func ult_bifrostJudgment(f, t, _dt) -> bool:
	var opp = g.opponent_of(f)
	var BLUE = Color("9fd8ff")
	if not f.sv.get("locked", false):
		f.set_pose("sky", 16)
		if t > 0.6 and not f.sv.has("fired"):
			f.sv["fired"] = true
			g.set_dark(0.5, 3.2)
			var r = g.direct_hit(f, opp, {"id": g.new_hit_id(), "dmg": 3, "stun": 0.8, "push": 0, "kind": "ult", "sfx": "zap", "color": 0x9fd8ff, "keep_lock": true}) if abs(opp.x - f.x) < 9 and opp.on_ground else null
			if r == "hit": start_lock(f, opp); g.focus_on(opp, 2.0, 1.3, 3.4, -0.4)
			else: return false
		return t < 1.2
	var pillar = func():
		var cm = CylinderMesh.new(); cm.top_radius = 0.7; cm.bottom_radius = 0.7; cm.height = 14
		var mi = MeshInstance3D.new(); mi.mesh = cm; mi.material_override = g.fx.glow_mat(Color(0.6, 0.8, 1.0, 0.35)); mi.position = Vector3(opp.x, 7, 0)
		g.fx.timed(mi, 2.0, func(m, k, _d): m.scale.x = 1.0 - k * 0.6; m.scale.z = m.scale.x)
	var strike = func(): g.fx.bolt(Vector3(opp.x + (randf() - 0.5), 9, 0), opp.chest_pos(), BLUE, 0.2, 0.08, 2); g.fx.flash_light(opp.chest_pos(), BLUE, 16, 0.2); g.sfx.play("zap", 0.9)
	var steps = [{"at": 0.0, "pose": "sky", "fx": pillar}]
	for i in 5: steps.append({"at": 0.25 + i * 0.28, "dmg": 3.6, "sfx": "zap", "color": 0x9fd8ff, "fx": strike})
	steps.append({"at": 1.85, "pose": "overhead", "dmg": 9, "sfx": "heavy", "knockdown": true, "launch": 7, "final": true, "color": 0x9fd8ff,
		"fx": func(): for k in 6: g.fx.bolt(Vector3(f.x, 0.3, 0), Vector3(opp.x + (randf() - 0.5) * 2, 0.2, 0), BLUE, 0.3, 0.1, 1)})
	steps.append({"at": 2.4})
	return not lock_combo(f, t, steps)

func ult_monarchsWrath(f, t, _dt) -> bool:
	var opp = g.opponent_of(f)
	var GREEN = Color("5cff6a")
	if not f.sv.get("locked", false):
		f.set_pose("castBoth", 20)
		if t > 0.45 and not f.sv.has("fired"):
			f.sv["fired"] = true
			g.fx.ring(Vector3(opp.x, 0.05, 0), Color("ffcc40"), 2.4, 0.6, true)
			var r = g.direct_hit(f, opp, {"id": g.new_hit_id(), "dmg": 3, "stun": 0.8, "push": 0, "kind": "ult", "sfx": "zap", "color": 0x5cff6a, "keep_lock": true}) if abs(opp.x - f.x) < 10 else null
			if r == "hit": start_lock(f, opp); g.set_dark(0.45, 2.6)
			else: return false
		return t < 1.0
	if f.sv.has("beam") and is_instance_valid(f.sv.beam): set_ends(f.sv.beam, f.hand_pos(), opp.chest_pos())
	var siphon = func(): g.fx.bolt(opp.chest_pos(), f.hand_pos(), GREEN, 0.2, 0.05, 1); g.sfx.play("zap", 0.6)
	var steps = []
	for i in 4: steps.append({"at": 0.1 + i * 0.25, "pose": "cast", "dmg": 3, "sfx": "zap", "color": 0x5cff6a, "fx": siphon})
	steps.append({"at": 1.15, "pose": "castBoth", "fx": func(): f.sv["beam"] = strand(GREEN, 0.18, true); g.sfx.play("beam", 1.0)})
	steps.append({"at": 1.5, "dmg": 4, "sfx": "zap", "color": 0x5cff6a})
	steps.append({"at": 1.8, "dmg": 9, "sfx": "heavy", "knockdown": true, "launch": 8, "final": true, "color": 0x5cff6a,
		"fx": func():
			if f.sv.has("beam") and is_instance_valid(f.sv.beam): f.sv.beam.queue_free()
			var cm = CylinderMesh.new(); cm.top_radius = 0.9; cm.bottom_radius = 1.2; cm.height = 10
			var mi = MeshInstance3D.new(); mi.mesh = cm; mi.material_override = g.fx.glow_mat(Color(0.35, 1.0, 0.4, 0.4)); mi.position = Vector3(opp.x, 5, 0)
			g.fx.timed(mi, 0.8, func(m, k, _d): m.scale = Vector3(1 + k, 1, 1 + k))
			g.fx.flash_light(opp.chest_pos(), GREEN, 22, 0.4); g.sfx.play("boom", 1.0)})
	steps.append({"at": 2.3})
	return not lock_combo(f, t, steps)

func ult_voidErasure(f, t, _dt) -> bool:
	var opp = g.opponent_of(f)
	var PURPLE = Color("8a40ff")
	if not f.sv.get("locked", false):
		f.set_pose("charge" if t < 0.45 else ("castW" if t < 0.82 else "cast"), 14 if t < 0.82 else 30)
		if not f.sv.has("dark"): f.sv["dark"] = true; g.set_dark(0.8, 3.4); g.sfx.play("boom", 0.8, 0.5)
		g.fx.emit(f.chest_pos() + Vector3(0, (randf() - 0.5) * 1.2, 0), {"count": 2, "color": Color(0.05, 0.0, 0.1, 0.9), "color2": Color("2a0a48"), "speed": 1.2, "life": 0.9, "size": 0.4, "up": 0.8, "jitter": 0.6, "grow": 0.6})
		if t >= 0.86 and not f.sv.has("fired"):
			f.sv["fired"] = true
			var reach = min(abs(opp.x - f.x) + 1.2, 9.5)
			var r = zone(f, f.x, f.x + f.facing * reach, 0, 2.6, {"dmg": 3, "stun": 0.9, "blockstun": 0.45, "push": 1.5, "kind": "ult", "color": 0x5a1a8a, "chip": 0.25})
			if r == "hit" and opp.hp > 0: start_lock(f, opp); g.focus_on(opp, 1.9, 1.3, 3.2, -0.5)
			else: f.sv["recede"] = t
		if f.sv.has("recede") and t > f.sv.recede + 0.6: g.set_dark(0, 0); return false
		return true
	var lt = t - f.sv.lock_t
	opp.rig.set_flash(Color(0.1, 0.0, 0.2), 0.9 if lt < 1.45 else 0.0)
	if lt > 0.45 and lt < 1.35:
		g.fx.emit(Vector3(opp.x + (randf() - 0.5) * 0.7, opp.y + randf() * 1.9 * opp.scale, 0.15), {"count": 3, "color": Color(0.02, 0.0, 0.04, 0.9), "color2": Color("1c0a2c"), "speed": 1.5, "life": 0.8, "size": 0.18, "up": 1.0})
	return not lock_combo(f, t, [
		{"at": 0.0, "pose": "cast"},
		{"at": 0.7, "dmg": 5, "sfx": "heavy", "color": 0x1a0828},
		{"at": 1.0, "dmg": 5, "sfx": "heavy", "color": 0x1a0828},
		{"at": 1.3, "dmg": 6, "sfx": "heavy", "color": 0x1a0828},
		{"at": 1.85, "pose": "castBoth", "dmg": 9, "sfx": "heavy", "knockdown": true, "launch": 7, "final": true, "color": 0x8a40ff,
			"fx": func(): g.fx.ring(opp.chest_pos(), PURPLE, 3.5, 0.4); g.set_dark(0, 0)},
		{"at": 2.4},
	])

func ult_ancientForest(f, t, _dt) -> bool:
	var opp = g.opponent_of(f)
	if not f.sv.get("locked", false):
		f.grow = 1.45
		f.set_pose("charge", 10)
		if t > 0.7 and not f.sv.has("fired"):
			f.sv["fired"] = true
			root_burst(opp.x, 2.6, 14, 0.6, 1.6 * opp.scale, opp)
			var r = g.direct_hit(f, opp, {"id": g.new_hit_id(), "dmg": 3, "stun": 0.8, "push": 0, "kind": "ult", "color": 0xc8a060, "keep_lock": true}) if opp.on_ground and abs(opp.x - f.x) < 10 else null
			if r == "hit": start_lock(f, opp)
			else: return false
		return t < 1.2
	var wave = func():
		for i in 8: root_burst(f.x + f.facing * (1 + i * 1.0), 0.8, 4, 0.3, 0.8)
		g.sfx.play("boom", 0.9); g.shake(0.6)
	return not lock_combo(f, t, [
		{"at": 0.1, "pose": "hookW"},
		{"at": 0.35, "pose": "hook", "dmg": 6, "sfx": "heavy", "color": 0xc8a060},
		{"at": 0.7, "pose": "overheadW"},
		{"at": 0.95, "pose": "overhead", "dmg": 7, "sfx": "heavy", "color": 0xc8a060},
		{"at": 1.3, "pose": "smashW"},
		{"at": 1.6, "pose": "smash", "dmg": 10, "sfx": "heavy", "knockdown": true, "launch": 8, "final": true, "color": 0xc8a060, "fx": wave},
		{"at": 2.2},
	])

func ult_venomFeast(f, t, _dt) -> bool:
	var opp = g.opponent_of(f)
	if not f.sv.get("locked", false):
		if t < 0.15: f.set_pose("castW"); return true
		f.set_pose("castBoth")
		if not f.sv.has("tendril"): f.sv["tendril"] = strand(Color("05050a"), 0.06)
		var reach = min(4.5, abs(opp.x - f.x) + 0.2)
		var ext = clamp((t - 0.15) / 0.15, 0.0, 1.0)
		set_ends(f.sv.tendril, f.hand_pos(), f.hand_pos() + Vector3(f.facing * reach * max(0.02, ext), 0, 0))
		if ext >= 1.0 and not f.sv.has("fired"):
			f.sv["fired"] = true
			var r = zone(f, f.x, f.x + f.facing * (reach + 0.4), 0.6, 2.0, {"dmg": 3, "stun": 0.8, "blockstun": 0.3, "push": 1, "kind": "ult", "sfx": "slash", "color": 0x9aa8ff})
			if r == "hit" and opp.hp > 0: start_lock(f, opp)
			else: return t < 0.7
		return t < 0.7
	if f.sv.has("tendril") and is_instance_valid(f.sv.tendril): set_ends(f.sv.tendril, f.hand_pos(), opp.head_pos())
	return not lock_combo(f, t, [
		{"at": 0.05, "pose": "lift", "fx": func(): opp.y = 1.2},
		{"at": 0.35, "pose": "smash", "dmg": 5, "sfx": "heavy", "fx": func(): opp.y = 0; g.fx.dust(Vector3(opp.x, 0.05, 0), 20); g.sfx.play("boom", 0.7)},
		{"at": 0.75, "pose": "bite", "fx": func(): reposition(f, opp, -1, 0.9)},
		{"at": 0.95, "pose": "biteRip", "dmg": 6, "sfx": "slash", "color": 0x9aa8ff},
		{"at": 1.3, "pose": "swordRaise"},
		{"at": 1.6, "pose": "stab", "dmg": 10, "sfx": "slash", "knockdown": true, "final": true, "color": 0x6a74ff,
			"fx": func(): g.fx.ring(Vector3(opp.x, 0.05, 0), Color("6a74ff"), 3, 0.4, true); g.sfx.play("boom", 0.9)},
		{"at": 2.1},
	])

func ult_nanoArsenal(f, t, _dt) -> bool:
	var opp = g.opponent_of(f)
	var BLUE = Color("7fd8ff"); var ORANGE = Color("ff9030")
	if not f.sv.get("locked", false): return dash_opener(f, t, 22, 0x7fd8ff, "hookW", "hook")
	f.vx = 0
	var steps = []
	for i in 4: steps.append({"at": 0.05 + i * 0.13, "pose": "hook" if i % 2 else "cross", "dmg": 2.5, "sfx": "slash", "color": 0x7fd8ff})
	steps.append({"at": 0.65, "pose": "charge", "fx": func():
		for k in 8:
			var p0 = f.chest_pos() + Vector3(0, 0.5, 0)
			var tgt = opp.chest_pos() + Vector3((randf() - 0.5) * 0.6, (randf() - 0.5) * 0.6, 0)
			var mid = p0.lerp(tgt, 0.5) + Vector3(0, 1.5 + randf(), (randf() - 0.5) * 2)
			var bm = SphereMesh.new(); bm.radius = 0.06; bm.height = 0.12
			var mi = MeshInstance3D.new(); mi.mesh = bm; mi.material_override = g.fx.glow_mat(ORANGE)
			g.fx.timed(mi, 0.35 + k * 0.03, func(m, kk, _d): m.position = p0.lerp(mid, kk).lerp(mid.lerp(tgt, kk), kk))
		g.sfx.play("whoosh", 0.8, 1.4)})
	steps.append({"at": 1.05, "dmg": 6, "sfx": "heavy", "color": 0xff9030, "fx": func(): g.fx.hit_spark(opp.chest_pos(), ORANGE, 1.5)})
	steps.append({"at": 1.3, "pose": "castBoth", "fx": func(): f.sv["beam"] = strand(BLUE, 0.3, true); g.sfx.play("beam", 1.0)})
	steps.append({"at": 1.55, "dmg": 10, "sfx": "heavy", "knockdown": true, "launch": 8, "final": true, "color": 0x7fd8ff,
		"fx": func():
			if f.sv.has("beam") and is_instance_valid(f.sv.beam): f.sv.beam.queue_free()
			g.fx.flash_light(opp.chest_pos(), BLUE, 24, 0.3); g.fx.ring(opp.chest_pos(), BLUE, 3.4, 0.4)})
	steps.append({"at": 2.1})
	if f.sv.has("beam") and is_instance_valid(f.sv.beam): set_ends(f.sv.beam, f.chest_pos(), opp.chest_pos())
	return not lock_combo(f, t, steps)

func ult_healthbarBeatdown(f, t, _dt) -> bool:
	var opp = g.opponent_of(f)
	if not f.sv.get("locked", false): return dash_opener(f, t, 24, 0xd8dcff)
	f.vx = 0
	if not f.sv.has("bar"):
		# the foe's health bar, pulled off the HUD and used as a club
		var bm = BoxMesh.new(); bm.size = Vector3(1.2, 0.14, 0.05)
		var bar = MeshInstance3D.new(); bar.mesh = bm; bar.material_override = g.fx.glow_mat(Color(1.0, 0.85, 0.2))
		f.sv["bar"] = bar; g.fx.add_child(bar)
		g.hud.crack(opp.side)
	if is_instance_valid(f.sv.bar):
		f.sv.bar.position = f.hand_pos() + Vector3(f.facing * 0.5, 0.15, 0.1)
		f.sv.bar.rotation.z = sin(t * 18) * 0.8
	var steps = []
	for i in 4: steps.append({"at": 0.1 + i * 0.22, "pose": "overhead" if i % 2 else "hook", "dmg": 3.5, "sfx": "heavy", "color": 0xffd040})
	steps.append({"at": 1.05, "pose": "castBoth", "fx": func():
		if is_instance_valid(f.sv.bar): f.sv.bar.queue_free()
		g.fx.emit(f.hand_pos(), {"count": 20, "color": Color("ffe0a0"), "color2": Color("ff5010"), "speed": 6, "life": 0.3, "size": 0.2})})
	steps.append({"at": 1.3, "dmg": 9, "sfx": "heavy", "knockdown": true, "launch": 8, "final": true, "color": 0xff8030,
		"fx": func(): var p = opp.chest_pos(); g.fx.emit(p, {"count": 50, "color": Color("ffe0a0"), "color2": Color("ff5010"), "speed": 10, "life": 0.45, "size": 0.3}); g.fx.flash_light(p, Color("ff8030"), 22, 0.3); g.sfx.play("boom", 1.0)})
	steps.append({"at": 1.9, "pose": "victory"})
	steps.append({"at": 2.3})
	return not lock_combo(f, t, steps)
