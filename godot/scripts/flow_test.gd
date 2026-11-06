# Autoload test driver, active only with `-- --flowtest=<dir>`: injects key presses to walk
# title -> select -> match -> pause, saving screenshots and printing each screen.
extends Node
var dir := ""
var t := 0.0
var steps := []
var i := 0
func _ready():
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--flowtest="): dir = a.substr(11)
	if dir == "": set_process(false); return
	process_mode = Node.PROCESS_MODE_ALWAYS
	steps = [
		[1.5, "shot", "title"], [2.0, "key", KEY_F], [3.5, "shot", "select"],
		[3.8, "key", KEY_D], [4.3, "key", KEY_D], [4.8, "key", KEY_RIGHT], [5.5, "shot", "select2"],
		[6.0, "key", KEY_F], [6.5, "key", KEY_K], [12.0, "shot", "fight"],
		[13.0, "hold", KEY_D, 0.6], [14.0, "key", KEY_F], [14.15, "key", KEY_F], [14.3, "key", KEY_F], [14.5, "shot", "attack"],
		[15.0, "key", KEY_H], [15.25, "shot", "special"],
		[16.0, "key", KEY_ESCAPE], [16.5, "shot", "pause"], [17.0, "key", KEY_ESCAPE], [18.0, "quit"]]
func _press(k, down):
	var e = InputEventKey.new(); e.physical_keycode = k; e.keycode = k; e.pressed = down
	Input.parse_input_event(e)
func _process(dt):
	t += dt
	while i < steps.size() and t >= steps[i][0]:
		var s = steps[i]; i += 1
		match s[1]:
			"key":
				_press(s[2], true)
				get_tree().create_timer(0.08, true).timeout.connect(func(): _press(s[2], false))
			"hold":
				_press(s[2], true)
				get_tree().create_timer(s[3], true).timeout.connect(func(): _press(s[2], false))
			"shot":
				get_viewport().get_texture().get_image().save_png(dir + "/flow_" + s[2] + ".png")
				print("flow: shot ", s[2], " screen=", get_tree().current_scene.get("screen"))
			"quit": print("flow: done"); get_tree().quit()
