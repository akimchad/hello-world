# godot --headless --path godot --script res://tools/dump_models.gd
# Prints each hero model's skeleton bones (with canonical names) and animation clips.
extends SceneTree
const Bones = preload("res://scripts/bones.gd")
func _init():
	var dir = DirAccess.open("res://models")
	for hero in dir.get_directories():
		var path = _find("res://models/" + hero)
		if path == "": print(hero, ": no model"); continue
		var ps = load(path)
		if ps == null: print(hero, ": failed to load ", path); continue
		var inst = ps.instantiate()
		var skels = inst.find_children("*", "Skeleton3D", true, false)
		var aps = inst.find_children("*", "AnimationPlayer", true, false)
		print("=== ", hero, " ", path, " skeletons=", skels.size())
		for sk in skels:
			var s: Skeleton3D = sk
			var names = []
			for i in s.get_bone_count(): names.append(s.get_bone_name(i))
			print("  bones(", s.get_bone_count(), "): ", ", ".join(names.slice(0, 80)))
			var m = Bones.map_skeleton(s)
			print("  map: ", m)
		for ap in aps:
			print("  anims: ", ap.get_animation_list())
		var meshes = inst.find_children("*", "MeshInstance3D", true, false)
		print("  meshes: ", meshes.size())
		inst.free()
	quit()
func _find(d):
	for f in DirAccess.get_files_at(d):
		if f.get_extension().to_lower() in ["glb", "fbx"]: return d + "/" + f
	for sub in DirAccess.get_directories_at(d):
		var r = _find(d + "/" + sub)
		if r != "": return r
	return ""
