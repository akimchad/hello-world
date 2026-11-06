# A fighter: state machine, physics, attacks and pose selection (port of the web game's fighter.js).
# Positions are on the fight plane: x along world X, y up, z = 0.
class_name Fighter
extends RefCounted

const Poses = preload("res://scripts/poses.gd")
const Data = preload("res://scripts/data.gd")

const GRAVITY = 32.0
const FACE_ANGLE = PI / 2 - 0.38   # turned slightly toward the camera
const FREE = ["idle", "air"]
const STUNNED = ["hit", "locked", "down", "ko"]
const MAX_VX = 18.0
const MAX_VY = 16.0
const CEILING = 6.5
const WALK_SWING = 0.48
const STRIDE = 2 * 0.89 * 0.4618   # 2 * leg * sin(WALK_SWING)
const TWIST = {"jab": -1.0, "cross": 1.0, "hook": 1.0, "heavy": 1.0, "upper": 0.6, "kick": 0.5, "sweep": 0.4}
const ANIM_MAP = {"jab": "punch", "cross": "punch2", "kick": "kick", "heavy": "heavy", "sweep": "sweep", "upper": "uppercut", "airLight": "airKick", "airHeavy": "airKick"}

var hero: Dictionary
var side := 0
var rig: ModelRig
var game          # Match
var ctrl: Controls
var moves: Dictionary
var scale := 1.0
var max_hp := 100.0
var hp := 100.0
var ult := 0.0
var round_wins := 0
var x := 0.0
var y := 0.0
var vx := 0.0
var vy := 0.0
var facing := 1
var state := "intro"
var state_t := 0.0
var on_ground := true
var air_jumps := 0
var crouching := false
var blocking := false
var move = null
var move_hit = null
var hit_id := ""
var combo := 0
var invuln := 0.0
var freeze_t := 0.0
var freeze_amp := 0.0
var flash_t := 0.0
var flash_max := 0.1
var flash_color := Color.WHITE
var no_push := false
var armor := false
var super_armor := false
var stun_t := 0.0
var walk_phase := 0.0
var pose_name := ""
var pose_rate := 16.0
var locked_by = null
var since_hit := 0.0
var special_cd := 0.0
var slow_t := 0.0
var root_t := 0.0
var root_immune := 0.0
var hit_low := false
var pulled := 0.0
var recoil = null
var connect_t := -1.0
var lunged := false
var lunge_stop := false
var script_id := ""
var script_kind := ""
var ult_t := 0.0
var sv := {}           # per-script state for specials/ultimates
var got_hits := {}
var hit_count := 0
var stats := {"dmg": 0.0, "hits": 0, "max_combo": 0, "blocked": 0}
var shield_out := false
var face_cam := false
var breath_t := 0.0
var layer_pose := {}
var walk_pose := {}
var grow := 1.0        # whole-model scale for scripted moves (Groot's giant form)

func _init(h: Dictionary, s: int, r: ModelRig):
	hero = h; side = s; rig = r
	scale = r.scale_k
	moves = Data.moves_for(h.id)
	max_hp = float(h.hp)
	layer_pose = Poses.copy(Poses.POSES.idle)
	walk_pose = Poses.copy(Poses.POSES.idle)
	reset(-3.0 if s == 0 else 3.0)

func reset(px: float):
	if script_id != "" and game != null: game.specials.cleanup(script_id, self)
	script_id = ""; script_kind = ""
	x = px; y = 0; vx = 0; vy = 0
	facing = 1 if side == 0 else -1
	hp = max_hp
	special_cd = 0; slow_t = 0; root_t = 0; root_immune = 0; face_cam = false
	state = "intro"; state_t = 0
	on_ground = true; air_jumps = int(hero.airJumps)
	crouching = false; blocking = false; move = null; got_hits = {}
	combo = 0; invuln = 0; freeze_t = 0; freeze_amp = 0; flash_t = 0
	no_push = false; armor = false; super_armor = false; stun_t = 0; walk_phase = 0
	locked_by = null; since_hit = 0; shield_out = false; recoil = null; grow = 1.0
	sv = {}
	_place()
	rig.rotation.y = facing * FACE_ANGLE

