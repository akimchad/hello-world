# A versus match: arena, fighters, projectiles, hit resolution, hit-stop, camera and round flow
# (port of the web game's game.js).
class_name Match
extends Node3D

const Roster = preload("res://scripts/roster.gd")
const Specials = preload("res://scripts/specials.gd")
const Poses = preload("res://scripts/poses.gd")

signal finished(result)

const DAMAGE_SCALE = 0.85
const BASE_FOV = 34.0
const COMBO_SCALE = [1.0, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5]
const ATTACKER_FREEZE = 0.55
const PRAISE = ["", "", "NICE", "GREAT", "SUPERB", "BRUTAL", "OUTSTANDING", "LEGENDARY"]

var hud
var sfx: Sfx
var fx: Fx
var specials
var arena
var cam: Camera3D
var fighters := []
var inputs := []
var brains := [null, null]
var projectiles := []
var bounds := 10.5
var round_no := 1
var rounds_to_win := 2
var round_time := 99.0
var timer := 99.0
var phase := "intro"
var phase_t := 0.0
var time := 0.0
var stop_t := 0.0
var slow_t := 0.0
var time_scale := 1.0
var shake_amt := 0.0
var kick_x := 0.0
var fov_kick := 0.0
var ko_cam = null
var cine = null
var cam_focus = null
var cam_pos := Vector3(0, 5, 22)
var cam_look := Vector3(0, 1.2, 0)
var round_winner = null
var winner_shown := false
var last_flawless := false
var intro_step := 0
var ready_step := 0
var dark_level := 0.0
var dark_until := 0.0
var _hid := 1
var paused := false
var log_events := "--log" in OS.get_cmdline_user_args()

func logv(msg: String):
	if log_events: print("[%6.2f] %s" % [time, msg])

func setup(hero_ids: Array, ctrls: Array, cpu_levels: Array, the_hud, the_sfx: Sfx, stage_id := "rooftop"):
	hud = the_hud; sfx = the_sfx; inputs = ctrls
	arena = preload("res://scripts/arena.gd").new()
	add_child(arena)
	arena.build(stage_id)
	bounds = arena.bounds
	fx = Fx.new(); add_child(fx)
	specials = Specials.new(); specials.g = self
	cam = Camera3D.new(); cam.fov = BASE_FOV; cam.far = 600; add_child(cam); cam.current = true
	cam.position = cam_pos
	var mirror = hero_ids[0] == hero_ids[1]
	for i in 2:
		var rig = Roster.make_rig(hero_ids[i], mirror and i == 1)
		add_child(rig)
		var f = Fighter.new(Roster.hero(hero_ids[i]), i, rig)
		f.game = self
		f.ctrl = ctrls[i]
		fighters.append(f)
		if cpu_levels[i] != "": brains[i] = CpuBrain.new(ctrls[i], cpu_levels[i]); ctrls[i].cpu = brains[i]
		else: ctrls[i].cpu = null
	position_fighters()
	hud.setup(self)

func new_hit_id() -> String: _hid += 1; return "h" + str(_hid)
func opponent_of(f) : return fighters[1] if f == fighters[0] else fighters[0]

func position_fighters():
	fighters[0].reset(-2.8); fighters[1].reset(2.8)
	for p in projectiles: kill_projectile(p)
	projectiles.clear()
	fx.clear()
	ko_cam = null

# ---------------- hit resolution ----------------
static func overlap(a, b) -> bool: return a.x0 < b.x1 and a.x1 > b.x0 and a.y0 < b.y1 and a.y1 > b.y0

func zone_hit(att, box: Dictionary, hit: Dictionary):
	var d = opponent_of(att)
	if d.state == "ko" or phase != "fight": return null
	var hb = d.hurtbox()
	if hb == null or not overlap(box, hb): return null
	if d.got_hits.has(hit.id): return null
	d.got_hits[hit.id] = true
	if d.got_hits.size() > 200: d.got_hits = {hit.id: true}
	var cy = clamp((max(box.y0, hb.y0) + min(box.y1, hb.y1)) / 2.0, d.y + 0.25, d.y + 1.75 * d.scale)
	return apply_hit(att, d, hit, cy)

