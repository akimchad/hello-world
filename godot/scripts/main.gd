# Game flow: title -> character select (3D previews) -> match -> results, with pause.
# P1 and P2 share the keyboard; gamepad 1 plays P1 and gamepad 2 plays P2. P2 can be switched
# to a CPU opponent on the select screen (Tab / P2's Special button).
extends Node

const Roster = preload("res://scripts/roster.gd")
const Data = preload("res://scripts/data.gd")
const Poses = preload("res://scripts/poses.gd")

var sfx: Sfx
var ctrls := [Controls.new(0), Controls.new(1)]
var screen := ""
var ui: CanvasLayer
var stage3d: Node3D
var match_node: Match
var hud: Hud
var roster := []
var cursor := [0, 1]
var locked := [false, false]
var p2_cpu := false
var cpu_level := "normal"
var picks := ["", ""]
var previews := [null, null]
var preview_ids := ["", ""]
var cards := []
var info := []
var mode_lbl: Label
var pause_ui: Control
var last_result = null
var t := 0.0
var auto_args := {}

func _ready():
	sfx = Sfx.new(); add_child(sfx)
	ui = CanvasLayer.new(); ui.layer = 5; add_child(ui)
	roster = Roster.available()
	for m in Roster.MODELS.values():
		if ResourceLoader.exists(m.path): ResourceLoader.load_threaded_request(m.path)
	Input.joy_connection_changed.connect(func(_d, _c): _assign_pads())
	_assign_pads()
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--fight="):
			var ids = a.substr(8).split(",")
			auto_args["fight"] = ids
		if a == "--cpu": auto_args["cpu"] = true
		if a == "--cpu-both": auto_args["cpu_both"] = true
	if auto_args.has("fight"):
		picks = [auto_args.fight[0], auto_args.fight[1]]
		p2_cpu = auto_args.has("cpu") or auto_args.has("cpu_both")
		_start_match()
	else:
		_show_title()

func _assign_pads():
	var pads = Input.get_connected_joypads()
	ctrls[0].pad = pads[0] if pads.size() > 0 else -1
	ctrls[1].pad = pads[1] if pads.size() > 1 else -1

func _clear_ui():
	for c in ui.get_children(): c.queue_free()
	cards.clear(); info.clear()

func _label(text: String, size: int, color := Color.WHITE) -> Label:
	var l = Label.new(); l.text = text
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	l.add_theme_constant_override("outline_size", max(4, size / 8))
	return l

func _menu_stage():
	if stage3d != null: stage3d.queue_free()
	stage3d = Node3D.new(); add_child(stage3d)
	var we = WorldEnvironment.new(); var env = Environment.new()
	env.background_mode = Environment.BG_COLOR; env.background_color = Color(0.03, 0.035, 0.07)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.ambient_light_color = Color(0.45, 0.45, 0.55); env.ambient_light_energy = 1.0
	env.tonemap_mode = Environment.TONE_MAPPER_ACES; env.glow_enabled = true
	we.environment = env; stage3d.add_child(we)
	var key = DirectionalLight3D.new(); key.rotation_degrees = Vector3(-35, 25, 0); key.light_energy = 1.6; key.shadow_enabled = true; stage3d.add_child(key)
	var rim = DirectionalLight3D.new(); rim.rotation_degrees = Vector3(-20, 170, 0); rim.light_energy = 1.2; rim.light_color = Color(0.5, 0.7, 1.0); stage3d.add_child(rim)
	var floor = MeshInstance3D.new(); var pm = PlaneMesh.new(); pm.size = Vector2(30, 12); floor.mesh = pm
	var fm = StandardMaterial3D.new(); fm.albedo_color = Color(0.08, 0.08, 0.12); fm.metallic = 0.0; fm.roughness = 0.95; floor.material_override = fm
	stage3d.add_child(floor)
	var cam = Camera3D.new(); cam.fov = 34; cam.position = Vector3(0, 1.6, 9.5); stage3d.add_child(cam); cam.look_at(Vector3(0, 1.25, 0)); cam.current = true