func is_free() -> bool: return state in FREE
func is_stunned() -> bool: return state in STUNNED
func set_pose(n: String, rate := 22.0): pose_name = n; pose_rate = rate
func head_pos() -> Vector3: return rig.head_pos()
func chest_pos() -> Vector3: return Vector3(x + facing * 0.25 * scale, y + 1.38 * scale, 0.1)
func hand_pos(right := true) -> Vector3:
	var p = rig.hand_pos(right)
	if not rig.ok: p = Vector3(x + facing * 0.6, y + 1.35 * scale, 0.2)
	return p

func hurtbox():
	if state == "down" or state == "getup": return null
	var w = 0.34 * scale * grow
	var h = 1.85 * scale * grow
	if crouching or (state == "attack" and move != null and move.get("crouch", false) and state_t < move_total() * 0.6): h = 1.12 * scale
	if not on_ground: h = 1.6 * scale
	return {"x0": x - w, "x1": x + w, "y0": y, "y1": y + h}

func can_block() -> bool: return (state == "idle" and blocking) or state == "blockstun"
func move_total() -> float: return (move.startup + move.active + move.recovery) * hero.attackSpeed

func start_move(n: String):
	move = moves[n]
	state = "attack"; state_t = 0
	hit_id = game.new_hit_id()
	move_hit = null; lunged = false; lunge_stop = false
	crouching = move.get("crouch", false)
	blocking = false
	if on_ground and not move.get("air", false): vx *= 0.3
	var strength = {"light": 0.7, "medium": 0.9, "heavy": 1.15}.get(move.kind, 0.8)
	game.sfx.whoosh(max(0.0, move.startup * hero.attackSpeed - 0.07), strength)
	if move.kind != "light" and randf() < 0.6: game.sfx.grunt(hero.id, "effort", 0.7)

func start_special() -> bool:
	var id = hero.special.id
	if special_cd > 0 or not game.specials.has_script(id) or not game.specials.can_start(id, self): return false
	sv = {}; ult_t = 0
	state = "special"; state_t = 0
	script_id = id; script_kind = "special"
	special_cd = hero.special.cd
	game.logv("%s special %s" % [hero.id, id])
	crouching = false; blocking = false; vx = 0
	game.sfx.grunt(hero.id, "effort", 0.8)
	return true

func start_ultimate() -> bool:
	var id = hero.ultimate.id
	if ult < 100 or not game.specials.has_script(id): return false
	var opp = game.opponent_of(self)
	if opp.state == "ko": return false
	ult = 0
	sv = {}; ult_t = 0
	state = "ultimate"; state_t = 0
	script_id = id; script_kind = "ultimate"
	crouching = false; blocking = false; vx = 0
	game.logv("%s ULTIMATE %s" % [hero.id, id])
	game.ult_cinematic(self)
	return true

func lock_by(att):
	state = "locked"; state_t = 0; locked_by = att
	vx = 0; vy = 0; crouching = false; blocking = false; move = null

func enter_blockstun(t: float, push: float):
	state = "blockstun"; state_t = 0; stun_t = t; vx = push
	flash(Color("7fc8ff"), 0.12)

func flash(c: Color, t: float): flash_color = c; flash_t = t; flash_max = t

func end_script():
	if script_id != "": game.specials.cleanup(script_id, self)
	script_id = ""; script_kind = ""

