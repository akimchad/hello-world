# Input for one player: keyboard bindings (physical keys, same defaults as the web game) plus
# the player's gamepad (pad 1 -> P1, pad 2 -> P2, PlayStation layout):
#   Square = light, Triangle = heavy, L1/R1 = special, L2/R2 = ultimate, Cross = jump,
#   Circle = block, D-pad / left stick = move, Options = pause.
# Presses are buffered for 0.2 s so an attack pressed while busy still comes out.
class_name Controls
extends RefCounted

const ACTIONS = ["left", "right", "up", "down", "light", "heavy", "special", "block", "ult", "pause", "confirm", "back"]
const BUFFER = 0.2

const KEYS = {
	0: {"left": [KEY_A], "right": [KEY_D], "up": [KEY_W], "down": [KEY_S], "light": [KEY_F], "heavy": [KEY_G],
		"special": [KEY_H], "block": [KEY_R], "ult": [KEY_T], "pause": [KEY_ESCAPE], "confirm": [KEY_F, KEY_SPACE], "back": [KEY_R]},
	1: {"left": [KEY_LEFT], "right": [KEY_RIGHT], "up": [KEY_UP], "down": [KEY_DOWN], "light": [KEY_KP_1, KEY_K],
		"heavy": [KEY_KP_2, KEY_L], "special": [KEY_KP_3, KEY_SEMICOLON], "block": [KEY_KP_4, KEY_O], "ult": [KEY_KP_5, KEY_P],
		"pause": [], "confirm": [KEY_KP_1, KEY_K, KEY_ENTER], "back": [KEY_KP_4, KEY_O]},
}
const KEY_LABELS = {
	0: "Move W A S D   Light F   Heavy G   Special H   Block R   Ultimate T",
	1: "Move arrows   Light K / Num1   Heavy L / Num2   Special ; / Num3   Block O / Num4   Ultimate P / Num5",
}

var side := 0
var pad := -1          # joypad device id, or -1
var cpu = null         # an AI brain that fills `virtual` instead of the devices
var virtual := {}      # action -> time the AI holds it until
var held_now := {}
var held_prev := {}
var buffer := {}
var time := 0.0

func _init(s: int):
	side = s

func _pad_held(a: String) -> bool:
	if pad < 0: return false
	var ax = Input.get_joy_axis(pad, JOY_AXIS_LEFT_X)
	var ay = Input.get_joy_axis(pad, JOY_AXIS_LEFT_Y)
	var b = func(x): return Input.is_joy_button_pressed(pad, x)
	match a:
		"left": return b.call(JOY_BUTTON_DPAD_LEFT) or ax < -0.5
		"right": return b.call(JOY_BUTTON_DPAD_RIGHT) or ax > 0.5
		"up": return b.call(JOY_BUTTON_DPAD_UP) or ay < -0.6 or b.call(JOY_BUTTON_A)
		"down": return b.call(JOY_BUTTON_DPAD_DOWN) or ay > 0.6
		"light": return b.call(JOY_BUTTON_X)
		"heavy": return b.call(JOY_BUTTON_Y)
		"special": return b.call(JOY_BUTTON_LEFT_SHOULDER) or b.call(JOY_BUTTON_RIGHT_SHOULDER)
		"ult": return Input.get_joy_axis(pad, JOY_AXIS_TRIGGER_LEFT) > 0.5 or Input.get_joy_axis(pad, JOY_AXIS_TRIGGER_RIGHT) > 0.5
		"block": return b.call(JOY_BUTTON_B)
		"pause": return b.call(JOY_BUTTON_START)
		"confirm": return b.call(JOY_BUTTON_A) or b.call(JOY_BUTTON_X)
		"back": return b.call(JOY_BUTTON_B)
	return false

func _key_held(a: String) -> bool:
	for k in KEYS[side].get(a, []):
		if Input.is_physical_key_pressed(k): return true
	return false

# poll devices once per frame; records new presses in the buffer. The match passes a slowed dt
# during hit-stop so a press made in the freeze is still alive when the fighter can act again.
func poll(dt: float, use_devices := true):
	time += dt
	held_prev = held_now
	held_now = {}
	for a in ACTIONS:
		var h = false
		if cpu != null: h = virtual.get(a, -1.0) > time
		elif use_devices: h = _key_held(a) or _pad_held(a)
		if h:
			held_now[a] = true
			if not held_prev.has(a): buffer[a] = time

func held(a: String) -> bool: return held_now.has(a)
func pressed(a: String) -> bool: return held_now.has(a) and not held_prev.has(a)
func take(a: String) -> bool:
	if buffer.has(a) and time - buffer[a] <= BUFFER:
		buffer.erase(a); return true
	return false
func peek(a: String) -> bool: return buffer.has(a) and time - buffer[a] <= BUFFER
func clear(): buffer.clear()