func direct_hit(att, d, hit: Dictionary):
	if d.state == "ko" or phase != "fight": return null
	var h = hit.duplicate(); h["unblockable"] = true
	return apply_hit(att, d, h, d.y + 1.2 * d.scale)

func apply_hit(att, d, hit: Dictionary, contact_y: float):
	if d.invuln > 0 and not hit.get("unblockable", false): return null
	var src = hit.get("src_x", att.x)
	var dir = sign(d.x - src)
	if dir == 0: dir = att.facing
	var height_ok = not (hit.get("height") == "low" and not d.crouching) and not (hit.get("height") == "overhead" and d.crouching)
	var blocked = not hit.get("unblockable", false) and d.can_block() and d.facing == -dir and height_ok
	var contact = Vector3(d.x - dir * 0.3 * d.scale, contact_y, 0.35)
	var col = Color.hex(int(hit.get("color", 0xffa040)) * 256 + 255)
	if blocked:
		var chip = hit.get("chip", 0.12)
		if d.hero.id == "cap" and not d.shield_out: chip *= 0.3
		if d.hero.id == "doom": chip *= 0.5
		var dmg = hit.dmg * att.hero.power * chip
		d.hp = max(0.0, d.hp - dmg) if hit.get("kind") == "ult" else max(min(d.hp, 1.0), d.hp - dmg)
		d.enter_blockstun(hit.get("blockstun", 0.18), dir * (hit.get("push", 2.0) * 0.55 + 0.8) / d.hero.weight)
		d.ult = min(100.0, d.ult + 2.5); att.ult = min(100.0, att.ult + 1.5)
		d.stats.blocked += 1
		d.recoil = {"t": 0.0, "front": 1 if sign(att.x - d.x) == d.facing else -1, "h": hit.get("height", "mid"), "amp": min(1.0, 0.4 + hit.dmg * 0.06), "twist": 1}
		fx.hit_spark(contact, Color("9fd8ff"), 0.5, true, Vector3(dir, 0.05, 0))
		sfx.play("block", 0.9)
		if att.state == "attack": hitstop_pair(att, d, 0.05, 0.012)
		else: hitstop(0.04)
		logv("%s blocked %s (%s)" % [d.hero.id, hit.get("name", hit.get("kind", "")), att.hero.id])
		if d.hp <= 0: on_ko(att, d)
		return "blocked"
	var comboing = d.is_stunned()
	att.combo = att.combo + 1 if comboing else 1
	var mul = 1.0 if hit.get("kind") == "ult" else COMBO_SCALE[min(att.combo, COMBO_SCALE.size()) - 1]
	var dmg2 = hit.dmg * att.hero.power * d.hero.defense * mul * DAMAGE_SCALE
	d.hp = max(0.0, d.hp - dmg2)
	if att.state != "ultimate": att.ult = min(100.0, att.ult + dmg2 * (1.05 + att.combo * 0.05))
	d.ult = min(100.0, d.ult + dmg2 * 0.6)
	att.stats.dmg += dmg2; att.stats.hits += 1; att.stats.max_combo = max(att.stats.max_combo, att.combo)
	d.take_hit(hit, dir)
	logv("%s hit %s with %s for %.1f -> hp %.1f (combo %d, %s)" % [att.hero.id, d.hero.id, hit.get("name", att.script_id if att.script_id != "" else hit.get("kind", "")), dmg2, d.hp, att.combo, d.state])
	var k = hit.get("kind", "light")
	var power = hit.get("spark", {"light": 0.6, "medium": 1.0, "heavy": 1.5, "special": 1.3, "ult": 1.2}.get(k, 1.0))
	var impact = Vector3(dir, 0.95 if hit.get("launch", 0) else (0.35 if hit.get("knockdown", false) else (-0.2 if hit.get("height") == "low" else 0.12)), 0)
	fx.hit_spark(contact, col, power, false, impact)
	if d.on_ground and hit.get("push", 0.0) >= 4: fx.dust(Vector3(d.x, 0.08, 0.1), 4 + int(hit.push))
	if hit.get("zap", false): fx.bolt(contact + Vector3(0, 1.2, 0), contact, Color("9fd8ff"), 0.15, 0.05, 1)
	var s = hit.get("sfx", "light")
	sfx.hit("medium" if (k == "light" and s == "heavy") else k, hit.get("sfx_vol", 1.0), s)
	if d.hp <= 0: sfx.grunt(d.hero.id, "ko", 1.1)
	elif dmg2 > 3.5 or randf() < 0.35: sfx.grunt(d.hero.id, "hurt", 0.8 + min(0.4, dmg2 * 0.03))
	shake(hit.get("shake", {"heavy": 0.35, "medium": 0.18, "special": 0.3, "ult": 0.25}.get(k, 0.08)), dir)
	var stop = {"heavy": 0.1, "medium": 0.065, "special": 0.08, "ult": 0.05}.get(k, 0.045)
	if att.state == "attack" and k in ["light", "medium", "heavy"]: hitstop_pair(att, d, stop * 1.15, {"light": 0.02, "medium": 0.032, "heavy": 0.05}[k])
	else: hitstop(stop)
	if att.combo >= 2: hud.combo(att.side, att.combo, PRAISE[min(att.combo, PRAISE.size() - 1)])
	if d.hp <= 0: on_ko(att, d)
	return "hit"

