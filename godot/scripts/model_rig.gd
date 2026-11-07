# An imported hero model driven by the game's pose library.
#
# Same scheme as the web game's models.js: the model is stood up facing +Z, scaled to the hero's
# height with its feet on the floor, and an invisible "driver" skeleton (the procedural heroes'
# joint layout) is posed every frame. Each mapped model bone takes the driver joint's rotation
# relative to the rest pose (world-rotation retargeting, the same thing Godot's retargeter does
# between two skeleton profiles), so one pose library animates every rig: Mixamo, 3ds Max Biped,
# Unreal/Fortnite and custom names alike (see bones.gd for the name mapping).
# Heroes whose files ship their own clips (the MUA Cap, Thor and Hulk) blend those clips over
# the retargeted pose for attacks, block and specials.
class_name ModelRig
extends Node3D

const Bones = preload("res://scripts/bones.gd")
const Poses = preload("res://scripts/poses.gd")

const DRIVEN = ["hips", "spine", "chest", "head", "lSh", "lEl", "lHand", "rSh", "rEl", "rHand",
	"lHip", "lKnee", "lFoot", "rHip", "rKnee", "rFoot"]
const LOOP_KEYS = ["idle", "walk", "walkBack", "crouch", "block", "taunt", "victory"]

var hero_id := ""
var height := 1.85
var scale_k := 1.0          # height / 1.85: reach, hurtbox and strike heights scale with it
var body: Node3D
var model: Node3D
var skel: Skeleton3D
var B := {}                 # joint -> bone index
var cal := []               # retarget calibration per driven bone
var drv: Driver
var cur := {}               # current blended pose
var ok := false
var anims := {}             # clip name -> Animation (from the file)
var clip_map := {}          # game key -> clip name
var overlay := {}           # active clip overlay state
var rests := {}             # bone -> rest Transform3D (local)
var m_rest := Vector3.ZERO
var d_rest := Vector3.ZERO
var ratio := 1.0
var body_r := 0.15
var flash_mat: ShaderMaterial
var meshes: Array[MeshInstance3D] = []
var head_bone := -1
var anchor := {}