func take_hit(hit: Dictionary, dir: float):
	var opp = game.opponent_of(self)
	since_hit = 0
	hit_count += 1
	if not hit.get("no_flash", false): flash(Color.WHITE, 0.1)
	var front = 1 if sign(opp.x - x) == facing else -1
	recoil = {"t": 0.0, "front": front, "h": hit.get("height", "mid"), "amp": min(1.0, 0.45 + hit.get("dmg", 0) * 0.05), "twist": -1 if randf() < 0.5 else 1}
	if hp <= 0:
		end_script()
		state = "ko"; state_t = 0
		vy = max(9.0, hit.get("launch", 0.0)); vx = dir * 7.5; on_ground = false; crouching = false
		return
	if state == "locked" and hit.get("keep_lock", false): state_t = 0; return
	if hit.has("slow"): slow_t = max(slow_t, min(hit.slow, 2.0))
	if hit.has("root") and root_immune <= 0: root_t = min(hit.root, 1.2); root_immune = root_t + 2
	if armor and hit.get("kind") == "light" and on_ground: return
	if super_armor and hit.get("kind") != "ult": return
	var airborne = not on_ground
	crouching = false; blocking = false; move = null
	end_script()
	locked_by = null
	if hit.get("pull", false):
		state = "hit"; state_t = 0; stun_t = hit.stun
		var target = opp.x + opp.facing * 1.0 * opp.scale
		pulled = 0.18; vx = (target - x) / pulled
		return
	if hit.get("launch", 0.0) > 0:
		state = "hit"; state_t = 0; stun_t = 99
		vy = hit.launch / sqrt(hero.weight); vx = dir * 2.2; on_ground = false
	elif hit.get("knockdown", false):
		state = "hit"; state_t = 0; stun_t = 99
		vy = 6.5; vx = dir * hit.get("push", 4.0) * 0.9 / hero.weight; on_ground = false
	elif airborne:
		state = "hit"; state_t = 0; stun_t = 99
		vy = max(vy, 5.5); vx = dir * 2.6
	else:
		state = "hit"; state_t = 0; stun_t = hit.get("stun", 0.3)
		vx = dir * hit.get("push", 1.5) / hero.weight
		hit_low = hit.get("height") == "low"

# while frozen by hit-stop the simulation is skipped; the struck fighter just shakes in place
func freeze_visual():
	var a = freeze_amp
	rig.position = Vector3(x + ((randf() - 0.5) * a * 2 if a > 0 else 0.0), y + ((randf() - 0.5) * a if a > 0 else 0.0), 0)