# ---------------- projectiles ----------------
func spawn_projectile(o: Dictionary) -> Dictionary:
	var p = {"vy": 0.0, "age": 0.0, "alive": true, "hit_count": 0, "clash": true, "hit_targets": {}, "id": randf(), "persistent": false, "r": 0.3, "life": 1.0}
	p.merge(o, true)
	p["hit"] = o.hit.duplicate()
	p["hit_id"] = new_hit_id()
	if p.has("mesh"):
		add_child(p.mesh); p.mesh.position = Vector3(p.x, p.y, 0)
	projectiles.append(p)
	return p

func reset_projectile_hits(p): p.hit_targets.clear(); p.hit_id = new_hit_id()

func kill_projectile(p, target = null):
	if not p.alive: return
	p.alive = false
	if p.has("mesh") and is_instance_valid(p.mesh): p.mesh.queue_free()
	if p.has("on_end"): p.on_end.call(p, target)

func update_projectiles(dt: float):
	for p in projectiles:
		if not p.alive: continue
		p.age += dt
		p.x += p.vx * dt; p.y += p.vy * dt
		if p.has("mesh") and is_instance_valid(p.mesh):
			p.mesh.position = Vector3(p.x, p.y, 0)
			if not p.get("ground", false): p.mesh.rotation.y += dt * 4
		if p.has("trail") and randf() < 0.9: fx.emit(Vector3(p.x, p.y, 0), {"count": 1, "color": p.trail, "speed": 0.6, "life": 0.25, "size": 0.22, "drag": 4})
		if p.has("on_update"): p.on_update.call(p, dt)
		if not p.alive: continue
		if p.age > p.life or abs(p.x) > bounds + 4: kill_projectile(p); continue
		var d = opponent_of(p.owner)
		var hb = d.hurtbox()
		if hb != null and not p.hit_targets.has(d.side) and d.state != "ko" and phase == "fight":
			var cx = clamp(p.x, hb.x0, hb.x1); var cy = clamp(p.y, hb.y0, hb.y1)
			if Vector2(p.x - cx, p.y - cy).length() < p.r:
				p.hit_targets[d.side] = true
				var dir_x = sign(p.vx) if p.vx != 0 else p.owner.facing
				var h = p.hit.duplicate(); h["id"] = p.hit_id; h["src_x"] = p.x - dir_x * 2
				var res = apply_hit(p.owner, d, h, clamp(p.y, d.y + 0.3, d.y + 1.7))
				if res != null:
					p.hit_count += 1
					if p.has("on_hit"): p.on_hit.call(res, d)
					if not p.persistent: kill_projectile(p, d); continue
				else: p.hit_targets.erase(d.side)
	for i in projectiles.size():
		for j in range(i + 1, projectiles.size()):
			var a = projectiles[i]; var b = projectiles[j]
			if not a.alive or not b.alive or a.owner == b.owner or not a.clash or not b.clash: continue
			if Vector2(a.x - b.x, a.y - b.y).length() < a.r + b.r:
				fx.hit_spark(Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, 0.3), Color.WHITE, 1.4)
				sfx.play("boom", 0.6)
				if not a.persistent: kill_projectile(a)
				else: a.vx = -a.vx
				if not b.persistent: kill_projectile(b)
				else: b.vx = -b.vx
	projectiles = projectiles.filter(func(p): return p.alive)