# ------------------------------------------------------------------ driver skeleton
class Driver:
	const D = {"thigh": 0.45, "shin": 0.44, "ground": 0.09, "upper": 0.3, "fore": 0.27, "sw": 0.25, "hw": 0.1}
	var parent := {}
	var offset := {}
	var rot := {}      # joint -> Basis (local)
	var world := {}    # joint -> Transform3D (root-local)
	var body := Basis()
	var hips_y := 0.96
	var order := []
	func _init():
		var leg = D.thigh + D.shin + 0.07
		var add = func(n, p, o): parent[n] = p; offset[n] = o; rot[n] = Basis(); order.append(n)
		add.call("hips", "", Vector3(0, leg, 0)); add.call("spine", "hips", Vector3(0, 0.05, 0))
		add.call("chest", "spine", Vector3(0, 0.27, 0)); add.call("head", "chest", Vector3(0, 0.365, 0.008))
		add.call("lSh", "chest", Vector3(D.sw, 0.17, -0.005)); add.call("rSh", "chest", Vector3(-D.sw, 0.17, -0.005))
		add.call("lEl", "lSh", Vector3(0, -D.upper, 0)); add.call("rEl", "rSh", Vector3(0, -D.upper, 0))
		add.call("lHand", "lEl", Vector3(0, -D.fore, 0)); add.call("rHand", "rEl", Vector3(0, -D.fore, 0))
		add.call("lHip", "hips", Vector3(D.hw, -0.02, 0)); add.call("rHip", "hips", Vector3(-D.hw, -0.02, 0))
		add.call("lKnee", "lHip", Vector3(0, -D.thigh, 0)); add.call("rKnee", "rHip", Vector3(0, -D.thigh, 0))
		add.call("lFoot", "lKnee", Vector3(0, -D.shin, 0)); add.call("rFoot", "rKnee", Vector3(0, -D.shin, 0))
		hips_y = leg
		solve()
	func solve():
		for n in order:
			var o = offset[n]
			if n == "hips": o = Vector3(0, hips_y, 0)
			var local = Transform3D(rot[n], o)
			world[n] = (Transform3D(body, Vector3.ZERO) * local) if parent[n] == "" else world[parent[n]] * local
	# point joint j's -Y along a root-local direction (rest calibration)
	func aim(j: String, dir: Vector3):
		solve()
		var pw: Basis = world[parent[j]].basis
		var want = Quaternion(Vector3.DOWN, dir.normalized())
		rot[j] = Basis(pw.get_rotation_quaternion().inverse() * want)
		solve()
	# apply a pose (Rig.update in the web game)
	func apply(c: Dictionary):
		for j in Poses.JOINTS: rot[j] = Basis.from_euler(c[j], EULER_ORDER_XYZ)
		var lie: float = c.lie
		for s in ["l", "r"]:
			var fx = -(c.hips.x + c[s + "Hip"].x + c[s + "Knee"].x) * (1.0 - lie) + c[s + "Ft"] * (1.0 - lie)
			rot[s + "Foot"] = Basis.from_euler(Vector3(fx, 0, 0), EULER_ORDER_XYZ)
		var drop = func(s):
			var a = c.hips.x + c[s + "Hip"].x
			var b = c[s + "Knee"].x
			return cos(c[s + "Hip"].z) * (D.thigh * cos(a) + D.shin * cos(a + b))
		var stand = max(drop.call("l"), drop.call("r")) + D.ground + c.hipY
		hips_y = stand * (1.0 - lie) + 0.16 * lie
		body = Basis.from_euler(Vector3(-PI / 2 * lie + c.bodyX, c.bodyY, 0), EULER_ORDER_XYZ)
		solve()

# ------------------------------------------------------------------ setup
func setup(hid: String, path: String, h: float, clips: Dictionary, grip := "", alt := false) -> bool:
	hero_id = hid; height = h; scale_k = h / 1.85; clip_map = clips
	body = Node3D.new(); body.name = "Body"; add_child(body)
	var ps: PackedScene = load(path)
	if ps == null: push_error("model failed to load: " + path); return false
	model = ps.instantiate()
	body.add_child(model)
	# biggest skeleton is the body; the rest (Gamora's sword) are props
	var best: Skeleton3D = null
	for s in model.find_children("*", "Skeleton3D", true, false):
		if best == null or s.get_bone_count() > best.get_bone_count(): best = s
	skel = best
	for ap in model.find_children("*", "AnimationPlayer", true, false):
		for lib_name in ap.get_animation_library_list():
			var lib = ap.get_animation_library(lib_name)
			for an in lib.get_animation_list(): anims[an] = lib.get_animation(an)
		ap.queue_free()
	# files can carry their own cameras and lights (FBX scenes): drop them
	for n in model.find_children("*", "Camera3D", true, false) + model.find_children("*", "Light3D", true, false):
		n.get_parent().remove_child(n); n.queue_free()
	for mi in model.find_children("*", "MeshInstance3D", true, false):
		meshes.append(mi)
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		mi.extra_cull_margin = 2.0
	_make_overlay_material(alt)
	if skel == null:
		print_verbose(hid + ": model has no skeleton (static mesh)")
		_fit_static()
		return false
	skel.reset_bone_poses()
	for i in skel.get_bone_count(): rests[i] = skel.get_bone_rest(i)
	B = Bones.map_skeleton(skel)
	head_bone = B.head
	var need = ["hips", "head", "lSh", "rSh", "lEl", "rEl", "lHip", "rHip", "lKnee", "rKnee"]
	for n in need:
		if B[n] < 0: push_warning(hid + ": no bone for " + n); _fit_static(); return false
	_orient()
	_fit_height()
	if grip != "": _grip_weapon(grip)
	_calibrate()
	cur = Poses.copy(Poses.POSES.idle)
	ok = true
	return true

