# Autoload: when the command line has `-- --shot=<png> [--shot-at=<seconds>]`, save a screenshot then quit.
extends Node
var path := ""
var at := 2.5
var t := 0.0
func _ready():
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--shot="): path = a.substr(7)
		elif a.begins_with("--shot-at="): at = float(a.substr(10))
	process_mode = Node.PROCESS_MODE_ALWAYS
func _process(dt):
	if path == "": return
	t += dt
	if t >= at:
		var img = get_viewport().get_texture().get_image()
		img.save_png(path)
		print("shot saved: ", path)
		path = ""
		get_tree().quit()