# ---------------- feel ----------------
func shake(a: float, dir_x := 0.0):
	shake_amt = max(shake_amt, a)
	if dir_x != 0: kick_x += dir_x * a * 0.22
	if a >= 0.3: fov_kick = max(fov_kick, min(2.2, a * 2))
	if a >= 0.5: rumble(min(1.0, a * 0.7), 0.1 + a * 0.16)

func rumble(strength: float, secs: float):
	for f in inputs:
		if f.pad >= 0: Input.start_joy_vibration(f.pad, strength * 0.6, strength, secs)

func hitstop(t: float): stop_t = max(stop_t, t)
func hitstop_pair(att, d, t: float, amp := 0.0):
	d.freeze_t = max(d.freeze_t, t); d.freeze_amp = amp
	att.freeze_t = max(att.freeze_t, t * ATTACKER_FREEZE); att.freeze_amp = 0
func set_dark(level: float, dur: float): dark_level = level; dark_until = time + dur
func focus_on(f, dur: float, dx := 1.2, dz := 2.6, dy := -0.35): cam_focus = {"f": f, "until": time + dur, "dx": dx, "dz": dz, "dy": dy}

func ult_cinematic(f):
	cine = {"f": f, "t": 0.0, "dur": 0.95}
	hud.ult_banner(f.hero.ultimate.name, f.side)
	sfx.play("beam", 0.8, 0.7)
	sfx.play("boom", 0.5, 1.4)

func on_ko(att, d):
	if phase != "fight": return
	phase = "ko"; phase_t = 0
	round_winner = att
	logv("K.O. %s beats %s" % [att.hero.id, d.hero.id])
	var dir = sign(d.x - att.x)
	if dir == 0: dir = att.facing
	hitstop(0.22)
	slow_t = 1.7
	ko_cam = {"f": d, "dir": dir}
	hud.announce("K.O.", Color("ff3b3b"), 1.8)
	var chest = d.chest_pos()
	fx.hit_spark(chest, Color.WHITE, 2.2, false, Vector3(dir, 0.4, 0))
	fx.ring(chest, Color.WHITE, 3.2, 0.45)
	fx.flash_light(chest, Color.WHITE, 18, 0.3)
	sfx.play("boom", 1.0, 0.8)
	shake(1.0, dir)
	fov_kick = 3.2

# ---------------- update ----------------
func _process(raw_dt: float):
	if paused: return
	var real_dt = min(raw_dt, 1.0 / 20.0)
	time += real_dt
	phase_t += real_dt
	var dark = dark_level if time < dark_until else 0.0
	arena.set_dark(dark, real_dt)
	if cam_focus != null and (time > cam_focus.until or phase != "fight"): cam_focus = null
	arena.step(real_dt, time)
	for i in 2:
		var f = fighters[i]
		var slow = stop_t > 0 or cine != null or f.freeze_t > 0
		inputs[i].poll(real_dt * (0.25 if slow else 1.0))
		if brains[i] != null: brains[i].update(real_dt, f, opponent_of(f), self)
	if slow_t > 0:
		slow_t -= real_dt
		time_scale = 0.3 if slow_t > 0.4 else 0.3 + 0.7 * (1.0 - max(0.0, slow_t) / 0.4)
	else: time_scale = 1.0
	var dt = real_dt * time_scale
	if cine != null:
		var c = cine
		c.t += real_dt
		c.f.rig.update_pose(Poses.POSES.charge, real_dt, 8)
		var col = Color(c.f.hero.color)
		fx.emit(c.f.chest_pos(), {"count": 3, "color": col, "color2": Color.WHITE, "speed": 5, "life": 0.5, "size": 0.25, "jitter": 0.8})
		if c.t >= c.dur: cine = null; hud.ult_banner("", 0)
		dt = 0
	elif stop_t > 0:
		stop_t -= real_dt
		dt = 0
	update_phase(real_dt)
	if dt > 0:
		var a = fighters[0]; var b = fighters[1]
		for pair in [[a, b], [b, a]]:
			var f = pair[0]
			if f.freeze_t > 0:
				f.freeze_t -= real_dt
				if f.freeze_t > 0: f.freeze_visual(); continue
				f.freeze_amp = 0
			f.update(dt, pair[1])
		resolve_push(a, b)
		update_projectiles(dt)
		for f in fighters:
			if not opponent_of(f).is_stunned() and f.combo: f.combo = 0
	fx.step(real_dt * (0.5 if slow_t > 0 else 1.0))
	update_camera(real_dt)
	hud.update_hud(self, real_dt)