# ------------------------------------------------------------------ title
func _show_title():
	screen = "title"
	_clear_ui(); _menu_stage()
	previews = [null, null]; preview_ids = ["", ""]
	var bg = Control.new(); bg.set_anchors_preset(Control.PRESET_FULL_RECT); ui.add_child(bg)
	var title = _label("MARVEL KOMBAT", 110, Color(1, 0.25, 0.2)); title.set_anchors_preset(Control.PRESET_TOP_WIDE); title.offset_top = 120; bg.add_child(title)
	var sub = _label("Godot 4 edition  ·  2-player local", 28, Color(0.85, 0.85, 1.0)); sub.set_anchors_preset(Control.PRESET_TOP_WIDE); sub.offset_top = 260; bg.add_child(sub)
	var go = _label("Press Light attack (F / K), Space, or Cross / Square to start", 30); go.set_anchors_preset(Control.PRESET_TOP_WIDE); go.offset_top = 560; bg.add_child(go)
	var keys = _label("P1  " + Controls.KEY_LABELS[0] + "\nP2  " + Controls.KEY_LABELS[1] + "\nGamepad  Square light · Triangle heavy · L1/R1 special · L2/R2 ultimate · Cross jump · Circle block", 18, Color(0.75, 0.78, 0.9))
	keys.set_anchors_preset(Control.PRESET_TOP_WIDE); keys.offset_top = 680; bg.add_child(keys)
	var n = _label("%d heroes found in assets/models" % roster.size(), 18, Color(0.6, 0.65, 0.8)); n.set_anchors_preset(Control.PRESET_TOP_WIDE); n.offset_top = 320; bg.add_child(n)
	if roster.is_empty():
		n.text = "No hero models found. Run godot/tools/link_assets.sh, then reopen the project."

# ------------------------------------------------------------------ select
func _show_select():
	screen = "select"
	_clear_ui(); _menu_stage()
	previews = [null, null]; preview_ids = ["", ""]
	locked = [false, false]
	cursor[0] = clamp(cursor[0], 0, roster.size() - 1); cursor[1] = clamp(cursor[1], 0, roster.size() - 1)
	var root = Control.new(); root.set_anchors_preset(Control.PRESET_FULL_RECT); ui.add_child(root)
	var title = _label("CHOOSE YOUR HERO", 44); title.set_anchors_preset(Control.PRESET_TOP_WIDE); title.offset_top = 24; root.add_child(title)
	var grid = GridContainer.new(); grid.columns = 6
	grid.anchor_left = 0.5; grid.anchor_right = 0.5; grid.anchor_top = 1.0; grid.anchor_bottom = 1.0
	grid.offset_left = -480; grid.offset_top = -250
	grid.add_theme_constant_override("h_separation", 8); grid.add_theme_constant_override("v_separation", 8)
	root.add_child(grid)
	for id in roster:
		var h = Data.hero(id)
		var panel = Panel.new(); panel.custom_minimum_size = Vector2(152, 72)
		var sb = StyleBoxFlat.new(); sb.bg_color = Color(h.color).darkened(0.45); sb.set_corner_radius_all(6); sb.set_border_width_all(4); sb.border_color = Color(0, 0, 0, 0)
		panel.add_theme_stylebox_override("panel", sb)
		var l = _label(h.name.to_upper(), 17); l.set_anchors_preset(Control.PRESET_FULL_RECT); l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER; l.autowrap_mode = TextServer.AUTOWRAP_WORD
		panel.add_child(l)
		grid.add_child(panel)
		cards.append({"panel": panel, "sb": sb})
	for i in 2:
		var l = _label("", 18)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT if i == 0 else HORIZONTAL_ALIGNMENT_RIGHT
		l.anchor_left = 0.02 if i == 0 else 0.62; l.anchor_right = 0.38 if i == 0 else 0.98; l.anchor_top = 0.1
		l.autowrap_mode = TextServer.AUTOWRAP_WORD
		root.add_child(l); info.append(l)
	mode_lbl = _label("", 18, Color(0.8, 0.85, 1.0)); mode_lbl.set_anchors_preset(Control.PRESET_BOTTOM_WIDE); mode_lbl.offset_top = -40; root.add_child(mode_lbl)
	_refresh_select()