# ------------------------------------------------------------------
func update(dt: float, opp):
	var g = game
	var c = ctrl
	state_t += dt
	if special_cd > 0 and state != "special": special_cd = max(0.0, special_cd - dt)
	if invuln > 0: invuln -= dt
	if slow_t > 0:
		slow_t -= dt
		if randf() < dt * 14: g.fx.emit(Vector3(x + (randf() - 0.5) * 0.4, y + randf() * 1.6 * scale, 0.2), {"count": 1, "color": Color(1, 1, 1), "speed": 0.4, "life": 0.4, "size": 0.12})
	if root_t > 0: root_t -= dt
	if root_immune > 0: root_immune -= dt
	if flash_t > 0: flash_t -= dt
	pose_name = ""
	since_hit += dt
	if hero.get("regen", false) and since_hit > 3 and hp > 0 and hp < max_hp * 0.5 and g.phase == "fight":
		hp = min(max_hp * 0.5, hp + 1.5 * dt)
	if is_free() and on_ground and state != "ko":
		var want = 1 if opp.x >= x else -1
		if want != facing and abs(opp.x - x) > 0.05: facing = want

	match state:
		"intro", "wait":
			vx = 0
		"idle":
			crouching = c.held("down")
			blocking = c.held("block")
			if c.take("ult") and start_ultimate(): pass
			elif c.take("special") and start_special(): pass
			elif c.take("light"): start_move("sweep" if crouching else "jab")
			elif c.take("heavy"): start_move("upper" if crouching else "heavy")
			elif not crouching and not blocking and root_t <= 0 and c.take("up"): jump()
			else:
				var d = (1 if c.held("right") else 0) - (1 if c.held("left") else 0)
				if crouching or blocking or root_t > 0: d = 0
				if d != 0:
					var back = d != facing
					var target = d * hero.speed * (0.78 if back else 1.0) * (0.5 if slow_t > 0 else 1.0)
					vx += (target - vx) * min(1.0, dt * 18)
					walk_phase += dt * PI * abs(vx) / (STRIDE * scale) * (-1 if back else 1)
				else:
					vx *= max(0.0, 1 - dt * 16)
		"air":
			if c.take("light"): start_move("airLight")
			elif c.take("heavy"): start_move("airHeavy")
			else:
				if air_jumps > 0 and c.take("up"):
					air_jumps -= 1; vy = hero.jump * 0.85
					var d2 = (1 if c.held("right") else 0) - (1 if c.held("left") else 0)
					if d2 != 0: vx = d2 * hero.speed
					g.sfx.play("whoosh", 0.5, 1.4)
					g.fx.ring(Vector3(x, y + 0.2, 0), Color.WHITE, 0.8, 0.25, true)
				var d3 = (1 if c.held("right") else 0) - (1 if c.held("left") else 0)
				if d3 != 0: vx += d3 * dt * 6
				vx = clamp(vx, -hero.speed * 1.05, hero.speed * 1.05)
		"attack":
			_update_attack(dt, opp, c)
		"special", "ultimate":
			ult_t += dt
			var running = script_id != "" and g.specials.run(script_id, self, ult_t, dt)
			if not running:
				end_script()
				no_push = false; armor = false; super_armor = false; grow = 1.0
				if state == "special" or state == "ultimate": state = "idle" if on_ground else "air"
			if on_ground and state == "special" and not no_push: vx *= max(0.0, 1 - dt * 8)
		"blockstun":
			vx *= max(0.0, 1 - dt * 10)
			blocking = true
			if state_t >= stun_t: state = "idle"
		"hit":
			if pulled > 0:
				pulled -= dt
				if pulled <= 0: vx = 0
			elif on_ground: vx *= max(0.0, 1 - dt * 9)
			if on_ground and state_t >= stun_t: state = "idle"; hit_low = false
		"locked":
			vx = 0; vy = 0
			if locked_by == null or locked_by.state != "ultimate" or state_t > 3:
				state = "hit"; stun_t = 0.3; state_t = 0; locked_by = null
		"down":
			vx *= max(0.0, 1 - dt * 8)
			if state_t > 0.75: state = "getup"; state_t = 0
		"getup":
			if state_t > 0.38: state = "idle"; invuln = 0.3
		"ko", "victory":
			if on_ground: vx *= max(0.0, 1 - dt * 6)

	# physics
	if state != "locked":
		if y > 0.001 and on_ground: on_ground = false
		if state == "hit" or state == "ko": vx = clamp(vx, -MAX_VX, MAX_VX); vy = min(vy, MAX_VY)
		if not on_ground:
			var fall_mul = 0.35 if (hero.id == "ironman" and vy < 0 and state == "air" and c.held("up")) else 1.0
			vy -= GRAVITY * dt * fall_mul
		x += vx * dt
		y += vy * dt
	if y <= 0:
		y = 0
		if not on_ground: land()
	var b = g.bounds
	if abs(x) > b:
		var sd = sign(x)
		x = sd * b
		if state in ["hit", "ko", "blockstun"]:
			if sd * vx > 6 and not on_ground:
				vx = -vx * 0.3; g.shake(0.3); g.fx.dust(Vector3(x, y + 1, 0), 10); g.sfx.play("land", 0.8, 0.8)
			else: vx = min(0.0, vx) if sd > 0 else max(0.0, vx)
	if y > CEILING: y = CEILING; vy = min(0.0, vy)
	animate(dt)

func _update_attack(dt: float, opp, c: Controls):
	var m = move
	var s = hero.attackSpeed
	var st = m.startup * s
	var act = m.active * s
	var tot = move_total()
	var g = game
	if state_t >= st and state_t <= st + act and move_hit == null:
		var ys = min(scale, opp.scale if opp != null else scale)
		var xa = x + facing * m.x0 * scale
		var xb = x + facing * m.x1 * scale
		var box = {"x0": min(xa, xb), "x1": max(xa, xb), "y0": y + m.y0 * ys, "y1": y + m.y1 * ys}
		var hit = m.duplicate(); hit["id"] = hit_id; hit["src_x"] = x
		var r = g.zone_hit(self, box, hit)
		if r != null: move_hit = r; connect_t = 0
	armor = m.get("armor", false) and state_t < st + act
	if m.has("lunge") and on_ground:
		if state_t < st * 0.4: vx = -facing * m.lunge * 0.12
		elif state_t < st + act and move_hit == null:
			if not lunged: lunged = true; g.fx.dust(Vector3(x - facing * 0.3, 0.05, 0), 8)
			vx = facing * m.lunge
		elif move_hit == "hit" and not lunge_stop: lunge_stop = true; vx *= 0.15
	if move_hit != null and state_t > st:
		if m.has("next") and c.take("light"): start_move(m.next); return
		if c.peek("special") and special_cd <= 0 and on_ground:
			c.take("special")
			if start_special(): return
		if c.peek("ult") and ult >= 100 and on_ground:
			c.take("ult")
			if start_ultimate(): return
		if not m.get("air", false) and m.kind == "light" and c.take("heavy"): start_move("upper" if crouching else "heavy"); return
	if on_ground and not m.get("air", false) and not (m.has("lunge") and state_t < st + act): vx *= max(0.0, 1 - dt * 10)
	if state_t >= tot:
		move = null; armor = false
		state = "idle" if on_ground else "air"

