# Sound: the repo's CC0 samples (assets/audio, copied to godot/audio by tools/link_assets.sh) plus a
# few short sounds synthesised at start-up (block clack, boom, zap, beam). No music.
class_name Sfx
extends Node

var streams := {}
var players := []
var delayed := []   # {at, name, vol, pitch}
var t := 0.0

func _ready():
	for f in DirAccess.get_files_at("res://audio"):
		if f.get_extension() == "wav": streams[f.get_basename()] = load("res://audio/" + f)
	streams["block"] = _synth(0.09, 2600.0, 0.6, 0.4)
	streams["boom"] = _synth(0.7, 90.0, 1.0, 0.9)
	streams["zap"] = _synth(0.25, 5200.0, 0.8, 0.95)
	streams["beam"] = _synth(0.5, 900.0, 0.5, 0.5)
	streams["blip"] = _tone(0.08, 880.0)
	for i in 16:
		var p = AudioStreamPlayer.new(); add_child(p); players.append(p)

# filtered noise burst with an exponential decay
func _synth(dur: float, cutoff: float, vol: float, rough: float) -> AudioStreamWAV:
	var rate = 22050
	var n = int(dur * rate)
	var data = PackedByteArray(); data.resize(n * 2)
	var lp = 0.0
	var a = clamp(cutoff / rate * 2.0 * PI, 0.0, 1.0)
	for i in n:
		var k = float(i) / n
		var env = exp(-k * 6.0) * (1.0 if i > 40 else i / 40.0)
		lp += ((randf() * 2 - 1) - lp) * a
		var s = (lp * (1.0 - rough) + (randf() * 2 - 1) * rough * 0.3 * (1.0 - k)) * env * vol
		data.encode_s16(i * 2, int(clamp(s, -1.0, 1.0) * 32000))
	var w = AudioStreamWAV.new(); w.format = AudioStreamWAV.FORMAT_16_BITS; w.mix_rate = rate; w.data = data
	return w

func _tone(dur: float, hz: float) -> AudioStreamWAV:
	var rate = 22050; var n = int(dur * rate)
	var data = PackedByteArray(); data.resize(n * 2)
	for i in n:
		var k = float(i) / n
		data.encode_s16(i * 2, int(sin(i * hz * TAU / rate) * (1.0 - k) * 12000))
	var w = AudioStreamWAV.new(); w.format = AudioStreamWAV.FORMAT_16_BITS; w.mix_rate = rate; w.data = data
	return w

func play(name: String, vol := 1.0, pitch := 1.0):
	var s = streams.get(name)
	if s == null:
		s = streams.get({"land": "heavy_bass", "web": "whoosh", "slash": "whoosh", "shield": "hit_sharp", "blast": "boom", "wood": "heavy_bass", "squelch": "hit_sharp", "ko": "boom"}.get(name, ""), null)
		if s == null: return
	for p in players:
		if not p.playing:
			p.stream = s
			p.volume_db = linear_to_db(max(0.001, vol))
			p.pitch_scale = pitch * randf_range(0.95, 1.05)
			p.play()
			return

func play_later(delay: float, name: String, vol := 1.0, pitch := 1.0):
	if delay <= 0.0: play(name, vol, pitch)
	else: delayed.append({"at": t + delay, "n": name, "v": vol, "p": pitch})

func whoosh(delay: float, strength := 1.0): play_later(delay, "whoosh", 0.35 + 0.35 * strength, 1.25 - 0.3 * strength)

func hit(kind: String, vol := 1.0, special := ""):
	match kind:
		"light": play("hit_sharp", 0.7 * vol, 1.15)
		"medium": play("hit_sharp", 0.85 * vol, 0.95); play("heavy_bass", 0.4 * vol, 1.2)
		_: play("heavy_bass", 0.9 * vol, 1.0); play("hit_sharp", 0.5 * vol, 0.8)
	if special == "zap": play("zap", 0.6 * vol)
	elif special == "slash": play("whoosh", 0.5 * vol, 1.6)

# per-hero pain / KO voice where a sample exists (hurt / ko); efforts are left silent
func grunt(hero_id: String, kind: String, vol := 1.0):
	if kind == "effort": return
	var key = hero_id + "_" + kind
	if streams.has(key): play(key, vol)

func _process(dt):
	t += dt
	var keep = []
	for d in delayed:
		if d.at <= t: play(d.n, d.v, d.p)
		else: keep.append(d)
	delayed = keep