func _skel_to_root() -> Transform3D:
	var t = Transform3D()
	var n: Node = skel
	while n != self and n != null:
		if n is Node3D: t = (n as Node3D).transform * t
		n = n.get_parent()
	return t

func bone_root_pos(b: int) -> Vector3: return _skel_to_root() * skel.get_bone_global_pose(b).origin

# stand the model up: head above hips -> +Y, left arm -> +X, so it faces +Z
func _orient():
	var up = (bone_root_pos(B.head) - bone_root_pos(B.hips)).normalized()
	var lat = bone_root_pos(B.lSh) - bone_root_pos(B.rSh)
	lat = (lat - up * lat.dot(up)).normalized()
	var fwd = lat.cross(up)
	var q = Basis(lat, up, fwd).inverse()
	model.transform = Transform3D(q, Vector3.ZERO) * model.transform

# skinned vertex positions in root space (sampled), for the rest-pose bounds
func _skinned_points(step := 7) -> PackedVector3Array:
	var pts := PackedVector3Array()
	for mi in meshes:
		if mi.mesh == null: continue
		var sk: Skeleton3D = mi.get_node_or_null(mi.skeleton) as Skeleton3D
		var skin: Skin = mi.skin
		var to_root: Transform3D
		var binds := []
		if sk != null and skin != null:
			var t = Transform3D(); var n: Node = sk
			while n != self and n != null:
				if n is Node3D: t = (n as Node3D).transform * t
				n = n.get_parent()
			to_root = t
			for i in skin.get_bind_count():
				var bb = skin.get_bind_bone(i)
				if bb < 0: bb = sk.find_bone(skin.get_bind_name(i))
				binds.append(sk.get_bone_global_pose(max(bb, 0)) * skin.get_bind_pose(i))
		else:
			var t = Transform3D(); var n: Node = mi
			while n != self and n != null:
				if n is Node3D: t = (n as Node3D).transform * t
				n = n.get_parent()
			to_root = t
		for s in mi.mesh.get_surface_count():
			var arr = mi.mesh.surface_get_arrays(s)
			var v: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
			var bo = arr[Mesh.ARRAY_BONES]
			var we = arr[Mesh.ARRAY_WEIGHTS]
			var per = 4
			if binds.size() and bo != null and v.size() > 0: per = int(bo.size() / v.size())
			for i in range(0, v.size(), step):
				var p = v[i]
				if binds.size() and bo != null and bo.size() >= (i + 1) * per:
					var acc = Vector3.ZERO; var wsum = 0.0
					for k in per:
						var w = we[i * per + k]
						if w <= 0.0: continue
						var bi = bo[i * per + k]
						if bi < binds.size(): acc += (binds[bi] * p) * w; wsum += w
					if wsum > 0: p = acc / wsum
				pts.append(to_root * p)
	return pts

func _fit_height():
	var pts = _skinned_points()
	if pts.is_empty(): return
	var lo = Vector3(INF, INF, INF); var hi = -lo
	for p in pts: lo = lo.min(p); hi = hi.max(p)
	var s = height / max(0.01, hi.y - lo.y)
	model.transform = Transform3D(Basis().scaled(Vector3(s, s, s)), Vector3.ZERO) * model.transform
	var c = (lo + hi) * 0.5 * s
	model.position -= Vector3(c.x, lo.y * s, c.z)
	# torso half-depth: how high the trunk must stay above the floor when lying down
	var cy = bone_root_pos(B.chest).y
	var zmin = INF; var zmax = -INF
	for p in pts:
		var q = p * s - Vector3(c.x, lo.y * s, c.z)
		if abs(q.y - cy) < 0.06 * height and abs(q.x) < 0.18 * height: zmin = min(zmin, q.z); zmax = max(zmax, q.z)
	if zmax > zmin: body_r = clamp((zmax - zmin) / 2, 0.08 * scale_k, 0.4)

