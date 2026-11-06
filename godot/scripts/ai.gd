# CPU opponent (port of the web game's ai.js): drives a fighter through the same Controls
# interface as a human (held / take / peek), with reaction time, blocking and combos.
class_name CpuBrain
extends RefCounted

const LEVELS = {
	"easy": {"think": [0.28, 0.5], "block": 0.2, "react": 0.3, "combo": 0.25, "aggro": 0.45, "anti_air": 0.15},
	"normal": {"think": [0.16, 0.32], "block": 0.5, "react": 0.18, "combo": 0.55, "aggro": 0.6, "anti_air": 0.4},
	"hard": {"think": [0.08, 0.18], "block": 0.8, "react": 0.1, "combo": 0.85, "aggro": 0.72, "anti_air": 0.7},
}
const RANGED = ["missileBarrage", "webShot", "kineticSurge", "shieldThrow", "solarFlare", "mysticBolts", "rootSnare", "symbioteLash"]
const FAR_ULTS = ["bifrostJudgment", "monarchsWrath", "voidErasure", "ancientForest", "freedomStrike"]

var L: Dictionary
var c: Controls
var queue := []
var next_think := 0.5
var threat_seen = null
var threat_decision := false
var threat_at := 0.0
var threat_low := false

func _init(ctl: Controls, level := "normal"):
	c = ctl; L = LEVELS.get(level, LEVELS.normal)

func press(a: String, delay := 0.0): queue.append({"at": c.time + delay, "a": a})
func hold(a: String, dur: float): c.virtual[a] = c.time + dur
func release(a: String): c.virtual.erase(a)
func held(a: String) -> bool: return c.virtual.get(a, -1.0) > c.time

func update(dt: float, me, opp, game):
	var keep = []
	for q in queue:
		if q.at <= c.time: c.buffer[q.a] = c.time
		else: keep.append(q)
	queue = keep
	if me == null or game == null or game.phase != "fight" or game.cine != null:
		if game != null and game.phase != "fight": c.virtual.clear()
		return
	var dist = abs(opp.x - me.x)
	var toward = "right" if opp.x > me.x else "left"
	var away = "left" if toward == "right" else "right"
	var threat = _find_threat(me, opp, game, dist)
	if threat != null and threat.key != threat_seen:
		threat_seen = threat.key
		threat_decision = randf() < L.block
		threat_at = c.time + L.react * (0.6 + randf() * 0.8)
		threat_low = threat.low
	if threat != null and threat_decision and c.time >= threat_at and me.is_free():
		release("left"); release("right")
		hold("block", 0.3)
		if threat_low: hold("down", 0.3)
		else: release("down")
		return
	if threat == null: threat_seen = null
	if me.state == "attack" and me.move_hit == "hit" and randf() < L.combo * dt * 12:
		if me.move.has("next"): press("light")
		elif me.special_cd <= 0 and randf() < 0.5: press("special")
		elif me.ult >= 100: press("ult")
	if not opp.on_ground and opp.state == "attack" and dist < 2.4 and me.is_free() and randf() < L.anti_air * dt * 10:
		hold("down", 0.25); press("heavy", 0.02)
		return
	if c.time < next_think: return
	next_think = c.time + L.think[0] + randf() * (L.think[1] - L.think[0])
	if not me.is_free(): return
	release("block")
	if not held("down"): release("down")
	var sp = me.hero.special.id
	if me.ult >= 100 and opp.state != "down" and opp.state != "ko" and (dist < 3.2 or me.hero.ultimate.id in FAR_ULTS) and randf() < 0.6:
		press("ult"); return
	if opp.state == "down" or opp.state == "getup":
		if dist < 2: hold(away, 0.2)
		return
	var r = randf()
	if dist > 4.2:
		if sp in RANGED and me.special_cd <= 0 and r < 0.35: release("left"); release("right"); press("special"); return
		if r < 0.07: hold(toward, 0.25); press("up"); return
		hold(toward, 0.35); release(away)
		return
	if dist > 1.7:
		if sp == "dashSlash" and me.special_cd <= 0 and r < 0.3: press("special"); return
		if sp in ["groundBreaker", "kineticSurge", "webShot", "rootSnare"] and me.special_cd <= 0 and r < 0.2: press("special"); return
		if r < 0.1 * L.aggro: hold(toward, 0.3); press("up"); press("light" if randf() < 0.5 else "heavy", 0.32); return
		if r > 0.92: hold(away, 0.25); return
		hold(toward, 0.25); release(away)
		return
	release("left"); release("right")
	if r < L.aggro:
		var pick = randf()
		if pick < 0.42:
			press("light")
			if randf() < L.combo: press("light", 0.18); press("light", 0.38)
		elif pick < 0.62: press("heavy")
		elif pick < 0.78: hold("down", 0.25); press("light", 0.03)
		elif pick < 0.9: hold("down", 0.25); press("heavy", 0.03)
		elif me.special_cd <= 0: press("special")
	elif r < L.aggro + 0.15: hold("block", 0.35)
	else: hold(away, 0.22)

func _find_threat(me, opp, game, dist):
	if opp.state == "attack" and opp.move != null:
		var m = opp.move
		var reach = m.x1 * opp.scale + 0.7
		if dist < reach and opp.state_t < (m.startup + m.active) * opp.hero.attackSpeed: return {"key": opp.hit_id, "low": m.height == "low"}
	if (opp.state == "special" or opp.state == "ultimate") and dist < 7:
		return {"key": "sp" + str(int(opp.state_t)) + opp.state, "low": opp.state == "special" and opp.hero.special.id in ["groundBreaker", "rootSnare"]}
	for p in game.projectiles:
		if p.owner == opp and p.alive and sign(me.x - p.x) == sign(p.vx) and abs(me.x - p.x) < 5: return {"key": p.id, "low": p.get("ground", false)}
	return null