func _refresh_select():
	for k in cards.size():
		var c = cards[k]
		var on0 = cursor[0] == k; var on1 = cursor[1] == k
		c.sb.border_color = Color(1, 0.3, 0.25) if on0 and not on1 else (Color(0.3, 0.6, 1) if on1 and not on0 else (Color(0.9, 0.4, 1.0) if on0 and on1 else Color(0, 0, 0, 0)))
	for i in 2:
		var h = Data.hero(roster[cursor[i]])
		var who = "P%d%s" % [i + 1, " (CPU)" if i == 1 and p2_cpu else ""]
		var st = h.stats
		info[i].text = "%s%s\n%s\n%s\n\nPower %s  Speed %s  Defense %s  Range %s\n\nSpecial: %s\n%s\n\nUltimate: %s\n\nPassive: %s" % [
			who, "  ✔ READY" if locked[i] else "", h.name.to_upper(), h.title,
			"■".repeat(int(st.Power)), "■".repeat(int(st.Speed)), "■".repeat(int(st.Defense)), "■".repeat(int(st.Range)),
			h.special.name, h.special.desc, h.ultimate.name, h.passive]
		if preview_ids[i] != roster[cursor[i]]: _set_preview(i, roster[cursor[i]])
	mode_lbl.text = "P2: %s   (Tab or P2 Special to switch%s)   ·   Light = lock in   ·   Block = back" % ["CPU " + cpu_level.to_upper() if p2_cpu else "HUMAN", ", Shift+Tab difficulty" if p2_cpu else ""]

func _set_preview(i: int, id: String):
	if previews[i] != null: previews[i].queue_free()
	var r = Roster.make_rig(id, i == 1 and preview_ids[0] == id)
	stage3d.add_child(r)
	r.position = Vector3(-2.1 if i == 0 else 2.1, 0, 0)
	r.rotation.y = (0.5 if i == 0 else -0.5)
	var k = 1.9 / max(1.9, r.height)  # keep giants in frame
	r.scale = Vector3(k, k, k)
	previews[i] = r; preview_ids[i] = id

# ------------------------------------------------------------------ match
func _start_match():
	_clear_ui()
	if stage3d != null: stage3d.queue_free(); stage3d = null
	screen = "match"
	hud = Hud.new(); add_child(hud)
	match_node = Match.new()
	add_child(match_node)
	var levels = ["", cpu_level if p2_cpu else ""]
	if auto_args.has("cpu_both"): levels[0] = cpu_level
	match_node.setup(picks, ctrls, levels, hud, sfx)
	match_node.finished.connect(_on_finished)

func _end_match():
	if match_node != null: match_node.queue_free(); match_node = null
	if hud != null: hud.queue_free(); hud = null
	for c in ctrls: c.cpu = null; c.virtual.clear(); c.clear()
	get_tree().paused = false

func _on_finished(res):
	last_result = res
	await get_tree().create_timer(2.5).timeout
	if screen != "match": return
	screen = "results"
	var root = Control.new(); root.set_anchors_preset(Control.PRESET_FULL_RECT); ui.add_child(root)
	var shade = ColorRect.new(); shade.color = Color(0, 0, 0, 0.35); shade.set_anchors_preset(Control.PRESET_FULL_RECT); root.add_child(shade)
	var w = res.winner
	var l = _label("%s WINS%s" % [w.hero.name.to_upper(), "\nFLAWLESS VICTORY" if res.flawless else ""], 72, Color(1, 0.85, 0.3))
	l.set_anchors_preset(Control.PRESET_TOP_WIDE); l.offset_top = 160; root.add_child(l)
	var st = _label("Damage %d  ·  Hits %d  ·  Best combo %d" % [int(w.stats.dmg), w.stats.hits, w.stats.max_combo], 26)
	st.set_anchors_preset(Control.PRESET_TOP_WIDE); st.offset_top = 360; root.add_child(st)
	var opts = _label("Light: rematch     Block: character select", 30, Color(0.85, 0.9, 1.0))
	opts.set_anchors_preset(Control.PRESET_TOP_WIDE); opts.offset_top = 640; root.add_child(opts)

