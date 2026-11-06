# Temporary entry scene: every hero model in a row, posed through the retargeter
# (cycles idle / jab / kick / block poses). Replaced by the menu + match once those land.
extends Node3D
const Poses = preload("res://scripts/poses.gd")
const ModelRig = preload("res://scripts/model_rig.gd")
const HEROES = {
	"spiderman": ["res://models/spiderman/spiderman.glb", 1.76, {}, ""],
	"cap": ["res://models/cap/source/cap.fbx", 1.88, {"block": "blocking", "punch": "attack_light1"}, ""],
	"thor": ["res://models/thor/source/thor.fbx", 1.95, {"block": "blocking", "punch": "attack_light1"}, ""],
	"hulk": ["res://models/hulk/hulk.glb", 2.55, {"block": "blocking", "punch": "attack_light1"}, ""],
	"gamora": ["res://models/gamora/gamora.fbx", 1.78, {}, "Melee_TwoHanded_Handle"],
	"doom": ["res://models/doom/doom.fbx", 1.96, {}, ""],
	"sentry": ["res://models/sentry/sentry.fbx", 1.92, {}, ""],
	"groot": ["res://models/groot/groot.glb", 2.5, {}, ""],
	"venom": ["res://models/venom/venom.glb", 2.2, {}, ""],
	"deadpool": ["res://models/deadpool/deadpool.glb", 1.84, {}, ""],
	"ironman": ["res://models/ironman/source/ironman.fbx", 1.92, {}, ""],
}
var rigs = []
var t = 0.0
func _ready():
	var x = -11.0
	for id in HEROES:
		var h = HEROES[id]
		if not ResourceLoader.exists(h[0]): continue
		var r = ModelRig.new(); add_child(r); r.position = Vector3(x, 0, 0); x += 2.2
		var ok = r.setup(id, h[0], h[1], h[2], h[3])
		print(id, ": ", "retargeted" if ok else "static (no usable skeleton)")
		rigs.append(r)
	var cam = Camera3D.new(); add_child(cam); cam.position = Vector3(0, 2, 14); cam.look_at(Vector3(0, 1.2, 0)); cam.current = true; cam.fov = 40; cam.position.z = 30
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--cam="):
			var c = a.substr(6).split(","); cam.position = Vector3(float(c[0]), float(c[1]), float(c[2])); cam.look_at(Vector3(float(c[0]), 1.1, 0))
	var sun = DirectionalLight3D.new(); add_child(sun); sun.rotation_degrees = Vector3(-50, 30, 0); sun.shadow_enabled = true
	var env = WorldEnvironment.new(); env.environment = Environment.new(); env.environment.background_mode = Environment.BG_COLOR
	env.environment.background_color = Color(0.12, 0.13, 0.18); env.environment.ambient_light_color = Color(0.6, 0.6, 0.7); env.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	add_child(env)
	var floor = MeshInstance3D.new(); floor.mesh = PlaneMesh.new(); floor.mesh.size = Vector2(40, 10); add_child(floor)
func _process(dt):
	t += dt
	var names = ["idle", "jab", "kick", "block", "crouch", "hook"]
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--pose="): names = [a.substr(7)]
	var pose = Poses.POSES[names[int(t / 1.5) % names.size()]]
	for r in rigs: r.update_pose(pose, dt, 10.0)
