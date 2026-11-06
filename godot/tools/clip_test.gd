# Shows Cap, Thor and Hulk playing their file clips over the retargeted pose (side by side).
extends Node3D
const Roster = preload("res://scripts/roster.gd")
const Poses = preload("res://scripts/poses.gd")
var rigs = []
var key = "punch"
func _ready():
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--key="): key = a.substr(6)
	var x = -3.0
	for id in ["cap", "thor", "hulk"]:
		var r = Roster.make_rig(id); add_child(r); r.position.x = x; x += 3.0; r.rotation.y = 0.5; rigs.append(r)
	var cam = Camera3D.new(); cam.fov = 40; cam.position = Vector3(0, 1.8, 9); add_child(cam); cam.look_at(Vector3(0, 1.2, 0)); cam.current = true
	var sun = DirectionalLight3D.new(); sun.rotation_degrees = Vector3(-40, 20, 0); add_child(sun)
	var env = WorldEnvironment.new(); env.environment = Environment.new(); env.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.environment.ambient_light_color = Color(0.6, 0.6, 0.7); add_child(env)
var t = 0.0
func _process(dt):
	t += dt
	for r in rigs:
		r.set_anim(key, 0.7, int(t / 1.2))
		r.update_pose(Poses.POSES.jab if key == "punch" else Poses.POSES.idle, dt, 20)