func _toggle_pause():
	var p = not match_node.paused
	match_node.paused = p
	if p:
		pause_ui = Control.new(); pause_ui.set_anchors_preset(Control.PRESET_FULL_RECT); ui.add_child(pause_ui)
		var shade = ColorRect.new(); shade.color = Color(0, 0, 0, 0.5); shade.set_anchors_preset(Control.PRESET_FULL_RECT); pause_ui.add_child(shade)
		var l = _label("PAUSED\n\nEsc / Options: resume\nBlock: quit to character select", 40)
		l.set_anchors_preset(Control.PRESET_CENTER); l.anchor_left = 0; l.anchor_right = 1; l.offset_left = 0; l.offset_right = 0; l.offset_top = -160
		pause_ui.add_child(l)
	elif pause_ui != null: pause_ui.queue_free(); pause_ui = null

# ------------------------------------------------------------------ input per screen
func _process(dt):
	t += dt
	if screen != "match" or (match_node != null and match_node.paused):
		for c in ctrls: c.poll(dt)
	match screen:
		"title":
			for c in ctrls:
				if c.pressed("confirm") or c.pressed("light"): sfx.play("blip", 0.6); _show_select(); return
			for i in 2:
				if previews[i] == null and roster.size() > i and t > 0.3:
					_set_preview(i, roster[(i * 3) % roster.size()])
					previews[i].position.x = -2.1 if i == 0 else 2.1
		"select": _select_input(dt)
		"match":
			if match_node == null: return
			if ctrls[0].pressed("pause") or ctrls[1].pressed("pause") or (match_node.paused and (ctrls[0].pressed("pause") or ctrls[1].pressed("pause"))):
				_toggle_pause()
			elif match_node.paused and (ctrls[0].pressed("back") or ctrls[1].pressed("back")):
				_end_match(); _show_select()
		"results":
			for c in ctrls:
				if c.pressed("light") or c.pressed("confirm"): _end_match(); _start_match(); return
				if c.pressed("back"): _end_match(); _show_select(); return
	if screen == "select" or screen == "title":
		var pose_names = ["idle", "taunt", "victory"]
		for i in 2:
			if previews[i] != null:
				var pn = "victory" if (screen == "select" and locked[i]) else pose_names[int(t / 3.0 + i) % 2]
				previews[i].update_pose(Poses.POSES[pn], dt, 4.0)

func _unhandled_input(e):
	if screen == "select" and e is InputEventKey and e.pressed and not e.echo and e.physical_keycode == KEY_TAB:
		if e.shift_pressed:
			cpu_level = {"easy": "normal", "normal": "hard", "hard": "easy"}[cpu_level]
		else:
			p2_cpu = not p2_cpu; locked[1] = false
		sfx.play("blip", 0.5, 1.3); _refresh_select()

func _select_input(_dt):
	var changed = false
	var n = roster.size()
	for i in 2:
		var c = ctrls[i]
		# with P2 on CPU, P1 picks for both: first P1's hero, then the CPU's
		var who = i
		if p2_cpu and i == 1:
			if c.pressed("special"): p2_cpu = false; changed = true
			continue
		if p2_cpu and locked[0]: who = 1
		if not locked[who]:
			var d = 0
			if c.pressed("right"): d = 1
			elif c.pressed("left"): d = -1
			elif c.pressed("down"): d = 6
			elif c.pressed("up"): d = -6
			if d != 0: cursor[who] = posmod(cursor[who] + d, n); sfx.play("blip", 0.3, 1.6); changed = true
			if c.pressed("light") or c.pressed("confirm"):
				locked[who] = true; sfx.play("hit_sharp", 0.6, 1.2); changed = true
		if c.pressed("back"):
			if locked[who]: locked[who] = false; changed = true
			elif p2_cpu and who == 1 and locked[0]: locked[0] = false; changed = true
			elif not locked[0] and not locked[1]: _show_title(); return
		if i == 1 and not p2_cpu and c.pressed("special") and not locked[1]: p2_cpu = true; changed = true
	if changed: _refresh_select()
	if locked[0] and locked[1]:
		picks = [roster[cursor[0]], roster[cursor[1]]]
		_start_match()