func resolve_push(a, b):
	var skip = func(f): return f.no_push or f.state in ["down", "ko", "getup"]
	if not skip.call(a) and not skip.call(b):
		var v_overlap = a.y < b.y + 1.5 * b.scale and b.y < a.y + 1.5 * a.scale
		var min_d = 0.36 * a.scale * a.grow + 0.36 * b.scale * b.grow
		var dx = b.x - a.x
		if v_overlap and abs(dx) < min_d:
			var s = sign(dx) if dx != 0 else a.facing
			var over = min_d - abs(dx)
			var pa = over / 2; var pb = over / 2
			if abs(a.x - s * pa) > bounds: pb += pa; pa = 0
			if abs(b.x + s * pb) > bounds: pa += pb; pb = 0
			a.x -= s * pa; b.x += s * pb
	var sep = b.x - a.x
	if abs(sep) > 14:
		var fix = (abs(sep) - 14) / 2 * sign(sep)
		a.x += fix; b.x -= fix
	for f in [a, b]: f.x = clamp(f.x, -bounds, bounds)

func update_phase(dt: float):
	var a = fighters[0]; var b = fighters[1]
	match phase:
		"intro":
			var T = phase_t
			if intro_step == 0: intro_step = 1; hud.intro_card(a.hero, 0)
			if intro_step == 1 and T > 1.5: intro_step = 2; hud.intro_card(b.hero, 1)
			if T > 3.0: hud.intro_card(null, 0); phase = "ready"; phase_t = 0; ready_step = 0
		"ready":
			if ready_step == 0:
				ready_step = 1
				var final = a.round_wins == rounds_to_win - 1 and b.round_wins == rounds_to_win - 1 and rounds_to_win > 1
				var label = "FINAL ROUND" if final else "ROUND %d" % round_no
				hud.announce(label, Color.WHITE, 1.1)
				logv(label)
				hud.round_label(label)
				sfx.play("blip", 0.6)
			if ready_step == 1 and phase_t > 1.25:
				ready_step = 2
				hud.announce("FIGHT!", Color("ff3b3b"), 0.8)
				sfx.play("boom", 0.6, 1.2)
			if phase_t > 1.55:
				phase = "fight"; phase_t = 0
				for f in fighters: f.state = "idle"; f.state_t = 0; f.ctrl.clear()
		"fight":
			if round_time > 0 and cine == null:
				timer -= dt * time_scale
				if timer <= 0:
					timer = 0
					phase = "timeout"; phase_t = 0
					var ra = a.hp / a.max_hp; var rb = b.hp / b.max_hp
					round_winner = null if abs(ra - rb) < 0.001 else (a if ra > rb else b)
					hud.announce("TIME", Color("ff3b3b"), 1.5)
					for f in fighters:
						if f.state != "ko": f.state = "wait"; f.state_t = 0
		"ko", "timeout":
			if phase_t > 2.0 and not winner_shown:
				winner_shown = true
				var w = round_winner
				if w != null:
					w.round_wins += 1
					if w.on_ground and w.state != "ko": w.state = "victory"; w.state_t = 0; w.vx = 0
					var flawless = w.hp >= w.max_hp - 0.01
					hud.announce(w.hero.name.to_upper() + " WINS", Color.WHITE, 2.0, "FLAWLESS VICTORY" if flawless else "")
					last_flawless = flawless
				else: hud.announce("DRAW", Color.WHITE, 2.0)
			if round_winner != null and winner_shown and round_winner.state != "victory" and round_winner.on_ground and round_winner.is_free():
				round_winner.state = "victory"; round_winner.state_t = 0
			if phase_t > 4.4:
				winner_shown = false
				var w2 = round_winner
				if w2 != null and w2.round_wins >= rounds_to_win:
					phase = "over"; phase_t = 0
					logv("MATCH OVER: %s wins %d-%d" % [w2.hero.id, w2.round_wins, opponent_of(w2).round_wins])
					finished.emit({"winner": w2, "loser": opponent_of(w2), "flawless": last_flawless})
				else:
					round_no += 1
					timer = round_time
					position_fighters()
					phase = "ready"; phase_t = 0; ready_step = 0

