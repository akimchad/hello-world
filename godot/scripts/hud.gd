# Fight HUD: health bars with a trailing damage bar, ultimate meters, special cooldowns, round
# pips, timer, announcements, combo counters, intro cards and the ultimate banner.
class_name Hud
extends CanvasLayer

var bars := []
var timer_label: Label
var round_lbl: Label
var announce_lbl: Label
var announce_sub: Label
var announce_t := 0.0
var combo_lbls := []
var combo_t := [0.0, 0.0]
var intro_lbl: Label
var banner: Label
var font_big := 64

func _label(text: String, size: int, color := Color.WHITE, align := HORIZONTAL_ALIGNMENT_CENTER) -> Label:
	var l = Label.new()
	l.text = text
	l.horizontal_alignment = align
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	l.add_theme_constant_override("outline_size", max(4, size / 8))
	return l

func _rect(c: Color) -> ColorRect:
	var r = ColorRect.new(); r.color = c; return r

func setup(m):
	for c in get_children(): c.queue_free()
	bars.clear(); combo_lbls.clear()
	var root = Control.new(); root.set_anchors_preset(Control.PRESET_FULL_RECT); root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	for i in 2:
		var f = m.fighters[i]
		var b = {}
		var box = Control.new()
		box.anchor_left = 0.03 if i == 0 else 0.55; box.anchor_right = 0.45 if i == 0 else 0.97
		box.anchor_top = 0.03; box.anchor_bottom = 0.03
		box.offset_bottom = 120
		root.add_child(box)
		var frame = _rect(Color(0, 0, 0, 0.6)); frame.set_anchors_preset(Control.PRESET_TOP_WIDE); frame.offset_bottom = 30; box.add_child(frame)
		var trail = _rect(Color(0.9, 0.15, 0.1)); trail.position = Vector2(3, 3); box.add_child(trail)
		var hp = _rect(Color(f.hero.color).lerp(Color(1, 0.85, 0.2), 0.35)); hp.position = Vector2(3, 3); box.add_child(hp)
		var name = _label(f.hero.name.to_upper(), 22, Color.WHITE, HORIZONTAL_ALIGNMENT_LEFT if i == 0 else HORIZONTAL_ALIGNMENT_RIGHT)
		name.set_anchors_preset(Control.PRESET_TOP_WIDE); name.offset_top = 32; box.add_child(name)
		var tag = _label(("P%d" % (i + 1)) + (" CPU" if m.brains[i] != null else ""), 16, Color(0.8, 0.85, 1.0), HORIZONTAL_ALIGNMENT_RIGHT if i == 0 else HORIZONTAL_ALIGNMENT_LEFT)
		tag.set_anchors_preset(Control.PRESET_TOP_WIDE); tag.offset_top = 34; box.add_child(tag)
		var pips = HBoxContainer.new(); pips.position = Vector2(0, 62); box.add_child(pips)
		if i == 1: pips.set_anchors_preset(Control.PRESET_TOP_RIGHT); pips.offset_left = -60; pips.position.y = 62
		b["pips"] = pips
		# ultimate meter and special cooldown at the bottom
		var ub = Control.new()
		ub.anchor_left = 0.03 if i == 0 else 0.67; ub.anchor_right = 0.33 if i == 0 else 0.97
		ub.anchor_top = 0.93; ub.anchor_bottom = 0.93
		root.add_child(ub)
		var uframe = _rect(Color(0, 0, 0, 0.6)); uframe.set_anchors_preset(Control.PRESET_TOP_WIDE); uframe.offset_bottom = 16; ub.add_child(uframe)
		var ufill = _rect(Color(0.3, 0.75, 1.0)); ufill.position = Vector2(2, 2); ub.add_child(ufill)
		var ulbl = _label("ULTIMATE", 14, Color(0.85, 0.9, 1.0), HORIZONTAL_ALIGNMENT_LEFT if i == 0 else HORIZONTAL_ALIGNMENT_RIGHT)
		ulbl.set_anchors_preset(Control.PRESET_TOP_WIDE); ulbl.offset_top = -22; ub.add_child(ulbl)
		var sp = _label("", 14, Color(1, 0.9, 0.6), HORIZONTAL_ALIGNMENT_RIGHT if i == 0 else HORIZONTAL_ALIGNMENT_LEFT)
		sp.set_anchors_preset(Control.PRESET_TOP_WIDE); sp.offset_top = -22; ub.add_child(sp)
		b.merge({"box": box, "hp": hp, "trail": trail, "trail_v": 1.0, "ub": ub, "ufill": ufill, "ulbl": ulbl, "sp": sp, "frame": frame, "cracked": false})
		bars.append(b)
		var cl = _label("", 40, Color(1, 0.85, 0.3), HORIZONTAL_ALIGNMENT_LEFT if i == 0 else HORIZONTAL_ALIGNMENT_RIGHT)
		cl.anchor_left = 0.04 if i == 0 else 0.6; cl.anchor_right = 0.4 if i == 0 else 0.96; cl.anchor_top = 0.3; cl.anchor_bottom = 0.3
		root.add_child(cl); combo_lbls.append(cl)
	timer_label = _label("99", 52)
	timer_label.anchor_left = 0.45; timer_label.anchor_right = 0.55; timer_label.anchor_top = 0.015
	root.add_child(timer_label)
	round_lbl = _label("", 16, Color(0.8, 0.85, 1.0))
	round_lbl.anchor_left = 0.4; round_lbl.anchor_right = 0.6; round_lbl.anchor_top = 0.1
	root.add_child(round_lbl)
	announce_lbl = _label("", 96)
	announce_lbl.set_anchors_preset(Control.PRESET_CENTER); announce_lbl.anchor_left = 0; announce_lbl.anchor_right = 1; announce_lbl.offset_left = 0; announce_lbl.offset_right = 0; announce_lbl.offset_top = -80
	root.add_child(announce_lbl)
	announce_sub = _label("", 32, Color(1, 0.85, 0.3))
	announce_sub.set_anchors_preset(Control.PRESET_CENTER); announce_sub.anchor_left = 0; announce_sub.anchor_right = 1; announce_sub.offset_left = 0; announce_sub.offset_right = 0; announce_sub.offset_top = 40
	root.add_child(announce_sub)
	intro_lbl = _label("", 54)
	intro_lbl.anchor_left = 0.05; intro_lbl.anchor_right = 0.95; intro_lbl.anchor_top = 0.72
	root.add_child(intro_lbl)
	banner = _label("", 44, Color(1, 0.9, 0.5))
	banner.anchor_left = 0; banner.anchor_right = 1; banner.anchor_top = 0.78
	root.add_child(banner)
	pips(m)