func jump():
	var c = ctrl
	var d = (1 if c.held("right") else 0) - (1 if c.held("left") else 0)
	var slow = 0.8 if slow_t > 0 else 1.0
	vy = hero.jump * slow
	vx = d * hero.speed * 1.05 * slow
	on_ground = false
	state = "air"; state_t = 0
	crouching = false; blocking = false
	game.sfx.play("whoosh", 0.45, 1.3)
	game.fx.dust(Vector3(x, 0.1, 0), 6)

func land():
	on_ground = true
	vy = 0
	air_jumps = int(hero.airJumps)
	var g = game
	if state == "air": state = "idle"; vx *= 0.3; g.sfx.play("land", 0.5); g.fx.dust(Vector3(x, 0.05, 0), 5)
	elif state == "attack" and move != null and move.get("air", false): state = "idle"; move = null; vx *= 0.2; g.sfx.play("land", 0.5)
	elif state == "hit" and stun_t > 50:
		state = "down"; state_t = 0; vx *= 0.4
		g.sfx.play("land", 1.0, 0.8); g.fx.dust(Vector3(x, 0.05, 0), 18); g.shake(0.25)
	elif state == "ko":
		vx *= 0.4; g.sfx.play("land", 1.0, 0.7); g.fx.dust(Vector3(x, 0.05, 0), 24); g.fx.ring(Vector3(x, 0.05, 0), Color.WHITE, 2.4, 0.4, true); g.shake(0.4)
	elif state == "hit": vx *= 0.5

# key for heroes whose model file ships its own clips (MUA Cap / Thor / Hulk)
func anim_key() -> Array:
	match state:
		"intro", "wait": return ["idle", 0.0, null]
		"idle":
			if blocking: return ["block", 0.0, null]
			if crouching: return ["crouch", 0.0, null]
			if abs(vx) > 0.4: return ["walk", 0.0, null]
			return ["idle", 0.0, null]
		"attack": return [ANIM_MAP.get(move.name, "punch"), move_total(), hit_id]
		"special": return ["special", 0.6, "sp" + str(int(special_cd * 100))]
		"blockstun": return ["block", 0.0, null]
	return ["", 0.0, null]

