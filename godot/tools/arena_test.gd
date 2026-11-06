extends Node3D
func _ready():
	var a = preload("res://scripts/arena.gd").new(); add_child(a); a.build("rooftop")
	for x in OS.get_cmdline_user_args():
		if x == "--noglow": a.env.glow_enabled = false
		if x == "--nofog": a.env.fog_enabled = false
		if x == "--nossao": a.env.ssao_enabled = false
		if x == "--noamb": a.env.ambient_light_energy = 0.2
	var cam = Camera3D.new(); cam.fov = 34; cam.position = Vector3(0, 2.4, 12); add_child(cam); cam.look_at(Vector3(0, 1.5, 0)); cam.current = true