func _fit_static():
	var pts = _skinned_points(5)
	if pts.is_empty(): return
	var lo = Vector3(INF, INF, INF); var hi = -lo
	for p in pts: lo = lo.min(p); hi = hi.max(p)
	var s = height / max(0.01, hi.y - lo.y)
	model.transform = Transform3D(Basis().scaled(Vector3(s, s, s)), Vector3.ZERO) * model.transform
	var c = (lo + hi) * 0.5 * s
	model.position -= Vector3(c.x, lo.y * s, c.z)

# a prop skinned to its own skeleton (Fortnite's Melee_TwoHanded_Handle): put it in the right fist,
# blade forward and a little up, square to the forearm, and carry it with the hand from then on
func _grip_weapon(grip_name: String):
	var ws: Skeleton3D = null
	for s in model.find_children("*", "Skeleton3D", true, false):
		if s != skel and s.find_bone(grip_name) >= 0: ws = s
	if ws == null: push_warning("grip bone not found: " + grip_name); return
	var gb = ws.find_bone(grip_name)
	var to_root = func(n: Node) -> Transform3D:
		var t = Transform3D(); var x: Node = n
		while x != self and x != null:
			if x is Node3D: t = (x as Node3D).transform * t
			x = x.get_parent()
		return t
	var wt: Transform3D = to_root.call(ws)
	var gp = wt * ws.get_bone_global_pose(gb).origin
	# blade centre: skinned prop vertices
	var lo = Vector3(INF, INF, INF); var hi = -lo
	for mi in meshes:
		if mi.get_node_or_null(mi.skeleton) != ws: continue
		var a = mi.get_aabb()
		var mt: Transform3D = to_root.call(mi)
		for k in 8:
			var p = mt * a.get_endpoint(k); lo = lo.min(p); hi = hi.max(p)
	if lo.x == INF: return
	var blade = ((lo + hi) * 0.5 - gp).normalized()
	var hp = bone_root_pos(B.rHand)
	var arm = (hp - bone_root_pos(B.rEl)).normalized()
	var want = Vector3(0, 0.25, 1); want = (want - arm * want.dot(arm)).normalized()
	var q = Quaternion(blade, want)
	var palm = hp + arm * 0.075 * scale_k
	# rotate the prop skeleton about the grip point, then move the grip into the palm
	var rot_t = Transform3D(Basis(q), Vector3.ZERO)
	var new_wt = Transform3D(Basis(), palm) * rot_t * Transform3D(Basis(), -gp) * wt
	# hang it off a bone attachment on the hand, keeping that placement
	var att = BoneAttachment3D.new()
	att.bone_idx = B.rHand
	skel.add_child(att)
	var att_root: Transform3D = _skel_to_root() * skel.get_bone_global_pose(B.rHand)
	# the prop leaves the imported scene's ownership before it moves onto the hand
	for n in [ws] + ws.find_children("*", "", true, false): n.owner = null
	ws.get_parent().remove_child(ws)
	att.add_child(ws)
	ws.transform = att_root.affine_inverse() * new_wt
	# meshes skinned to the prop skeleton follow it automatically (NodePath is relative)
	for mi in meshes:
		if mi.get_node_or_null(mi.skeleton) == null and mi.skeleton != NodePath(""):
			mi.skeleton = mi.get_path_to(ws)