# ------------------------------------------------------------------ body mechanics
# additive layer over the chosen pose: breathing, strike anticipation/drive, hit recoil
func layer(base: Dictionary, dt: float) -> Dictionary:
	var p = layer_pose
	Poses.lerp_into(p, base, base, 0.0)
	var st = state
	breath_t += dt
	if on_ground and st in ["idle", "blockstun", "intro", "wait", "victory"]:
		var T = breath_t; var ph = side * 1.7
		var b = sin(T * 2.1 + ph)
		var drift = sin(T * 0.71 + ph) * sin(T * 0.43 + 2)
		Poses.add(p, "chest", -b * 0.03); Poses.add(p, "spine", b * 0.008, drift * 0.04, 0)
		Poses.add(p, "lSh", -b * 0.03, 0, b * 0.025 + drift * 0.03); Poses.add(p, "rSh", -b * 0.03, 0, -b * 0.025 + drift * 0.02)
		Poses.add(p, "lEl", sin(T * 1.3 + ph) * 0.04); Poses.add(p, "rEl", sin(T * 1.1 + ph + 1) * 0.04)
		Poses.add(p, "head", b * 0.015, drift * 0.04, 0)
		p.hipY += b * 0.005
	if st == "attack" and move != null and on_ground and not move.get("air", false):
		var m = move
		var s = hero.attackSpeed
		var sT = m.startup * s; var aT = m.active * s; var t = state_t
		var amp = 0.55 if m.kind == "light" else 1.0
		var tw = TWIST.get(m.name, 0.0)
		if t < sT:
			var k = sin(min(1.0, t / sT) * PI / 2) * amp
			p.hipY -= 0.035 * k; Poses.add(p, "lKnee", 0.16 * k); Poses.add(p, "rKnee", 0.16 * k); Poses.add(p, "spine", -0.06 * k); Poses.add(p, "chest", -0.05 * k)
			Poses.add(p, "spine", 0, -tw * 0.1 * k, 0); Poses.add(p, "chest", 0, -tw * 0.08 * k, 0)
		else:
			var span = aT + m.recovery * s * 0.6
			var u = min(1.0, (t - sT) / span)
			var k = (1 - u) * (1 - u) * amp
			p.hipY -= 0.02 * k; Poses.add(p, "spine", 0.12 * k); Poses.add(p, "chest", 0.06 * k); Poses.add(p, "rHip", 0.14 * k); Poses.add(p, "lKnee", 0.14 * k); Poses.add(p, "rKnee", -0.08 * k)
			Poses.add(p, "hips", 0, tw * 0.12 * k, 0); Poses.add(p, "spine", 0, tw * 0.16 * k, 0); Poses.add(p, "chest", 0, tw * 0.12 * k, 0)
	if connect_t >= 0:
		connect_t += dt
		var k = exp(-14 * connect_t)
		if st == "attack" and k > 0.02: Poses.add(p, "spine", -0.08 * k); Poses.add(p, "chest", -0.07 * k); Poses.add(p, "head", -0.06 * k)
	if sv.has("flip_x"): p.bodyX += sv.flip_x
	var R = recoil
	if R != null:
		R.t += dt
		var react = st in ["hit", "locked", "blockstun"]
		var k = exp(-9 * R.t) * R.amp * (0.5 if st == "blockstun" else 1.0)
		if st == "blockstun" and k > 0.01: Poses.add(p, "chest", -0.2 * k * R.front); Poses.add(p, "lEl", -0.25 * k); Poses.add(p, "rEl", -0.25 * k); p.hipY -= 0.03 * k
		if not react or k < 0.01: recoil = null
		else:
			var f = R.front
			var q = k * sin(min(1.0, R.t * 30) * PI / 2)
			if R.h == "high" or R.h == "overhead": Poses.add(p, "head", -0.6 * q * f, 0.3 * q * R.twist, 0.15 * q * R.twist); Poses.add(p, "chest", -0.22 * q * f); Poses.add(p, "spine", -0.1 * q * f)
			elif R.h == "low": Poses.add(p, "spine", 0.3 * q); Poses.add(p, "head", 0.2 * q); Poses.add(p, "lKnee", 0.35 * q); Poses.add(p, "rKnee", 0.35 * q); p.hipY -= 0.05 * q
			else: Poses.add(p, "spine", -0.3 * q * f); Poses.add(p, "chest", -0.25 * q * f, 0.15 * q * R.twist, 0); Poses.add(p, "head", 0.3 * q * f)
	return p

