# Bone-name canonicalisation and humanoid mapping for imported hero skeletons.
# Mixamo (mixamorig:LeftArm), 3ds Max Biped (Bip01 L UpperArm), Unreal/Fortnite (upperarm_l,
# spine_03) and Rigify (upper_arm.L) names all become one Mixamo-style key ("leftarm", "spine2").
# Same rules as the web game's models.js, so the same models map the same way.
extends RefCounted

const LIMB = {"clavicle": "shoulder", "upperarm": "arm", "forearm": "forearm", "lowerarm": "forearm",
	"hand": "hand", "thigh": "upleg", "calf": "leg", "shin": "leg", "foot": "foot", "toe0": "toebase", "ball": "toebase"}
const TRUNK = {"pelvis": "hips", "spine01": "spine", "spine02": "spine1", "spine03": "spine2",
	"spine04": "spine3", "spine05": "spine4", "neck01": "neck"}

static func bone_key(n: String) -> String:
	var r = RegEx.create_from_string("(?i)^mixamorig[:_]?")
	n = r.sub(n, "")
	var r2 = RegEx.create_from_string("[:_\\s.\\-]")
	return r2.sub(n, "", true).to_lower()

static func canon(name: String, strip := false) -> String:
	var n = name
	# Sketchfab exports append _NN to every node name (only stripped when most bones have it)
	if strip: n = RegEx.create_from_string("_\\d+$").sub(n, "")
	n = RegEx.create_from_string("^.*[:|]").sub(n, "")
	n = RegEx.create_from_string("(?i)^(def|org|mch)[-_]").sub(n, "")
	var k = bone_key(n)
	var m = RegEx.create_from_string("^bip0*1(l|r)?(.*)$").search(k)
	if m:
		var side = m.get_string(1)
		var rest = m.get_string(2)
		if side != "" and LIMB.has(rest):
			return ("left" if side == "l" else "right") + LIMB[rest]
		if TRUNK.has(rest): return TRUNK[rest]
		return rest if rest != "" else k
	m = RegEx.create_from_string("^(clavicle|upperarm|lowerarm|forearm|hand|thigh|calf|shin|foot|ball)(l|r)$").search(k)
	if m:
		return ("left" if m.get_string(2) == "l" else "right") + LIMB[m.get_string(1)]
	m = RegEx.create_from_string("^(left|right)(elbow|wrist|ankle)$").search(k)
	if m:
		return m.get_string(1) + {"elbow": "forearm", "wrist": "hand", "ankle": "foot"}[m.get_string(2)]
	return TRUNK.get(k, k)

static func _count_desc(s: Skeleton3D, b: int) -> int:
	var n = 1
	for c in s.get_bone_children(b): n += _count_desc(s, c)
	return n

# game joint -> bone index (or -1). Joints: hips spine chest head neck lSh lEl lHand rSh rEl rHand
# lHip lKnee lFoot rHip rKnee rFoot
static func map_skeleton(s: Skeleton3D) -> Dictionary:
	var by = {}
	var knee_rig = false
	var suffixed = 0
	var suf = RegEx.create_from_string("_\\d+$")
	for i in s.get_bone_count():
		if suf.search(s.get_bone_name(i)): suffixed += 1
	var strip = s.get_bone_count() >= 5 and suffixed >= s.get_bone_count() * 0.8
	for i in s.get_bone_count():
		if RegEx.create_from_string("^(left|right)knee$").search(canon(s.get_bone_name(i), strip)): knee_rig = true
	for i in s.get_bone_count():
		var k = canon(s.get_bone_name(i), strip)
		if knee_rig:
			k = RegEx.create_from_string("^(left|right)leg$").sub(k, "$1upleg")
			k = RegEx.create_from_string("^(left|right)knee$").sub(k, "$1leg")
		if not by.has(k): by[k] = i
	_infer_arms(s, by)
	var hips = by.get("hips", -1)
	var chest = -1
	if by.has("leftarm"):
		chest = s.get_bone_parent(by["leftarm"])
		if chest >= 0 and canon(s.get_bone_name(chest), strip).ends_with("shoulder"): chest = s.get_bone_parent(chest)
		while chest >= 0 and canon(s.get_bone_name(chest), strip).begins_with("neck"): chest = s.get_bone_parent(chest)
	if chest < 0: chest = by.get("spine2", by.get("spine1", by.get("spine", hips)))
	var spine = chest
	while spine >= 0 and s.get_bone_parent(spine) >= 0 and s.get_bone_parent(spine) != hips: spine = s.get_bone_parent(spine)
	if spine < 0 or spine == chest or s.get_bone_parent(spine) != hips: spine = -1
	var head = by.get("head", -1)
	var neck = -1
	if head >= 0:
		var p = s.get_bone_parent(head)
		if p >= 0 and canon(s.get_bone_name(p), strip).begins_with("neck") and p != chest: neck = p
	return {"hips": hips, "spine": spine, "chest": chest, "head": head, "neck": neck,
		"lSh": by.get("leftarm", -1), "lEl": by.get("leftforearm", -1), "lHand": by.get("lefthand", -1),
		"rSh": by.get("rightarm", -1), "rEl": by.get("rightforearm", -1), "rHand": by.get("righthand", -1),
		"lHip": by.get("leftupleg", -1), "lKnee": by.get("leftleg", -1), "lFoot": by.get("leftfoot", -1),
		"rHip": by.get("rightupleg", -1), "rKnee": by.get("rightleg", -1), "rFoot": by.get("rightfoot", -1)}

# rigs whose arms are plain bone chains (Groot's branch arms): pick bones ~45% and ~85% down the chain
static func _infer_arms(s: Skeleton3D, by: Dictionary) -> void:
	for side in ["left", "right"]:
		if by.has(side + "arm") or not by.has(side + "shoulder"): continue
		var chain = []
		var b = by[side + "shoulder"]
		while true:
			var kids = s.get_bone_children(b)
			if kids.is_empty(): break
			var best = kids[0]
			for c in kids:
				if _count_desc(s, c) > _count_desc(s, best): best = c
			chain.append(best); b = best
		if chain.size() < 3: continue
		var pts = []
		for c in chain: pts.append(s.get_bone_global_rest(c).origin)
		var cum = [0.0]
		for i in range(1, pts.size()): cum.append(cum[i - 1] + pts[i].distance_to(pts[i - 1]))
		var total = cum[cum.size() - 1]
		var at = func(f):
			var bi = 0
			for i in cum.size():
				if abs(cum[i] - f * total) < abs(cum[bi] - f * total): bi = i
			return bi
		var e = max(1, at.call(0.45))
		var h = max(e + 1, at.call(0.85))
		by[side + "arm"] = chain[0]; by[side + "forearm"] = chain[e]; by[side + "hand"] = chain[min(h, chain.size() - 1)]