func _calibrate():
	drv = Driver.new()
	var P = func(j): return bone_root_pos(B[j])
	var aim = func(dj, a, b):
		if B[a] >= 0 and B[b] >= 0: drv.aim(dj, P.call(b) - P.call(a))
	aim.call("lSh", "lSh", "lEl"); aim.call("lEl", "lEl", "lHand"); aim.call("rSh", "rSh", "rEl"); aim.call("rEl", "rEl", "rHand")
	aim.call("lHip", "lHip", "lKnee"); aim.call("lKnee", "lKnee", "lFoot"); aim.call("rHip", "rHip", "rKnee"); aim.call("rKnee", "rKnee", "rFoot")
	var sr = _skel_to_root()
	cal.clear()
	for j in DRIVEN:
		var b = B.get(j, -1)
		if b < 0: continue
		var rm = (sr.basis * skel.get_bone_global_pose(b).basis).get_rotation_quaternion()
		cal.append({"j": j, "b": b, "rdInv": drv.world[j].basis.get_rotation_quaternion().inverse(), "rm": rm})
	m_rest = P.call("hips")
	d_rest = drv.world.hips.origin
	ratio = m_rest.y / d_rest.y

# ------------------------------------------------------------------ per frame
# blend toward the target pose at `rate` and pose the skeleton
func update_pose(target: Dictionary, dt: float, rate := 16.0):
	var k = 1.0 - exp(-rate * dt)
	if not ok:
		# no usable skeleton (Iron Man's FBX): the whole statue leans, lies down and turns
		if cur.is_empty(): cur = Poses.copy(Poses.POSES.idle)
		Poses.lerp_into(cur, cur, target, k)
		body.rotation = Vector3(-PI / 2 * cur.lie + cur.bodyX + cur.spine.x * 0.4, cur.bodyY + cur.spine.y * 0.5, 0)
		body.position = Vector3(0, 0.25 * cur.lie + cur.hipY, 0)
		return
	Poses.lerp_into(cur, cur, target, k)
	drv.apply(cur)
	var sr = _skel_to_root()
	var sr_inv = sr.affine_inverse()
	var srq = sr.basis.get_rotation_quaternion()
	# clip-only bones back to rest so the overlay starts from the rest hierarchy
	if overlay.has("slots"):
		for b in overlay.slots: skel.set_bone_pose_rotation(b, rests[b].basis.get_rotation_quaternion()); skel.set_bone_pose_position(b, rests[b].origin)
	# hips: follow the driver's hips, scaled to the model's proportions
	var hb: int = B.hips
	var d: Vector3 = (drv.world.hips.origin - d_rest) * ratio + m_rest
	d.y += 0.1 * cur.lie
	_set_bone_root_pos(hb, d, sr_inv)
	# joints: each driver joint's rotation relative to its rest goes onto the model bone
	for c in cal:
		var q: Quaternion = drv.world[c.j].basis.get_rotation_quaternion() * c.rdInv * c.rm
		var pb = skel.get_bone_parent(c.b)
		var pq: Quaternion = srq * (skel.get_bone_global_pose(pb).basis.get_rotation_quaternion() if pb >= 0 else Quaternion())
		skel.set_bone_pose_rotation(c.b, (pq.inverse() * q).normalized())
	# lying down: bulky models are thicker than the driver; keep the trunk above the floor
	var lie = min(1.0, cur.lie)
	if lie > 0.05:
		var low = INF
		for j in ["hips", "spine", "chest", "head"]:
			if B.get(j, -1) >= 0: low = min(low, bone_root_pos(B[j]).y)
		var lift = (body_r - low) * lie
		if lift > 0:
			_set_bone_root_pos(hb, bone_root_pos(hb) + Vector3(0, lift, 0), sr_inv)
	_update_overlay(dt, sr)

func _set_bone_root_pos(b: int, p_root: Vector3, sr_inv: Transform3D):
	var ps = sr_inv * p_root
	var pb = skel.get_bone_parent(b)
	if pb >= 0: ps = skel.get_bone_global_pose(pb).affine_inverse() * ps
	skel.set_bone_pose_position(b, ps)

# ------------------------------------------------------------------ clip overlay
func has_clip(key: String) -> bool: return clip_map.has(key) and anims.has(clip_map[key])