# walking legs by foot placement: each foot's spot comes from the walk phase, which advances
# with distance walked, so planted feet don't skate; two-bone IK turns spots into hip/knee angles
func walk_legs(p: Dictionary):
	var A = 0.45; var Bl = 0.44; var ankle = 0.09
	var heavy = clamp(hero.weight - 1.0, 0.0, 1.0)
	var phi = walk_phase
	var half = STRIDE * (A + Bl) / 0.89
	var along = sin(FACE_ANGLE)
	var drop = (1 + cos(2 * phi)) / 2
	var H = ankle + (A + Bl) * 0.955 - drop * (0.03 + 0.02 * heavy)
	var smooth = func(v): return v * v * (3 - 2 * v)
	var z = {}
	for pair in [["l", 0.0], ["r", PI]]:
		var sd = pair[0]
		var u = fposmod((phi + pair[1]) / PI, 2.0)
		var fz; var fy; var ft
		if u < 1:
			fz = half * (0.5 - u); fy = ankle
			ft = 0.25 * (1 - u / 0.15) if u < 0.15 else (-0.45 * smooth.call((u - 0.7) / 0.3) if u > 0.7 else 0.0)
		else:
			var w = u - 1
			fz = half * (smooth.call(w) - 0.5); fy = ankle + sin(PI * w) * (0.11 + 0.04 * heavy)
			ft = -0.45 * (1 - w / 0.35) if w < 0.35 else 0.25 * smooth.call((w - 0.35) / 0.65)
		fz /= along
		z[sd] = fz
		var dz = fz; var dy = H - fy
		var reach = (A + Bl) * 0.999
		var dist = min(reach, max(0.25, Vector2(dz, dy).length()))
		var theta = atan2(dz, dy)
		var hip_open = acos(clamp((A * A + dist * dist - Bl * Bl) / (2 * A * dist), -1.0, 1.0))
		var knee = PI - acos(clamp((A * A + Bl * Bl - dist * dist) / (2 * A * Bl), -1.0, 1.0))
		p[sd + "Hip"] = Vector3(-(theta + hip_open) - p.hips.x, p[sd + "Hip"].y, 0.1 if sd == "l" else -0.1)
		p[sd + "Knee"] = Vector3(knee, 0, 0)
		p[sd + "Ft"] = ft
	p.hipY = 0
	var lead = (z.l - z.r) / max(0.001, half)
	Poses.add(p, "hips", drop * 0.03, -lead * (0.12 + 0.06 * heavy), lead * 0.04 * (1 + heavy))
	Poses.add(p, "spine", 0.02 * drop, lead * (0.09 + 0.05 * heavy), 0)
	Poses.add(p, "lSh", -lead * 0.12); Poses.add(p, "rSh", lead * 0.12)

func animate(dt: float):
	var P = Poses.POSES
	var rate = 16.0
	var pose: Dictionary
	var t = state_t
	match state:
		"intro": pose = P.taunt if game.phase == "intro" else P.idle; rate = 8
		"wait": pose = P.idle
		"idle":
			if blocking: pose = P.crouchBlock if crouching else P.block
			elif crouching: pose = P.crouch
			elif abs(vx) > 0.4:
				Poses.lerp_into(walk_pose, P.idle, P.idle, 0.0)
				walk_legs(walk_pose)
				pose = walk_pose; rate = 75
			else: pose = P.idle
		"air": pose = P.jump if vy > 2 else P.fall; rate = 12
		"attack":
			var m = move; var s = hero.attackSpeed
			var st = m.startup * s; var act = m.active * s
			if t < st: pose = P[m.pose[0]]; rate = 26
			elif t < st + act + m.recovery * s * 0.4: pose = P[m.pose[1]]; rate = 45
			else: pose = (P.crouch if m.get("crouch", false) else P.idle) if on_ground else P.fall; rate = 12
		"special", "ultimate": pose = P.get(pose_name, P.idle); rate = pose_rate
		"blockstun": pose = P.crouchBlock if crouching else P.block; rate = 30
		"hit":
			if not on_ground or stun_t > 50: pose = P.airHit
			else: pose = P.hitLow if hit_low else P.hit
			rate = 30
		"locked": pose = P.hit if int(t * 8) % 2 else P.airHit; rate = 25
		"down": pose = P.down; rate = 14
		"getup": pose = P.getup; rate = 12
		"ko": pose = P.down if on_ground else P.airHit; rate = 10
		"victory": pose = P.victory if fmod(t, 3.0) < 1.6 else P.taunt; rate = 6
		_: pose = P.idle
	pose = layer(pose, dt)
	var ak = anim_key()
	rig.set_anim(ak[0], ak[1], ak[2])
	rig.update_pose(pose, dt, rate)
	_place()
	if not (state in ["hit", "down", "ko", "locked"]):
		var target_rot = 0.0 if face_cam else facing * FACE_ANGLE
		rig.rotation.y += (target_rot - rig.rotation.y) * min(1.0, dt * 18)
	var s2 = rig.scale.x + (grow - rig.scale.x) * min(1.0, dt * 6)
	rig.scale = Vector3(s2, s2, s2)
	if flash_t > 0: rig.set_flash(flash_color, max(0.0, flash_t / flash_max) * 0.9)
	elif invuln > 0: rig.set_flash(Color.WHITE, (sin(Time.get_ticks_msec() * 0.05) * 0.5 + 0.5) * 0.25)
	else: rig.set_flash(flash_color, 0)

func _place(): rig.position = Vector3(x, y, 0)