func pips(m):
	for i in 2:
		var p: HBoxContainer = bars[i].pips
		for c in p.get_children(): c.queue_free()
		for k in m.rounds_to_win:
			var r = _rect(Color(1, 0.8, 0.2) if k < m.fighters[i].round_wins else Color(1, 1, 1, 0.2))
			r.custom_minimum_size = Vector2(22, 10)
			p.add_child(r)

func update_hud(m, dt: float):
	for i in 2:
		var f = m.fighters[i]; var b = bars[i]
		var w = b.box.size.x - 6
		var k = clamp(f.hp / f.max_hp, 0.0, 1.0)
		b.hp.size = Vector2(w * k, 24)
		if i == 1: b.hp.position.x = 3 + w * (1 - k)
		if b.trail_v > k: b.trail_v = max(k, b.trail_v - dt * (0.35 if f.is_stunned() else 0.9))
		else: b.trail_v = k
		b.trail.size = Vector2(w * b.trail_v, 24)
		if i == 1: b.trail.position.x = 3 + w * (1 - b.trail_v)
		var uw = b.ub.size.x - 4
		var u = clamp(f.ult / 100.0, 0.0, 1.0)
		b.ufill.size = Vector2(uw * u, 12)
		if i == 1: b.ufill.position.x = 2 + uw * (1 - u)
		var ready = u >= 1.0
		b.ufill.color = Color(1, 0.8, 0.2).lerp(Color.WHITE, 0.5 + 0.5 * sin(m.time * 10)) if ready else Color(0.3, 0.75, 1.0)
		b.ulbl.text = (f.hero.ultimate.name.to_upper() + " READY") if ready else "ULTIMATE"
		b.sp.text = f.hero.special.name + ("  %.1fs" % f.special_cd if f.special_cd > 0 else "  ready")
		b.frame.color = Color(0.6, 0.1, 0.1, 0.8) if b.cracked else Color(0, 0, 0, 0.6)
		combo_t[i] -= dt
		combo_lbls[i].modulate.a = clamp(combo_t[i] * 2.0, 0.0, 1.0)
	timer_label.text = str(int(ceil(m.timer)))
	announce_t -= dt
	var a = clamp(announce_t * 3.0, 0.0, 1.0)
	announce_lbl.modulate.a = a; announce_sub.modulate.a = a

func combo(side: int, n: int, praise: String):
	combo_lbls[side].text = "%d HITS\n%s" % [n, praise]
	combo_t[side] = 1.4

func announce(text: String, color := Color.WHITE, dur := 1.2, sub := ""):
	announce_lbl.text = text
	announce_lbl.add_theme_color_override("font_color", color)
	announce_sub.text = sub
	announce_t = dur

func round_label(s: String): round_lbl.text = s

func intro_card(hero, side: int):
	if hero == null: intro_lbl.text = ""; return
	intro_lbl.text = hero.name.to_upper() + "\n" + hero.title
	intro_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT if side == 0 else HORIZONTAL_ALIGNMENT_RIGHT

func ult_banner(name: String, _side: int): banner.text = name.to_upper()

func crack(side: int): bars[side].cracked = true