# play a file clip over the retargeted pose (key from the game's animation keys); token restarts it
func set_anim(key: String, duration := 0.0, token = null):
	if not has_clip(key):
		overlay["want"] = false
		return
	if overlay.get("want", false) and overlay.get("key") == key and overlay.get("token") == token: return
	var a: Animation = anims[clip_map[key]]
	var once = not (key in LOOP_KEYS)
	var speed = clamp(a.length / duration, 0.5, 3.0) if duration > 0 and once else 1.0
	if not overlay.has("slots"): _init_overlay()
	overlay["prev"] = overlay.get("cur") if overlay.get("w", 0.0) > 0 else null
	overlay["fade"] = 0.0
	overlay["cur"] = {"a": a, "t": 0.0, "once": once, "speed": speed, "tracks": _tracks_of(a)}
	overlay["key"] = key; overlay["token"] = token; overlay["want"] = true

func _init_overlay():
	var roots = {}
	var anc = []
	var b = skel.get_bone_parent(B.hips)
	while b >= 0: anc.append(b); b = skel.get_bone_parent(b)
	anc.reverse()  # root first
	roots[B.hips] = true
	for x in anc: roots[x] = true
	var driven = {}
	for c in cal: driven[c.b] = true
	var slots = []
	for an in clip_map.values():
		if not anims.has(an): continue
		for tr in _tracks_of(anims[an]):
			if tr.rot and not roots.has(tr.b) and not driven.has(tr.b) and not (tr.b in slots): slots.append(tr.b)
	overlay = {"w": 0.0, "want": false, "slots": slots, "anc": anc, "roots": roots, "cur": null, "prev": null, "fade": 0.0}

var _track_cache := {}
func _tracks_of(a: Animation) -> Array:
	if _track_cache.has(a): return _track_cache[a]
	var out = []
	for i in a.get_track_count():
		var ty = a.track_get_type(i)
		if ty != Animation.TYPE_ROTATION_3D and ty != Animation.TYPE_POSITION_3D: continue
		var bn = a.track_get_path(i).get_concatenated_subnames()
		var b = skel.find_bone(bn)
		if b < 0: continue
		out.append({"i": i, "b": b, "rot": ty == Animation.TYPE_ROTATION_3D})
	_track_cache[a] = out
	return out

func _sample(play: Dictionary, at := -1.0) -> Dictionary:
	var a: Animation = play.a
	var t = at if at >= 0.0 else (min(play.t, a.length) if play.once else fmod(play.t, max(0.001, a.length)))
	var rot = {}; var pos = {}
	for tr in play.tracks:
		if tr.rot: rot[tr.b] = a.rotation_track_interpolate(tr.i, t)
		else: pos[tr.b] = a.position_track_interpolate(tr.i, t)
	return {"rot": rot, "pos": pos}

# the clip's hips in skeleton space, through its own root chain
func _clip_hips(smp: Dictionary, anc: Array, hb: int) -> Transform3D:
	var g = Transform3D()
	for a in anc + [hb]:
		var r: Transform3D = rests[a]
		g = g * Transform3D(Basis(smp.rot.get(a, r.basis.get_rotation_quaternion())).scaled(r.basis.get_scale()), smp.pos.get(a, r.origin))
	return g