func update_camera(dt: float):
	var a = fighters[0]; var b = fighters[1]
	var rate = 5.0
	var mid_x = (a.x + b.x) / 2
	var sep = abs(a.x - b.x)
	var vp = get_viewport().get_visible_rect().size
	var aspect = vp.x / max(1.0, vp.y)
	var aspect_k = clamp(1.78 / aspect, 0.8, 2.2)
	var max_y = max(a.y, b.y)
	var dist = clamp(6.8 + sep * 0.9 * aspect_k + max_y * 1.1, 8.5, 19 * aspect_k)
	var pos = Vector3(mid_x, 1.75 + dist * 0.07 + max_y * 0.55, dist)
	var look = Vector3(mid_x, 1.2 + max_y * 0.6, 0)
	# lambdas capture locals by value, so this returns [pos, look]
	var face_shot = func(f, dx, dz, dy):
		var h = f.head_pos()
		return [Vector3(h.x + f.facing * dx, h.y + dy, h.z + dz), Vector3(h.x, h.y - 0.04 * f.scale, h.z)]
	var shot = []
	if phase == "intro":
		var T = phase_t
		if T < 1.5: shot = face_shot.call(a, 0.6 + T * 0.15, (1.15 + T * 0.2) * a.scale, -0.08); rate = 60.0 if T < 0.1 else 6.0
		elif T < 3.0: shot = face_shot.call(b, 0.6 + (T - 1.5) * 0.15, (1.15 + (T - 1.5) * 0.2) * b.scale, -0.08); rate = 60.0 if T < 1.6 else 6.0
		else: rate = 4
	if cine != null:
		var f = cine.f; var t = cine.t
		shot = face_shot.call(f, 0.9 - t * 0.25, 1.15 * f.scale + 0.4 - t * 0.35, -0.05)
		rate = 7
	elif ko_cam != null and phase == "ko" and phase_t < 2.0:
		var f = ko_cam.f; var h = f.head_pos()
		pos = Vector3(h.x - ko_cam.dir * 1.5 * f.scale, max(0.9, h.y * 0.7) + 0.2, 3.6 * f.scale)
		look = Vector3(h.x + ko_cam.dir * 0.4, h.y * 0.85, 0)
		rate = 7
	elif cam_focus != null:
		shot = face_shot.call(cam_focus.f, cam_focus.dx, cam_focus.dz * cam_focus.f.scale, cam_focus.dy * cam_focus.f.scale)
		rate = 6
	elif (phase == "ko" or phase == "timeout") and phase_t > 2.0 and round_winner != null:
		var w = round_winner; var t = phase_t - 2
		shot = face_shot.call(w, 0.95 + sin(t * 0.5) * 0.35, 2.1 * w.scale, -0.2 * w.scale)
		rate = 3
	elif phase == "over" and round_winner != null:
		var w = round_winner; var t = phase_t
		shot = face_shot.call(w, 1.0 + sin(t * 0.3) * 0.5, 2.5 * w.scale, -0.3 * w.scale)
		rate = 2
	if shot.size() == 2: pos = shot[0]; look = shot[1]
	var k = 1.0 - exp(-rate * dt)
	if not (is_finite(pos.x + pos.y + pos.z + look.x + look.y + look.z)): pos = cam_pos; look = cam_look
	cam_pos = cam_pos.lerp(pos, k)
	cam_look = cam_look.lerp(look, k)
	var p = cam_pos
	if shake_amt > 0.001:
		var s = shake_amt * 0.25
		p += Vector3((randf() - 0.5) * s, (randf() - 0.5) * s, 0)
		shake_amt *= exp(-9 * dt)
	if abs(kick_x) > 0.001: p.x += kick_x; kick_x *= exp(-12 * dt)
	cam.fov = BASE_FOV - fov_kick
	fov_kick *= exp(-9 * dt)
	cam.position = p
	if p.distance_to(cam_look) > 0.01: cam.look_at(cam_look)
	arena.follow(mid_x)