func _update_overlay(dt: float, sr: Transform3D):
	if not overlay.has("slots"): return
	var O = overlay
	O.w = clamp(O.w + (dt / 0.1 if O.want else -dt / 0.16), 0.0, 1.0)
	if O.cur == null: return
	if O.w <= 0.0: O.cur = null; O.prev = null; return
	O.cur.t += dt * O.cur.speed
	var s = _sample(O.cur)
	if O.prev != null:
		O.prev.t += dt * O.prev.speed
		O.fade = min(1.0, O.fade + dt / 0.08)
		var sp = _sample(O.prev)
		for b in sp.rot:
			if s.rot.has(b): s.rot[b] = sp.rot[b].slerp(s.rot[b], O.fade)
		for b in sp.pos:
			if s.pos.has(b): s.pos[b] = sp.pos[b].lerp(s.pos[b], O.fade)
		if O.fade >= 1.0: O.prev = null
	var w = O.w * O.w * (3.0 - 2.0 * O.w)
	# hips: the clip's root bones use their own facing convention (and attack clips turn and
	# travel), so only the clip's hips motion relative to its first frame is layered onto the
	# procedural hips: its turn, tilt and rise, never its absolute facing or travel
	var hb: int = B.hips
	var rest_g = Transform3D()
	for a in O.anc: rest_g = rest_g * rests[a]
	if not O.cur.has("h0"): O.cur["h0"] = _clip_hips(_sample(O.cur, 0.0), O.anc, hb)
	var clip_now = _clip_hips(s, O.anc, hb)
	var h0: Transform3D = O.cur.h0
	var srq = sr.basis.get_rotation_quaternion()
	var base_r = srq * rest_g.basis.get_rotation_quaternion()
	# clip_now / h0 are skeleton-space: their delta moves to root space through sr only
	var delta_root = srq * (clip_now.basis.get_rotation_quaternion() * h0.basis.get_rotation_quaternion().inverse()) * srq.inverse()
	var proc_pos = skel.get_bone_pose_position(hb)
	var proc_rot = skel.get_bone_pose_rotation(hb)
	var proc_root_q = base_r * proc_rot
	var want_local_q = base_r.inverse() * (delta_root * proc_root_q)
	var dy = (sr * clip_now.origin).y - (sr * h0.origin).y
	var proc_root = sr * (rest_g * proc_pos) + Vector3(0, dy, 0)
	var tgt_local = rest_g.affine_inverse() * (sr.affine_inverse() * proc_root)
	skel.set_bone_pose_rotation(hb, proc_rot.slerp(want_local_q.normalized(), w))
	skel.set_bone_pose_position(hb, proc_pos.lerp(tgt_local, w))
	for b in s.rot:
		if O.roots.has(b): continue
		skel.set_bone_pose_rotation(b, skel.get_bone_pose_rotation(b).slerp(s.rot[b], w))

# ------------------------------------------------------------------ helpers for gameplay
func world_of_bone(b: int) -> Vector3:
	if skel == null or b < 0: return global_position + Vector3(0, height * 0.7, 0)
	return skel.global_transform * skel.get_bone_global_pose(b).origin

func hand_pos(right := true) -> Vector3:
	return world_of_bone(B.get("rHand" if right else "lHand", -1)) if ok else global_position + Vector3(0, height * 0.72, 0)

func head_pos() -> Vector3:
	if ok and head_bone >= 0: return world_of_bone(head_bone) + Vector3(0, 0.09 * scale_k, 0)
	return global_position + Vector3(0, height * 0.93, 0)

func _make_overlay_material(alt: bool):
	var sh = Shader.new()
	sh.code = """shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_back, shadows_disabled;
uniform vec4 flash : source_color = vec4(0.0);
uniform vec4 tint : source_color = vec4(0.0);
void fragment() {
	float rim = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 2.0);
	ALBEDO = flash.rgb * flash.a + tint.rgb * tint.a * (0.35 + rim);
}
"""
	flash_mat = ShaderMaterial.new()
	flash_mat.shader = sh
	flash_mat.set_shader_parameter("tint", Color(0.45, 0.25, 0.9, 0.5) if alt else Color(0, 0, 0, 0))
	for mi in meshes: mi.material_overlay = flash_mat

func set_flash(c: Color, amount: float):
	if flash_mat: flash_mat.set_shader_parameter("flash", Color(c.r, c.g, c.b, clamp(amount, 0.0, 1.0)))
